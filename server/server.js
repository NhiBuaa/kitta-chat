const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/user");
const messageRoutes = require("./src/routes/messages");
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const User = require('./src/models/User');
const Message = require('./src/models/Message');

dotenv.config();

const app = express();
const PORT = process.env.PORT;
app.use(express.json());

// Middlewares
app.use(express.json());
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

//Socket Setup
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

// Lưu danh sách user đang online vào RAM để truy xuất nhanh
let onlineUsers = new Map();

io.on('connection', async (socket) => {
    // Lấy userId từ client gửi lên
    const userId = socket.handshake.query.userId;

    if (userId && userId !== "undefined") {
        console.log(`⚡ User Connected: ${userId}`);

        // Lưu vào Map Online
        onlineUsers.set(userId, socket.id);

        // Cập nhật DB thành ACTIVE
        await User.findByIdAndUpdate(userId, {
            activityStatus: { state: 'active', lastSeen: new Date() }
        });

        io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    }

    // Khi User ngắt kết nối
    socket.on('disconnect', async () => {
        console.log(`❌ User Disconnected: ${userId}`);

        if (userId) {
            // Xóa khỏi Map Online
            onlineUsers.delete(userId);

            // Cập nhật DB thành OFFLINE + Thời gian
            await User.findByIdAndUpdate(userId, {
                activityStatus: { state: 'offline', lastSeen: new Date() }
            });

            // Báo cho tất cả: Danh sách online mới
            io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
        }
    });

    // Lắng nghe sự kiện 'sendMessage' từ Client
    socket.on("sendMessage", ({ senderId, receiverId, text }) => {
        const userSocketId = onlineUsers.get(receiverId);

        if (userSocketId) {
            // Gửi tin nhắn riêng cho người đó
            io.to(userSocketId).emit("getMessage", {
                senderId,
                text,
                createdAt: Date.now()
            });
        }
    });

    // Lắng nghe sự kiện đang gõ
    socket.on("typing", ({ receiverId }) => {
        const userSocketId = onlineUsers.get(receiverId);
        if (userSocketId) {
            // Báo cho người nhận biết: "senderId đang gõ đấy"
            io.to(userSocketId).emit("getTyping", socket.handshake.query.userId);
        }
    });

    // Lắng nghe sự kiện ngưng gõ
    socket.on("stopTyping", ({ receiverId }) => {
        const userSocketId = onlineUsers.get(receiverId);
        if (userSocketId) {
            io.to(userSocketId).emit("getStopTyping", socket.handshake.query.userId);
        }
    });

    // Sự kiện đã đọc tin nhắn hay chưa
    socket.on("markRead", async ({ senderId, receiverId }) => {
        await Message.updateMany(
            { sender: senderId, conversationId: [senderId, receiverId].sort().join("_"), isRead: false },
            { $set: { isRead: true } }
        );

        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
            io.to(senderSocketId).emit("userReadMessages", {
                readerId: receiverId
            });
        }
    });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/messages', messageRoutes);

// Start Server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Error:", err));