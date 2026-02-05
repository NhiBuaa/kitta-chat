const User = require('../models/User');
const Message = require('../models/Message');

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
        const users = await User.find({ _id: { $ne: currentUserId } }).select('-password').lean();

        const usersWithUnreadInfo = await Promise.all(users.map(async (user) => {
            const unreadExist = await Message.exists({
                sender: user._id,
                receiver: currentUserId,
                isRead: false
            });

            return {
                ...user,
                hasUnread: !!unreadExist
            };
        }));

        res.json({ success: true, users: usersWithUnreadInfo });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// Tìm kiếm người dùng
const searchUsers = async (req, res) => {
    try {
        const { keyword } = req.query;
        const currentUserId = req.user.id;

        const users = await User.find({
            $or: [
                { displayName: { $regex: keyword, $options: 'i' } },
                { email: { $regex: keyword, $options: 'i' } }
            ],
            _id: { $ne: currentUserId }
        }).select('displayName email avatar');

        res.json({ success: true, users });

    } catch (error) {
        console.error("Lỗi tìm kiếm người dùng:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
}

// Lấy danh sách bạn bè
const getFriends = async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id).populate('friends', 'displayName email avatar status activityStatus');
        res.json({ success: true, friends: currentUser.friends });
    } catch (error) {
        console.error("Lỗi lấy danh sách bạn bè:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
}

// Lấy danh sách lời mời kết bạn đang chờ
const getFriendRequests = async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id)
            .populate('friendRequests', 'displayName avatar email');

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

        const receiver = await User.findById(receiverId);

        // Kiểm tra có lời mời này hay không
        if (!receiver.friendRequests.includes(senderId)) {
            return res.status(400).json({ success: false, message: "Không có lời mời kết bạn này" });
        }

        // Thêm vào danh sách bạn bè và xoá khỏi lời mời
        await User.findByIdAndUpdate(receiverId, {
            $push: { friends: senderId },
            $pull: { friendRequests: senderId }
        })

        await User.findByIdAndUpdate(senderId, {
            $push: { friends: receiverId }
        })

        res.json({ success: true, message: "Đã chấp nhận lời mời kết bạn." });

    } catch (error) {
        console.error("Lỗi chấp nhận lời mời kết bạn:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
}

const getSidebarUsers = async (req, res) => {
    try {
        const currentUserId = req.user.id;

        // Lấy danh sách bạn bè hiện tại
        const currentUser = await User.findById(currentUserId);
        const friendsIds = currentUser.friends.map(f => f._id.toString());

        // Lấy danh sách các người lạ từng nhắn tin không phải bạn bè
        const messages = await Message.find({
            $or: [
                { sender: currentUserId },
                { receiver: currentUserId }
            ]
        }).select('sender receiver').lean();

        const chattedUserIds = new Set();
        messages.forEach(msg => {
            if (msg.senderId.toString() !== currentUserId) chattedUserIds.add(msg.senderId.toString());
            if (msg.receiverId.toString() !== currentUserId) chattedUserIds.add(msg.receiverId.toString());
        })

        // Gộp 2 danh sách lại với nhau
        const allUserIdsToShow = Array.from(new Set([...friendsIds, ...chattedUserIds]));

        // Truy cập lại vào DB để lấy những thông tin cần thiết
        const users = await User.find({ _id: { $in: allUserIdsToShow } }).select('displayName avatar status activityStatus');
        res.json({ success: true, users });

    } catch (error) {
        console.error("Get Sidebar Users Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
}

module.exports = {
    getUserProfile,
    updateUserProfile,
    getAllUsers,
    searchUsers,
    getFriends,
    getFriendRequests,
    accceptFriendRequest,
    getSidebarUsers
};