const User = require("../../models/User");
const Group = require("../../models/Group");

/**
 * Lấy đối tượng Redis Client đã được khởi tạo từ Server
 * Hàm này dùng để lấy redisClient động mỗi khi cần truy vấn
 */
const getRedisClient = (io) => io.engine.server.app?.get("redisClient");

/**
 * Trả về payload danh sách online để emit cho client
 */
const getOnlineUsersPayload = async (redisClient) => {
    // Lấy toàn bộ danh sách users từ Hash "online_users" trong Redis
    const onlineUsersHash = await redisClient.hGetAll("online_users");

    const payload = [];
    for (const [userId, socketIdsStr] of Object.entries(onlineUsersHash)) {
        const socketIds = socketIdsStr.split(',').filter(id => id);
        if (socketIds.length > 0) {
            payload.push({
                userId,
                socketId: socketIds[socketIds.length - 1],
                socketIds: socketIds,
            });
        }
    }
    return payload;
};

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
            console.log(`[Presence] Broadcast "${status}" for ${userId} -> ${targetRooms.length} rooms`);
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
    // Kết nối mới / Đăng ký User
    socket.on("addNewUser", async (userId) => {
        if (!userId || userId === "undefined") return;

        const redisClient = getRedisClient(io);
        // Tránh đăng ký lại nếu socket đã join cùng userId
        if (!redisClient) {
            console.error("[Presence] Redis client not available");
            return;
        }

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

            // ==============================
            // LOGIC REDI
            // ==============================

            // Xóa flag "đang chờ offline" (nếu có) do user vừa reconnect (tránh flicker khi F5)
            await redisClient.del(`offline_timer:${userId}`);

            // Lấy danh sách SocketId hiện tại của User trong Redis
            let currentSocketsStr = await redisClient.hGet("online_users", userId);
            let currentSockets = currentSocketsStr ? currentSocketsStr.split(',').filter(id => id) : [];

            const isFirstConnection = currentSockets.length === 0;

            // Thêm socketId mới vào mảng
            if (!currentSockets.includes(socket.id)) {
                currentSockets.push(socket.id);
                await redisClient.hSet("online_users", userId, currentSockets.join(','));
            }

            // Chỉ broadcast "online" nếu đây là kết nối đầu tiên của User trên toàn hệ thống
            if (isFirstConnection) {
                broadcastUserStatus(io, userId, "online");
                await User.findByIdAndUpdate(userId, { "activityStatus.state": "active" });
            }

            // Lấy danh sách payload từ Redis và gửi cho Client
            const payload = await getOnlineUsersPayload(redisClient);
            socket.emit("getOnlineUsers", payload);

        } catch (err) {
            console.error(`[Presence] Error joining rooms for ${userId}:`, err);
        }
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

    // Disconnect 
    socket.on("disconnect", async () => {
        const userId = socket.userId;
        if (!userId) return;

        socket.userRegistered = false;

        const redisClient = getRedisClient(io);
        if (!redisClient) return;

        try {
            //  Xóa SocketId hiện tại khỏi danh sách của User trong Redis
            let currentSocketsStr = await redisClient.hGet("online_users", userId);
            if (currentSocketsStr) {
                let currentSockets = currentSocketsStr.split(',');
                currentSockets = currentSockets.filter(id => id !== socket.id);

                if (currentSockets.length > 0) {
                    // Nếu User vẫn còn tab/thiết bị khác đang mở
                    await redisClient.hSet("online_users", userId, currentSockets.join(','));
                } else {
                    // Nếu User đã đóng hết toàn bộ tab/thiết bị
                    await redisClient.hDel("online_users", userId);

                    // Thay vì dùng setTimeout (chỉ chạy trên 1 Server), ta dùng cơ chế Cache tạm trên Redis
                    // Đặt cờ "offline_timer" với thời gian hết hạn (TTL) là 5 giây
                    await redisClient.setEx(`offline_timer:${userId}`, 5, "pending");

                    // Đặt một timer cục bộ để sau 5s kiểm tra lại cờ này trên Redis
                    setTimeout(async () => {
                        try {
                            // Kiểm tra xem cờ còn tồn tại hay không (hay là user đã reconnect và xóa nó rồi)
                            const isPending = await redisClient.get(`offline_timer:${userId}`);
                            const isStillOffline = !(await redisClient.hExists("online_users", userId));

                            // Nếu cờ chờ đã hết hạn HOẶC không có kết nối mới nào
                            if (!isPending && isStillOffline) {
                                console.log(`[Presence] Confirmed offline: ${userId}`);
                                broadcastUserStatus(io, userId, "offline");
                                await User.findByIdAndUpdate(userId, {
                                    activityStatus: { state: "offline", lastSeen: new Date() },
                                });
                            } else {
                                console.log(`[Presence] Cancelled offline for ${userId} - reconnected on another tab/server`);
                            }
                        } catch (err) {
                            console.error("[Presence] Error resolving offline status:", err);
                        }
                    }, 5500);
                }
            }
        } catch (err) {
            console.error(`[Presence] Disconnect error for ${userId}:`, err);
        }
    });
};

module.exports = { registerPresenceHandlers, getOnlineUsersPayload };