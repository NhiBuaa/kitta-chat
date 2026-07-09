const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    legacyConversationId: { type: String, required: true },
    directKey: { type: String, default: undefined },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: undefined,
    },
    participantUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: undefined,
    },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ legacyConversationId: 1 }, { unique: true });
conversationSchema.index(
  { kind: 1, directKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: "direct",
      directKey: { $type: "string" },
    },
  },
);
conversationSchema.index(
  { groupId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: "group",
      groupId: { $type: "objectId" },
    },
  },
);
conversationSchema.index({ participantUserIds: 1, lastMessageAt: -1 });
conversationSchema.index({ kind: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);

