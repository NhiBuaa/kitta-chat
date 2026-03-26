const Group = require("../models/Group");
const User = require("../models/User");
const Message = require("../models/Message");
const { createSystemMessage } = require("./messageController");
const getSafeUserName = require("../utils/getSafeUserName");

const GROUP_USER_FIELDS = "displayName avatar username status activityStatus";

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

    const fullGroup = await populateGroup(Group.findById(newGroup._id));
    const admin = await User.findById(adminId).select("displayName username");

    await createSystemMessage(
      newGroup._id.toString(),
      `${getSafeUserName(admin)} đã tạo nhóm`,
    );

    emitGroupUpsert(io, fullGroup, {
      action: "created",
      actorId: adminId,
    });

    res.json({ success: true, group: fullGroup });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Lỗi tạo nhóm" });
  }
};

// [GET] /api/groups (Lấy danh sách nhóm tôi đã tham gia)
const getMyGroups = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groups = await populateGroup(Group.find({ members: currentUserId })).sort({
      updatedAt: -1,
    });

    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// [POST] /api/groups/:groupId/add-member (Thêm thành viên vào nhóm)
const addMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberId } = req.body;
    const adminId = req.user.id;
    const io = req.app.get("socketio");

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (group.admin.toString() !== adminId) {
      return res.status(403).json({
        success: false,
        message: "Chỉ admin mới có thể thêm thành viên",
      });
    }

    if (group.members.some((id) => id.toString() === memberId)) {
      return res.status(400).json({
        success: false,
        message: "Thành viên đã tồn tại trong nhóm",
      });
    }

    group.members.push(memberId);
    await group.save();

    const updatedGroup = await populateGroup(Group.findById(groupId));
    const [admin, newMember] = await Promise.all([
      User.findById(adminId).select("displayName username"),
      User.findById(memberId).select("displayName username"),
    ]);
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(admin)} đã thêm ${getSafeUserName(newMember)} vào nhóm`,
    );

    io.to(groupId).emit("getMessage", {
      senderId: null,
      sender: null,
      receiverId: groupId,
      text: systemMessage.text,
      type: "system",
      createdAt: systemMessage.createdAt,
      isGroup: true,
    });

    emitGroupUpsert(io, updatedGroup, {
      action: "member-added",
      actorId: adminId,
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
      return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
    }

    if (group.admin.toString() !== adminId && memberId !== adminId) {
      return res.status(403).json({ success: false, message: "Không có quyền" });
    }

    if (!group.members.some((id) => id.toString() === memberId)) {
      return res.status(400).json({
        success: false,
        message: "Thành viên không tồn tại trong nhóm",
      });
    }

    const previousMemberIds = group.members.map((id) => id.toString());
    const removedMember = await User.findById(memberId).select("displayName username");
    const actionType = memberId === adminId ? "rời" : "bị xóa khỏi";
    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(removedMember)} đã ${actionType} nhóm`,
    );

    io.to(groupId).emit("getMessage", {
      senderId: null,
      sender: null,
      receiverId: groupId,
      text: systemMessage.text,
      type: "system",
      createdAt: systemMessage.createdAt,
      isGroup: true,
    });

    group.members = group.members.filter((id) => id.toString() !== memberId);
    await group.save();

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
      return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
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

    io.to(groupId).emit("getMessage", {
      senderId: null,
      sender: null,
      receiverId: groupId,
      text: systemMessage.text,
      type: "system",
      createdAt: systemMessage.createdAt,
      isGroup: true,
    });

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
      return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
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

    const [oldAdmin, newAdmin] = await Promise.all([
      User.findById(currentAdminId).select("displayName username"),
      User.findById(newAdminId).select("displayName username"),
    ]);

    const systemMessage = await createSystemMessage(
      groupId,
      `${getSafeUserName(oldAdmin)} đã chuyển quyền trưởng nhóm cho ${getSafeUserName(newAdmin)}`,
    );

    const updatedGroup = await populateGroup(Group.findById(groupId));

    io.to(groupId).emit("getMessage", {
      senderId: null,
      sender: null,
      receiverId: groupId,
      text: systemMessage.text,
      type: "system",
      createdAt: systemMessage.createdAt,
      isGroup: true,
    });

    const payload = {
      groupId,
      newAdminId,
    };
    emitToUserRooms(io, memberIds, "groupAdminChanged", payload);

    res.json({ success: true, message: "Chuyển quyền thành công", group: updatedGroup });
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
      return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
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

    io.to(groupId).emit("getMessage", {
      senderId: null,
      sender: null,
      receiverId: groupId,
      text: systemMessage.text,
      type: "system",
      createdAt: systemMessage.createdAt,
      isGroup: true,
    });

    await Group.findByIdAndDelete(groupId);
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
      return res.status(404).json({ success: false, message: "Không tìm thấy group" });
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
