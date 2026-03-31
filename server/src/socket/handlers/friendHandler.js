/**
 * Đăng ký các friend request events cho một socket
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerFriendHandlers = (socket, io) => {
    // Gửi lời mời kết bạn
    socket.on("sendFriendRequest", ({ senderId, receiverId, senderName }) => {
        console.log(`[Friend] Request from ${senderId} → ${receiverId}`);
        io.to(receiverId).emit("newFriendRequest", { senderId, senderName });
    });

    // Chấp nhận lời mời kết bạn
    socket.on(
        "acceptFriendRequest",
        ({ senderId, receiverId, receiverName, receiverAvatar }) => {
            console.log(`[Friend] Accepted by ${receiverId} ← ${senderId}`);
            io.to(senderId).emit("friendRequestAccepted", {
                newFriendId: receiverId,
                newFriendName: receiverName,
                newFriendAvatar: receiverAvatar,
            });
        }
    );

    // Từ chối lời mời kết bạn
    socket.on("rejectFriendRequest", ({ senderId, receiverId }) => {
        console.log(`[Friend] Rejected by ${receiverId} ← ${senderId}`);
        io.to(senderId).emit("friendRequestRejected", { rejecterId: receiverId });
    });
};

module.exports = { registerFriendHandlers };