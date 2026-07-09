function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function getState(participant) {
  return participant?.state || {};
}

function isParticipantReadable(participant, options = {}) {
  if (!participant) return false;

  const kind = options.kind || participant.kind || participant.conversationKind;
  if (kind !== "group") return true;

  const leftAt = toDate(participant.leftAt);
  if (!leftAt) return true;

  const messageCreatedAt = toDate(options.messageCreatedAt);
  if (!messageCreatedAt) return true;

  return messageCreatedAt <= leftAt;
}

function buildMessageVisibilityFilter(participant) {
  const createdAt = {};
  const state = getState(participant);
  const deletedAt = toDate(state.deletedAt);
  const leftAt = toDate(participant?.leftAt);

  if (deletedAt) createdAt.$gt = deletedAt;
  if (leftAt) createdAt.$lte = leftAt;

  return Object.keys(createdAt).length > 0 ? { createdAt } : {};
}

function hasLastMessage(participant) {
  return Boolean(getState(participant).lastMessageAt);
}

function isSidebarVisible(participant) {
  const state = getState(participant);
  return !state.archivedAt && hasLastMessage(participant);
}

function isArchivedVisible(participant) {
  const state = getState(participant);
  return Boolean(state.archivedAt && hasLastMessage(participant));
}

function applySoftDeleteState(participant, deletedAt) {
  return {
    $set: {
      "state.deletedAt": toDate(deletedAt),
      "state.lastMessageId": null,
      "state.lastMessageAt": null,
      "state.unreadCount": 0,
    },
  };
}

function canIncrementUnreadForParticipant(participant, messageCreatedAt) {
  if (!participant) return false;

  const createdAt = toDate(messageCreatedAt);
  if (!createdAt) return false;

  const state = getState(participant);
  const deletedAt = toDate(state.deletedAt);
  if (deletedAt && createdAt <= deletedAt) return false;

  const leftAt = toDate(participant.leftAt);
  if (leftAt && createdAt > leftAt) return false;

  return true;
}

function getNotificationSuppressionState(participant, now = new Date()) {
  const state = getState(participant);
  const mutedUntil = toDate(state.mutedUntil);
  const currentTime = toDate(now) || new Date();

  if (mutedUntil && mutedUntil > currentTime) {
    return { suppressed: true, reason: "mutedUntil" };
  }

  if (participant?.settings?.notifications === "muted") {
    return { suppressed: true, reason: "settings" };
  }

  return { suppressed: false, reason: null };
}

module.exports = {
  applySoftDeleteState,
  buildMessageVisibilityFilter,
  canIncrementUnreadForParticipant,
  getNotificationSuppressionState,
  isArchivedVisible,
  isParticipantReadable,
  isSidebarVisible,
};
