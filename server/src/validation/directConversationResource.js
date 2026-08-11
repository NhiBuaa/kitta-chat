const mongoose = require("mongoose");
const buildConversationId = require("../utils/buildConversationId");
const { isValidExternalObjectId } = require("./externalObjectId");

const toCanonicalObjectId = (value) => {
  const stringValue = value?.toString?.();
  if (!isValidExternalObjectId(stringValue)) return null;
  return new mongoose.Types.ObjectId(stringValue).toString();
};

function resolveCanonicalDirectConversationResource(conversationId, requesterId) {
  if (typeof conversationId !== "string") return null;

  const participantValues = conversationId.split("_");
  if (participantValues.length !== 2) return null;

  const participantIds = participantValues.map(toCanonicalObjectId);
  if (participantIds.some((participantId) => !participantId)) return null;

  const [leftParticipantId, rightParticipantId] = participantIds;
  if (leftParticipantId === rightParticipantId) return null;

  const canonicalConversationId = buildConversationId(leftParticipantId, rightParticipantId);
  if (conversationId !== canonicalConversationId) return null;

  const canonicalRequesterId = toCanonicalObjectId(requesterId);
  if (!canonicalRequesterId || !participantIds.includes(canonicalRequesterId)) return null;

  return {
    conversationId: canonicalConversationId,
    participantIds,
    otherUserId: participantIds.find((participantId) => participantId !== canonicalRequesterId),
  };
}

module.exports = {
  resolveCanonicalDirectConversationResource,
};
