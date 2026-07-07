const mongoose = require("mongoose");

const DefaultMessage = require("../models/Message");
const DefaultGroup = require("../models/Group");
const DefaultConversation = require("../models/Conversation");
const DefaultConversationParticipant = require("../models/ConversationParticipant");

const toIdString = (value) => value?._id?.toString?.() || value?.toString?.() || String(value);

function isStrictObjectId(value) {
  if (!value) return false;
  const stringValue = toIdString(value);
  return mongoose.Types.ObjectId.isValid(stringValue) && new mongoose.Types.ObjectId(stringValue).toString() === stringValue;
}

function normalizeDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function sameDate(left, right) {
  const leftDate = normalizeDate(left);
  const rightDate = normalizeDate(right);
  if (!leftDate && !rightDate) return true;
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() === rightDate.getTime();
}

function sortedUniqueIds(values = []) {
  return [...new Set(values.filter(Boolean).map(toIdString))].sort();
}

function sameId(left, right) {
  return toIdString(left || "") === toIdString(right || "");
}

function sameIdSet(left = [], right = []) {
  return JSON.stringify(sortedUniqueIds(left)) === JSON.stringify(sortedUniqueIds(right));
}

async function readAll(model) {
  const query = model.find({});
  if (query && typeof query.lean === "function") {
    return query.lean();
  }
  return query;
}

function groupMessagesByConversationId(messages) {
  const grouped = new Map();
  for (const message of messages || []) {
    if (!message?.conversationId) continue;
    const legacyConversationId = String(message.conversationId);
    const existing = grouped.get(legacyConversationId) || [];
    existing.push(message);
    grouped.set(legacyConversationId, existing);
  }
  return grouped;
}

function pickLatestMessage(messages) {
  return [...messages].sort((left, right) => {
    const leftTime = normalizeDate(left.createdAt)?.getTime() || 0;
    const rightTime = normalizeDate(right.createdAt)?.getTime() || 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return toIdString(right._id).localeCompare(toIdString(left._id));
  })[0];
}

function deriveDirectParticipantIds(legacyConversationId) {
  const parts = String(legacyConversationId || "").split("_");
  if (parts.length !== 2 || !parts.every(isStrictObjectId)) return null;
  return sortedUniqueIds(parts);
}

function countUnreadForUser({ messages, userId, kind }) {
  const userIdString = toIdString(userId);
  if (kind === "direct") {
    return messages.filter(
      (message) => toIdString(message.receiver || "") === userIdString && message.isRead === false,
    ).length;
  }

  return messages.filter((message) => {
    if (toIdString(message.sender || "") === userIdString) return false;
    return !sortedUniqueIds(message.readBy || []).includes(userIdString);
  }).length;
}

function expectedCandidate({ legacyConversationId, messages, groupById }) {
  const latestMessage = pickLatestMessage(messages);
  if (legacyConversationId.includes("_")) {
    const participantUserIds = deriveDirectParticipantIds(legacyConversationId);
    if (!participantUserIds) {
      return { warning: { type: "malformed_direct_legacy_conversation_id", legacyConversationId } };
    }
    return {
      kind: "direct",
      legacyConversationId,
      directKey: participantUserIds.join("_"),
      participantUserIds,
      lastMessageId: latestMessage?._id || null,
      lastMessageAt: latestMessage ? normalizeDate(latestMessage.createdAt) : null,
    };
  }

  if (!isStrictObjectId(legacyConversationId)) {
    return { warning: { type: "malformed_legacy_conversation_id", legacyConversationId } };
  }

  const group = groupById.get(legacyConversationId);
  if (!group) {
    return { warning: { type: "missing_group", legacyConversationId } };
  }

  return {
    kind: "group",
    legacyConversationId,
    groupId: group._id,
    participantUserIds: sortedUniqueIds(group.members || []),
    lastMessageId: latestMessage?._id || null,
    lastMessageAt: latestMessage ? normalizeDate(latestMessage.createdAt) : null,
  };
}

function createReport() {
  return {
    mode: "report-only",
    drift: [],
    warnings: [],
    summary: {
      messagesScanned: 0,
      legacyConversationsScanned: 0,
      totalDrift: 0,
      warnings: 0,
      missingConversations: 0,
      missingParticipants: 0,
      lastMessageMismatches: 0,
      participantMismatches: 0,
      unreadMismatches: 0,
      groupParticipantMismatches: 0,
    },
  };
}

function addDrift(report, item) {
  report.drift.push(item);
}

