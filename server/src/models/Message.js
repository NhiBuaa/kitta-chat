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

    hasLink: { type: Boolean, default: false },
    links: [
      {
        url: { type: String },
        hostname: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// Index cho phân trang tin nhắn
messageSchema.index({ conversationId: 1, _id: -1 });

// Index tối ưu cho Shared Links query
messageSchema.index({ conversationId: 1, hasLink: 1, _id: -1 });

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

function extractAndNormalizeLinks(text) {
  if (!text) return { hasLink: false, links: [] };
  try {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const matches = text.match(urlRegex);
    if (matches && matches.length > 0) {
      const foundLinks = [];
      for (const match of matches) {
        try {
          // Loại bỏ các dấu câu ở cuối URL thường gặp trong chat
          const cleanUrl = match.replace(/[.,;:!?)]+$/, "");
          const parsed = new URL(cleanUrl);
          let hostname = parsed.hostname.toLowerCase();
          if (hostname.startsWith("www.")) {
            hostname = hostname.slice(4);
          }
          if (!foundLinks.some(l => l.url === cleanUrl)) {
            foundLinks.push({
              url: cleanUrl,
              hostname: hostname
            });
          }
        } catch (e) {
          // Bỏ qua URL không hợp lệ
        }
      }
      if (foundLinks.length > 0) {
        return { hasLink: true, links: foundLinks };
      }
    }
  } catch (err) {
    // Bỏ qua lỗi
  }
  return { hasLink: false, links: [] };
}

messageSchema.pre("save", function () {
  if (this.text) {
    const { hasLink, links } = extractAndNormalizeLinks(this.text);
    if (hasLink) {
      this.hasLink = hasLink;
      this.links = links;
    }
  }
});

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

Message.extractAndNormalizeLinks = extractAndNormalizeLinks;

module.exports = Message;