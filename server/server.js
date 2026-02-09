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
const Group = require('./src/models/Group');

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
global.onlineUsers = onlineUsers;

// Set io vào app để controller có thể access
app.set('socketio', io);
app.set('onlineUsers', onlineUsers);

io.on('connection', async (socket) => {
    // Lấy userId từ client gửi lên
    const userId = socket.handshake.query.userId;

    if (userId && userId !== "undefined") {
        console.log(`⚡ User Connected: ${userId}`);

        // Lưu vào Map Online
        onlineUsers.set(userId, socket.id);

        // Join user vào userId room (để nhận tin nhắn 1-1)
        socket.join(userId);
        console.log(`📍 User ${userId} joined room ${userId}`);

        // Cập nhật DB thành ACTIVE
        await User.findByIdAndUpdate(userId, {
            activityStatus: { state: 'active', lastSeen: new Date() }
        });

        io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    }

    // Lắng nghe sự kiện joinGroup
    socket.on('joinGroup', (groupId) => {
        socket.join(groupId);
        console.log(`📍 User ${userId} joined group room ${groupId}`);
    });

    // Lắng nghe sự kiện leaveGroup
    socket.on('leaveGroup', (groupId) => {
        socket.leave(groupId);
        console.log(`📍 User ${userId} left group room ${groupId}`);
    });

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

    // Lắng nghe sự kiện sendMessage
    socket.on("sendMessage", async ({ senderId, receiverId, text, image, isGroup }) => {
        // Fetch thông tin người gửi
        const sender = await User.findById(senderId).select('displayName avatar email');
        const senderInfo = {
            _id: senderId,
            displayName: sender?.displayName || sender?.email?.split('@')[0],
            avatar: sender?.avatar
        };

        if (isGroup) {
            // LOGIC GỬI CHO NHÓM - Dùng Room
            io.to(receiverId).emit("getMessage", {
                senderId,
                sender: senderInfo,
                receiverId,
                text,
                image,
                createdAt: Date.now(),
                isGroup: true
            });
            console.log(`💬 Group message sent to room ${receiverId}`);
        } else {
            // LOGIC GỬI 1-1 - Dùng User Room
            io.to(receiverId).emit("getMessage", {
                senderId,
                sender: senderInfo,
                receiverId,
                text,
                image,
                isGroup: false,
                createdAt: Date.now()
            });
            console.log(`💬 1-1 message sent to room ${receiverId}`);
        }
    });

    // Lắng nghe sự kiện đang gõ
    socket.on("typing", async ({ receiverId, isGroup, senderId, senderName, senderAvatar }) => {
        console.log(`⌨️  Typing event: senderId=${senderId}, receiverId=${receiverId}, isGroup=${isGroup}, senderName=${senderName}`);
        
        if (isGroup) {
            // LOGIC TYPING TRONG NHÓM - Dùng Room nhưng EXCLUDE sender
            socket.broadcast.to(receiverId).emit("getTyping", {
                chatId: receiverId, // ID nhóm
                isGroup: true,
                senderName: senderName,
                senderAvatar: senderAvatar
            });
            console.log(`⌨️  Typing broadcast to group room ${receiverId} (excluding sender)`);
        } else {
            // LOGIC TYPING 1-1 - Dùng User Room
            io.to(receiverId).emit("getTyping", {
                chatId: senderId, // ID người gõ (user)
                isGroup: false,
                senderAvatar: senderAvatar
            });
            console.log(`⌨️  Typing sent to user room ${receiverId}`);
        }
    });

    // Lắng nghe sự kiện ngưng gõ
    socket.on("stopTyping", async ({ receiverId, isGroup, senderId }) => {
        console.log(`⏹️  Stop typing: senderId=${senderId}, receiverId=${receiverId}, isGroup=${isGroup}`);
        
        if (isGroup) {
            // LOGIC STOP TYPING TRONG NHÓM - Dùng Room nhưng EXCLUDE sender
            socket.broadcast.to(receiverId).emit("getStopTyping", {
                chatId: receiverId, // ID nhóm
                isGroup: true
            });
            console.log(`⏹️  Stop typing broadcast to group room ${receiverId} (excluding sender)`);
        } else {
            // LOGIC STOP TYPING 1-1 - Dùng User Room
            io.to(receiverId).emit("getStopTyping", {
                chatId: senderId, // ID người gõ (user)
                isGroup: false
            });
            console.log(`⏹️  Stop typing sent to user room ${receiverId}`);
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
app.use('/api/groups', require('./src/routes/group'));

// Start Server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ MongoDB Error:", err));