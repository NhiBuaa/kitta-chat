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
                const memberSocketId = onlineUsers?.get(memberId.toString());
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

        // Tạo system message
        const admin = await User.findById(adminId);
        const newMember = await User.findById(memberId);
        const systemMessage = await createSystemMessage(
            groupId,
            `${admin.displayName || admin.email.split('@')[0]} đã thêm ${newMember.displayName || newMember.email.split('@')[0]} vào nhóm`
        );

        // Emit system message tới tất cả members online
        group.members.forEach(mid => {
            const memberSocketId = onlineUsers?.get(mid.toString());
            if (memberSocketId) {
                io.to(memberSocketId).emit('getMessage', {
                    senderId: null,
                    sender: null,
                    receiverId: groupId,
                    text: systemMessage.text,
                    type: 'system',
                    createdAt: systemMessage.createdAt,
                    isGroup: true
                });
            }
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

        // Xóa thành viên
        group.members = group.members.filter(id => id.toString() !== memberId);
        await group.save();

        // Tạo system message
        const removedMember = await User.findById(memberId);
        const actionType = memberId === adminId ? "rời" : "bị xóa khỏi";
        const systemMessage = await createSystemMessage(
            groupId,
            `${removedMember.displayName || removedMember.email.split('@')[0]} đã ${actionType} nhóm`
        );

        // Emit event tới tất cả members online
        group.members.forEach(mid => {
            const memberSocketId = onlineUsers?.get(mid.toString());
            if (memberSocketId) {
                io.to(memberSocketId).emit('getMessage', {
                    senderId: null,
                    sender: null,
                    receiverId: groupId,
                    text: systemMessage.text,
                    type: 'system',
                    createdAt: systemMessage.createdAt,
                    isGroup: true
                });
            }
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

        // Emit event tới tất cả members online
        group.members.forEach(mid => {
            const memberSocketId = onlineUsers?.get(mid.toString());
            if (memberSocketId) {
                io.to(memberSocketId).emit('getMessage', {
                    senderId: null,
                    sender: null,
                    receiverId: groupId,
                    text: systemMessage.text,
                    type: 'system',
                    createdAt: systemMessage.createdAt,
                    isGroup: true
                });
                
                // Emit event riêng để update group info (tên, avatar)
                io.to(memberSocketId).emit('groupRenamed', {
                    groupId: groupId,
                    newName: newName,
                    newAvatar: group.avatar
                });
            }
        });

        res.json({ success: true, message: "Đổi tên nhóm thành công", group });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

module.exports = { createGroup, getMyGroups, addMember, removeMember, renameGroup };