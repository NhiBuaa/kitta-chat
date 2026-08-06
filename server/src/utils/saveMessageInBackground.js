const Message = require("../models/Message");
const { cacheClient } = require("../config/redis");
const buildConversationId = require("./buildConversationId");
const { dualWriteConfirmedMessage } = require("../services/conversationDualWriteService");

const NOOP_METRICS_MODULE = Object.freeze({
    observeMessagePersistence() {},
});

let configuredMetricsModule = NOOP_METRICS_MODULE;

const configureMetricsModule = (metricsModule) => {
    configuredMetricsModule = metricsModule
        && typeof metricsModule.observeMessagePersistence === "function"
        ? metricsModule
        : NOOP_METRICS_MODULE;
    return configuredMetricsModule;
};

const toDurationSeconds = (startedAt, finishedAt) =>
    Number(finishedAt - startedAt) / 1_000_000_000;

const toComparableId = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "object" && value._id !== undefined) {
        return toComparableId(value._id);
    }
    return String(value);
};

const toComparableIds = (value) =>
    (Array.isArray(value) ? value : []).map(toComparableId);

const toComparableLinks = (value) =>
    (Array.isArray(value) ? value : []).map((link) => ({
        url: link?.url || null,
        hostname: link?.hostname || null,
    }));

const isVerifiedDuplicate = (existingDoc, messageToSave) => {
    if (
        !existingDoc
        || !messageToSave
        || !toComparableId(messageToSave.sender)
        || !toComparableId(messageToSave.idempotencyKey)
    ) return false;

    const persisted = typeof existingDoc.toObject === "function"
        ? existingDoc.toObject()
        : existingDoc;

    return toComparableId(persisted.sender) === toComparableId(messageToSave.sender)
        && toComparableId(persisted.receiver) === toComparableId(messageToSave.receiver)
        && toComparableId(persisted.conversationId) === toComparableId(messageToSave.conversationId)
        && (persisted.type || "text") === messageToSave.type
        && (persisted.text || "") === messageToSave.text
        && toComparableIds(persisted.attachments).join(",") === toComparableIds(messageToSave.attachments).join(",")
        && Boolean(persisted.hasLink) === Boolean(messageToSave.hasLink)
        && JSON.stringify(toComparableLinks(persisted.links)) === JSON.stringify(toComparableLinks(messageToSave.links))
        && toComparableId(persisted.idempotencyKey) === toComparableId(messageToSave.idempotencyKey);
};

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
async function saveMessageInBackground(data, options = {}) {
    const metricsModule = options?.metricsModule || configuredMetricsModule;
    const clock = options?.clock || process.hrtime.bigint;
    let persistenceStartedAt = null;
    let persistenceObservationRecorded = false;
    let messageToSave = null;

    const startPersistenceTimer = () => {
        try {
            persistenceStartedAt = clock();
        } catch (error) {
            persistenceStartedAt = null;
            console.warn("[saveMessage] Persistence timing unavailable:", error?.message);
        }
    };

    const observePersistence = (outcome) => {
        if (persistenceObservationRecorded || persistenceStartedAt === null) return;
        persistenceObservationRecorded = true;

        try {
            const durationSeconds = toDurationSeconds(persistenceStartedAt, clock());
            if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
                metricsModule.observeMessagePersistence({ outcome, durationSeconds });
            }
        } catch (error) {
            console.warn("[saveMessage] Persistence metric observation failed:", error?.message);
        }
    };

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

        messageToSave = {
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
            startPersistenceTimer();
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
            startPersistenceTimer();
            savedMessage = await Message.create(messageToSave);
        }

        if (!savedMessage) {
            observePersistence("failed");
            return { doc: null, isDuplicate: false };
        }

        if (isDuplicate && !isVerifiedDuplicate(savedMessage, messageToSave)) {
            observePersistence("failed");
            return { doc: null, isDuplicate: false };
        }

        observePersistence("success");

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
                if (!isVerifiedDuplicate(existingDoc, messageToSave)) {
                    observePersistence("failed");
                    return { doc: null, isDuplicate: false };
                }
                observePersistence("success");
                return { doc: existingDoc, isDuplicate: true };
            } catch (e2) {
                observePersistence("failed");
                console.error("[saveMessage] Lỗi khi fetch doc trùng:", e2);
                return { doc: null, isDuplicate: false };
            }
        }

        observePersistence("failed");
        console.error("[saveMessage] Lỗi lưu tin nhắn ngầm:", error);
        return { doc: null, isDuplicate: false };
    }
}

saveMessageInBackground.configureMetricsModule = configureMetricsModule;

module.exports = saveMessageInBackground;


