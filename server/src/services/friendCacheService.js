
/**
 * ============================================================
 * friendCacheService.js — Friend List Cache (Write-Through + SISMEMBER O(1))
 * ============================================================
 *
 * Tách biệt hoàn toàn Cache Key khỏi Socket.io Pub/Sub Channel:
 *   - Cache Key:  "cache:friends:{userId}"  → Redis SET chứa danh sách bạn bè
 *   - Socket.io: "socket.io#..."           → do thư viện tự quản lý
 *
 * Mô hình Write-Through:
 *   - Khi A và B trở thành bạn bè → cập nhật ĐỒNG THỜI vào MongoDB và Redis SET
 *   - Khi A hủy kết bạn với B    → xóa ĐỒNG THỜI khỏi MongoDB và Redis SET
 *
 * O(1) Friend Check:
 *   - SISMEMBER kiểm tra bạn bè trong < 2ms, không chạm MongoDB
 *   - Có cơ chế Warm-up tự động khi Redis Set bị mất (sau restart/crash)
 */

const { cacheClient } = require("../config/redis");
const User = require("../models/User");

const FRIEND_CACHE_PREFIX = "cache:friends:";

const getFriendKey = (userId) => `${FRIEND_CACHE_PREFIX}${userId}`;

// Write-Through: Thêm Bạn Bè
/**
 * Khi A và B trở thành bạn bè -> cập nhật MongoDB + Redis SET đồng thời.
 * Dùng $addToSet trong MongoDB để tránh trùng lặp.
 *
 * @param {string} userIdA  ID người gửi lời mời
 * @param {string} userIdB  ID người nhận lời mời (đã chấp nhận)
 */
const addFriendWriteThrough = async (userIdA, userIdB) => {
    const keyA = getFriendKey(userIdA);
    const keyB = getFriendKey(userIdB);

    // Ghi MongoDB trước (source of truth)
    await Promise.all([
        User.findByIdAndUpdate(userIdA, { $addToSet: { friends: userIdB } }),
        User.findByIdAndUpdate(userIdB, { $addToSet: { friends: userIdA } }),
    ]);

    // Ghi Redis SET song song — Write-Through
    await Promise.all([
        cacheClient.sAdd(keyA, userIdB.toString()),
        cacheClient.sAdd(keyB, userIdA.toString()),
    ]);

    console.log(
        `[Write-Through] Friend added: ${userIdA} <-> ${userIdB}`
    );
};

// Write-Through: Hủy Bạn Bè
/**
 * Khi A hủy kết bạn với B -> xóa khỏi MongoDB + Redis SET đồng thời.
 *
 * @param {string} userIdA  ID người thực hiện hủy
 * @param {string} userIdB  ID người bị hủy
 */
const removeFriendWriteThrough = async (userIdA, userIdB) => {
    const keyA = getFriendKey(userIdA);
    const keyB = getFriendKey(userIdB);

    // Xóa khỏi MongoDB
    await Promise.all([
        User.findByIdAndUpdate(userIdA, { $pull: { friends: userIdB } }),
        User.findByIdAndUpdate(userIdB, { $pull: { friends: userIdA } }),
    ]);

    // Xóa khỏi Redis SET
    await Promise.all([
        cacheClient.sRem(keyA, userIdB.toString()),
        cacheClient.sRem(keyB, userIdA.toString()),
    ]);

    console.log(
        `[Write-Through] Friend removed: ${userIdA} <-/-> ${userIdB}`
    );
};

// O(1) Friend Check
/**
 * Kiểm tra xem targetId có trong danh sách bạn bè của userId không.
 * Có cơ chế Warm-up tự động khi Redis Set bị miss (sau Redis restart).
 *
 * @param {string} userId    ID người thực hiện kiểm tra
 * @param {string} targetId ID người cần kiểm tra
 * @returns {boolean}
 */
const checkIsFriend = async (userId, targetId) => {
    const key = getFriendKey(userId);

    // Check tồn tại Set trong Redis
    let setExists = false;
    try {
        setExists = await cacheClient.exists(key);
    } catch (err) {
        console.warn(`[Friend Cache] EXISTS error for ${key}:`, err.message);
    }

    // Cache Miss -> Warm-up từ MongoDB
    if (!setExists) {
        console.log(`[Friend Cache] Warm-up for user: ${userId}`);
        const user = await User.findById(userId).select("friends").lean();

        if (user && user.friends && user.friends.length > 0) {
            const friendStrings = user.friends.map((id) => id.toString());
            // SADD toàn bộ friend list lên Redis SET trong 1 lệnh
            if (friendStrings.length > 0) {
                await cacheClient.sAdd(key, friendStrings);
            }
        } else {
            // Không có bạn bè -> tạo placeholder để tránh Cache Penetration
            await cacheClient.sAdd(key, "__no_friends__");
            await cacheClient.expire(key, 3600);
        }
    }

    // O(1) Check bằng SISMEMBER
    try {
        const result = await cacheClient.sIsMember(key, targetId.toString());
        // redis client trả về 1 (true) hoặc 0 (false)
        return result === 1 || result === true;
    } catch (err) {
        console.warn(`[Friend Cache] SISMEMBER error for ${key}:`, err.message);
        // Fallback: check MongoDB nếu Redis lỗi
        const user = await User.findById(userId).select("friends").lean();
        return (
            user?.friends?.some(
                (fId) => fId.toString() === targetId.toString()
            ) ?? false
        );
    }
};

// Get All Friends (từ Cache với Warm-up)
/**
 * Lấy toàn bộ danh sách bạn bè từ Redis SET.
 * Tự động Warm-up nếu Set chưa tồn tại.
 *
 * @param {string} userId
 * @returns {Promise<string[]>} Mảng ID bạn bè
 */
const getFriendIdsFromCache = async (userId) => {
    const key = getFriendKey(userId);

    let setExists = false;
    try {
        setExists = await cacheClient.exists(key);
    } catch (err) {
        console.warn(`[Friend Cache] EXISTS error for ${key}:`, err.message);
    }

    if (!setExists) {
        console.log(`[Friend Cache] Warm-up for user: ${userId}`);
        const user = await User.findById(userId).select("friends").lean();

        if (user && user.friends && user.friends.length > 0) {
            const friendStrings = user.friends.map((id) => id.toString());
            if (friendStrings.length > 0) {
                await cacheClient.sAdd(key, friendStrings);
            }
            return friendStrings;
        } else {
            await cacheClient.sAdd(key, "__no_friends__");
            await cacheClient.expire(key, 3600);
            return [];
        }
    }

    try {
        const members = await cacheClient.sMembers(key);
        // Loại bỏ placeholder nếu có
        return members.filter((m) => m !== "__no_friends__");
    } catch (err) {
        console.warn(`[Friend Cache] SMEMBERS error for ${key}:`, err.message);
        // Fallback MongoDB
        const user = await User.findById(userId).select("friends").lean();
        return user?.friends?.map((id) => id.toString()) ?? [];
    }
};

// Debug / Monitoring
/**
 * Liệt kê tất cả friend cache key đang tồn tại.
 */
const listFriendCacheKeys = async () => {
    try {
        return await cacheClient.keys(`${FRIEND_CACHE_PREFIX}*`);
    } catch (err) {
        console.warn("[Friend Cache] Redis KEYS error:", err.message);
        return [];
    }
};

module.exports = {
    addFriendWriteThrough,
    removeFriendWriteThrough,
    checkIsFriend,
    getFriendIdsFromCache,
    listFriendCacheKeys,
    FRIEND_CACHE_PREFIX,
    getFriendKey,
};