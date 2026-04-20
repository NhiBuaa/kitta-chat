/**
 * ============================================================
 * conversationCacheService.js — Conversation List (ZSET Write-Through + ZREVRANGE)
 * ============================================================
 *
 * Tách biệt hoàn toàn Cache Key khỏi Socket.io Pub/Sub Channel:
 *   - Conversation ZSET:  "convs:{userId}"  -> Redis Sorted Set
 *   - Socket.io:           "socket.io#..."  -> do thư viện tự quản lý
 *
 * Mô hình Write-Through:
 *   - Mỗi tin nhắn mới -> ZADD cập nhật Score (timestamp) cho conversationId
 *   - ZREVRANGE đọc danh sách từ mới → cũ với O(log N)
 *
 */

const { cacheClient } = require("../config/redis");
const Message = require("../models/Message");
const User = require("../models/User");
const buildConversationId = require("../utils/buildConversationId");

const CONV_CACHE_PREFIX = "convs:";

const getConvKey = (userId) => `${CONV_CACHE_PREFIX}${userId}`;

// Write-Through: Cập nhật ZSET sau tin nhắn mới
/**
 * CẬP NHẬT DANH SÁCH TRÒ CHUYỆN (Write-Through)
 * Gọi ngay sau khi lưu tin nhắn vào MongoDB.
 * ZADD nếu chưa có -> thêm mới; ZADD nếu đã có -> cập nhật Score (timestamp) -> tự đưa lên đầu.
 *
 * @param {string} conversationId
 * @param {string[]} participantIds  — mảng userId tham gia cuộc trò chuyện
 * @param {number} lastMessageTimestamp — Unix timestamp (Date.now())
 */
const updateConversationWriteThrough = async (conversationId, participantIds, lastMessageTimestamp) => {
    const convIdStr = conversationId.toString();

    // ZADD cho TẤT CẢ thành viên — song song
    const zAddPromises = participantIds.map((userId) => {
        const key = getConvKey(userId);
        return cacheClient.zAdd(key, {
            score: lastMessageTimestamp,
            value: convIdStr,
        });
    });

    try {
        await Promise.all(zAddPromises);
        console.log(
            `[Write-Through] ZADD conversation=${convIdStr} score=${lastMessageTimestamp} participants=${participantIds.length}`
        );
    } catch (err) {
        console.warn("[Conv Cache] ZADD error:", err.message);
    }
};

// Đọc danh sách bằng ZREVRANGE + Warm-up
/**
 * LẤY DANH SÁCH TRÒ CHUYỆN (ZREVRANGE)
 * Đọc conversationId từ mới nhất -> cũ nhất.
 * Tự động Warm-up từ MongoDB khi Redis Cache Miss.
 *
 * @param {string} userId
 * @param {number} limit — số lượng cuộc trò chuyện muốn lấy (mặc định 20)
 * @returns {Promise<string[]>} — mảng conversationId đã sắp xếp
 */
const getRecentConversations = async (userId, limit = 20) => {
    const key = getConvKey(userId);

    // Check Cache Hit
    try {
        const exists = await cacheClient.exists(key);
        if (exists) {
            const conversationIds = await cacheClient.zRange(key, 0, limit - 1, { REV: true });
            console.log(`[Conv Cache] Hit user=${userId} count=${conversationIds.length}`);
            return conversationIds;
        }
    } catch (err) {
        console.warn(`[Conv Cache] EXISTS/ZREVRANGE error for ${key}:`, err.message);
    }

    // Cache Miss -> Warm-up từ MongoDB
    console.log(`[Conv Cache] Miss — warming up for user=${userId}`);

    // Lấy các cuộc trò chuyện của user, sắp xếp theo tin nhắn mới nhất
    const messages = await Message.find({
        $or: [{ sender: userId }, { receiver: userId }],
    })
        .sort({ _id: -1 }) // sort theo _id = createdAt (dùng index sẵn)
        .limit(200)        // lấy nhiều để đảm bảo cover đủ conversation
        .select("conversationId createdAt")
        .lean();

    // Lấy conversationId duy nhất + timestamp mới nhất của mỗi cuộc trò chuyện
    const convMap = new Map();
    for (const msg of messages) {
        const convId = msg.conversationId;
        if (!convMap.has(convId)) {
            convMap.set(convId, new Date(msg.createdAt).getTime());
        }
    }

    // Bao gồm bạn bè chưa nhắn tin
    const user = await User.findById(userId).select("friends").lean();
    if (user && user.friends) {
        for (const friendId of user.friends) {
            const convId = buildConversationId(userId, friendId);
            if (!convMap.has(convId)) {
                convMap.set(convId, 0); // score = 0 để ở cuối danh sách
            }
        }
    }

    if (convMap.size === 0) {
        return [];
    }

    // Chuyển Map -> array để ZADD
    const zAddEntries = Array.from(convMap.entries()).map(([convId, timestamp]) => ({
        score: timestamp,
        value: convId,
    }));

    if (zAddEntries.length > 0) {
        try {
            await cacheClient.zAdd(key, zAddEntries);
            console.log(`[Conv Cache] Warm-up wrote ${zAddEntries.length} conversations for ${userId}`);
        } catch (err) {
            console.warn("[Conv Cache] Warm-up ZADD error:", err.message);
        }
    }

    // Trả về danh sách đã sắp xếp (từ Map insertion order = timestamp giảm dần)
    return Array.from(convMap.keys());
};

// Xóa conversation khỏi ZSET
/**
 * Xóa 1 cuộc trò chuyện khỏi danh sách của user.
 * Dùng khi user rời nhóm hoặc xóa cuộc trò chuyện.
 *
 * @param {string} userId
 * @param {string} conversationId
 */
const removeConversation = async (userId, conversationId) => {
    const key = getConvKey(userId);
    try {
        await cacheClient.zRem(key, conversationId.toString());
        console.log(`[Conv Cache] Removed conversation=${conversationId} from user=${userId}`);
    } catch (err) {
        console.warn("[Conv Cache] ZREM error:", err.message);
    }
};

// Debug / Monitoring
/**
 * Liệt kê tất cả conversation cache key.
 */
const listConvCacheKeys = async () => {
    try {
        return await cacheClient.keys(`${CONV_CACHE_PREFIX}*`);
    } catch (err) {
        console.warn("[Conv Cache] Redis KEYS error:", err.message);
        return [];
    }
};

module.exports = {
    updateConversationWriteThrough,
    getRecentConversations,
    removeConversation,
    listConvCacheKeys,
    CONV_CACHE_PREFIX,
    getConvKey,
};
