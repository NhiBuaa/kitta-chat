const mongoose = require("mongoose");

const conversationParticipantSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    legacyConversationId: { type: String, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["member", "admin", "owner", null],
      default: null,
    },
    joinedAt: { type: Date, default: null },
    leftAt: { type: Date, default: null },
    state: {
      pinnedAt: { type: Date, default: null },
      archivedAt: { type: Date, default: null },
      mutedUntil: { type: Date, default: null },
      deletedAt: { type: Date, default: null },
      lastReadMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        default: null,
      },
      lastReadAt: { type: Date, default: null },
      unreadCount: { type: Number, default: 0 },
      lastMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
        default: null,
      },
      lastMessageAt: { type: Date, default: null },
    },
    settings: {
      notifications: {
        type: String,
        enum: ["default", "muted"],
        default: "default",
      },
      customTitle: { type: String, default: null },
    },
  },
  { timestamps: true },
);

conversationParticipantSchema.index(
  { conversationId: 1, userId: 1 },
  { unique: true },
);
conversationParticipantSchema.index({
  userId: 1,
  leftAt: 1,
  "state.deletedAt": 1,
  "state.pinnedAt": -1,
  "state.lastMessageAt": -1,
});
conversationParticipantSchema.index({
  userId: 1,
  "state.archivedAt": 1,
  "state.pinnedAt": -1,
  "state.lastMessageAt": -1,
});
conversationParticipantSchema.index({ userId: 1, "state.unreadCount": -1 });
conversationParticipantSchema.index({ legacyConversationId: 1, userId: 1 });
conversationParticipantSchema.index({ conversationId: 1, leftAt: 1 });

module.exports = mongoose.models.ConversationParticipant || mongoose.model(
  "ConversationParticipant",
  conversationParticipantSchema,
);
