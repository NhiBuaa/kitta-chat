const User = require("../models/User");
const Message = require("../models/Message");
const getSafeUserName = require("../utils/getSafeUserName");
const { uploadSingleFile } = require("../service/s3.service");
const sharp = require("sharp");

const toComparableId = (value) => value?.toString?.() || String(value);

const includesId = (list = [], targetId) =>
  list.some((item) => toComparableId(item) === toComparableId(targetId));

const emitToUserRoom = (io, userId, eventName, payload) => {
  if (!io || !userId) return;
  io.to(toComparableId(userId)).emit(eventName, payload);
};

const buildRelationshipFlags = (targetUser, currentUser) => {
  const currentUserId = toComparableId(currentUser?._id || currentUser?.id);

  return {
    isFriend: includesId(targetUser?.friends, currentUserId),
    isSent: includesId(targetUser?.friendRequests, currentUserId),
    isReceived: includesId(currentUser?.friendRequests, targetUser?._id),
  };
};

// [GET] /api/users/profile
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("-password"); // Bỏ password

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ success: false, message: "Lỗi Server" });
  }
};

const getUserById = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.id;

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId).select("friendRequests"),
      User.findById(targetUserId)
        .select(
          "displayName avatar username status activityStatus friends friendRequests",
        )
        .lean(),
    ]);

    if (!targetUser) {
      return res
        .status(404)
        .json({ success: false, message: "Người dùng không tồn tại" });
    }

    const relationshipFlags = buildRelationshipFlags(targetUser, currentUser);

    res.json({
      success: true,
      user: {
        ...targetUser,
        ...relationshipFlags,
      },
    });
  } catch (error) {
    console.error("Get User By Id Error:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [PUT] /api/users/profile
const updateUserProfile = async (req, res) => {
  try {
    console.log("Bắt đầu Update Profile");
    console.log("Body nhận được:", req.body);
    console.log("File nhận được:", req.file);

    const userId = req.user.id;
    const { displayName, status, activityStatus } = req.body;

    // Chuẩn bị object update
    const updateData = { displayName, status };
    if (activityStatus) updateData.activityStatus = JSON.parse(activityStatus);

    // Xử lý Avatar
    if (req.file) {
      const compressedBuffer = await sharp(req.file.buffer)
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();

      const OriginalNameWithoutExt = req.file.originalname.split(".")[0];
      const newName = OriginalNameWithoutExt + ".webp";

      const avatarUrl = await uploadSingleFile(
        compressedBuffer,
        newName,
        "image/webp",
        "avatars",
      );

      updateData.avatar = avatarUrl;
    }

    console.log("Dữ liệu chuẩn bị update vào DB:", updateData);

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      returnDocument: "after",
    }).select("-password");

    res.json({
      success: true,
      message: "Cập nhật thành công",
      user: updatedUser,
    });
  } catch (error) {
    // In lỗi ra terminal server để bạn nhìn thấy
    console.error("LỖI UPDATE PROFILE:", error);
    res
      .status(500)
      .json({ success: false, message: "Lỗi Server: " + error.message });
  }
};

