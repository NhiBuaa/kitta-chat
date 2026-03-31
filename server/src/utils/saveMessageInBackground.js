const Message = require("../models/Message");
const { redisClient } = require("../config/redis");
const buildConversationId = require("./buildConversationId");

/**
 * Lưu tin nhắn vào MongoDB và cập nhật Redis cache.
 * Chạy ngầm sau khi socket đã emit cho client.
 *
 * @param {Object} data - Dữ liệu tin nhắn từ socket event
 * @returns {Promise<Document|null>} - Document đã lưu hoặc null nếu lỗi
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
            return null;
        }

        const cacheKey = `chat_history:${conversationId}`;

        // Nếu đã có _id thì tin nhắn đã được lưu trước đó (VD: qua REST API)
        let savedMessage = data;

        if (!data._id) {
            const messageToSave = {
                conversationId,
                sender: senderId,
                receiver: data.receiverId || data.receiver,
                type: data.type || "text",
                text: data.content || data.text || "",
                attachments: data.attachments || [],
                isRead: false,
            };

            savedMessage = await Message.create(messageToSave);
        }

        // Cập nhật Redis Cache – giữ 50 tin nhắn mới nhất
        if (redisClient.isOpen) {
            const dataToCache = {
                ...(typeof savedMessage.toObject === "function"
                    ? savedMessage.toObject()
                    : savedMessage),
                conversationId,
                senderInfo: data.senderInfo || data.sender,
            };

            const multi = redisClient.multi();
            multi.lPush(cacheKey, JSON.stringify(dataToCache));
            multi.lTrim(cacheKey, 0, 49);
            await multi.exec();
        }

        return savedMessage;
    } catch (error) {
        console.error("[saveMessage] Lỗi lưu tin nhắn ngầm:", error);
        return null;
    }
}

module.exports = saveMessageInBackground;