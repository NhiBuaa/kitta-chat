const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

// Khởi tạo handelers cho từng nhóm chức năng
const { registerPresenceHandlers } = require("./handlers/presenceHandler");
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

    // ==============
    // CẤU HÌNH REDIS ADAPTER CHO SCALING SOCKET.IO
    // =============
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    // Bắt sự kiện lỗi Redis để debug
    pubClient.on("error", (err) => console.error("[Redis PubClient] Error:", err));
    subClient.on("error", (err) => console.error("[Redis SubClient] Error:", err));

    // Kết nối Redis và gắn Adapter
    Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            const port = process.env.PORT || 3000;
            console.log(`[Socket] Redis adapter connected. Socket.IO server is running on port ${port}`);
        })
        .catch((err) => {
            console.error("[Socket] Failed to connect to Redis:", err);
        })

    // Gán io và onlineUsers vào app để controllers có thể dùng nếu cần
    app.set("socketio", io);
    app.set("redisClient", pubClient);

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