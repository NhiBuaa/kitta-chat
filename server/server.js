const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/user");
const messageRoutes = require("./src/routes/messages");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

// Import Model
const User = require("./src/models/User");
const Message = require("./src/models/Message");
const Group = require("./src/models/Group");
const File = require("./src/models/File");
const getSafeUserName = require("./src/utils/getSafeUserName");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: process.env.URL_FRONTEND,
    credentials: true,
  })
);

// Socket Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.URL_FRONTEND,
    methods: ["GET", "POST"],
  },
});

// Lưu danh sách user đang online vào RAM
let onlineUsers = new Map();
global.onlineUsers = onlineUsers;

// Set io vào app để controller có thể access
app.set("socketio", io);
app.set("onlineUsers", onlineUsers);

// Helper function để xử lý khi user connect
const handleUserConnected = async (socket, userId, socketId) => {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    console.warn(`Ignoring invalid userId on connect: ${userId}`);
    return;
  }

  console.log(`User Connected: ${userId}`);
  onlineUsers.set(userId, socketId);

  // Join user vào room với userId (để nhận tin nhắn 1-1)
  try {
    socket.join(userId);
    console.log(`User ${userId} joined room ${userId}`);
  } catch (err) {
    console.error(`Lỗi khi join room cho user ${userId}:`, err);
  }

  // Cập nhật DB thành ACTIVE
  try {
    await User.findByIdAndUpdate(userId, {
      activityStatus: { state: "active", lastSeen: new Date() },
    });
  } catch (err) {
    console.error(`Lỗi cập nhật activityStatus cho user ${userId}:`, err.message || err);
  }

  const usersArray = Array.from(onlineUsers, ([uid, sid]) => ({
    userId: uid,
    socketId: sid,
  })).filter((u) => u.userId && typeof u.userId === "string" && u.userId.trim() !== "");

  io.emit("getOnlineUsers", usersArray);
};

