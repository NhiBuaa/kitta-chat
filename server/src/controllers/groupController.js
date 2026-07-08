const Group = require("../models/Group");
const User = require("../models/User");
const Message = require("../models/Message");
const mongoose = require("mongoose");
const { createSystemMessage } = require("./messageController");
const getSafeUserName = require("../utils/getSafeUserName");
const { getConversationMigrationConfig } = require("../config/env");
const { compareSidebarForUser } = require("../services/conversationShadowCompareService");
const { getSidebarCandidatesForUser } = require("../services/conversationSidebarCandidateService");
const { logger } = require("../utils/logger");
const { syncGroupLifecycle } = require("../services/conversationReadModelService");

const GROUP_USER_FIELDS = "displayName avatar username status activityStatus";
const runSidebarShadowCompare = async ({ userId, legacyItems, scope }) => {
  const { conversationShadowCompareEnabled } = getConversationMigrationConfig();
  if (!conversationShadowCompareEnabled) return;

  try {
    const report = await compareSidebarForUser({ userId, legacyItems, scope });
    if (report.mismatches.length > 0) {
      logger.warn("Conversation shadow compare mismatch", {
        scope,
        userId: normalizeUserId(userId),
        mismatchCount: report.mismatches.length,
        mismatches: report.mismatches,
      });
    }
  } catch (error) {
    logger.error("Conversation shadow compare failed", { error: error.message });
  }
};

const normalizeUserId = (value) => {
  if (!value) return null;
  if (typeof value === "object") {
    return value._id ? value._id.toString() : null;
  }
  return value.toString();
};

const populateGroup = (query) =>
  query
    .populate("members", GROUP_USER_FIELDS)
    .populate("admin", GROUP_USER_FIELDS);

const toPlainObject = (doc) =>
  typeof doc?.toObject === "function" ? doc.toObject() : doc;

const hasReadMessage = (message, currentUserId) => {
  const senderId = normalizeUserId(message?.sender);
  if (!message || senderId === currentUserId) {
    return true;
  }

  return (message.readBy || []).some(
    (readerId) => normalizeUserId(readerId) === currentUserId,
  );
};

const buildGroupLastMessagePreview = (message, currentUserId) => {
  if (!message) return null;

  let content = message.text || "";
  if (message.type === "call_log" && message.callData?.type) {
    content = message.callData.type === "video"
      ? "[Cuộc gọi video]"
      : "[Cuộc gọi thoại]";
  } else if (!content && message.attachments?.length > 0) {
    content = "[Tệp đính kèm]";
  }
  if (!content) content = "Tin nhắn";

  const senderId = normalizeUserId(message.sender);

  return {
    content,
    text: message.text || "",
    type: message.type,
    sender: message.sender,
    senderId,
    createdAt: message.createdAt,
    isRead: hasReadMessage(message, currentUserId),
    readBy: message.readBy || [],
    messageId: message._id,
    callHistoryId: message.callData?.callHistoryId || null,
  };
};

const buildGroupSidebarUnreadState = (lastMessagePreview) => {
  const unreadCount = lastMessagePreview?.isRead === false ? 1 : 0;

  return {
    hasUnread: unreadCount > 0,
    unreadCount,
  };
};

const emitToUserRooms = (io, userIds, eventName, payload) => {
  if (!io) return;

  Array.from(new Set(userIds.map(normalizeUserId).filter(Boolean))).forEach(
    (userId) => {
      io.to(userId).emit(eventName, payload);
    },
  );
};

const emitGroupUpsert = (io, group, extraPayload = {}) => {
  if (!group) return;

  emitToUserRooms(io, group.members || [], "groupUpserted", {
    group,
    ...extraPayload,
  });
};

const buildGroupSidebarState = (group, lastMessage, currentUserId) => {
  const lastMessagePreview = buildGroupLastMessagePreview(lastMessage, currentUserId);
  const unreadState = buildGroupSidebarUnreadState(lastMessagePreview);

  return {
    ...toPlainObject(group),
    lastMessage: lastMessagePreview,
    ...unreadState,
  };
};

const buildGroupSystemMessagePayload = (groupId, systemMessage) => ({
  _id: systemMessage._id,
  conversationId: groupId,
  senderId: null,
  sender: null,
  receiverId: groupId,
  receiver: groupId,
  text: systemMessage.text,
  type: "system",
  createdAt: systemMessage.createdAt,
  isGroup: true,
});