function compareConversation({ report, candidate, conversation }) {
  if (!conversation) {
    addDrift(report, {
      type: "missing_conversation",
      legacyConversationId: candidate.legacyConversationId,
      kind: candidate.kind,
    });
    return;
  }

  if (!sameIdSet(conversation.participantUserIds || [], candidate.participantUserIds)) {
    addDrift(report, {
      type: candidate.kind === "group" ? "group_participant_mismatch" : "participant_mismatch",
      legacyConversationId: candidate.legacyConversationId,
      expectedUserIds: candidate.participantUserIds,
      actualUserIds: sortedUniqueIds(conversation.participantUserIds || []),
    });
  }

  const fields = [];
  if (!sameId(conversation.lastMessageId, candidate.lastMessageId)) fields.push("lastMessageId");
  if (!sameDate(conversation.lastMessageAt, candidate.lastMessageAt)) fields.push("lastMessageAt");
  if (fields.length > 0) {
    addDrift(report, {
      type: "last_message_mismatch",
      legacyConversationId: candidate.legacyConversationId,
      fields,
      expected: {
        lastMessageId: candidate.lastMessageId ? toIdString(candidate.lastMessageId) : null,
        lastMessageAt: candidate.lastMessageAt,
      },
      actual: {
        lastMessageId: conversation.lastMessageId ? toIdString(conversation.lastMessageId) : null,
        lastMessageAt: normalizeDate(conversation.lastMessageAt),
      },
    });
  }
}

function compareParticipants({ report, candidate, messages, participantByLegacyUser }) {
  for (const userId of candidate.participantUserIds) {
    const participant = participantByLegacyUser.get(`${candidate.legacyConversationId}:${userId}`);
    if (!participant) {
      addDrift(report, {
        type: "missing_participant",
        legacyConversationId: candidate.legacyConversationId,
        userId,
      });
      continue;
    }

    const expectedUnreadCount = countUnreadForUser({ messages, userId, kind: candidate.kind });
    if ((participant.state?.unreadCount || 0) !== expectedUnreadCount) {
      addDrift(report, {
        type: "unread_count_mismatch",
        legacyConversationId: candidate.legacyConversationId,
        userId,
        expectedUnreadCount,
        actualUnreadCount: participant.state?.unreadCount || 0,
      });
    }

    const fields = [];
    if (!sameId(participant.state?.lastMessageId, candidate.lastMessageId)) fields.push("lastMessageId");
    if (!sameDate(participant.state?.lastMessageAt, candidate.lastMessageAt)) fields.push("lastMessageAt");
    if (fields.length > 0) {
      addDrift(report, {
        type: "participant_last_message_mismatch",
        legacyConversationId: candidate.legacyConversationId,
        userId,
        fields,
      });
    }
  }
}

function updateSummary(report) {
  const counts = {
    missingConversations: "missing_conversation",
    missingParticipants: "missing_participant",
    lastMessageMismatches: "last_message_mismatch",
    participantMismatches: "participant_mismatch",
    unreadMismatches: "unread_count_mismatch",
    groupParticipantMismatches: "group_participant_mismatch",
  };

  report.summary.totalDrift = report.drift.length;
  report.summary.warnings = report.warnings.length;
  for (const [summaryKey, driftType] of Object.entries(counts)) {
    report.summary[summaryKey] = report.drift.filter((item) => item.type === driftType).length;
  }
}

async function runConversationReconciliationReport({ models = {} } = {}) {
  const Message = models.Message || DefaultMessage;
  const Group = models.Group || DefaultGroup;
  const Conversation = models.Conversation || DefaultConversation;
  const ConversationParticipant = models.ConversationParticipant || DefaultConversationParticipant;

  const report = createReport();
  const [messages, groups, conversations, participants] = await Promise.all([
    readAll(Message),
    readAll(Group),
    readAll(Conversation),
    readAll(ConversationParticipant),
  ]);

  const messagesByConversationId = groupMessagesByConversationId(messages);
  const groupById = new Map((groups || []).map((group) => [toIdString(group._id), group]));
  const conversationByLegacyId = new Map((conversations || []).map((conversation) => [conversation.legacyConversationId, conversation]));
  const participantByLegacyUser = new Map(
    (participants || []).map((participant) => [
      `${participant.legacyConversationId}:${toIdString(participant.userId)}`,
      participant,
    ]),
  );

  report.summary.messagesScanned = (messages || []).length;
  report.summary.legacyConversationsScanned = messagesByConversationId.size;

  for (const [legacyConversationId, groupedMessages] of [...messagesByConversationId.entries()].sort()) {
    const candidate = expectedCandidate({ legacyConversationId, messages: groupedMessages, groupById });
    if (candidate.warning) {
      report.warnings.push(candidate.warning);
      continue;
    }

    compareConversation({ report, candidate, conversation: conversationByLegacyId.get(legacyConversationId) });
    compareParticipants({ report, candidate, messages: groupedMessages, participantByLegacyUser });
  }

  report.drift.sort((left, right) => `${left.legacyConversationId}:${left.type}`.localeCompare(`${right.legacyConversationId}:${right.type}`));
  report.warnings.sort((left, right) => `${left.legacyConversationId}:${left.type}`.localeCompare(`${right.legacyConversationId}:${right.type}`));
  updateSummary(report);
  return report;
}

module.exports = {
  runConversationReconciliationReport,
};
