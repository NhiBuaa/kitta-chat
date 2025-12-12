// controllers/userController.js
const User = require('../models/User');

// [GET] /api/users/profile
const getUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select('-password'); // Bỏ password

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Get Profile Error:', error);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
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
                const parsedStatus = typeof activityStatus === 'string'
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
            { new: true }
        ).select('-password');

        res.json({ success: true, message: 'Cập nhật thành công', user: updatedUser });

    } catch (error) {
        // In lỗi ra terminal server để bạn nhìn thấy
        console.error("LỖI UPDATE PROFILE:", error);
        res.status(500).json({ success: false, message: 'Lỗi Server: ' + error.message });
    }
};

// [GET] /api/users
const getAllUsers = async (req, res) => {
    try {
        const currentUserId = req.user.id;

        // Tìm tất cả user có _id KHÁC ($ne) currentUserId
        const users = await User.find({ _id: { $ne: currentUserId } }).select('-password');

        res.json({ success: true, users });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

module.exports = {
    getUserProfile,
    updateUserProfile,
    getAllUsers
};