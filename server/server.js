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
const User = require("./src/models/User");
const Message = require("./src/models/Message");
const Group = require("./src/models/Group");

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: process.env.URL_FRONTEND,
    credentials: true,
  }),
);

//Socket Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.URL_FRONTEND,
    methods: ["GET", "POST"],
  },
});

// Lưu danh sách user đang online vào RAM để truy xuất nhanh
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

  // Lưu vào Map Online
  onlineUsers.set(userId, socketId);

  // Join user vào room với userId (để nhận tin nhắn 1-1)
  try {
    socket.join(userId);
    console.log(`User ${userId} joined room ${userId}`);
  } catch (err) {
    console.error(`Lỗi khi join room cho user ${userId}:`, err);
  }

  // Cập nhật DB thành ACTIVE (only if valid ObjectId)
  try {
    await User.findByIdAndUpdate(userId, {
      activityStatus: { state: "active", lastSeen: new Date() },
    });
  } catch (err) {
    console.error(
      `Lỗi cập nhật activityStatus cho user ${userId}:`,
      err.message || err,
    );
  }

  const usersArray = Array.from(onlineUsers, ([uid, sid]) => ({
    userId: uid,
    socketId: sid,
  })).filter(
    (u) => u.userId && typeof u.userId === "string" && u.userId.trim() !== "",
  );

  io.emit("getOnlineUsers", usersArray);
};