// SOCKET
io.on("connection", async (socket) => {
  let userId = socket.handshake.query.userId;
  console.log(`[Socket Connection] ID: ${socket.id}, Query userId: ${userId}`);

  // Khởi tạo User
  if (!userId || userId === "undefined") {
    console.log(`userId không hợp lệ từ query string, đợi event addNewUser`);
    socket.on("addNewUser", async (id) => {
      userId = id;
      if (!userId || typeof userId !== "string" || userId.trim() === "") {
        console.warn(`Received addNewUser with invalid id: ${userId}`);
        return;
      }
      console.log(`Nhận event addNewUser: ${userId}`);
      await handleUserConnected(socket, userId, socket.id);
    });
  }

  (async () => {
    try {
      await handleUserConnected(socket, userId, socket.id);
    } catch (error) {
      console.error(`Lỗi khi connect user ${userId}:`, error);
    }
  })();

  // Disconnect
  socket.on("disconnect", async () => {
    console.log(`User Disconnected: ${userId}`);
    if (userId) {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, {
        activityStatus: { state: "offline", lastSeen: new Date() },
      });
      const usersArray = Array.from(onlineUsers, ([uid, sid]) => ({
        userId: uid,
        socketId: sid,
      }));
      io.emit("getOnlineUsers", usersArray);
    }
  });

  // Friend Requests
  socket.on("sendFriendRequest", async ({ senderId, receiverId, senderName }) => {
    console.log(`Received sendFriendRequest from ${senderId} to ${receiverId}`);
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newFriendRequest", { senderId, senderName });
    }
  });

  socket.on("acceptFriendRequest", async ({ senderId, receiverId, receiverName, receiverAvatar }) => {
    const senderSocketId = onlineUsers.get(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("friendRequestAccepted", {
        newFriendId: receiverId,
        newFriendName: receiverName,
        newFriendAvatar: receiverAvatar,
      });
    }
  });

  socket.on("rejectFriendRequest", async ({ senderId, receiverId }) => {
    const senderSocketId = onlineUsers.get(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit("friendRequestRejected", { rejecterId: receiverId });
    }
  });

  // Group Rooms
  socket.on("joinGroup", (groupId) => {
    socket.join(groupId);
    console.log(`User ${userId} joined group room ${groupId}`);
  });

  socket.on("leaveGroup", (groupId) => {
    socket.leave(groupId);
    console.log(`User ${userId} left group room ${groupId}`);
  });

  // Messaging (Hỗ trợ File S3 + Text + Group)
  socket.on("sendMessage", async (messageData) => {
    const { sender, receiverId, isGroup } = messageData;
    const senderId = typeof sender === "object" ? sender._id : sender;

    try {
      const senderDoc = await User.findById(senderId).select("displayName avatar username");
      const senderInfo = {
        _id: senderId,
        displayName: getSafeUserName(senderDoc),
        avatar: senderDoc?.avatar,
      };

      const payloadToEmit = { ...messageData, sender: senderInfo };

      if (isGroup) {
        io.to(receiverId).emit("getMessage", payloadToEmit);
        console.log(`Group message sent to room ${receiverId}`);
      } else {
        io.to(receiverId).emit("getMessage", payloadToEmit);
        io.to(senderId).emit("getMessage", payloadToEmit);
        console.log(`1-1 message sent to ${senderId} and ${receiverId}`);
      }
    } catch (err) {
      console.error("Lỗi socket sendMessage:", err);
    }
  });

  // Typing Indicators
  socket.on("typing", async ({ receiverId, isGroup, senderId, senderName, senderAvatar }) => {
    if (isGroup) {
      socket.broadcast.to(receiverId).emit("getTyping", {
        chatId: receiverId, isGroup: true, senderName, senderAvatar
      });
    } else {
      io.to(receiverId).emit("getTyping", {
        chatId: senderId, isGroup: false, senderAvatar
      });
    }
  });

  socket.on("stopTyping", async ({ receiverId, isGroup, senderId }) => {
    if (isGroup) {
      socket.broadcast.to(receiverId).emit("getStopTyping", { chatId: receiverId, isGroup: true });
    } else {
      io.to(receiverId).emit("getStopTyping", { chatId: senderId, isGroup: false });
    }
  });

  // Read Receipts (Đã xem)
  socket.on("markRead", async (data) => {
    try {
      if (data?.isGroup) {
        const { groupId, readerId } = data;
        if (!groupId || !readerId) return;

        await Message.updateMany(
          { conversationId: groupId, type: { $ne: "system" }, readBy: { $ne: readerId } },
          { $push: { readBy: readerId } }
        );
        io.to(groupId).emit("groupUserRead", { groupId, readerId });
      } else {
        const { senderId, receiverId } = data;
        if (!senderId || !receiverId) return;

        const convId = [senderId, receiverId].sort().join("_");
        await Message.updateMany(
          { sender: senderId, conversationId: convId, isRead: false },
          { $set: { isRead: true } }
        );

        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("userReadMessages", { readerId: receiverId });
        }
      }
    } catch (err) {
      console.error("markRead handler error", err);
    }
  });

  // WEBRTC (VIDEO/AUDIO CALLS)
  socket.emit("me", socket.id);

  socket.on("callUser", ({ userToCall, signalData, from, name, callerDbId }) => {
    console.log(`[SERVER] Nhận lệnh callUser từ ${from} gọi tới ${userToCall}`);
    const room = io.sockets.adapter.rooms.get(userToCall);
    if (room) {
      io.to(userToCall).emit("callUser", { signal: signalData, from, name, callerDbId });
    } else {
      socket.emit("callRejected");
    }
  });

  socket.on("answerCall", (data) => {
    io.to(data.to).emit("callAccepted", data.signal);
  });

  socket.on("endCall", (data) => {
    console.log(`[SERVER] Kết thúc cuộc gọi từ ${socket.id} tới ${data.to}`);
    io.to(data.to).emit("callEnded");
  });

  socket.on("rejectCall", (data) => {
    io.to(data.to).emit("callRejected");
  });

  socket.on("toggleMedia", ({ to, cam, mic }) => {
    io.to(to).emit("updateMediaStatus", { cam, mic });
  });
});

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/messages", messageRoutes);
app.use("/api/groups", require("./src/routes/group"));
app.use("/api/files", require("./src/routes/file"));

// Start Server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));
