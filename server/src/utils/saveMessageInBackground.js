const Message = require("../models/Message");
const { cacheClient } = require("../config/redis");
const buildConversationId = require("./buildConversationId");
const { dualWriteConfirmedMessage } = require("../services/conversationDualWriteService");

/**
 * Lưu tin nhắn vào MongoDB và cập nhật Redis cache.
 * Chạy ngầm sau khi socket đã emit cho client.
 *
 * Sử dụng upsert theo (sender + idempotencyKey) để:
 * - Tránh duplicate khi client retry cùng 1 tin nhắn
 * - Chỉ tạo document mới khi chưa có; trả về document cũ nếu đã tồn tại
 *
 * @param {Object} data - Dữ liệu tin nhắn từ socket event
 * @returns {Promise<{doc: Document|null, isDuplicate: boolean}>}
 */
async function saveMessageInBackground(data) {
    try {
        const senderId = data.sender?._id || data.sender;
        const conversationId =
            data.conversationId ||
            (data.isGroup
                ? data.receiverId
                : buildConversationId(senderId, data.receiverId));

        if (!conversationId) {
            console.warn("[saveMessage] Không xác định được conversationId:", data);
            return { doc: null, isDuplicate: false };
        }

        const cacheKey = `chat_history:${conversationId}`;

        // Tin đã có _id -> đã lưu qua REST API, không upsert
        if (data._id && !data.idempotencyKey) {
            const doc = await Message.findById(data._id);
            return { doc, isDuplicate: false };
        }

        const { hasLink, links } = typeof Message.extractAndNormalizeLinks === "function"
            ? Message.extractAndNormalizeLinks(data.content || data.text || "")
            : { hasLink: false, links: [] };

        const messageToSave = {
            conversationId,
            sender: senderId,
            receiver: data.receiverId || data.receiver,
            type: data.type || "text",
            text: data.content || data.text || "",
            attachments: data.attachments || [],
            isRead: false,
            createdAt: data.createdAt || new Date(),
            idempotencyKey: data.idempotencyKey || null,
            hasLink,
            links
        };

        let savedMessage;
        let isDuplicate = false;

        if (data.idempotencyKey && senderId) {
            /**
             * Upsert: nếu đã có (sender + idempotencyKey) -> trả về doc cũ (isDuplicate = true)
             * Nếu chưa có -> tạo mới (isDuplicate = false)
             * $setOnInsert đảm bảo createdAt / _id chỉ được set khi INSERT
             */
            const result = await Message.findOneAndUpdate(
                { sender: senderId, idempotencyKey: data.idempotencyKey },
                {
                    $setOnInsert: messageToSave,
                },
                {
                    includeResultMetadata: true,
                    returnDocument: "after",
                    upsert: true,
                    runValidators: true,
                }
            );
            savedMessage = result?.value ?? result;
            isDuplicate = Boolean(result?.lastErrorObject?.updatedExisting);
        } else {
            // Không có idempotencyKey -> tạo bình thường (group messages, system messages)
            savedMessage = await Message.create(messageToSave);
        }

        // Cập nhật Redis Cache – giữ 50 tin nhắn mới nhất
        // Write-Through: cập nhật ZSET danh sách trò chuyện cho tất cả participants
        if (savedMessage) {
            const dataToCache = {
                ...(typeof savedMessage.toObject === "function"
                    ? savedMessage.toObject()
                    : savedMessage),
                conversationId,
                senderInfo: data.senderInfo || data.sender,
            };

            // Lấy participantIds: sender + receiver (1-1 chat)
            const participantIds = [senderId];
            if (data.receiverId || data.receiver) {
                const receiverId = data.receiverId || data.receiver;
                if (!participantIds.includes(receiverId)) {
                    participantIds.push(receiverId);
                }
            }

            // Chat history cache (50 tin nhắn gần nhất)
            if (cacheClient.isOpen) {
                const multi = cacheClient.multi();
                multi.lPush(cacheKey, JSON.stringify(dataToCache));
                multi.lTrim(cacheKey, 0, 49);
                await multi.exec();
            }

            // ZSET Write-Through: đã gỡ bỏ trong cleanup

            if (!isDuplicate) {
                await dualWriteConfirmedMessage(savedMessage, { logPrefix: "[saveMessage]" });
            }
        }

        return { doc: savedMessage, isDuplicate };
    } catch (error) {
        // MongoDB duplicate key error -> tin đã tồn tại (retry từ client)
        if (error.code === 11000) {
            console.warn("[saveMessage] Duplicate idempotencyKey, fetching existing doc:", data.idempotencyKey);
            try {
                const existingDoc = await Message.findOne({
                    sender: data.sender?._id || data.sender,
                    idempotencyKey: data.idempotencyKey,
                });
                return { doc: existingDoc, isDuplicate: true };
            } catch (e2) {
                console.error("[saveMessage] Lỗi khi fetch doc trùng:", e2);
                return { doc: null, isDuplicate: true };
            }
        }

        console.error("[saveMessage] Lỗi lưu tin nhắn ngầm:", error);
        return { doc: null, isDuplicate: false };
    }
}

module.exports = saveMessageInBackground;


