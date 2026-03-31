/**
 * Đăng ký WebRTC call signaling events cho một socket
 *
 * @param {import("socket.io").Socket} socket
 * @param {import("socket.io").Server} io
 */
const registerCallHandlers = (socket, io) => {
    // Gọi đến user khác
    socket.on("callUser", ({ userToCall, signalData, from, name, callerDbId, mediaStatus }) => {
        console.log(`[Call] ${callerDbId} → ${userToCall}`);

        const room = io.sockets.adapter.rooms.get(userToCall);

        if (room && room.size > 0) {
            io.to(userToCall).emit("callUser", {
                signal: signalData,
                from,
                name,
                callerDbId,
                mediaStatus,
            });
        } else {
            // User offline → thông báo lại cho người gọi
            socket.emit("callRejected", { reason: "User offline" });
        }
    });

    // Trả lời cuộc gọi (WebRTC answer)
    socket.on("answerCall", ({ to, signal, mediaStatus }) => {
        io.to(to).emit("callAccepted", { signal, mediaStatus });
    });

    // Kết thúc cuộc gọi
    socket.on("endCall", ({ to }) => {
        console.log(`[Call] End call → ${to}`);
        io.to(to).emit("callEnded");
    });

    // Từ chối cuộc gọi
    socket.on("rejectCall", ({ to }) => {
        io.to(to).emit("callRejected", { reason: "User busy" });
    });

    // Bật/tắt camera hoặc mic
    socket.on("toggleMedia", ({ to, cam, mic }) => {
        io.to(to).emit("updateMediaStatus", { cam, mic });
    });
};

module.exports = { registerCallHandlers };