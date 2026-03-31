/**
 * Đăng ký typing indicator events cho một socket
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerTypingHandlers = (socket, io) => {
    socket.on("typing", ({ receiverId, isGroup, senderId, senderName, senderAvatar }) => {
        if (isGroup) {
            // Broadcast đến các thành viên khác trong nhóm (trừ người đang gõ)
            socket.broadcast.to(receiverId).emit("getTyping", {
                chatId: receiverId,
                isGroup: true,
                senderId,
                senderName,
                senderAvatar,
            });
        } else {
            io.to(receiverId).emit("getTyping", {
                chatId: senderId,
                isGroup: false,
                senderId,
                senderAvatar,
            });
        }
    });

    socket.on("stopTyping", ({ receiverId, isGroup, senderId }) => {
        if (isGroup) {
            socket.broadcast.to(receiverId).emit("getStopTyping", {
                chatId: receiverId,
                isGroup: true,
                senderId,
            });
        } else {
            io.to(receiverId).emit("getStopTyping", {
                chatId: senderId,
                isGroup: false,
                senderId,
            });
        }
    });
};

module.exports = { registerTypingHandlers };