// [GET] /api/users
const getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const users = await User.find({ _id: { $ne: currentUserId } })
      .select("-password")
      .lean();

    const usersWithUnreadInfo = await Promise.all(
      users.map(async (user) => {
        const unreadExist = await Message.exists({
          sender: user._id,
          receiver: currentUserId,
          isRead: false,
        });

        return {
          ...user,
          hasUnread: !!unreadExist,
        };
      }),
    );

    res.json({ success: true, users: usersWithUnreadInfo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Tìm kiếm người dùng

// hàm bỏ dấu để tìm ko phân biệt
const removeVietnameseTones = (str = "") => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const searchUsers = async (req, res) => {
  try {
    const { keyword } = req.query;
    const currentUserId = req.user.id;

    // lấy full in4 của user hiện tại để check bb, lời mời
    const currentUserFull = await User.findById(currentUserId);

    if (!keyword || !keyword.trim()) {
      return res.json({ success: true, users: [] });
    }

    // xoá dấu + lowercase
    const keywordClean = removeVietnameseTones(keyword.trim());

    const users = await User.find({
      _id: { $ne: currentUserId },
    }).select(
      "displayName email avatar friendRequests friends status activityStatus",
    );

    const filteredUsers = users.filter((user) => {
      const name = removeVietnameseTones(user.displayName || "");
      const email = removeVietnameseTones(user.email || "");

      // key nằm trong tên or mail thì giữ
      return name.includes(keywordClean) || email.includes(keywordClean);
    });

    // thêm trạng thái là bb hay chưa
    const usersWithStatus = filteredUsers.map((user) => {
      const relationshipFlags = buildRelationshipFlags(user, currentUserFull);

      return {
        _id: user._id,
        displayName: user.displayName,
        avatar: user.avatar,
        status: user.status,
        activityStatus: user.activityStatus,
        ...relationshipFlags,
      };
    });

    // trả kq về FE
    res.json({ success: true, users: usersWithStatus });
  } catch (error) {
    console.error("Lỗi tìm kiếm người dùng:", error);

    // trả lỗi cho client
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Lấy danh sách bạn bè
const getFriends = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id).populate(
      "friends",
      "displayName avatar username status activityStatus",
    );
    res.json({ success: true, friends: currentUser.friends });
  } catch (error) {
    console.error("Lỗi lấy danh sách bạn bè:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [GET] /api/users/online-friends
const getOnlineFriends = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const redisClient = req.app.get("redisClient");

    if (!redisClient) {
      return res
        .status(500)
        .json({ success: false, message: "Redis client không sẵn sàng" });
    }

    // Lấy tất cả user đang online trên toàn hệ thống từ Redis
    const globalOnlineUsers = await redisClient.sMembers("global_online_users");

    // Lấy danh sách bạn bè của user hiện tại từ DB
    const currentUser = await User.findById(currentUserId).select("friends");
    if (!currentUser || !currentUser.friends) {
      return res.json({ success: true, onlineUsers: [] });
    }

    const friendIds = currentUser.friends.map((id) => id.toString());

    // Lọc ra những người vừa là bạn, vừa nằm trong danh sách online
    const onlineFriends = friendIds.filter((friendId) =>
      globalOnlineUsers.includes(friendId),
    );

    res.json({ success: true, onlineUsers: onlineFriends });
  } catch (error) {
    console.error("Lỗi lấy danh sách bạn bè online:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Lấy danh sách lời mời kết bạn đang chờ
const getFriendRequests = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id).populate(
      "friendRequests",
      "displayName avatar username",
    );

    res.json({ success: true, requests: currentUser.friendRequests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Chấp nhận lời mời kết bạn
const accceptFriendRequest = async (req, res) => {
  try {
    const { senderId } = req.body;
    const receiverId = req.user.id;
    const io = req.app.get("socketio");

    const receiver = await User.findById(receiverId);

    // Kiểm tra có lời mời này hay không
    if (!receiver || !includesId(receiver.friendRequests, senderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Không có lời mời kết bạn này" });
    }

    // Thêm vào danh sách bạn bè và xoá khỏi lời mời
    await User.findByIdAndUpdate(receiverId, {
      $push: { friends: senderId },
      $pull: { friendRequests: senderId },
    });

    const sender = await User.findByIdAndUpdate(
      senderId,
      {
        $push: { friends: receiverId },
      },
      { new: true },
    );

    // Emit event cho người gửi (sender) để cập nhật sidebar
    emitToUserRoom(io, senderId, "friendRequestAccepted", {
      newFriendId: receiverId,
      newFriendName: getSafeUserName(receiver),
      newFriendAvatar: receiver.avatar,
    });

    emitToUserRoom(io, receiverId, "friendRequestHandled", {
      action: "accepted",
      senderId: toComparableId(senderId),
      friend: {
        _id: toComparableId(senderId),
        displayName: getSafeUserName(sender),
        avatar: sender?.avatar,
      },
    });

    res.json({ success: true, message: "Đã chấp nhận lời mời kết bạn." });
  } catch (error) {
    console.error("Lỗi chấp nhận lời mời kết bạn:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

const getSidebarUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId).select(
      "friends friendRequests",
    );
    // Map friends
    const friendsIds = currentUser.friends.map((id) => id.toString());

    // Tìm người lạ đã chat
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    })
      .select("sender receiver")
      .lean();

    const chattedUserIds = new Set();
    messages.forEach((msg) => {
      if (msg.sender && msg.sender.toString() !== currentUserId) {
        chattedUserIds.add(msg.sender.toString());
      }
      if (msg.receiver && msg.receiver.toString() !== currentUserId) {
        chattedUserIds.add(msg.receiver.toString());
      }
    });

    const allUserIdsToShow = Array.from(
      new Set([...friendsIds, ...chattedUserIds]),
    );

    const users = await User.find({ _id: { $in: allUserIdsToShow } }).select(
      "displayName avatar status activityStatus friends friendRequests",
    );

    const usersWithLastMessage = await Promise.all(
      users.map(async (user) => {
        const lastMsg = await Message.findOne({
          $or: [
            { sender: currentUserId, receiver: user._id },
            { sender: user._id, receiver: currentUserId },
          ],
        })
          .sort({ createdAt: -1 })
          .populate("attachments", "name type url")
          .select("content text image sender createdAt isRead attachments type callData")
          .lean();

        const userObj = user.toObject();

        const relationshipFlags = buildRelationshipFlags(user, currentUser);

        if (lastMsg) {
          let previewContent = lastMsg.text || "";

          // DEBUG: log để kiểm tra dữ liệu thực tế từ DB
          console.log("[DEBUG sidebar] lastMsg:", JSON.stringify(lastMsg, null, 2));

          // Nếu tin nhắn cuối là call_log → hiện "[Cuộc gọi video]" hoặc "[Cuộc gọi thoại]"
          if (lastMsg.type === "call_log" && lastMsg.callData?.type) {
            previewContent = lastMsg.callData.type === "video"
              ? "[Cuộc gọi video]"
              : "[Cuộc gọi thoại]";
          } else if (!previewContent && lastMsg.attachments?.length > 0) {
            const file = lastMsg.attachments[0];

            const isImage =
              file.type?.startsWith("image/") ||
              file.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

            if (isImage) {
              previewContent = "[Hình ảnh]";
            } else {
              previewContent = file.name || "[Tệp đính kèm]";
            }
          }

          // fallback cuối cùng
          if (!previewContent) {
            previewContent = "Tin nhắn";
          }

          const unreadCount = await Message.countDocuments({
            sender: user._id,
            receiver: currentUserId,
            isRead: false,
          });

          userObj.lastMessage = {
            content: previewContent || "Tin nhắn",
            senderId: lastMsg.sender,
            createdAt: lastMsg.createdAt,
            isRead: lastMsg.isRead,
          };

          userObj.hasUnread = unreadCount > 0;
          userObj.unreadCount = unreadCount;
        } else {
          // Nếu là bạn bè nhưng chưa chat bao giờ
          userObj.lastMessage = null;
          userObj.hasUnread = false;
        }

        return {
          ...userObj,
          ...relationshipFlags,
        };
      }),
    );

    usersWithLastMessage.sort((a, b) => {
      const dateA = a.lastMessage
        ? new Date(a.lastMessage.createdAt)
        : new Date(0);
      const dateB = b.lastMessage
        ? new Date(b.lastMessage.createdAt)
        : new Date(0);
      return dateB - dateA;
    });

    res.json({ success: true, users: usersWithLastMessage });
  } catch (error) {
    console.error("Get Sidebar Users Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendFriendRequest = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user.id;
    const io = req.app.get("socketio");

    // Kiểm tra các lỗi cơ bản
    if (receiverId === senderId) {
      return res.status(400).json({
        success: false,
        message: "Không thể gửi lời mời kết bạn cho chính mình",
      });
    }
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res
        .status(404)
        .json({ success: false, message: "Người dùng không tồn tại" });
    }
    if (includesId(receiver.friendRequests, senderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Đã gửi lời mời kết bạn trước đó" });
    }
    if (includesId(receiver.friends, senderId)) {
      return res.status(400).json({ success: false, message: "Đã là bạn bè" });
    }

    // Thêm lời mời kết bạn
    const sender = await User.findById(senderId);
    await User.findByIdAndUpdate(receiverId, {
      $push: { friendRequests: senderId },
    });

    // Gửi thông báo real-time nếu người nhận đang online
    emitToUserRoom(io, receiverId, "newFriendRequest", {
      senderId: toComparableId(senderId),
      senderName: getSafeUserName(sender),
      avatar: sender?.avatar,
    });

    emitToUserRoom(io, senderId, "friendRequestSent", {
      receiverId: toComparableId(receiverId),
    });

    res.status(200).json({ success: true, message: "Đã gửi lời mời" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

const rejectFriendRequest = async (req, res) => {
  try {
    const { senderId } = req.body;
    const receiverId = req.user.id;

    // Xoá lời mời kết bạn
    const io = req.app.get("socketio");

    await User.findByIdAndUpdate(receiverId, {
      $pull: { friendRequests: senderId },
    });

    emitToUserRoom(io, senderId, "friendRequestRejected", {
      rejecterId: toComparableId(receiverId),
    });

    emitToUserRoom(io, receiverId, "friendRequestHandled", {
      action: "rejected",
      senderId: toComparableId(senderId),
    });

    res.status(200).json({ success: true, message: "Đã từ chối lời mời" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

module.exports = {
  getUserProfile,
  getUserById,
  updateUserProfile,
  getAllUsers,
  searchUsers,
  getFriends,
  getFriendRequests,
  accceptFriendRequest,
  getSidebarUsers,
  sendFriendRequest,
  rejectFriendRequest,
  getOnlineFriends,
};
