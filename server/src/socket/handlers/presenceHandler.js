const User = require("../../models/User");
const Group = require("../../models/Group");
const {
    setPresenceWriteThrough,
    renewHeartbeat,
} = require("../../services/presenceService");

const NODE_NAME = process.env.NODE_NAME || process.env.HOSTNAME || "backend";
const logPrefix = `[Presence][node=${NODE_NAME}]`;

/**
 * Lấy đối tượng Redis Client đã được khởi tạo từ Server
 * Hàm này dùng để lấy redisClient động mỗi khi cần truy vấn
 */
const getRedisClient = (io) => io.redisClient;

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
            console.log(`${logPrefix} broadcast status=${status} user=${userId} rooms=${targetRooms.length}`);
        } else {
            console.log(`${logPrefix} user=${userId} status=${status} rooms=0`);
        }
    } catch (error) {
        console.error(`${logPrefix} broadcastUserStatus error user=${userId}:`, error);
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
        if (!redisClient) {
            console.error(`${logPrefix} Redis client not available`);
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
            console.log(`${logPrefix} register user=${userId} socket=${socket.id} joinedUserRoom=${userId} joinedGroupCount=${userGroups.length}`);

            // MULTI-TAB SUPPORT
            // Xóa flag "đang chờ offline" (nếu có) do user vừa reconnect (tránh flicker khi F5)
            await redisClient.del(`offline_timer:${userId}`);

            // Thêm socket.id vào Set chứa các kết nối của user này
            await redisClient.sAdd(`user_sockets:${userId}`, socket.id);

            const socketCount = await redisClient.sCard(`user_sockets:${userId}`);
            const isFirstConnection = socketCount === 1;

            // Chỉ broadcast + ghi DB khi đây là kết nối đầu tiên (không phải tab thứ 2/3)
            if (isFirstConnection) {
                // Write-Through: Cập nhật MongoDB + Redis HASH đồng thời
                await setPresenceWriteThrough(userId, "online");

                // Cập nhật global online users set (dùng cho API online-friends)
                await redisClient.sAdd("global_online_users", userId);

                // Broadcast cho bạn bè + nhóm
                broadcastUserStatus(io, userId, "online");
            } else {
                // Tab thứ N (N>1): chỉ bơm heartbeat để giữ TTL
                await renewHeartbeat(userId);
            }

        } catch (err) {
            console.error(`${logPrefix} Error joining rooms for user=${userId}:`, err);
        }
    });

    // Heartbeat (Client gửi mỗi 20s)
    socket.on("heartbeat", async () => {
        const userId = socket.userId || socket.userId;
        if (!userId) return;
        try {
            await renewHeartbeat(userId);
        } catch (err) {
            console.warn(`${logPrefix} heartbeat error user=${userId}:`, err.message);
        }
    });

    // joinGroup / leaveGroup 
    socket.on("joinGroup", async (groupId) => {
        try {
            if (!groupId) return;

            const userId = socket.userId;

            // Kiểm tra xem socket này đã có danh tính chưa
            if (!userId) {
                console.warn(`${logPrefix} SECURITY socket=${socket.id} joinGroup denied group=${groupId} reason=missing-userId`);
                socket.emit("error", { message: "Bạn chưa xác thực danh tính." });
                return;
            }

            // Query DB để xác thực quyền
            // Tìm xem có Group nào khớp ID và có chứa userId này trong mảng members không
            const isMember = await Group.exists({
                _id: groupId,
                members: userId
            });

            if (!isMember) {
                // NẾU KHÔNG PHẢI THÀNH VIÊN -> Chặn đứng và ghi log cảnh báo
                console.warn(`${logPrefix} SECURITY user=${userId} socket=${socket.id} joinGroup denied group=${groupId} reason=not-member`);
                socket.emit("error", { message: "Bạn không có quyền tham gia nhóm này." });
                return;
            }

            // Nếu qua được bài kiểm tra, cho phép join
            socket.join(groupId);
            console.log(`${logPrefix} joinGroup ok user=${userId} socket=${socket.id} group=${groupId}`);

        } catch (error) {
            console.error(`${logPrefix} joinGroup error group=${groupId}:`, error);
            socket.emit("error", { message: "Lỗi hệ thống khi tham gia nhóm." });
        }
    });

    socket.on("leaveGroup", (groupId) => {
        try {
            if (!groupId) return;

            const userId = socket.userId;
            if (!userId) return;

            socket.leave(groupId);
            console.log(`${logPrefix} leaveGroup user=${userId} socket=${socket.id} group=${groupId}`);
        } catch (error) {
            console.error(`${logPrefix} leaveGroup error group=${groupId}:`, error);
        }
    });

    // Disconnect
    socket.on("disconnect", async () => {
        const userId = socket.userId;
        if (!userId) return;

        socket.userRegistered = false;
        const redisClient = getRedisClient(io);
        if (!redisClient) return;

        try {
            // Xóa socket.id này khỏi Set của User
            await redisClient.sRem(`user_sockets:${userId}`, socket.id);

            // Đếm xem User còn tab/thiết bị nào khác đang mở không
            const socketCount = await redisClient.sCard(`user_sockets:${userId}`);

            if (socketCount === 0) {
                // Đặt cờ Grace Period 5s - tránh Flashing khi F5
                await redisClient.setEx(`offline_timer:${userId}`, 5, "pending");

                setTimeout(async () => {
                    try {
                        const isPending = await redisClient.get(`offline_timer:${userId}`);
                        const finalCount = await redisClient.sCard(`user_sockets:${userId}`);

                        // Chỉ offline thật sự khi: không còn pending + không còn tab nào
                        if (!isPending && finalCount === 0) {
                            console.log(`${logPrefix} confirmedOffline user=${userId}`);

                            // Write-Through: Xóa khỏi MongoDB + Redis HASH đồng thời
                            await setPresenceWriteThrough(userId, "offline");

                            // Xóa khỏi global online users set
                            await redisClient.sRem("global_online_users", userId);

                            // Broadcast cho bạn bè + nhóm
                            broadcastUserStatus(io, userId, "offline");
                        }
                    } catch (err) {
                        console.error(`${logPrefix} Error resolving offline status:`, err);
                    }
                }, 5500);
            }
        } catch (err) {
            console.error(`${logPrefix} Disconnect error for user=${userId}:`, err);
        }
    });
};

module.exports = { registerPresenceHandlers, getOnlineUsersPayload, broadcastUserStatus };
