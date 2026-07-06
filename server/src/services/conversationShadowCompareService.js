const ConversationParticipant = require("../models/ConversationParticipant");
const buildConversationId = require("../utils/buildConversationId");

const toComparableId = (value) => value?.toString?.() || String(value);

const normalizeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getConversation = (participant) => participant?.conversationId || {};

const getLegacyConversationId = ({ userId, scope, item }) => {
  if (item?.legacyConversationId) return toComparableId(item.legacyConversationId);
  if (item?.conversationId) return toComparableId(item.conversationId);
  if (scope === "group" && item?._id) return toComparableId(item._id);
  if (scope === "direct" && item?._id) return buildConversationId(userId, item._id);
  return null;
};

const getLegacyLastMessageId = (item) => {
  const lastMessage = item?.lastMessage;
  return lastMessage?.messageId
    ? toComparableId(lastMessage.messageId)
    : lastMessage?._id
      ? toComparableId(lastMessage._id)
      : null;
};

const getLegacyLastMessageAt = (item) => normalizeDate(item?.lastMessage?.createdAt);

const isDefaultSidebarCandidate = (participant) => {
  const state = participant?.state || {};
  return !participant?.leftAt && !state.deletedAt && !state.archivedAt && Boolean(state.lastMessageId);
};

const buildReadModelCandidate = (participant) => {
  const conversation = getConversation(participant);
  return {
    legacyConversationId: toComparableId(
      conversation.legacyConversationId || participant.legacyConversationId,
    ),
    kind: conversation.kind,
    lastMessageId: participant.state?.lastMessageId
      ? toComparableId(participant.state.lastMessageId)
      : null,
    lastMessageAt: normalizeDate(participant.state?.lastMessageAt),
    unreadCount: participant.state?.unreadCount || 0,
  };
};

const buildLegacyCandidate = ({ userId, scope, item }) => ({
  legacyConversationId: getLegacyConversationId({ userId, scope, item }),
  lastMessageId: getLegacyLastMessageId(item),
  lastMessageAt: getLegacyLastMessageAt(item),
  unreadCount: item?.unreadCount || 0,
});

const compareField = ({ mismatches, legacy, readModel, field }) => {
  if (legacy[field] === readModel[field]) return;
  mismatches.push({
    type: "field_mismatch",
    legacyConversationId: legacy.legacyConversationId,
    field,
    legacyValue: legacy[field],
    readModelValue: readModel[field],
  });
};

const compareSidebarForUser = async ({ userId, legacyItems = [], scope = "direct" }) => {
  const participants = await ConversationParticipant.find({ userId })
    .populate("conversationId")
    .lean();

  const readModelCandidates = participants
    .filter((participant) => getConversation(participant).kind === scope)
    .filter(isDefaultSidebarCandidate)
    .map(buildReadModelCandidate);

  const readModelByLegacyId = new Map(
    readModelCandidates.map((candidate) => [candidate.legacyConversationId, candidate]),
  );
  const mismatches = [];

  const seenLegacyIds = new Set();

  for (const item of legacyItems) {
    const legacy = buildLegacyCandidate({ userId, scope, item });
    if (!legacy.legacyConversationId || !legacy.lastMessageId) continue;
    seenLegacyIds.add(legacy.legacyConversationId);

    const readModel = readModelByLegacyId.get(legacy.legacyConversationId);
    if (!readModel) {
      mismatches.push({
        type: "missing_read_model_candidate",
        legacyConversationId: legacy.legacyConversationId,
      });
      continue;
    }

    compareField({ mismatches, legacy, readModel, field: "lastMessageId" });
    compareField({ mismatches, legacy, readModel, field: "lastMessageAt" });
    compareField({ mismatches, legacy, readModel, field: "unreadCount" });
  }

  for (const readModel of readModelCandidates) {
    if (!seenLegacyIds.has(readModel.legacyConversationId)) {
      mismatches.push({
        type: "extra_read_model_candidate",
        legacyConversationId: readModel.legacyConversationId,
      });
    }
  }

  return {
    scope,
    userId: toComparableId(userId),
    legacyCount: legacyItems.length,
    readModelCount: readModelCandidates.length,
    readModelCandidates,
    mismatches,
  };
};

module.exports = {
  compareSidebarForUser,
};