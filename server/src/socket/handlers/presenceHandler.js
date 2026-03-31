const User = require("../../models/User");
const Group = require("../../models/Group");

// Shared presence state (module-level singleton)
const onlineUsers = new Map();      // userId -> Set<socketId>
const userConnections = new Map();  // userId -> connection count
const disconnectTimers = new Map(); // userId -> setTimeout handle

/**
 * Trả về payload danh sách online để emit cho client
 */
const getOnlineUsersPayload = () =>
    Array.from(onlineUsers.entries()).map(([userId, socketIds]) => ({
        userId,
        socketId: Array.from(socketIds)[socketIds.size - 1] || null,
        socketIds: Array.from(socketIds),
    }));

/**
 * Broadcast trạng thái online/offline đến các room liên quan
 * (bạn bè và các nhóm chung)
 */
const broadcastUserStatus = async (io, userId, status) => {
    try {
        const groups = await Group.find({ members: userId }).select("_id");
        const groupIds = groups.map((g) => g._id.toString());

        const user = await User.findById(userId).select("friends");
        const friendIds = user?.friends?.map((f) => f.toString()) ?? [];

        const targetRooms = [...new Set([...groupIds, ...friendIds])];

        if (targetRooms.length > 0) {
            io.to(targetRooms).emit("userStatusChanged", { userId, status });
            console.log(`[Presence] Broadcast "${status}" for ${userId} → ${targetRooms.length} rooms`);
        } else {
            console.log(`[Presence] User ${userId} is ${status} but has no related rooms`);
        }
    } catch (error) {
        console.error(`[Presence] broadcastUserStatus error for ${userId}:`, error);
    }
};

/**
 * Đăng ký tất cả presence events cho một socket
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerPresenceHandlers = (socket, io) => {
    // addNewUser 
    socket.on("addNewUser", async (userId) => {
        if (!userId || userId === "undefined") return;

        // Tránh đăng ký lại nếu socket đã join cùng userId
        if (socket.userRegistered && socket.userId === userId) {
            socket.emit("getOnlineUsers", getOnlineUsersPayload());
            return;
        }

        const hadPendingOfflineTimer = disconnectTimers.has(userId);
        const currentCount = userConnections.get(userId) || 0;

        try {
            socket.userId = userId;
            socket.userRegistered = true;

            // Join room userId để nhận tin nhắn 1-1
            socket.join(userId);

            // Join tất cả room Group mà user là thành viên
            const userGroups = await Group.find({ members: userId });
            userGroups.forEach((group) => {
                socket.join(group._id.toString());
            });
        } catch (err) {
            console.error(`[Presence] Error joining rooms for ${userId}:`, err);
        }

        // Cập nhật onlineUsers map
        const existingSocketIds = onlineUsers.get(userId) || new Set();
        existingSocketIds.add(socket.id);
        onlineUsers.set(userId, existingSocketIds);

        // Hủy timer offline nếu user kết nối lại trong vòng 5s
        if (hadPendingOfflineTimer) {
            clearTimeout(disconnectTimers.get(userId));
            disconnectTimers.delete(userId);
            console.log(`[Presence] Cancelled offline timer for ${userId}`);
        }

        userConnections.set(userId, currentCount + 1);

        // Chỉ broadcast "online" lần đầu tiên kết nối
        if (!hadPendingOfflineTimer && currentCount === 0) {
            broadcastUserStatus(io, userId, "online");
            await User.findByIdAndUpdate(userId, { "activityStatus.state": "active" });
        }

        socket.emit("getOnlineUsers", getOnlineUsersPayload());
    });

    // joinGroup / leaveGroup 
    socket.on("joinGroup", (groupId) => {
        if (!groupId) return;
        socket.join(groupId);
        console.log(`[Socket] ${socket.id} joined group ${groupId}`);
    });

    socket.on("leaveGroup", (groupId) => {
        if (!groupId) return;
        socket.leave(groupId);
        console.log(`[Socket] ${socket.id} left group ${groupId}`);
    });

    // disconnect 
    socket.on("disconnect", () => {
        const userId = socket.userId;
        if (!userId) return;

        socket.userRegistered = false;

        // Xóa socketId này khỏi onlineUsers
        const existingSocketIds = onlineUsers.get(userId);
        if (existingSocketIds) {
            existingSocketIds.delete(socket.id);
            if (existingSocketIds.size === 0) {
                onlineUsers.delete(userId);
            }
        }

        const currentCount = userConnections.get(userId) || 0;
        const newCount = Math.max(0, currentCount - 1);
        userConnections.set(userId, newCount);

        console.log(`[Presence] User ${userId} disconnected. Count: ${currentCount} → ${newCount}`);

        // Đặt timer 5s để xác nhận offline (tránh flicker khi reload trang)
        if (newCount === 0) {
            const timerId = setTimeout(async () => {
                try {
                    const finalCount = userConnections.get(userId) || 0;
                    const finalSocketCount = onlineUsers.get(userId)?.size || 0;

                    if (finalCount === 0 && finalSocketCount === 0) {
                        console.log(`[Presence] Confirmed offline: ${userId}`);

                        broadcastUserStatus(io, userId, "offline");
                        await User.findByIdAndUpdate(userId, {
                            activityStatus: { state: "offline", lastSeen: new Date() },
                        });

                        userConnections.delete(userId);
                        disconnectTimers.delete(userId);
                    } else {
                        console.log(`[Presence] Cancelled offline for ${userId} - reconnected`);
                    }
                } catch (error) {
                    console.error("[Presence] Timer offline error:", error);
                }
            }, 5000);

            disconnectTimers.set(userId, timerId);
        }
    });
};

module.exports = { registerPresenceHandlers, getOnlineUsersPayload, onlineUsers };