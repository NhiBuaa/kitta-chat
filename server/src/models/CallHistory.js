const mongoose = require("mongoose");

const callHistorySchema = new mongoose.Schema(
  {
    // Participants
    callerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Conversation context
    // format: [userId1, userId2].sort().join("_") — reuse existing chat context
    conversationId: {
      type: String,
      required: true,
    },

    //  Call metadata 
    type: {
      type: String,
      enum: ["video", "audio"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "missed", "rejected", "unreachable", "busy"],
      default: "pending",
    },

    // Timing 
    startedAt: {
      type: Date,
      default: Date.now,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },

    duration: {
      type: Number,
      default: null,
    },

    // READ STATUS
    // Mảng các ID người dùng đã đọc bản ghi cuộc gọi này.
    // Sử dụng mảng (không phải bản đồ khóa động) để MongoDB có thể lập chỉ mục.
    // Truy vấn: { receiverId, status: { $in: [...] }, readBy: { $ne: currentUser } }
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, collection: "call-histories" }
);

// COMPOUND INDEXES

// Index 1: Lấy lịch sử cuộc gọi của người dùng (cả cuộc gọi đi và đến)
// Được sử dụng bởi GET /api/calls/history
callHistorySchema.index({ callerId: 1, createdAt: -1 });
callHistorySchema.index({ receiverId: 1, createdAt: -1 });

// Index 2: Badge count
// Truy vấn: receiverId = currentUser VÀ status TRONG ["missed","rejected","unreachable","busy"]
// VÀ readBy KHÔNG chứa currentUser
// Chỉ mục phức hợp: { receiverId, status, readBy }
callHistorySchema.index({ receiverId: 1, status: 1, readBy: 1, createdAt: -1 });

// Index 3: Ngữ cảnh cuộc trò chuyện - tải nhật ký cuộc gọi trong luồng trò chuyện
// Được sử dụng khi hiển thị nhật ký cuộc gọi nội tuyến trong ChatWindow
callHistorySchema.index({ conversationId: 1, createdAt: -1 });

// Index 4: Phân trang dựa trên con trỏ
callHistorySchema.index({ callerId: 1, _id: -1 });
callHistorySchema.index({ receiverId: 1, _id: -1 });

const CallHistory = mongoose.model("CallHistory", callHistorySchema);

module.exports = CallHistory;
