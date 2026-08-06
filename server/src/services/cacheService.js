/**
 * ============================================================
 * cacheService.js — User Profile Cache (Cache-Aside Pattern)
 * ============================================================
 *
 * Tách biệt hoàn toàn Cache Key khỏi Socket.io Pub/Sub Channel:
 *   - Cache Key:  "cache:user:{id}"
 *   - Socket.io: "socket.io#..." (do thư viện tự quản lý)
 *
 * Điều này đảm bảo 2 namespace không xung đột trên cùng 1 Redis instance.
 */

const { cacheClient } = require("../config/redis");
const {
    observeRedisOperation,
    observeCacheFallback,
} = require("../observability/metrics/runtime");

const USER_CACHE_TTL     = 900;
const USER_CACHE_PREFIX  = "cache:user:";

/**
 * Lấy user profile — ưu tiên cache, query DB khi miss.
 *
 * @param {string}   userId     MongoDB ObjectId dạng string
 * @param {Function} UserModel  Mongoose User model
 * @returns {Object|null}       User document hoặc null nếu không tồn tại
 */
const getCachedUserProfile = async (userId, UserModel, metrics) => {
    const cacheKey = `${USER_CACHE_PREFIX}${userId}`;
    let fallbackReason = null;

    // Check Redis trước  ->  Cache Hit
    let cachedData = null;
    try {
        cachedData = await cacheClient.get(cacheKey);
        observeRedisOperation(metrics, { operation: "get", outcome: "success" });
    } catch (err) {
        // Redis bị lỗi -> fallback sang DB
        observeRedisOperation(metrics, { operation: "get", outcome: "error" });
        fallbackReason = "redis_error";
        console.warn(`[Cache] Redis GET error for ${cacheKey}:`, err.message);
    }

    if (cachedData) {
        try {
            console.log(`[Cache Hit] User: ${userId}`);
            return JSON.parse(cachedData);
        } catch (err) {
            fallbackReason = "redis_error";
            console.warn(`[Cache] Redis GET error for ${cacheKey}:`, err.message);
        }
    }

    if (!fallbackReason) {
        fallbackReason = "miss";
    }
    observeCacheFallback(metrics, { reason: fallbackReason });

    // Cache Miss -> Query MongoDB
    console.log(`[Cache Miss] Querying DB for User: ${userId}`);
    const user = await UserModel.findById(userId)
        .select("displayName avatar status activityStatus")
        .lean();

    if (user) {
        try {
            await cacheClient.setEx(cacheKey, USER_CACHE_TTL, JSON.stringify(user));
            observeRedisOperation(metrics, { operation: "set_ex", outcome: "success" });
            console.log(`[Cache Write] ${cacheKey} → TTL ${USER_CACHE_TTL}s`);
        } catch (err) {
            observeRedisOperation(metrics, { operation: "set_ex", outcome: "error" });
            console.warn(`[Cache] Redis SET error for ${cacheKey}:`, err.message);
        }
    }

    return user;
};

// Cache-Aside: Invalidate (Write)
/**
 * Xóa cache khi user cập nhật profile.
 * Các request tiếp theo sẽ tự động repopulate cache mới từ MongoDB.
 *
 * @param {string} userId MongoDB ObjectId dạng string
 */
const invalidateUserProfile = async (userId, metrics) => {
    const cacheKey = `${USER_CACHE_PREFIX}${userId}`;
    try {
        await cacheClient.del(cacheKey);
        observeRedisOperation(metrics, { operation: "del", outcome: "success" });
        console.log(`[Cache Invalidate] ${cacheKey}`);
    } catch (err) {
        observeRedisOperation(metrics, { operation: "del", outcome: "error" });
        console.warn(`[Cache] Redis DEL error for ${cacheKey}:`, err.message);
    }
};

// Debug / Monitoring
/**
 * Liệt kê tất cả cache key đang tồn tại trong Redis.
 * Dùng cho lấy bằng chứng demo
 */
const listUserCacheKeys = async () => {
    try {
        return await cacheClient.keys(`${USER_CACHE_PREFIX}*`);
    } catch (err) {
        console.warn("[Cache] Redis KEYS error:", err.message);
        return [];
    }
};

module.exports = {
    getCachedUserProfile,
    invalidateUserProfile,
    listUserCacheKeys,
    USER_CACHE_PREFIX,
    USER_CACHE_TTL,
};
