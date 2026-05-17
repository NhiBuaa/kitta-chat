const AUDIT_EVENTS_QUEUE = "audit.events";

const toId = (value) => value?._id?.toString?.() || value?.toString?.() || null;

const toIso = (value) => {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  return new Date(value).toISOString();
};

const buildMessageCreatedJob = ({
  message,
  isGroup = false,
  isDuplicate = false,
}) => {
  const messageObject =
    typeof message?.toObject === "function" ? message.toObject() : message;

  if (!messageObject?._id) {
    throw new Error("message.created job requires message._id");
  }

  return {
    type: "message.created",
    messageId: toId(messageObject._id),
    conversationId: messageObject.conversationId,
    senderId: toId(messageObject.sender),
    receiverId: toId(messageObject.receiver),
    messageType: messageObject.type || "text",
    isGroup: Boolean(isGroup),
    isDuplicate: Boolean(isDuplicate),
    attachmentCount: Array.isArray(messageObject.attachments)
      ? messageObject.attachments.length
      : 0,
    createdAt: toIso(messageObject.createdAt),
    emittedAt: new Date().toISOString(),
  };
};

module.exports = {
  AUDIT_EVENTS_QUEUE,
  buildMessageCreatedJob,
};