// [POST] /api/groups (Tạo nhóm mới)
const createGroup = async (req, res) => {
  try {
    const { name, members } = req.body;
    const adminId = req.user.id;
    const io = req.app.get("socketio");
    const allMembers = Array.from(new Set([...(members || []), adminId]));

    if (allMembers.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Nhóm phải có ít nhất 3 thành viên (tính cả bạn)",
      });
    }

    const newGroup = new Group({
      name,
      admin: adminId,
      members: allMembers,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`,
    });

    await newGroup.save();
    await syncGroupLifecycle(newGroup._id, "create");

    const fullGroup = await populateGroup(Group.findById(newGroup._id));
    const admin = await User.findById(adminId).select("displayName username");

    const systemMessage = await createSystemMessage(
      newGroup._id.toString(),
      `${getSafeUserName(admin)} \u0111\u00e3 t\u1ea1o nh\u00f3m`,
      { readBy: [adminId] },
    );

    allMembers.forEach((memberId) => {
      emitToUserRooms(io, [memberId], "groupUpserted", {
        group: buildGroupSidebarState(fullGroup, systemMessage, memberId),
        action: "created",
        actorId: adminId,
      });
    });

    res.json({
      success: true,
      group: buildGroupSidebarState(fullGroup, systemMessage, adminId),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi tạo nhóm" });
  }
};

const buildReadModelGroupSidebarResult = ({
  candidates,
  groupMap,
  lastMessageMap,
  currentUserId,
}) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const result = [];
  for (const candidate of candidates) {
    if (candidate.kind !== "group") continue;
    const legacyConversationId = candidate.conversationId || candidate.legacyConversationId;
    if (!legacyConversationId) continue;

    const groupObj = groupMap.get(legacyConversationId);
    if (!groupObj) continue;

    const lastMsg = lastMessageMap.get(legacyConversationId) || null;
    const unreadCount = candidate.unreadCount || 0;

    result.push({
      ...groupObj,
      lastMessage: buildGroupLastMessagePreview(lastMsg, currentUserId),
      hasUnread: unreadCount > 0,
      unreadCount,
    });
  }

  return result;
};

// [GET] /api/groups (Lấy danh sách nhóm tôi đã tham gia)
const getMyGroups = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);
    const groups = await populateGroup(
      Group.find({ members: currentUserId }),
    ).sort({
      updatedAt: -1,
    });

    const groupIds = groups.map((group) => normalizeUserId(group)).filter(Boolean);

    if (groupIds.length === 0) {
      return res.json({ success: true, groups: [] });
    }

    const [lastMessages, unreadCounts] = await Promise.all([
      Message.aggregate([
        { $match: { conversationId: { $in: groupIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$conversationId",
            lastMsg: { $first: "$$ROOT" },
          },
        },
      ]),
      Message.aggregate([
        {
          $match: {
            conversationId: { $in: groupIds },
            sender: { $ne: currentUserObjectId },
            readBy: { $ne: currentUserObjectId },
          },
        },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
      ]),
    ]);

    const lastMessageMap = new Map(
      lastMessages.map((item) => [item._id, item.lastMsg]),
    );
    const unreadMap = new Map(
      unreadCounts.map((item) => [item._id, item.count]),
    );

    const groupsWithSidebarState = groups.map((group) => {
      const groupId = normalizeUserId(group);
      const lastMsg = lastMessageMap.get(groupId) || null;
      const unreadCount = unreadMap.get(groupId) || 0;

      return {
        ...toPlainObject(group),
        lastMessage: buildGroupLastMessagePreview(lastMsg, currentUserId),
        hasUnread: unreadCount > 0,
        unreadCount,
      };
    });

    let responseGroups = groupsWithSidebarState;
    const { conversationSidebarReadModelEnabled } = getConversationMigrationConfig();
    if (conversationSidebarReadModelEnabled) {
      try {
        const candidates = await getSidebarCandidatesForUser({ userId: currentUserId, limit: 30 });
        const groupMap = new Map(groups.map((g) => [normalizeUserId(g), toPlainObject(g)]));
        responseGroups = buildReadModelGroupSidebarResult({
          candidates,
          groupMap,
          lastMessageMap,
          currentUserId,
        }) || groupsWithSidebarState;
      } catch (error) {
        console.error("Group sidebar read-model switch failed; falling back to legacy", error);
        responseGroups = groupsWithSidebarState;
      }
    }

    await runSidebarShadowCompare({
      userId: currentUserId,
      legacyItems: responseGroups,
      scope: "group",
    });

    res.json({ success: true, groups: responseGroups });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [POST] /api/groups/:groupId/add-member (Thêm thành viên vào nhóm)
const addMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const userId = req.user.id;
    const io = req.app.get("socketio");

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (!group.members.some((id) => id.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thêm thành viên vào nhóm",
      });
    }

    // ko dc them trùng
    if (group.members.some((id) => id.toString() === memberId)) {
      return res.status(400).json({
        success: false,
        message: "Thành viên đã tồn tại trong nhóm",
      });
    }

    group.members.push(memberId);
    await group.save();
    await syncGroupLifecycle(groupId, "add-member", { memberId });

    const updatedGroup = await populateGroup(Group.findById(groupId));
    const [actor, newMember] = await Promise.all([
      User.findById(userId).select("displayName username"),
      User.findById(memberId).select("displayName username"),
    ]);
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(actor)} đã thêm ${getSafeUserName(newMember)} vào nhóm`,
    );

    io.to(groupId).emit("getMessage", buildGroupSystemMessagePayload(groupId, systemMessage));

    emitGroupUpsert(io, updatedGroup, {
      action: "member-added",
      actorId: userId,
      addedMemberId: memberId,
    });

    res.json({
      success: true,
      message: "Thêm thành viên thành công",
      group: updatedGroup,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [POST] /api/groups/:groupId/remove-member (Xóa thành viên khỏi nhóm)
const removeMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const adminId = req.user.id;
    const io = req.app.get("socketio");

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (group.admin.toString() !== adminId && memberId !== adminId) {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền" });
    }

    if (!group.members.some((id) => id.toString() === memberId)) {
      return res.status(400).json({
        success: false,
        message: "Thành viên không tồn tại trong nhóm",
      });
    }

    const previousMemberIds = group.members.map((id) => id.toString());
    const removedMember = await User.findById(memberId).select(
      "displayName username",
    );
    const actionType = memberId === adminId ? "rời" : "bị xóa khỏi";
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(removedMember)} đã ${actionType} nhóm`,
    );

    io.to(groupId).emit("getMessage", buildGroupSystemMessagePayload(groupId, systemMessage));

    group.members = group.members.filter((id) => id.toString() !== memberId);
    await group.save();
    await syncGroupLifecycle(groupId, "remove-member", { memberId });

    const updatedGroup = await populateGroup(Group.findById(groupId));
    const payload = {
      groupId,
      updatedGroup,
      removedMemberId: memberId,
      isVoluntaryLeave: memberId === adminId,
    };

    emitToUserRooms(io, previousMemberIds, "groupMemberUpdated", payload);

    res.json({ success: true, message: "Xóa thành viên thành công" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [PUT] /api/groups/:groupId/rename (Đổi tên nhóm)
const renameGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { newName } = req.body;
    const adminId = req.user.id;
    const io = req.app.get("socketio");

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (group.admin.toString() !== adminId) {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có thể đổi tên nhóm",
      });
    }

    const oldName = group.name;
    const memberIds = group.members.map((id) => id.toString());

    group.name = newName;
    group.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(newName)}&background=random&color=fff&size=128`;
    await group.save();

    const admin = await User.findById(adminId).select("displayName username");
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(admin)} đã đổi tên nhóm từ "${oldName}" thành "${newName}"`,
    );

    io.to(groupId).emit("getMessage", buildGroupSystemMessagePayload(groupId, systemMessage));

    const payload = {
      groupId,
      newName,
      newAvatar: group.avatar,
    };
    emitToUserRooms(io, memberIds, "groupRenamed", payload);

    res.json({ success: true, message: "Đổi tên nhóm thành công", group });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [POST] /api/groups/:groupId/transfer-admin (Chuyển quyền trưởng nhóm)
const transferAdmin = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { newAdminId } = req.body;
    const currentAdminId = req.user.id;
    const io = req.app.get("socketio");

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (group.admin.toString() !== currentAdminId) {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có thể chuyển quyền",
      });
    }

    if (!group.members.some((m) => m.toString() === newAdminId)) {
      return res.status(400).json({
        success: false,
        message: "Người dùng không phải thành viên nhóm",
      });
    }

    const memberIds = group.members.map((id) => id.toString());

    group.admin = newAdminId;
    await group.save();
    await syncGroupLifecycle(groupId, "transfer-admin", { newAdminId });

    const [oldAdmin, newAdmin] = await Promise.all([
      User.findById(currentAdminId).select("displayName username"),
      User.findById(newAdminId).select("displayName username"),
    ]);

    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(oldAdmin)} đã chuyển quyền trưởng nhóm cho ${getSafeUserName(newAdmin)}`,
    );

    const updatedGroup = await populateGroup(Group.findById(groupId));

    io.to(groupId).emit("getMessage", buildGroupSystemMessagePayload(groupId, systemMessage));

    const payload = {
      groupId,
      newAdminId,
    };
    emitToUserRooms(io, memberIds, "groupAdminChanged", payload);

    res.json({
      success: true,
      message: "Chuyển quyền thành công",
      group: updatedGroup,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [DELETE] /api/groups/:groupId (Giải tán nhóm - chỉ admin)
const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const adminId = req.user.id;
    const io = req.app.get("socketio");

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (group.admin.toString() !== adminId) {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có thể giải tán nhóm",
      });
    }

    const memberIds = group.members.map((id) => id.toString());
    const admin = await User.findById(adminId).select("displayName username");
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(admin)} đã giải tán nhóm`,
    );

    io.to(groupId).emit("getMessage", buildGroupSystemMessagePayload(groupId, systemMessage));

    await Group.findByIdAndDelete(groupId);
    await syncGroupLifecycle(groupId, "delete");
    await Message.deleteMany({ conversationId: groupId });

    const payload = { groupId };
    emitToUserRooms(io, memberIds, "groupDeleted", payload);

    res.json({ success: true, message: "Giải tán nhóm thành công" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [GET] /api/groups/:groupId (Lấy thông tin chi tiết nhóm)
const getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await populateGroup(Group.findById(groupId));

    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy group" });
    }

    res.status(200).json(group);
  } catch (err) {
    console.log("Error getGroupById groupController: ", err);
    res.status(500).json({ success: false, message: "Lỗi Server" });
  }
};

module.exports = {
  createGroup,
  getMyGroups,
  addMember,
  removeMember,
  renameGroup,
  transferAdmin,
  deleteGroup,
  getGroupById,
};


