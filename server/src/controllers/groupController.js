const Group = require('../models/Group');

// [POST] /api/groups (Tạo nhóm mới)
const createGroup = async (req, res) => {
    try {
        const { name, members } = req.body;
        const adminId = req.user.id;

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

module.exports = { createGroup, getMyGroups };