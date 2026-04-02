const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "file", "system"],
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

    isRead: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    idempotencyKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

messageSchema.index(
  { sender: 1, idempotencyKey: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { idempotencyKey: { $exists: true, $ne: null } },
  }
);

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;