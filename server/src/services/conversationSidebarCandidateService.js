const DefaultConversationParticipant = require("../models/ConversationParticipant");
const { isSidebarVisible } = require("./conversationVisibilityHelpers");

const toIdString = (value) => value?._id?.toString?.() || value?.toString?.() || String(value);

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getConversation(participant) {
  return participant?.conversationId || {};
}

function buildSidebarCandidate(participant) {
  const conversation = getConversation(participant);
  const state = participant.state || {};
  const legacyConversationId = toIdString(conversation.legacyConversationId || participant.legacyConversationId);
  const unreadCount = state.unreadCount || 0;

  return {
    kind: conversation.kind,
    conversationId: legacyConversationId,
    legacyConversationId,
    lastMessageId: state.lastMessageId ? toIdString(state.lastMessageId) : null,
    lastMessageAt: normalizeDate(state.lastMessageAt),
    unreadCount,
    hasUnread: unreadCount > 0,
    pinnedAt: normalizeDate(state.pinnedAt),
    mutedUntil: normalizeDate(state.mutedUntil),
  };
}

function compareCandidateOrder(left, right) {
  const leftPinned = left.pinnedAt ? new Date(left.pinnedAt).getTime() : 0;
  const rightPinned = right.pinnedAt ? new Date(right.pinnedAt).getTime() : 0;
  if (leftPinned !== rightPinned) return rightPinned - leftPinned;

  const leftLast = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
  const rightLast = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
  if (leftLast !== rightLast) return rightLast - leftLast;

  return left.legacyConversationId.localeCompare(right.legacyConversationId);
}

async function getSidebarCandidatesForUser({ userId, limit = 30, models = {} } = {}) {
  const ConversationParticipant = models.ConversationParticipant || DefaultConversationParticipant;

  const participants = await ConversationParticipant.find({ userId })
    .populate("conversationId")
    .sort({ "state.pinnedAt": -1, "state.lastMessageAt": -1 })
    .limit(limit)
    .lean();

  return (participants || [])
    .filter((participant) => !participant.leftAt)
    .filter((participant) => {
      const deletedAt = participant.state?.deletedAt;
      if (!deletedAt) return true;
      const lastMessageAt = participant.state?.lastMessageAt;
      return lastMessageAt && new Date(lastMessageAt) > new Date(deletedAt);
    })
    .filter(isSidebarVisible)
    .map(buildSidebarCandidate)
    .sort(compareCandidateOrder)
    .slice(0, limit);
}

module.exports = {
  getSidebarCandidatesForUser,
};
