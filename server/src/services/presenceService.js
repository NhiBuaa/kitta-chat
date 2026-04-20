/**
 * ============================================================
 * presenceService.js — Online Presence (Heartbeat + Write-Through + HASH O(1))
 * ============================================================
 *
 * Tách biệt hoàn toàn Cache Key khỏi Socket.io Pub/Sub Channel:
 *   - Presence Key: "presence:{userId}"   -> Redis HASH { status, lastSeen }
 *   - Socket.io:    "socket.io#..."      -> do thư viện tự quản lý
 *
 * Mô hình Write-Through:
 *   - Chỉ ghi MongoDB khi trạng thái THỰC SỰ thay đổi (Online -> Offline, Offline -> Online)
 *   - Heartbeat mỗi 20s KHÔNG chạm MongoDB, chỉ cập nhật Redis HASH + TTL 30s
 *
 * Ghost Online Fix:
 *   - Redis TTL 30s tự động xóa key khi user crash/rớt mạng (không gửi disconnect)
 *   - Client check HGETALL thấy rỗng = offline
 *
 * Flashing Fix (F5/Page Refresh):
 *   - Multi-tab: mỗi tab gửi heartbeat riêng → key không bị xóa khi 1 tab disconnect
 *   - Grace period 5s trong disconnect handler
 */

const { cacheClient } = require("../config/redis");
const User = require("../models/User");

const PRESENCE_PREFIX = "presence:";
const PRESENCE_TTL    = 30;   // 30 giây — heartbeat interval 20s -> margin 10s

const getPresenceKey = (userId) => `${PRESENCE_PREFIX}${userId}`;

// Write-Through: Cập nhật trạng thái
/**
 * CẬP NHẬT TRẠNG THÁI (Write-Through)
 * Chỉ ghi MongoDB khi có sự thay đổi trạng thái thực sự.
 * Dùng khi: Login, Logout, đổi trạng thái (online/away/offline).
 *
 * @param {string} userId
 * @param {"online"|"away"|"offline"} status
 */
const setPresenceWriteThrough = async (userId, status) => {
    const key = getPresenceKey(userId);
    const now = Date.now();

    const normalizedStatus =
        status === "online" ? "active" : status === "away" ? "busy" : status;

    if (normalizedStatus === "offline") {
        if (cacheClient.isOpen) {
            await User.findByIdAndUpdate(userId, {
                "activityStatus.state": "offline",
                "activityStatus.lastSeen": now,
            });
            await cacheClient.del(key);
        }
        console.log(`[Presence] User ${userId} -> OFFLINE (DB + Redis deleted)`);
        return;
    }

    const exists = cacheClient.isOpen ? await cacheClient.exists(key) : false;
    if (!exists) {
        await User.findByIdAndUpdate(userId, {
            "activityStatus.state": normalizedStatus,
            "activityStatus.lastSeen": now,
        });
        console.log(`[Presence] User ${userId} → ${normalizedStatus.toUpperCase()} (DB + Redis HASH)`);
    }

    if (cacheClient.isOpen) {
        await cacheClient.hSet(key, [
            "status",
            normalizedStatus,
            "lastSeen",
            now.toString(),
        ]);
        await cacheClient.expire(key, PRESENCE_TTL);
    }
};

// ─── Heartbeat (Chỉ Redis, không chạm DB) ─────────────────────
/**
 * HEARTBEAT — Gia hạn TTL + cập nhật lastSeen.
 * Client gửi mỗi 20s. TUYỆT ĐỐI KHÔNG ghi vào MongoDB.
 *
 * @param {string} userId
 */
const renewHeartbeat = async (userId) => {
    const key = getPresenceKey(userId);

    if (!cacheClient.isOpen) return;

    try {
        const exists = await cacheClient.exists(key);
        if (exists) {
            await cacheClient.hSet(key, "lastSeen", Date.now().toString());
            await cacheClient.expire(key, PRESENCE_TTL);
        }
    } catch (err) {
        console.warn(`[Presence] renewHeartbeat error:`, err.message);
    }
};

// ─── O(1) Lấy trạng thái ───────────────────────────────────────
/**
 * LẤY TRẠNG THÁI O(1) bằng HGETALL.
 * Nếu HASH rỗng hoặc key hết hạn → coi như offline.
 *
 * @param {string} userId
 * @returns {{ status: string, lastSeen: number | null }}
 */
const getUserPresence = async (userId) => {
    const key = getPresenceKey(userId);

    if (!cacheClient.isOpen) {
        const user = await User.findById(userId).select("activityStatus").lean();
        return {
            status: user?.activityStatus?.state || "offline",
            lastSeen: user?.activityStatus?.lastSeen
                ? new Date(user.activityStatus.lastSeen).getTime()
                : null,
        };
    }

    try {
        const presence = await cacheClient.hGetAll(key);
        if (Object.keys(presence).length === 0) {
            return { status: "offline", lastSeen: null };
        }
        return {
            status: presence.status || "offline",
            lastSeen: presence.lastSeen ? parseInt(presence.lastSeen, 10) : null,
        };
    } catch (err) {
        console.warn(`[Presence] HGETALL error for ${key}:`, err.message);
        const user = await User.findById(userId).select("activityStatus").lean();
        return {
            status: user?.activityStatus?.state || "offline",
            lastSeen: user?.activityStatus?.lastSeen
                ? new Date(user.activityStatus.lastSeen).getTime()
                : null,
        };
    }
};

// ─── O(1) Batch lấy nhiều trạng thái ───────────────────────────
/**
 * Lấy trạng thái online/offline cho nhiều user cùng lúc.
 * Dùng cho API hiển thị danh sách bạn bè với trạng thái.
 *
 * @param {string[]} userIds
 * @returns {Promise<Record<string, { status: string, lastSeen: number | null }>>}
 */
const getMultiPresence = async (userIds) => {
    const results = {};

    // Pipeline: HGETALL cho từng user song song
    await Promise.all(
        userIds.map(async (userId) => {
            results[userId] = await getUserPresence(userId);
        })
    );

    return results;
};

// ─── Debug / Monitoring ─────────────────────────────────────────
/**
 * Liệt kê tất cả presence key đang tồn tại.
 */
const listPresenceKeys = async () => {
    try {
        return await cacheClient.keys(`${PRESENCE_PREFIX}*`);
    } catch (err) {
        console.warn("[Presence] Redis KEYS error:", err.message);
        return [];
    }
};

module.exports = {
    setPresenceWriteThrough,
    renewHeartbeat,
    getUserPresence,
    getMultiPresence,
    listPresenceKeys,
    PRESENCE_PREFIX,
    PRESENCE_TTL,
    getPresenceKey,
};