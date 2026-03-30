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
const { redisClient } = require('./src/config/redis');

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

// Online presence state
const onlineUsers = new Map();
const userConnections = new Map();
const disconnectTimers = new Map();

const getOnlineUsersPayload = () =>
  Array.from(onlineUsers.entries()).map(([userId, socketIds]) => ({
    userId,
    socketId: Array.from(socketIds)[socketIds.size - 1] || null,
    socketIds: Array.from(socketIds),
  }));

const buildConversationId = (senderId, receiverId) => {
  if (!senderId || !receiverId) return null;
  return [senderId.toString(), receiverId.toString()].sort().join("_");
};

// Allow controllers to access shared realtime state
app.set("socketio", io);
app.set("onlineUsers", onlineUsers);

// Notify only related rooms about presence changes
const broadcastUserStatus = async (ioInstance, userId, status) => {
  try {
    const groups = await Group.find({ members: userId }).select("_id");
    const groupIds = groups.map((group) => group._id.toString());

    const user = await User.findById(userId).select("friends");
    const friendIds = user?.friends ? user.friends.map((friend) => friend.toString()) : [];

    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .select("sender receiver")
      .lean();

    const chattedUserIds = messages.reduce((accumulator, message) => {
      const senderId = message.sender?.toString();
      const receiverId = message.receiver?.toString();

      if (senderId && senderId !== userId) {
        accumulator.push(senderId);
      }
      if (receiverId && receiverId !== userId) {
        accumulator.push(receiverId);
      }

      return accumulator;
    }, []);

    const targetRooms = [...new Set([...groupIds, ...friendIds, ...chattedUserIds])];

    if (targetRooms.length > 0) {
      ioInstance.to(targetRooms).emit("userStatusChanged", { userId, status });
      console.log(
        `[Presence] Broadcast ${status} for user ${userId} to ${targetRooms.length} rooms.`
      );
    } else {
      console.log(`[Presence] User ${userId} is ${status} but has no related rooms.`);
    }
  } catch (error) {
    console.error(`[Presence] Failed to broadcast status for ${userId}:`, error);
  }
};

// LƯU LOG VÀ CACHE REDIS
async function saveMessageInBackground(data) {
  try {
    const senderId = data.sender?._id || data.sender;
    const conversationId =
      data.conversationId ||
      (data.isGroup ? data.receiverId : buildConversationId(senderId, data.receiverId));

    if (!conversationId) return;

    const cacheKey = `chat_history:${conversationId}`;

    //  Chuẩn bị dữ liệu để lưu vào DB
    let savedMessage = data;

    if (!data._id) {
      const messageToSave = {
        conversationId,
        sender: senderId,
        receiver: data.receiverId || data.receiver,
        type: data.type || "text",
        text: data.content || data.text || "",
        attachments: data.attachments || [],
        isRead: false,
      };

      // Lưu
      savedMessage = await Message.create(messageToSave);
    }

    // Cập nhật Redis Cache - lưu 50 tin mới nhất
    if (redisClient.isOpen) {
      const multi = redisClient.multi();

      // Để Frontend hiển thị được ngay mà không cần query lại User, lưu kèm cả senderInfo vào cache
      const dataToCache = {
        ...(typeof savedMessage.toObject === "function"
          ? savedMessage.toObject()
          : savedMessage),
        conversationId,
        senderInfo: data.senderInfo || data.sender,
      };

      multi.lPush(cacheKey, JSON.stringify(dataToCache));
      multi.lTrim(cacheKey, 0, 49);
      await multi.exec();
    }

    return savedMessage;

  } catch (error) {
    console.error("Lỗi lưu tin nhắn ngầm:", error);
    return null;
  }
}

