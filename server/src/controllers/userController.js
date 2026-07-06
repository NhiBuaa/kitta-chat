const User = require("../models/User");
const Message = require("../models/Message");
const mongoose = require("mongoose");
const getSafeUserName = require("../utils/getSafeUserName");
const { queueProfileAvatarProcessing } = require("../services/profileAvatarQueueService");
const { invalidateUserProfile, getCachedUserProfile } = require("../services/cacheService");
const { addFriendWriteThrough, removeFriendWriteThrough, getFriendIdsFromCache } = require("../services/friendCacheService");
const { getMultiPresence, getUserPresence, setPresenceWriteThrough } = require("../services/presenceService");
const { getRecentConversations } = require("../services/conversationCacheService");
const { broadcastUserStatus } = require("../socket/handlers/presenceHandler");
const { getConversationMigrationConfig } = require("../config/env");
const { compareSidebarForUser } = require("../services/conversationShadowCompareService");

const toComparableId = (value) => value?.toString?.() || String(value);

const includesId = (list = [], targetId) =>
  list.some((item) => toComparableId(item) === toComparableId(targetId));

const emitToUserRoom = (io, userId, eventName, payload) => {
  if (!io || !userId) return;
  io.to(toComparableId(userId)).emit(eventName, payload);
};

const isRealtimeOnline = (presence) =>
  presence?.status === "online" || presence?.status === "active";


const runSidebarShadowCompare = async ({ userId, legacyItems, scope }) => {
  const { conversationShadowCompareEnabled } = getConversationMigrationConfig();
  if (!conversationShadowCompareEnabled) return;

  try {
    const report = await compareSidebarForUser({ userId, legacyItems, scope });
    if (report.mismatches.length > 0) {
      console.warn("Conversation shadow compare mismatch", {
        scope,
        userId: toComparableId(userId),
        mismatchCount: report.mismatches.length,
        mismatches: report.mismatches,
      });
    }
  } catch (error) {
    console.error("Conversation shadow compare failed", error);
  }
};
const buildRelationshipFlags = (targetUser, currentUser) => {
  const currentUserId = toComparableId(currentUser?._id || currentUser?.id);

  return {
    isFriend: includesId(targetUser?.friends, currentUserId),
    isSent: includesId(targetUser?.friendRequests, currentUserId),
    isReceived: includesId(currentUser?.friendRequests, targetUser?._id),
  };
};

const buildSidebarLastMessage = (lastMsg) => {
  if (!lastMsg) return null;

  let previewContent = lastMsg.text || "";
  if (lastMsg.type === "call_log" && lastMsg.callData?.type) {
    previewContent = lastMsg.callData.type === "video"
      ? "[Cuộc gọi video]"
      : "[Cuộc gọi thoại]";
  } else if (!previewContent && lastMsg.attachments?.length > 0) {
    const file = lastMsg.attachments[0];
    const isImage =
      file?.type?.startsWith("image/") ||
      file?.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    previewContent = isImage ? "[Hình ảnh]" : (file?.name || "[Tệp đính kèm]");
  }
  if (!previewContent) previewContent = "Tin nhắn";

  return {
    content: previewContent,
    senderId: lastMsg.sender,
    createdAt: lastMsg.createdAt,
    isRead: lastMsg.isRead,
    messageId: lastMsg._id ? toComparableId(lastMsg._id) : null,
    callHistoryId: lastMsg.callData?.callHistoryId
      ? toComparableId(lastMsg.callData.callHistoryId)
      : null,
  };
};

