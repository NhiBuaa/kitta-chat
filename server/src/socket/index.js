const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

// Handlers
const { registerPresenceHandlers } = require("./handlers/presenceHandler");
const { registerMessageHandlers } = require("./handlers/messageHandler");
const { registerFriendHandlers } = require("./handlers/friendHandler");
const { registerTypingHandlers } = require("./handlers/typingHandler");
const { registerCallHandlers } = require("./handlers/call/index");
const { createCallTimeoutFinalizer } = require("./handlers/call/services/callTimeoutFinalizer");

const NODE_NAME = process.env.NODE_NAME || "backend";
const logPrefix = `[Socket][node=${NODE_NAME}]`;
const deliveryLogPrefix = `[Delivery][node=${NODE_NAME}]`;

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
 * @returns {Promise<import("socket.io").Server>} io
 */
const initSocket = async (httpServer, app) => {
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

    pubClient.on("error", (err) => console.error(`${logPrefix}[RedisPub] Error:`, err));
    subClient.on("error", (err) => console.error(`${logPrefix}[RedisSub] Error:`, err));

    try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        console.log(`${logPrefix} Redis adapter connected`);
    } catch (err) {
            // FAIL FAST: Redis là core dependency, không chạy nếu không có Redis
        throw new Error(`Redis connection failed: ${err.message}`);
    }

    app.set("socketio", io);
    app.set("redisClient", pubClient);
    io.redisClient = pubClient;
    io.callTimeoutFinalizer = createCallTimeoutFinalizer({ io, redisClient: pubClient });
    io.callTimeoutFinalizer.start();

    // Proof log cho multi-node: backend nào đang giữ socket của receiver
    // sẽ tự in log "received" khi nhận được sự kiện nội bộ này.
    io.on("proof:message-dispatched", (payload = {}) => {
        const {
            messageId,
            senderId,
            receiverId,
            conversationId,
            originNode,
        } = payload;

        if (!receiverId) return;

        const localReceiverSockets = io.of("/").adapter.rooms.get(String(receiverId));
        const localCount = localReceiverSockets?.size || 0;

        if (localCount > 0) {
            console.log(
                `${deliveryLogPrefix} RECEIVED receiver=${receiverId} sender=${senderId} messageId=${messageId || "n/a"} conv=${conversationId || "n/a"} localSockets=${localCount} originNode=${originNode || "unknown"}`
            );
        }
    });

    // =========================================================
    // MIDDLEWARE: JWT Authentication
    // Verify token TRƯỚC KHI cho connection
    // =========================================================
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            console.warn(`${logPrefix}[Auth] No token for socket=${socket.id}`);
            return next(new Error("Authentication required"));
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.id || decoded._id;
            socket.userEmail = decoded.email;

            if (!socket.userId) {
                console.warn(`${logPrefix}[Auth] Token missing userId for socket=${socket.id}`);
                return next(new Error("Invalid token payload"));
            }

            console.log(`${logPrefix}[Auth] OK user=${socket.userId} socket=${socket.id}`);
            next();
        } catch (err) {
            console.warn(`${logPrefix}[Auth] Invalid token socket=${socket.id}: ${err.message}`);
            return next(new Error("Invalid or expired token"));
        }
    });

    // =========================================================
    // CONNECTION HANDLER
    // =========================================================
    io.on("connection", (socket) => {
        const userId = socket.userId;
        console.log(`${logPrefix} CONNECT user=${userId} socket=${socket.id}`);

        socket.on("disconnect", (reason) => {
            console.log(`${logPrefix} DISCONNECT user=${socket.userId} socket=${socket.id} reason=${reason}`);
        });

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