// SOCKET
io.on("connection", (socket) => {
  const initialUserId = socket.handshake.query.userId;
  console.log(`[Socket Connection] ID: ${socket.id}, Query userId: ${initialUserId}`);

  socket.emit("me", socket.id);

  socket.on("addNewUser", async (userId) => {
    if (!userId || userId === "undefined") return;
    if (socket.userRegistered && socket.userId === userId) {
      socket.emit("getOnlineUsers", getOnlineUsersPayload());
      return;
    }
    const hadPendingOfflineTimer = disconnectTimers.has(userId);
    const currentCount = userConnections.get(userId) || 0;

    try {
      // Join user vào room với userId (để nhận tin nhắn 1-1)
      socket.userId = userId;
      socket.userRegistered = true;
      socket.join(userId);
      console.log(`User ${userId} joined room ${userId}`);

      // Join user vào các room Group
      const userGroups = await Group.find({ members: userId });

      if (userGroups) {
        userGroups.forEach((group) => {
          socket.join(group._id.toString());
          console.log(`User ${userId} joined group room ${group._id.toString()}`);
        });
      }
    } catch (err) {
      console.error(`Lỗi khi join room cho user ${userId}:`, err);
    }

    const existingSocketIds = onlineUsers.get(userId) || new Set();
    existingSocketIds.add(socket.id);
    onlineUsers.set(userId, existingSocketIds);

    if (hadPendingOfflineTimer) {
      console.log(`[Presence] Cancel offline timer for ${userId}.`);
      clearTimeout(disconnectTimers.get(userId));
      disconnectTimers.delete(userId);
    }

    userConnections.set(userId, currentCount + 1);
    console.log(`[Presence] User ${userId} connected. Count ${currentCount} -> ${currentCount + 1}`);

    if (!hadPendingOfflineTimer && currentCount === 0) {
      broadcastUserStatus(io, userId, "online");
      await User.findByIdAndUpdate(userId, { "activityStatus.state": "active" });
    }

    socket.emit("getOnlineUsers", getOnlineUsersPayload());
  });

  socket.on("joinGroup", (groupId) => {
    if (!groupId) return;
    socket.join(groupId);
    console.log(`[Socket] ${socket.id} joined group ${groupId}`);
  });

  socket.on("leaveGroup", (groupId) => {
    if (!groupId) return;
    socket.leave(groupId);
    console.log(`[Socket] ${socket.id} left group ${groupId}`);
  });

  socket.on("disconnect", () => {
    const userId = socket.userId;
    if (!userId) return;
    socket.userRegistered = false;

    const existingSocketIds = onlineUsers.get(userId);
    if (existingSocketIds) {
      existingSocketIds.delete(socket.id);
      if (existingSocketIds.size === 0) {
        onlineUsers.delete(userId);
      } else {
        onlineUsers.set(userId, existingSocketIds);
      }
    }

    console.log(`Socket disconnected. Waiting to confirm offline for user: ${userId}`);

    const currentCount = userConnections.get(userId) || 0;
    const newCount = Math.max(0, currentCount - 1);
    userConnections.set(userId, newCount);
    console.log(`[Presence] User ${userId} disconnected. Count ${currentCount} -> ${newCount}`);

    if (newCount === 0) {
      const timerId = setTimeout(async () => {
        try {
          console.log(`[Timer 5s] Hết 5 giây. Đang kiểm tra lại count của ${userId}...`);
          const finalCount = userConnections.get(userId);
          const finalSocketCount = onlineUsers.get(userId)?.size || 0;

          if (finalCount === 0 && finalSocketCount === 0) {
            console.log(`[Timer 5s] Xác nhận User ${userId} ĐÃ CHÍNH THỨC OFFLINE.`);

            broadcastUserStatus(io, userId, "offline");

            console.log(`[Timer 5s] Đang lưu trạng thái offline xuống Database...`);
            await User.findByIdAndUpdate(userId, {
              activityStatus: { state: "offline", lastSeen: new Date() },
            });
            console.log(`[Timer 5s] Lưu Database thành công!`);

            userConnections.delete(userId);
            disconnectTimers.delete(userId);
          } else {
            console.log(`[Timer 5s] Đã hủy báo Offline vì ${userId} đã kết nối lại.`);
          }
        } catch (error) {
          console.error(`[LỖI NGHIÊM TRỌNG TRONG TIMER 5S]:`, error);
        }
      }, 5000);

      disconnectTimers.set(userId, timerId);
    }
  });

  socket.on("sendFriendRequest", ({ senderId, receiverId, senderName }) => {
    console.log(`Friend request from ${senderId} to ${receiverId}`);
    io.to(receiverId).emit("newFriendRequest", { senderId, senderName });
  });

  socket.on("acceptFriendRequest", ({ senderId, receiverId, receiverName, receiverAvatar }) => {
    io.to(senderId).emit("friendRequestAccepted", {
      newFriendId: receiverId,
      newFriendName: receiverName,
      newFriendAvatar: receiverAvatar,
    });
  });

  socket.on("rejectFriendRequest", ({ senderId, receiverId }) => {
    io.to(senderId).emit("friendRequestRejected", { rejecterId: receiverId });
  });

  socket.on("sendMessage", async (messageData, callBack) => {
    try {
      const receiverId = messageData.receiverId || messageData.receiver;
      const sender = messageData.sender;
      const isGroup = messageData.isGroup;
      const senderId = typeof sender === "object" ? sender._id : sender;
      let senderInfo = messageData.senderInfo;
      const attachmentMetas = Array.isArray(messageData.attachmentsData)
        ? messageData.attachmentsData.map((attachment) => ({
          _id: attachment?._id,
          url: attachment?.url,
          mimeType: attachment?.mimeType,
          originalName: attachment?.originalName,
          size: attachment?.size,
        }))
        : [];

      if (!receiverId) {
        console.error("Lỗi Socket: Thiếu receiverId!", messageData);
        if (typeof callBack === "function") callBack({ success: false });
        return;
      }

      if (!senderInfo) {
        const senderDoc = await User.findById(senderId).select("displayName avatar username");
        senderInfo = {
          _id: senderId,
          displayName: getSafeUserName(senderDoc),
          avatar: senderDoc?.avatar,
        };
      }

      const payloadToEmit = {
        ...messageData,
        sender: senderInfo,
        attachmentsData: attachmentMetas,
      };

      if (isGroup) {
        let groupName = messageData.groupName;
        if (!groupName) {
          const groupDoc = await Group.findById(receiverId).select("name displayName");
          groupName = groupDoc?.displayName || groupDoc?.name || "Nhom chat";
        }
        payloadToEmit.groupName = groupName;

        io.to(receiverId).emit("getMessage", payloadToEmit);
        console.log(`Group message sent to room ${receiverId}`);
      } else {
        io.to(receiverId).emit("getMessage", payloadToEmit);
        io.to(senderId).emit("getMessage", payloadToEmit);
        console.log(`1-1 message sent to ${senderId} and ${receiverId}`);
      }

      let conversationId = messageData.conversationId;

      if (!conversationId) {
        if (isGroup) {
          conversationId = receiverId;
        } else {
          conversationId = buildConversationId(senderId, receiverId);
        }
      }

      const savedMessage = await saveMessageInBackground({
        ...payloadToEmit,
        conversationId: conversationId,
        receiverId: receiverId
      });

      if (typeof callBack === "function") {
        callBack({
          success: Boolean(savedMessage?._id),
          realId: savedMessage?._id
        });
      }

    } catch (err) {
      console.error("Socket sendMessage error:", err);
      if (typeof callBack === "function") {
        callBack({ success: false });
      }
    }
  });

  socket.on("typing", ({ receiverId, isGroup, senderId, senderName, senderAvatar }) => {
    if (isGroup) {
      socket.broadcast.to(receiverId).emit("getTyping", {
        chatId: receiverId,
        isGroup: true,
        senderId,
        senderName,
        senderAvatar,
      });
    } else {
      io.to(receiverId).emit("getTyping", {
        chatId: senderId,
        isGroup: false,
        senderId,
        senderAvatar,
      });
    }
  });

  socket.on("stopTyping", ({ receiverId, isGroup, senderId }) => {
    if (isGroup) {
      socket.broadcast.to(receiverId).emit("getStopTyping", {
        chatId: receiverId,
        isGroup: true,
        senderId,
      });
    } else {
      io.to(receiverId).emit("getStopTyping", {
        chatId: senderId,
        isGroup: false,
        senderId,
      });
    }
  });

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

        io.to(senderId).emit("userReadMessages", { readerId: receiverId });
      }
    } catch (err) {
      console.error("markRead handler error", err);
    }
  });

  socket.on("callUser", (data) => {
    console.log(`[SERVER] callUser from ${data.callerDbId} to ${data.userToCall}`);

    const room = io.sockets.adapter.rooms.get(data.userToCall);

    if (room && room.size > 0) {
      io.to(data.userToCall).emit("callUser", data);
    } else {
      socket.emit("callRejected", { reason: "User offline" });
    }
  });

  socket.on("answerCall", (data) => {
    io.to(data.to).emit("callAccepted", {
      signal: data.signal,
      mediaStatus: data.mediaStatus,
    });
  });

  socket.on("endCall", (data) => {
    console.log(`[SERVER] End call to ${data.to}`);
    io.to(data.to).emit("callEnded");
  });

  socket.on("rejectCall", (data) => {
    io.to(data.to).emit("callRejected", { reason: "User busy" });
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
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));
