const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "image", "system"],
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

    image: { type: String, default: "" },
    files: [
      {
        type: String,
      },
    ],
    isRead: { type: Boolean, default: false },
    // Array of userIds who have read this message (for group read-receipts)
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Message", messageSchema);
