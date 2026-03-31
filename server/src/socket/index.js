const { Server } = require("socket.io");
const { registerPresenceHandlers, onlineUsers } = require("./handlers/presenceHandler");
const { registerMessageHandlers } = require("./handlers/messageHandler");
const { registerFriendHandlers } = require("./handlers/friendHandler");
const { registerTypingHandlers } = require("./handlers/typingHandler");
const { registerCallHandlers } = require("./handlers/callHandler");

/**
 * Khởi tạo Socket.IO server và đăng ký tất cả event handlers
 *
 * @param {import("http").Server} httpServer - HTTP server từ Express
 * @param {import("express").Application} app - Express app (để gán io vào app.set)
 * @returns {import("socket.io").Server} io
 */
const initSocket = (httpServer, app) => {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.URL_FRONTEND,
            methods: ["GET", "POST"],
        },
    });

    // Gán io và onlineUsers vào app để controllers có thể dùng nếu cần
    app.set("socketio", io);
    app.set("onlineUsers", onlineUsers);

    io.on("connection", (socket) => {
        console.log(`[Socket] Connected: ${socket.id}`);

        // Thông báo cho client biết socketId của mình
        socket.emit("me", socket.id);

        // Đăng ký handlers theo từng nhóm chức năng
        registerPresenceHandlers(socket, io);
        registerMessageHandlers(socket, io);
        registerFriendHandlers(socket, io);
        registerTypingHandlers(socket, io);
        registerCallHandlers(socket, io);
    });

    return io;
};

module.exports = { initSocket };