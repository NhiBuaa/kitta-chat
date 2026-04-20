const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "file", "system", "call_log"],
      default: "text",
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    text: { type: String, default: "" },

    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "File",
      },
    ],

    // Call Log Payload
    // Chỉ present khi type === "call_log".
    // Server tạo 1 message này khi call kết thúc -> Frontend hiển thị inline
    // trong ChatWindow mà KHÔNG cần fetch riêng CallHistory.
    callData: {
      callHistoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CallHistory",
        default: null,
      },
      type: {
        type: String,
        enum: ["video", "audio"],
        default: "video",
      },
      status: {
        type: String,
        enum: ["completed", "missed", "rejected", "unreachable", "busy"],
        default: "completed",
      },
      startedAt: { type: Date, default: null },
      duration: { type: Number, default: null }, // giây talk time
      // direction: "outgoing" | "incoming" — do Frontend tự tính từ message.sender
      // Direction được xác định bằng cách so sánh message.sender với currentUserId
    },

    isRead: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    idempotencyKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Index cho phân trang tin nhắn
messageSchema.index({ conversationId: 1, _id: -1 });

// Index cho sync: sort theo _id (tương đương createdAt nhưng dùng sẵn index)
// Kết hợp với $in trên conversationId
messageSchema.index({ conversationId: 1 });

// Index cho truy vấn theo người gửi
messageSchema.index({ sender: 1, createdAt: -1 });

messageSchema.index(
  { sender: 1, idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { idempotencyKey: { $exists: true, $ne: null } },
  }
);

messageSchema.index(
  { "callData.callHistoryId": 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      type: "call_log",
      "callData.callHistoryId": { $exists: true, $ne: null },
    },
  }
);

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;