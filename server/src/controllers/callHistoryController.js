const mongoose = require("mongoose");
const CallHistory = require("../models/CallHistory");

// ─────────────────────────────────────────────────────────────────────────────
// [GET] /api/calls/history
// Mục đích: Lấy lịch sử cuộc gọi của người dùng hiện tại (cả cuộc gọi đi và đến)
// Tham số truy vấn: ?cursor=<id>&limit=20
// ─────────────────────────────────────────────────────────────────────────────
exports.getCallHistory = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { cursor, limit = 20 } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);

    // Match: người dùng là caller hoặc receiver
    const matchStage = {
      $or: [
        { callerId: new mongoose.Types.ObjectId(currentUserId) },
        { receiverId: new mongoose.Types.ObjectId(currentUserId) },
      ],
    };

    // Phân trang dựa trên con trỏ: lấy các bản ghi cũ hơn con trỏ (dựa trên _id)
    if (cursor) {
      matchStage._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    // LƯU Ý: Sử dụng `$sort` để sắp xếp theo `_id` (không phải `createdAt`) nhằm nhất quán với phân trang con trỏ.
    // `ObjectId` của MongoDB nhúng dấu thời gian, vì vậy việc sắp xếp theo `_id` tương đương với
    // sắp xếp theo `createdAt` trong khi sử dụng chỉ mục con trỏ chuyên dụng.
    const calls = await CallHistory.aggregate([
      { $match: matchStage },

      // Điền thông tin chi tiết callerId
      {
        $lookup: {
          from: "users",
          localField: "callerId",
          foreignField: "_id",
          as: "callerId",
          pipeline: [
            { $project: { _id: 1, displayName: 1, avatar: 1, username: 1 } },
          ],
        },
      },

      // Điền thông tin chi tiết receiverId
      {
        $lookup: {
          from: "users",
          localField: "receiverId",
          foreignField: "_id",
          as: "receiverId",
          pipeline: [
            { $project: { _id: 1, displayName: 1, avatar: 1, username: 1 } },
          ],
        },
      },

      // Giải nén mảng (pipeline $lookup luôn trả về mảng).
      // preserveNullAndEmptyArrays: true — nếu Người dùng đã bị xóa, bản ghi cuộc gọi
      // vẫn hiển thị; Giao diện người dùng hiển thị "Người dùng đã bị xóa" thay vì ẩn bản ghi.
      { $unwind: { path: "$callerId", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$receiverId", preserveNullAndEmptyArrays: true } },

      // Sắp xếp theo _id giảm dần
      { $sort: { _id: -1 } },

      // Lấy giới hạn + 1 để xác định hasMore
      { $limit: parsedLimit + 1 },

      // Chỉ hiển thị thông tin người dùng hiện tại đã đọc bản ghi này hay chưa — KHÔNG hiển thị toàn bộ mảng readBy
      {
        $addFields: {
          isReadByCurrentUser: {
            $in: [
              new mongoose.Types.ObjectId(currentUserId),
              { $ifNull: ["$readBy", []] },
            ],
          },
        },
      },

      // Xóa mảng `readBy` khỏi phản hồi (vì lý do bảo mật)
      { $project: { readBy: 0 } },
    ]);

    // Xác định hasMore và nextCursor
    const hasMore = calls.length > parsedLimit;
    if (hasMore) calls.pop();

    const lastCall = calls[calls.length - 1];
    const nextCursor = hasMore && lastCall ? lastCall._id.toString() : null;

    res.status(200).json({
      success: true,
      data: {
        calls,
        pagination: {
          nextCursor,
          hasMore,
        },
      },
    });
  } catch (err) {
    console.error("[CallHistory] getCallHistory error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// [GET] /api/calls/missed
// Mục đích: Lấy số lượng và xem trước các cuộc gọi nhỡ/không liên lạc được/bị từ chối/bận
// Được sử dụng bởi: CallHistoryBadge, CallHistoryContext khi được gắn kết
// ─────────────────────────────────────────────────────────────────────────────
exports.getMissedCalls = async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;

    // Đếm: người dùng là người nhận, trạng thái là các loại bị bỏ lỡ và CHƯA đọc nó
    const count = await CallHistory.countDocuments({
      receiverId: new mongoose.Types.ObjectId(currentUserId),
      status: { $in: ["missed", "rejected", "unreachable", "busy"] },
      readBy: { $ne: new mongoose.Types.ObjectId(currentUserId) },
    });

    // Preview: latest 5 missed calls for toast preview
    const previewCalls = await CallHistory.find({
      receiverId: new mongoose.Types.ObjectId(currentUserId),
      status: { $in: ["missed", "rejected", "unreachable", "busy"] },
      readBy: { $ne: new mongoose.Types.ObjectId(currentUserId) },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("callerId", "_id displayName avatar username")
      .lean();

    res.status(200).json({
      success: true,
      data: {
        count,
        calls: previewCalls,
      },
    });
  } catch (err) {
    console.error("[CallHistory] getMissedCalls error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// [POST] /api/calls/:id/read
// Mục đích: Đánh dấu một bản ghi cuộc gọi là đã được người dùng hiện tại đọc
// ─────────────────────────────────────────────────────────────────────────────
exports.markCallRead = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { id } = req.params;

    // Kết hợp kiểm tra xác thực + cập nhật trong cơ sở dữ liệu (tối ưu hóa hiệu suất)
    // findOneAndUpdate trả về tài liệu TRƯỚC khi cập nhật; null có nghĩa là không khớp -> 404
    const updated = await CallHistory.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        $or: [
          { callerId: new mongoose.Types.ObjectId(currentUserId) },
          { receiverId: new mongoose.Types.ObjectId(currentUserId) },
        ],
      },
      {
        $addToSet: { readBy: new mongoose.Types.ObjectId(currentUserId) },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: "Call record not found or access denied" });
    }

    res.status(200).json({ success: true, message: "Call marked as read" });
  } catch (err) {
    console.error("[CallHistory] markCallRead error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// [POST] /api/calls/read-all
// Mục đích: Đánh dấu TẤT CẢ các cuộc gọi nhỡ là đã đọc (khi người dùng chạm vào biểu tượng thông báo)
// ─────────────────────────────────────────────────────────────────────────────
exports.markAllCallsRead = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const result = await CallHistory.updateMany(
      {
        receiverId: new mongoose.Types.ObjectId(currentUserId),
        status: { $in: ["missed", "rejected", "unreachable", "busy"] },
        readBy: { $ne: new mongoose.Types.ObjectId(currentUserId) },
      },
      {
        $addToSet: { readBy: new mongoose.Types.ObjectId(currentUserId) },
      }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} calls marked as read`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error("[CallHistory] markAllCallsRead error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
