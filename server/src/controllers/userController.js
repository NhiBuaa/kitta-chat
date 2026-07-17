const User = require("../models/User");
const ConversationParticipant = require("../models/ConversationParticipant");
const Message = require("../models/Message");
const mongoose = require("mongoose");
const getSafeUserName = require("../utils/getSafeUserName");
const { queueProfileAvatarProcessing } = require("../services/profileAvatarQueueService");
const { invalidateUserProfile, getCachedUserProfile } = require("../services/cacheService");
const { addFriendWriteThrough, removeFriendWriteThrough, getFriendIdsFromCache } = require("../services/friendCacheService");
const { getMultiPresence, getUserPresence, setPresenceWriteThrough } = require("../services/presenceService");
const { broadcastUserStatus } = require("../socket/handlers/presenceHandler");
const { getConversationMigrationConfig } = require("../config/env");
const { logger } = require("../utils/logger");
const { getSidebarCandidatesForUser } = require("../services/conversationSidebarCandidateService");

const toComparableId = (value) => value?.toString?.() || String(value);

const includesId = (list = [], targetId) =>
  list.some((item) => toComparableId(item) === toComparableId(targetId));

const emitToUserRoom = (io, userId, eventName, payload) => {
  if (!io || !userId) return;
  io.to(toComparableId(userId)).emit(eventName, payload);
};

