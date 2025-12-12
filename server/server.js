const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/user");
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const User = require('./src/models/User');

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
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start Server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Error:", err));