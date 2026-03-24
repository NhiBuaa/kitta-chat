const Group = require('../models/Group');
const User = require('../models/User');
const Message = require('../models/Message');
const { createSystemMessage } = require('./messageController');

// [POST] /api/groups (Tạo nhóm mới)
const createGroup = async (req, res) => {
    try {
        const { name, members } = req.body;
        const adminId = req.user.id;
        const io = req.app.get('socketio');

        // Members gửi lên là mảng các ID. Cần thêm cả Admin vào nhóm.
        // Dùng Set để đảm bảo không trùng lặp ID
        const allMembers = Array.from(new Set([...members, adminId]));

        if (allMembers.length < 3) {
            return res.status(400).json({ success: false, message: "Nhóm phải có ít nhất 3 thành viên (tính cả bạn)" });
        }

        const newGroup = new Group({
            name,
            admin: adminId,
            members: allMembers,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`
        });

        await newGroup.save();

        // Populate thông tin members để trả về frontend hiển thị ngay
        const fullGroup = await Group.findById(newGroup._id).populate('members', '-password');

        // Tạo system message: "Admin đã tạo nhóm"
        const admin = await User.findById(adminId);
        const systemMessage = await createSystemMessage(
            newGroup._id.toString(),
            `${admin.displayName || admin.email.split('@')[0]} đã tạo nhóm`
        );

        // Emit system message tới tất cả members online
        if (io) {
            allMembers.forEach(memberId => {
                const onlineUsers = req.app.get('onlineUsers');
                const memberSocketIds = onlineUsers?.get(memberId.toString());
                const memberSocketId = memberSocketIds ? Array.from(memberSocketIds).at(-1) : null;
                if (memberSocketId) {
                    io.to(memberSocketId).emit('getMessage', {
                        senderId: null,
                        sender: null,
                        receiverId: newGroup._id.toString(),
                        text: systemMessage.text,
                        type: 'system',
                        createdAt: systemMessage.createdAt,
                        isGroup: true
                    });
                }
            });
        }

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
        // Tìm các nhóm mà userId nằm trong mảng members
        const groups = await Group.find({ members: currentUserId })
            .populate('members', '-password')
            .populate('admin', '-password')
            .sort({ updatedAt: -1 });

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
        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
        }

        // Kiểm tra quyền (chỉ admin được thêm thành viên)
        if (group.admin.toString() !== adminId) {
            return res.status(403).json({ success: false, message: "Chỉ admin mới có thể thêm thành viên" });
        }

        // Kiểm tra thành viên đã tồn tại chưa
        if (group.members.includes(memberId)) {
            return res.status(400).json({ success: false, message: "Thành viên đã tồn tại trong nhóm" });
        }

        // Thêm thành viên
        group.members.push(memberId);
        await group.save();

        // Populate để lấy thông tin đầy đủ
        const updatedGroup = await Group.findById(groupId).populate('members', '-password');

        // Tạo system message
        const admin = await User.findById(adminId);
        const newMember = await User.findById(memberId);
        const systemMessage = await createSystemMessage(
            groupId,
            `${admin.displayName || admin.email.split('@')[0]} đã thêm ${newMember.displayName || newMember.email.split('@')[0]} vào nhóm`
        );

        // Emit system message tới tất cả trong group room
        io.to(groupId).emit('getMessage', {
            senderId: null,
            sender: null,
            receiverId: groupId,
            text: systemMessage.text,
            type: 'system',
            createdAt: systemMessage.createdAt,
            isGroup: true
        });

        // Emit event để cập nhật members list
        io.to(groupId).emit('groupMemberUpdated', {
            groupId: groupId,
            updatedGroup: updatedGroup
        });

        res.json({ success: true, message: "Thêm thành viên thành công" });
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
        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
        }

        // Kiểm tra quyền (chỉ admin được xóa thành viên, hoặc user có thể rời nhóm của mình)
        if (group.admin.toString() !== adminId && memberId !== adminId) {
            return res.status(403).json({ success: false, message: "Không có quyền" });
        }

        // Kiểm tra thành viên tồn tại
        if (!group.members.includes(memberId)) {
            return res.status(400).json({ success: false, message: "Thành viên không tồn tại trong nhóm" });
        }

        // Tạo system message TRƯỚC KHI xóa member
        const removedMember = await User.findById(memberId);
        const actionType = memberId === adminId ? "rời" : "bị xóa khỏi";
        const systemMessage = await createSystemMessage(
            groupId,
            `${removedMember.displayName || removedMember.email.split('@')[0]} đã ${actionType} nhóm`
        );

        // Emit system message tới tất cả trong group room
        io.to(groupId).emit('getMessage', {
            senderId: null,
            sender: null,
            receiverId: groupId,
            text: systemMessage.text,
            type: 'system',
            createdAt: systemMessage.createdAt,
            isGroup: true
        });

        // Xóa thành viên
        group.members = group.members.filter(id => id.toString() !== memberId);
        await group.save();

        // Populate để lấy thông tin members updated
        const updatedGroup = await Group.findById(groupId).populate('members', '-password');

        // Emit event để cập nhật members list + thông báo ai bị remove
        // isVoluntaryLeave: true nếu user tự rời, false nếu bị admin xóa
        const isVoluntaryLeave = memberId === adminId;
        io.to(groupId).emit('groupMemberUpdated', {
            groupId: groupId,
            updatedGroup: updatedGroup,
            removedMemberId: memberId,
            isVoluntaryLeave: isVoluntaryLeave
        });

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
        const io = req.app.get('socketio');
        const onlineUsers = req.app.get('onlineUsers');

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
        }

        // Kiểm tra quyền (chỉ admin được đổi tên)
        if (group.admin.toString() !== adminId) {
            return res.status(403).json({ success: false, message: "Chỉ admin mới có thể đổi tên nhóm" });
        }

        const oldName = group.name;
        group.name = newName;
        group.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(newName)}&background=random&color=fff&size=128`;
        await group.save();

        // Tạo system message
        const admin = await User.findById(adminId);
        const systemMessage = await createSystemMessage(
            groupId,
            `${admin.displayName || admin.email.split('@')[0]} đã đổi tên nhóm từ "${oldName}" thành "${newName}"`
        );

        // Emit system message tới tất cả trong group room
        io.to(groupId).emit('getMessage', {
            senderId: null,
            sender: null,
            receiverId: groupId,
            text: systemMessage.text,
            type: 'system',
            createdAt: systemMessage.createdAt,
            isGroup: true
        });

        // Emit event riêng để update group info (tên, avatar)
        io.to(groupId).emit('groupRenamed', {
            groupId: groupId,
            newName: newName,
            newAvatar: group.avatar
        });

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
        const io = req.app.get('socketio');

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
        }

        // Kiểm tra quyền
        if (group.admin.toString() !== currentAdminId) {
            return res.status(403).json({ success: false, message: "Chỉ admin mới có thể chuyển quyền" });
        }

        // Kiểm tra thành viên tồn tại
        if (!group.members.some(m => m.toString() === newAdminId)) {
            return res.status(400).json({ success: false, message: "Người dùng không phải thành viên nhóm" });
        }

        // Cập nhật DB
        group.admin = newAdminId;
        await group.save();

        // Tạo tin nhắn hệ thống
        const [oldAdmin, newAdmin] = await Promise.all([
            User.findById(currentAdminId),
            User.findById(newAdminId)
        ]);

        const oldName = oldAdmin.displayName || oldAdmin.username;
        const newName = newAdmin.displayName || newAdmin.username;

        const systemMessage = await createSystemMessage(
            groupId,
            `${oldName} đã chuyển quyền trưởng nhóm cho ${newName}`
        );

        // Populate dữ liệu nhóm để trả về cho client (nếu cần cập nhật UI ngay)
        const updatedGroup = await Group.findById(groupId).populate('members', '-password');

        // TỐI ƯU SOCKET (DÙNG ROOM)

        // Gửi tin nhắn hệ thống vào phòng
        io.to(groupId).emit('getMessage', {
            senderId: null,
            sender: null,
            receiverId: groupId,
            text: systemMessage.text,
            type: 'system',
            createdAt: systemMessage.createdAt,
            isGroup: true
        });

        // Gửi sự kiện đổi Admin vào phòng
        io.to(groupId).emit('groupAdminChanged', {
            groupId: groupId,
            newAdminId: newAdminId
        });

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
        const io = req.app.get('socketio');

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ success: false, message: "Nhóm không tồn tại" });
        }

        // Kiểm tra quyền (chỉ admin được giải tán nhóm)
        if (group.admin.toString() !== adminId) {
            return res.status(403).json({ success: false, message: "Chỉ admin mới có thể giải tán nhóm" });
        }

        // Tạo system message trước khi xóa
        const admin = await User.findById(adminId);
        const systemMessage = await createSystemMessage(
            groupId,
            `${admin.displayName || admin.email.split('@')[0]} đã giải tán nhóm`
        );

        // Emit system message tới tất cả trong group room
        io.to(groupId).emit('getMessage', {
            senderId: null,
            sender: null,
            receiverId: groupId,
            text: systemMessage.text,
            type: 'system',
            createdAt: systemMessage.createdAt,
            isGroup: true
        });

        // Xóa nhóm
        await Group.findByIdAndDelete(groupId);

        // Xóa tất cả messages của nhóm
        await Message.deleteMany({ conversationId: groupId });

        // Emit event để thông báo nhóm đã bị xóa
        io.to(groupId).emit('groupDeleted', {
            groupId: groupId
        });

        res.json({ success: true, message: "Giải tsan nhóm thành công" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// [GET] /api/groups/:groupId (Lấy thông tin chi tiết nhóm)
const getGroupById = async (req, res) => {
    try {
        const { groupId } = req.params;

        const group = await Group.findById(groupId).populate(
            "members",
            "displayName avatar email username activityStatus"
        );

        if (!group) {
            return res.status(404).json({ success: false, message: "Không tìm thấy group" });
        }

        res.status(200).json(group);
    } catch (err) {
        console.log("Error getGroupById groupController: ", err);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
}

module.exports = { createGroup, getMyGroups, addMember, removeMember, renameGroup, transferAdmin, deleteGroup, getGroupById };
