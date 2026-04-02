const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

// Handlers
const { registerPresenceHandlers } = require("./handlers/presenceHandler");
const { registerMessageHandlers } = require("./handlers/messageHandler");
const { registerFriendHandlers } = require("./handlers/friendHandler");
const { registerTypingHandlers } = require("./handlers/typingHandler");
const { registerCallHandlers } = require("./handlers/callHandler");

// =========================================================
// CRITICAL: Validate environment variables at startup
// =========================================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("FATAL: JWT_SECRET environment variable is missing");
}

/**
 * Khởi tạo Socket.IO server với JWT auth + Redis Adapter
 *
 * @param {import("http").Server} httpServer
 * @param {import("express").Application} app
 * @returns {import("socket.io").Server} io
 */
const initSocket = (httpServer, app) => {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.URL_FRONTEND,
            methods: ["GET", "POST"],
        },
        pingTimeout: 20000,
        pingInterval: 25000,
    });

    // =========================================================
    // REDIS ADAPTER CHO MULTI-CONTAINER SCALING
    // =========================================================
    const redisUrl = process.env.REDIS_URL || "redis://redis:6379";
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) => console.error("[Redis PubClient] Error:", err));
    subClient.on("error", (err) => console.error("[Redis SubClient] Error:", err));

    Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
            io.adapter(createAdapter(pubClient, subClient));
            console.log("[Socket] Redis adapter connected");
        })
        .catch((err) => {
            // FAIL FAST: Redis là core dependency, không chạy nếu không có Redis
            console.error(`[Socket] FATAL: Redis connection failed: ${err.message}`);
            process.exit(1);
        });

    app.set("socketio", io);
    app.set("redisClient", pubClient);
    io.redisClient = pubClient;

    // =========================================================
    // MIDDLEWARE: JWT Authentication
    // Verify token TRƯỚC KHI cho connection
    // =========================================================
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            console.warn(`[Socket Auth] No token: ${socket.id}`);
            return next(new Error("Authentication required"));
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.id || decoded._id;
            socket.userEmail = decoded.email;

            if (!socket.userId) {
                console.warn(`[Socket Auth] Token missing user ID: ${socket.id}`);
                return next(new Error("Invalid token payload"));
            }

            console.log(`[Socket Auth] OK: ${socket.userId} (${socket.id})`);
            next();
        } catch (err) {
            console.warn(`[Socket Auth] Invalid token ${socket.id}: ${err.message}`);
            return next(new Error("Invalid or expired token"));
        }
    });

    // =========================================================
    // CONNECTION HANDLER
    // =========================================================
    io.on("connection", (socket) => {
        const userId = socket.userId;
        console.log(`[Socket] Connected: ${socket.id} (user: ${userId})`);

        socket.emit("me", socket.id);

        registerPresenceHandlers(socket, io);
        registerMessageHandlers(socket, io);
        registerFriendHandlers(socket, io);
        registerTypingHandlers(socket, io);
        registerCallHandlers(socket, io);
    });

    return io;
};

module.exports = { initSocket };