const isRealtimeOnline = (presence) =>
  presence?.status === "online" || presence?.status === "active";



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

    const conversationId = [currentUserId, targetUserId].sort().join("_");
    const participant = await ConversationParticipant.findOne({
      legacyConversationId: conversationId,
      userId: currentUserId,
    }).lean();

    let participantPrefs = {};
    if (participant) {
      const now = new Date();
      const isMuted = !!(
        participant.state?.mutedUntil &&
        new Date(participant.state.mutedUntil) > now
      );
      participantPrefs = {
        isPinned: !!participant.state?.pinnedAt,
        pinnedAt: participant.state?.pinnedAt,
        isMuted,
        mutedUntil: participant.state?.mutedUntil,
      };
    }

    res.json({
      success: true,
      user: {
        ...targetUser,
        ...relationshipFlags,
        ...participantPrefs,
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

    // 1. Lấy candidates từ Conversation Read Model (tối đa 30)
    const candidates = await getSidebarCandidatesForUser({ userId: currentUserId, limit: 30 });
    const directCandidates = (candidates || []).filter((c) => c.kind === "direct");

    // 2. Lấy danh sách bạn bè của người dùng hiện tại
    const [currentUser, friendIds] = await Promise.all([
      User.findById(currentUserId).select("friends friendRequests"),
      getFriendIdsFromCache(currentUserId),
    ]);
    const friendsIds = new Set(friendIds);

    // Xác định tập các user id của bạn bè trong candidate
    const candidateTargetUserIds = new Set();
    for (const candidate of directCandidates) {
      const legacyConversationId = candidate.conversationId || candidate.legacyConversationId;
      if (legacyConversationId) {
        const parts = legacyConversationId.includes("_") ? legacyConversationId.split("_") : [legacyConversationId];
        const targetId = parts.find((part) => part && part !== currentUserId);
        if (targetId) {
          candidateTargetUserIds.add(targetId);
        }
      }
    }

    // Lọc các bạn bè có cuộc hội thoại direct đang bị xóa (soft delete) và chưa có tin nhắn mới
    const allParticipants = await ConversationParticipant.find({ userId: currentUserId })
      .populate("conversationId")
      .lean();

    const deletedDirectTargetIds = new Set();
    for (const p of allParticipants) {
      const conv = p.conversationId;
      if (conv && conv.kind === "direct" && p.state?.deletedAt) {
        const lastMsgAt = p.state.lastMessageAt ? new Date(p.state.lastMessageAt).getTime() : 0;
        const deletedAt = new Date(p.state.deletedAt).getTime();
        if (lastMsgAt <= deletedAt) {
          const legacyId = conv.legacyConversationId || p.legacyConversationId;
          if (legacyId) {
            const parts = legacyId.split("_");
            const targetId = parts.find((id) => id !== currentUserId);
            if (targetId) {
              deletedDirectTargetIds.add(targetId);
            }
          }
        }
      }
    }

    // Bạn bè chưa nhắn tin -> xếp sau (lastMessage = null)
    // Loại bỏ những bạn bè có cuộc hội thoại đang bị xóa
    const noMessageFriendIds = friendIds.filter(
      (friendId) => !candidateTargetUserIds.has(friendId) && !deletedDirectTargetIds.has(friendId)
    );

    // Gom toàn bộ User ID cần fetch thông tin
    const allTargetUserIds = Array.from(new Set([
      ...Array.from(candidateTargetUserIds),
      ...noMessageFriendIds
    ]));

    // Fetch thông tin người dùng
    const users = allTargetUserIds.length > 0 
      ? await User.find({ _id: { $in: allTargetUserIds } }).select(
          "displayName avatar status activityStatus friends friendRequests",
        )
      : [];

    const userMap = new Map(users.map((u) => [u._id.toString(), u.toObject()]));

    // Gom các lastMessageId từ direct candidates để fetch Message
    const lastMessageIds = directCandidates
      .map((c) => c.lastMessageId)
      .filter(Boolean);

    const messages = lastMessageIds.length > 0
      ? await Message.find({ _id: { $in: lastMessageIds } }).lean()
      : [];

    const lastMsgMap = new Map(messages.map((m) => [m._id.toString(), m]));

    // 3. Build response
    // Nhóm 1: Có cuộc hội thoại (candidates)
    const conversationEntries = [];
    for (const candidate of directCandidates) {
      const legacyConversationId = candidate.conversationId || candidate.legacyConversationId;
      const parts = legacyConversationId.includes("_") ? legacyConversationId.split("_") : [legacyConversationId];
      const targetId = parts.find((part) => part && part !== currentUserId);
      if (targetId && userMap.has(targetId)) {
        const userObj = userMap.get(targetId);
        const lastMsg = candidate.lastMessageId ? lastMsgMap.get(candidate.lastMessageId.toString()) : null;
        const unreadCount = candidate.unreadCount || 0;

        const relationshipFlags = {
          isFriend: friendsIds.has(targetId),
          isSent: includesId(userObj?.friendRequests, currentUserId),
          isReceived: includesId(currentUser?.friendRequests, targetId),
        };

        const now = new Date();
        const isMuted = !!(
          candidate.mutedUntil &&
          new Date(candidate.mutedUntil) > now
        );

        conversationEntries.push({
          ...userObj,
          ...relationshipFlags,
          lastMessage: lastMsg ? buildSidebarLastMessage(lastMsg) : null,
          hasUnread: unreadCount > 0,
          unreadCount,
          isPinned: !!candidate.pinnedAt,
          pinnedAt: candidate.pinnedAt,
          isMuted,
          mutedUntil: candidate.mutedUntil,
        });
      }
    }

    // Nhóm 2: Bạn bè chưa nhắn tin -> xếp sau (lastMessage = null)
    const noMessageEntries = [];
    for (const friendId of noMessageFriendIds) {
      if (userMap.has(friendId)) {
        const userObj = userMap.get(friendId);
        const relationshipFlags = {
          isFriend: friendsIds.has(friendId),
          isSent: includesId(userObj?.friendRequests, currentUserId),
          isReceived: includesId(currentUser?.friendRequests, friendId),
        };

        noMessageEntries.push({
          ...userObj,
          ...relationshipFlags,
          lastMessage: null,
          hasUnread: false,
          unreadCount: 0,
          isPinned: false,
          pinnedAt: null,
          isMuted: false,
          mutedUntil: null,
        });
      }
    }

    const responseUsers = [...conversationEntries, ...noMessageEntries];
    res.json({ success: true, users: responseUsers });
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