// [GET] /api/users/profile
const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    // Dùng Cache-Aside: ưu tiên Redis -> fallback MongoDB nếu miss
    const user = await getCachedUserProfile(userId, User);

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
      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ success: false, message: "Avatar phải là file ảnh." });
      }
    }

    console.log("Dữ liệu chuẩn bị update vào DB:", updateData);

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      returnDocument: "after",
    }).select("-password");

    let avatarQueueResult = { queued: false, requestId: null, error: null };
    if (req.file) {
      avatarQueueResult = await queueProfileAvatarProcessing({
        file: req.file,
        userId,
        correlationId: req.requestId,
      });

      if (!avatarQueueResult.queued) {
        console.warn("[ProfileAvatar] queue unavailable:", avatarQueueResult.error);
      }
    }

    // Nếu user thay đổi trạng thái hoạt động qua profile, đồng bộ cả Redis + broadcast cho bạn bè
    if (activityStatus?.state) {
      const normalizedStatus =
        activityStatus.state === "active" ? "online" : activityStatus.state;

      await setPresenceWriteThrough(userId, normalizedStatus);

      if (normalizedStatus === "offline") {
        await req.app.get("socketio")?.redisClient?.sRem("global_online_users", userId);
      } else if (normalizedStatus === "online") {
        await req.app.get("socketio")?.redisClient?.sAdd("global_online_users", userId);
      }

      await broadcastUserStatus(req.app.get("socketio"), userId, normalizedStatus);
    }

    // Cache Invalidation - xóa cache cũ để user khác thấy avatar/name mới sớm nhất
    await invalidateUserProfile(userId);

    res.json({
      success: true,
      message: "Cập nhật thành công",
      queued: avatarQueueResult.queued,
      avatarRequestId: avatarQueueResult.requestId,
      avatarQueueError: avatarQueueResult.queueError || null,
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
// Dùng O(1) HGETALL tu Redis HASH thay vi global_online_users SET cu
const getOnlineFriends = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // Lay friend IDs tu Redis Cache (có warm-up tu dong)
    const friendIds = await getFriendIdsFromCache(currentUserId);
    if (friendIds.length === 0) {
      return res.json({ success: true, onlineUsers: [] });
    }

    // Lay trang thái presence cho toan bộ ban be bang HGETALL O(1)
    const presenceMap = await getMultiPresence(friendIds);

    // Loc ra nhung nguoi dang online
    const onlineFriends = friendIds
      .filter((friendId) => presenceMap[friendId]?.status !== "offline")
      .map((friendId) => ({
        userId: friendId,
        status: presenceMap[friendId].status,
        lastSeen: presenceMap[friendId].lastSeen,
      }));

    res.json({ success: true, onlineUsers: onlineFriends });
  } catch (error) {
    console.error("Lỗi lay danh sách ban be online:", error);
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

    // Gỡ lời mời khỏi receiver (chỉ DB - không cần cache vì đây là pending request)
    await User.findByIdAndUpdate(receiverId, {
      $pull: { friendRequests: senderId },
    });

    // Write-Through: Cập nhật MongoDB + Redis SET đồng thời
    await addFriendWriteThrough(senderId, receiverId);

    // Lấy lại sender sau khi update để emit thông tin
    const sender = await User.findById(senderId);
    const [senderPresence, receiverPresence] = await Promise.all([
      getUserPresence(senderId),
      getUserPresence(receiverId),
    ]);

    // Emit event cho người gửi (sender) để cập nhật sidebar
    emitToUserRoom(io, senderId, "friendRequestAccepted", {
      newFriendId: receiverId,
      newFriendName: getSafeUserName(receiver),
      newFriendAvatar: receiver.avatar,
    });

    if (isRealtimeOnline(receiverPresence)) {
      emitToUserRoom(io, senderId, "userStatusChanged", {
        userId: toComparableId(receiverId),
        status: "online",
        lastSeen: receiverPresence.lastSeen,
      });
    }

    emitToUserRoom(io, receiverId, "friendRequestHandled", {
      action: "accepted",
      senderId: toComparableId(senderId),
      friend: {
        _id: toComparableId(senderId),
        displayName: getSafeUserName(sender),
        avatar: sender?.avatar,
      },
    });

    if (isRealtimeOnline(senderPresence)) {
      emitToUserRoom(io, receiverId, "userStatusChanged", {
        userId: toComparableId(senderId),
        status: "online",
        lastSeen: senderPresence.lastSeen,
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
    const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);

    // 
    // Lấy conversation IDs từ Redis ZSET
    const conversationIds = await getRecentConversations(currentUserId, 30);

    // Lấy friend IDs từ Redis SET (Write-Through cache)
    const [currentUser, friendIds] = await Promise.all([
      User.findById(currentUserId).select("friends friendRequests"),
      getFriendIdsFromCache(currentUserId),
    ]);
    const friendsIds = new Set(friendIds);

    // Users đã có trong ZSET
    // Friends chưa nhắn tin (vẫn phải hiển thị)
    const targetUserIds = new Set(friendIds);

    for (const convId of conversationIds) {
      const parts = convId.includes("_") ? convId.split("_") : [convId];
      for (const part of parts) {
        if (part && part !== currentUserId) {
          targetUserIds.add(part);
        }
      }
    }

    const targetIds = Array.from(targetUserIds);

    // Tranh crash khi khong co target nao
    if (targetIds.length === 0) {
      return res.json({ success: true, users: [] });
    }

    const allConversationIds = [
      ...new Set([...conversationIds, ...targetIds]),
    ];

    // Batch lấy User info + Last Message bằng $in
    // Thay N query findOne -> chỉ 1 query $in
    const [users, allLastMessages] = await Promise.all([
      User.find({ _id: { $in: targetIds } }).select(
        "displayName avatar status activityStatus friends friendRequests",
      ),
      Message.aggregate([
        { $match: { conversationId: { $in: allConversationIds } } },
        { $sort: { createdAt: -1 } },
        { $group: {
            _id: "$conversationId",
            lastMsg: { $first: "$$ROOT" },
        }},
      ]),
    ]);

    // Đánh index last message theo conversationId
    const lastMsgMap = new Map(
      allLastMessages.map((item) => [item._id, item.lastMsg])
    );

    // Batch lấy unread count cho tất cả conversations
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          receiver: currentUserObjectId,
          isRead: false,
          conversationId: { $in: allConversationIds },
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(unreadCounts.map((item) => [item._id, item.count]));

    // Build response - ưu tiên thứ tự từ ZSET (tin nhắn mới nhất)
    // Friends chưa nhắn tin -> xếp sau cùng, vẫn hiển thị
    const userMap = new Map(users.map((u) => [u._id.toString(), u.toObject()]));

    // Đã có conversation -> xếp theo ZSET order
    const hasConversationSet = new Set(conversationIds);
    const conversationEntries = conversationIds
      .map((convId) => {
        const parts = convId.includes("_") ? convId.split("_") : [convId];
        const targetId = parts.find((p) => p && p !== currentUserId) || convId;
        return { convId, targetId };
      })
      .filter(({ targetId }) => userMap.has(targetId));

    // Friends chưa nhắn tin -> xếp sau (lastMessage = null)
    const noMessageEntries = friendIds
      .filter((friendId) => {
        const hasConv = Array.from(hasConversationSet).some((convId) =>
          convId.includes(friendId)
        );
        return !hasConv && userMap.has(friendId);
      })
      .map((friendId) => ({ convId: null, targetId: friendId }));

    const allEntries = [...conversationEntries, ...noMessageEntries];

    // Tính relationship flags
    const getRelationshipFlags = (targetId, targetUser) => ({
      isFriend: friendsIds.has(targetId),
      isSent: includesId(targetUser?.friendRequests, currentUserId),
      isReceived: includesId(currentUser?.friendRequests, targetId),
    });

    const result = allEntries.map(({ convId, targetId }) => {
      const userObj = userMap.get(targetId);
      const lastMsg = convId ? lastMsgMap.get(convId) : null;
      const unreadCount = convId ? (unreadMap.get(convId) || 0) : 0;

      if (lastMsg) {

        return {
          ...userObj,
          ...getRelationshipFlags(targetId, userObj),
          lastMessage: buildSidebarLastMessage(lastMsg),
          hasUnread: unreadCount > 0,
          unreadCount,
        };
      }

      return {
        ...userObj,
        ...getRelationshipFlags(targetId, userObj),
        lastMessage: null,
        hasUnread: false,
        unreadCount: 0,
      };
    });

    await runSidebarShadowCompare({
      userId: currentUserId,
      legacyItems: result,
      scope: "direct",
    });

    res.json({ success: true, users: result });
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

const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.body;
    const currentUserId = req.user.id;
    const io = req.app.get("socketio");

    if (!friendId) {
      return res.status(400).json({ success: false, message: "Thiếu friendId" });
    }

    if (toComparableId(friendId) === toComparableId(currentUserId)) {
      return res.status(400).json({
        success: false,
        message: "Không thể hủy kết bạn với chính mình",
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(friendId),
    ]);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Người dùng không tồn tại" });
    }

    if (!currentUser || !includesId(currentUser.friends, friendId)) {
      return res.json({ success: true, alreadyRemoved: true });
    }

    const { conversationId, hadMessages } = await removeFriendWriteThrough(currentUserId, friendId);

    emitToUserRoom(io, currentUserId, "friendRemoved", {
      removedUserId: toComparableId(friendId),
      byUserId: toComparableId(currentUserId),
      conversationId,
      hadMessages,
    });

    emitToUserRoom(io, friendId, "friendRemoved", {
      removedUserId: toComparableId(currentUserId),
      byUserId: toComparableId(currentUserId),
      conversationId,
      hadMessages,
    });

    return res.json({
      success: true,
      removedUserId: toComparableId(friendId),
      conversationId,
      hadMessages,
    });
  } catch (error) {
    console.error("Lỗi hủy kết bạn:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
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
  removeFriend,
  getOnlineFriends,
  _buildSidebarLastMessage: buildSidebarLastMessage,
};