io.on("connection", async (socket) => {
  // Lấy userId từ client gửi lên (từ query string hoặc event)
  let userId = socket.handshake.query.userId;

  console.log(`[Socket Connection] ID: ${socket.id}, Query userId: ${userId}`);

  if (!userId || userId === "undefined") {
    console.log(`userId không hợp lệ từ query string, đợi event addNewUser`);
    // Fallback: lắng nghe event addNewUser từ client
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

  // IIFE để đảm bảo user được connected trước khi setup listeners
  (async () => {
    try {
      await handleUserConnected(socket, userId, socket.id);
    } catch (error) {
      console.error(`Lỗi khi connect user ${userId}:`, error);
    }
  })();

  socket.on(
    "sendFriendRequest",
    async ({ senderId, receiverId, senderName }) => {
      console.log(
        `Received sendFriendRequest from ${senderId} to ${receiverId}`,
      );

      const receiverSocketId = onlineUsers.get(receiverId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newFriendRequest", {
          senderId,
          senderName,
        });
        console.log(`Đã báo lời mời kết bạn tới socket: ${receiverSocketId}`);
      } else {
        console.log(`Người nhận ${receiverId} hiện không online.`);
      }
    },
  );

  // Lắng nghe sự kiện chấp nhận lời mời kết bạn
  socket.on(
    "acceptFriendRequest",
    async ({ senderId, receiverId, receiverName, receiverAvatar }) => {
      const senderSocketId = onlineUsers.get(senderId);

      if (senderSocketId) {
        io.to(senderSocketId).emit("friendRequestAccepted", {
          newFriendId: receiverId,
          newFriendName: receiverName,
          newFriendAvatar: receiverAvatar,
        });
      } else {
        console.log(
          `Không tìm thấy người gửi có ID ${senderId} đang online để báo kết bạn.`,
        );
      }
    },
  );

  // Lắng nghe sự kiện từ chối lời mời kết bạn
  socket.on("rejectFriendRequest", async ({ senderId, receiverId }) => {
    const senderSocketId = onlineUsers.get(senderId);

    if (senderSocketId) {
      io.to(senderSocketId).emit("friendRequestRejected", {
        rejecterId: receiverId,
      });
      console.log(
        `Đã báo từ chối lời mời kết bạn tới socket: ${senderSocketId}`,
      );
    }
  });

  // Lắng nghe sự kiện joinGroup
  socket.on("joinGroup", (groupId) => {
    socket.join(groupId);
    console.log(`User ${userId} joined group room ${groupId}`);
  });

  // Lắng nghe sự kiện leaveGroup
  socket.on("leaveGroup", (groupId) => {
    socket.leave(groupId);
    console.log(`User ${userId} left group room ${groupId}`);
  });

  // Khi User ngắt kết nối
  socket.on("disconnect", async () => {
    console.log(`User Disconnected: ${userId}`);

    if (userId) {
      // Xóa khỏi Map Online
      onlineUsers.delete(userId);

      // Cập nhật DB thành OFFLINE + Thời gian
      await User.findByIdAndUpdate(userId, {
        activityStatus: { state: "offline", lastSeen: new Date() },
      });

      // Báo cho tất cả: Danh sách online mới
      const usersArray = Array.from(onlineUsers, ([uid, sid]) => ({
        userId: uid,
        socketId: sid,
      }));
      io.emit("getOnlineUsers", usersArray);
    }
  });

  // Lắng nghe sự kiện sendMessage
  socket.on(
    "sendMessage",
    async ({ senderId, receiverId, text, image, isGroup }) => {
      // Fetch thông tin người gửi
      const sender = await User.findById(senderId).select(
        "displayName avatar email",
      );
      const senderInfo = {
        _id: senderId,
        displayName: sender?.displayName || sender?.email?.split("@")[0],
        avatar: sender?.avatar,
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
          isGroup: true,
        });
        console.log(`Group message sent to room ${receiverId}`);
      } else {
        // LOGIC GỬI 1-1 - Emit cho cả Sender lẫn Receiver
        const messageData = {
          senderId,
          sender: senderInfo,
          receiverId,
          text,
          image,
          isGroup: false,
          createdAt: Date.now(),
        };

        // Gửi cho receiver
        io.to(receiverId).emit("getMessage", messageData);
        // Gửi cho sender để sender thấy tin nhắn của mình
        io.to(senderId).emit("getMessage", messageData);

        console.log(`1-1 message sent to ${senderId} and ${receiverId}`);
      }
    },
  );

  // Lắng nghe sự kiện đang gõ
  socket.on(
    "typing",
    async ({ receiverId, isGroup, senderId, senderName, senderAvatar }) => {
      console.log(
        `Typing event: senderId=${senderId}, receiverId=${receiverId}, isGroup=${isGroup}, senderName=${senderName}`,
      );

      if (isGroup) {
        // LOGIC TYPING TRONG NHÓM - Dùng Room nhưng EXCLUDE sender
        socket.broadcast.to(receiverId).emit("getTyping", {
          chatId: receiverId, // ID nhóm
          isGroup: true,
          senderName: senderName,
          senderAvatar: senderAvatar,
        });
        console.log(
          `Typing broadcast to group room ${receiverId} (excluding sender)`,
        );
      } else {
        // LOGIC TYPING 1-1 - Dùng User Room
        io.to(receiverId).emit("getTyping", {
          chatId: senderId, // ID người gõ (user)
          isGroup: false,
          senderAvatar: senderAvatar,
        });
        console.log(`Typing sent to user room ${receiverId}`);
      }
    },
  );

  // Lắng nghe sự kiện ngưng gõ
  socket.on("stopTyping", async ({ receiverId, isGroup, senderId }) => {
    console.log(
      `Stop typing: senderId=${senderId}, receiverId=${receiverId}, isGroup=${isGroup}`,
    );

    if (isGroup) {
      // LOGIC STOP TYPING TRONG NHÓM - Dùng Room nhưng EXCLUDE sender
      socket.broadcast.to(receiverId).emit("getStopTyping", {
        chatId: receiverId, // ID nhóm
        isGroup: true,
      });
      console.log(
        `Stop typing broadcast to group room ${receiverId} (excluding sender)`,
      );
    } else {
      // LOGIC STOP TYPING 1-1 - Dùng User Room
      io.to(receiverId).emit("getStopTyping", {
        chatId: senderId, // ID người gõ (user)
        isGroup: false,
      });
      console.log(`Stop typing sent to user room ${receiverId}`);
    }
  });

  // Sự kiện đã đọc tin nhắn hay chưa
  socket.on("markRead", async (data) => {
    try {
      if (data?.isGroup) {
        const { groupId, readerId } = data;
        if (!groupId || !readerId) return;

        // Thêm readerId vào readBy cho tất cả message trong nhóm nếu chưa có
        await Message.updateMany(
          {
            conversationId: groupId,
            type: { $ne: "system" },
            readBy: { $ne: readerId },
          },
          { $push: { readBy: readerId } },
        );

        // Emit tới cả group room để mọi thành viên biết ai đã đọc
        io.to(groupId).emit("groupUserRead", {
          groupId,
          readerId,
        });
      } else {
        const { senderId, receiverId } = data;
        if (!senderId || !receiverId) return;

        // Ghi nhận đã đọc cho conversation 1-1
        const convId = [senderId, receiverId].sort().join("_");
        await Message.updateMany(
          { sender: senderId, conversationId: convId, isRead: false },
          { $set: { isRead: true } },
        );

        // Thông báo cho sender (nếu online)
        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit("userReadMessages", {
            readerId: receiverId,
          });
        }
      }
    } catch (err) {
      console.error("markRead handler error", err);
    }
  });

  // --- Sự kiện bắt đầu gọi video/audio ---
  socket.emit("me", socket.id);

  // Gọi cho người dùng khác
  socket.on("callUser", ({ userToCall, signalData, from, name }) => {
    // userToCall: Socket ID của người nhận
    // signalData: Dữ liệu mã hóa WebRTC của người gọi
    // from: Socket ID người gọi

    console.log(`[SERVER] Nhận lệnh callUser từ ${from} gọi tới ${userToCall}`);

    // Kiểm tra xem người nhận có trong phòng không
    const room = io.sockets.adapter.rooms.get(userToCall);
    if (room) {
      console.log(
        `[SERVER] Tìm thấy người nhận ${userToCall}, đang chuyển tiếp...`,
      );
      io.to(userToCall).emit("callUser", {
        signal: signalData,
        from,
        name,
      });
    } else {
      console.log(
        `[SERVER] Không tìm thấy socketId ${userToCall} (Người dùng có thể đã offline hoặc sai ID)`,
      );
    }
  });

  // Người dùng trả lời cuộc gọi
  socket.on("answerCall", (data) => {
    // data: { to: socketId người gọi, signal: Dữ liệu mã hóa WebRTC của người trả lời }
    io.to(data.to).emit("callAccepted", data.signal);
  });

  // Khi kết thúc cuộc gọi
  socket.on("endCall", (data) => {
    console.log(`[SERVER] Kết thúc cuộc gọi từ ${socket.id} tới ${data.to}`);
    io.to(data.to).emit("callEnded");
  });

  // Từ chối cuộc gọi
  socket.on("rejectCall", (data) => {
    io.to(data.to).emit("callRejected");
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/messages", messageRoutes);
app.use("/api/groups", require("./src/routes/group"));

// Start Server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));
