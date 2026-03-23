const User = require("../models/User");
const Message = require("../models/Message");

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

// [PUT] /api/users/profile
const updateUserProfile = async (req, res) => {
  try {
    console.log("--- Bắt đầu Update Profile ---");
    console.log("Body nhận được:", req.body);
    console.log("File nhận được:", req.file);

    const userId = req.user.id;
    const { displayName, status, activityStatus } = req.body;

    let updateData = {};

    // Validate và gán DisplayName
    if (displayName) updateData.displayName = displayName;

    // Validate và gán Status
    if (status) updateData.status = status;

    // Xử lý ActivityStatus (Quan trọng: Parse từ chuỗi JSON sang Object)
    if (activityStatus) {
      try {
        // Nếu là chuỗi JSON thì parse, nếu là object thì giữ nguyên
        const parsedStatus =
          typeof activityStatus === "string"
            ? JSON.parse(activityStatus)
            : activityStatus;

        updateData.activityStatus = parsedStatus;
      } catch (e) {
        console.error("Lỗi parse activityStatus:", e);
      }
    }

    // Xử lý Avatar (Nếu có file upload)
    if (req.file) {
      let path = req.file.path.replace(/\\/g, "/");
      // Nếu bạn lưu file trong folder uploads ở root, đường dẫn thường là uploads/tenfile.jpg
      // Cần sửa lại cho khớp với cách bạn serve static file
      updateData.avatar = `/uploads/${req.file.filename}`;
    }

    console.log("Dữ liệu chuẩn bị update vào DB:", updateData);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true },
    ).select("-password");

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
      const isSent = (user.friendRequests || []).includes(currentUserId);
      const isReceived = (currentUserFull.friendRequests || []).includes(
        user._id,
      );
      const isFriend = (user.friends || []).includes(currentUserId);

      return {
        _id: user._id,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        activityStatus: user.activityStatus,
        isSent,
        isReceived,
        isFriend,
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
      "displayName email avatar status activityStatus",
    );
    res.json({ success: true, friends: currentUser.friends });
  } catch (error) {
    console.error("Lỗi lấy danh sách bạn bè:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Lấy danh sách lời mời kết bạn đang chờ
const getFriendRequests = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id).populate(
      "friendRequests",
      "displayName avatar email",
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
    const onlineUsers = req.app.get("onlineUsers");

    const receiver = await User.findById(receiverId);

    // Kiểm tra có lời mời này hay không
    if (!receiver.friendRequests.includes(senderId)) {
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
    const senderSocketId = onlineUsers.get(senderId.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("friendRequestAccepted", {
        newFriendId: receiverId,
        newFriendName: receiver.displayName || receiver.email.split("@")[0],
        newFriendAvatar: receiver.avatar,
      });
    }

    res.json({ success: true, message: "Đã chấp nhận lời mời kết bạn." });
  } catch (error) {
    console.error("Lỗi chấp nhận lời mời kết bạn:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

const getSidebarUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const currentUser = await User.findById(currentUserId);
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
      "displayName avatar status activityStatus",
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
          .select("content text image sender createdAt isRead");

        const userObj = user.toObject();

        if (lastMsg) {
          let previewContent = lastMsg.content || lastMsg.text || "";

          if (!previewContent && lastMsg.image) {
            previewContent = "[Hình ảnh]";
          }

          userObj.lastMessage = {
            content: previewContent || "Tin nhắn",
            senderId: lastMsg.sender,
            createdAt: lastMsg.createdAt,
            isRead: lastMsg.isRead,
          };

          // Logic check unread
          userObj.hasUnread =
            lastMsg.sender.toString() !== currentUserId && !lastMsg.isRead;
        } else {
          // Nếu là bạn bè nhưng chưa chat bao giờ
          userObj.lastMessage = null;
          userObj.hasUnread = false;
        }

        return userObj;
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
    const onlineUsers = req.app.get("onlineUsers");

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
    if (receiver.friendRequests.includes(senderId)) {
      return res
        .status(400)
        .json({ success: false, message: "Đã gửi lời mời kết bạn trước đó" });
    }
    if (receiver.friends.includes(senderId)) {
      return res.status(400).json({ success: false, message: "Đã là bạn bè" });
    }

    // Thêm lời mời kết bạn
    const sender = await User.findById(senderId);
    await User.findByIdAndUpdate(receiverId, {
      $push: { friendRequests: senderId },
    });

    // Gửi thông báo real-time nếu người nhận đang online
    const receiverSocketId = onlineUsers.get(receiverId.toString());
    console.log("Receiver Socket ID:", receiverSocketId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newFriendRequest", {
        senderId: senderId,
        senderName: sender.displayName || sender.email.split("@")[0],
        avatar: sender.avatar,
      });
    }

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
    await User.findByIdAndUpdate(receiverId, {
      $pull: { friendRequests: senderId },
    });

    // await User.findByIdAndUpdate(senderId, {
    //     $pull: { sentRequests: receiverId }
    // })

    res.status(200).json({ success: true, message: "Đã từ chối lời mời" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
  searchUsers,
  getFriends,
  getFriendRequests,
  accceptFriendRequest,
  getSidebarUsers,
  sendFriendRequest,
  rejectFriendRequest,
};
