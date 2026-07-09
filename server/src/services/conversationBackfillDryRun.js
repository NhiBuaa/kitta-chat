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

function sameId(left, right) {
  return toIdString(left) === toIdString(right);
}

function sameDate(left, right) {
  const leftDate = normalizeDate(left);
  const rightDate = normalizeDate(right);
  if (!leftDate && !rightDate) return true;
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() === rightDate.getTime();
}

function sortedUniqueIds(values) {
  return [...new Set(values.filter(Boolean).map(toIdString))].sort();
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

function createEmptyReport() {
  return {
    conversationsToCreate: [],
    conversationsToUpdate: [],
    conversationsToSkip: [],
    participantsToCreate: [],
    participantsToUpdate: [],
    participantsToSkip: [],
    malformedDirectConversationIds: [],
    missingGroups: [],
    groupMemberMismatches: [],
    duplicateOrAmbiguousLegacyIds: [],
    lastMessageCandidates: [],
    summary: {
      messagesScanned: 0,
      legacyConversationsScanned: 0,
      conversationsToCreate: 0,
      conversationsToUpdate: 0,
      conversationsToSkip: 0,
      participantsToCreate: 0,
      participantsToUpdate: 0,
      participantsToSkip: 0,
      malformedDirectConversationIds: 0,
      missingGroups: 0,
      groupMemberMismatches: 0,
      duplicateOrAmbiguousLegacyIds: 0,
      lastMessageCandidates: 0,
    },
  };
}

function deriveDirectConversationCandidate(legacyConversationId) {
  const parts = String(legacyConversationId || "").split("_");
  if (parts.length !== 2 || !parts.every(isStrictObjectId)) {
    return { malformed: true, legacyConversationId };
  }

  const participantUserIds = [...parts].sort();
  const directKey = participantUserIds.join("_");

  return {
    malformed: false,
    ambiguous: directKey !== legacyConversationId,
    legacyConversationId,
    directKey,
    participantUserIds,
  };
}

function groupMessagesByConversationId(messages) {
  const grouped = new Map();
  for (const message of messages) {
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

function deriveMessageUserIds(messages, groupId = null) {
  const excludedGroupId = groupId ? toIdString(groupId) : null;
  const ids = [];

  for (const message of messages) {
    for (const value of [message.sender, message.receiver]) {
      if (!value || !isStrictObjectId(value)) continue;
      const id = toIdString(value);
      if (id !== excludedGroupId) ids.push(id);
    }
  }

  return sortedUniqueIds(ids);
}

function buildConversationCandidate({ legacyConversationId, kind, directKey = null, group = null, participantUserIds, latestMessage }) {
  return {
    kind,
    legacyConversationId,
    ...(directKey ? { directKey } : {}),
    ...(group?._id ? { groupId: group._id } : {}),
    participantUserIds: sortedUniqueIds(participantUserIds),
    lastMessageId: latestMessage?._id || null,
    lastMessageAt: latestMessage ? normalizeDate(latestMessage.createdAt) : null,
  };
}

function conversationNeedsUpdate(existing, candidate) {
  return (
    existing.kind !== candidate.kind ||
    (existing.directKey || null) !== (candidate.directKey || null) ||
    toIdString(existing.groupId || "") !== toIdString(candidate.groupId || "") ||
    !sameIdSet(existing.participantUserIds || [], candidate.participantUserIds || []) ||
    !sameId(existing.lastMessageId || "", candidate.lastMessageId || "") ||
    !sameDate(existing.lastMessageAt, candidate.lastMessageAt)
  );
}

function participantNeedsUpdate(existing, candidate) {
  return (
    toIdString(existing.conversationId || "") !== toIdString(candidate.conversationId || "") ||
    existing.legacyConversationId !== candidate.legacyConversationId ||
    (existing.role || null) !== (candidate.role || null) ||
    !sameId(existing.state?.lastMessageId || "", candidate.state?.lastMessageId || "") ||
    !sameDate(existing.state?.lastMessageAt, candidate.state?.lastMessageAt)
  );
}

function roleForGroupMember(group, userId) {
  if (group?.admin && sameId(group.admin, userId)) return "admin";
  return "member";
}

function buildParticipantCandidates({ conversation, candidate, group = null }) {
  return candidate.participantUserIds.map((userId) => ({
    conversationId: conversation?._id || null,
    legacyConversationId: candidate.legacyConversationId,
    userId,
    role: candidate.kind === "group" ? roleForGroupMember(group, userId) : "member",
    state: {
      lastMessageId: candidate.lastMessageId,
      lastMessageAt: candidate.lastMessageAt,
    },
  }));
}

function updateSummary(report) {
  for (const key of Object.keys(report.summary)) {
    if (key === "messagesScanned" || key === "legacyConversationsScanned") continue;
    report.summary[key] = report[key].length;
  }
}

async function runConversationBackfillDryRun(models = {}) {
  const Message = models.Message || DefaultMessage;
  const Group = models.Group || DefaultGroup;
  const Conversation = models.Conversation || DefaultConversation;
  const ConversationParticipant = models.ConversationParticipant || DefaultConversationParticipant;

  const report = createEmptyReport();
  const [messages, groups, conversations, participants] = await Promise.all([
    readAll(Message),
    readAll(Group),
    readAll(Conversation),
    readAll(ConversationParticipant),
  ]);

  const groupById = new Map((groups || []).map((group) => [toIdString(group._id), group]));
  const conversationByLegacyId = new Map((conversations || []).map((conversation) => [conversation.legacyConversationId, conversation]));
  const participantByLegacyUser = new Map(
    (participants || []).map((participant) => [
      `${participant.legacyConversationId}:${toIdString(participant.userId)}`,
      participant,
    ]),
  );
  const messagesByConversationId = groupMessagesByConversationId(messages || []);

  report.summary.messagesScanned = (messages || []).length;
  report.summary.legacyConversationsScanned = messagesByConversationId.size;

  for (const [legacyConversationId, groupedMessages] of messagesByConversationId.entries()) {
    const latestMessage = pickLatestMessage(groupedMessages);
    let candidate;
    let group = null;

    if (legacyConversationId.includes("_")) {
      const direct = deriveDirectConversationCandidate(legacyConversationId);
      if (direct.malformed) {
        report.malformedDirectConversationIds.push(legacyConversationId);
        continue;
      }
      if (direct.ambiguous) {
        report.duplicateOrAmbiguousLegacyIds.push({
          legacyConversationId,
          normalizedDirectKey: direct.directKey,
        });
      }
      candidate = buildConversationCandidate({
        legacyConversationId,
        kind: "direct",
        directKey: direct.directKey,
        participantUserIds: direct.participantUserIds,
        latestMessage,
      });
    } else if (isStrictObjectId(legacyConversationId)) {
      group = groupById.get(legacyConversationId);
      if (!group) {
        report.missingGroups.push(legacyConversationId);
        continue;
      }

      const groupMemberIds = sortedUniqueIds(group.members || []);
      const impliedUserIds = deriveMessageUserIds(groupedMessages, group._id);
      const mismatchedUserIds = impliedUserIds.filter((userId) => !groupMemberIds.includes(userId));
      if (mismatchedUserIds.length > 0) {
        report.groupMemberMismatches.push({
          legacyConversationId,
          userIds: mismatchedUserIds,
        });
      }

      candidate = buildConversationCandidate({
        legacyConversationId,
        kind: "group",
        group,
        participantUserIds: groupMemberIds,
        latestMessage,
      });
    } else {
      report.malformedDirectConversationIds.push(legacyConversationId);
      continue;
    }

    report.lastMessageCandidates.push({
      legacyConversationId,
      lastMessageId: candidate.lastMessageId,
      lastMessageAt: candidate.lastMessageAt,
    });

    const existingConversation = conversationByLegacyId.get(legacyConversationId);
    if (!existingConversation) {
      report.conversationsToCreate.push(candidate);
    } else if (conversationNeedsUpdate(existingConversation, candidate)) {
      report.conversationsToUpdate.push({ existing: existingConversation, candidate });
    } else {
      report.conversationsToSkip.push(existingConversation);
    }

    for (const participantCandidate of buildParticipantCandidates({
      conversation: existingConversation,
      candidate,
      group,
    })) {
      const existingParticipant = participantByLegacyUser.get(
        `${participantCandidate.legacyConversationId}:${toIdString(participantCandidate.userId)}`,
      );
      if (!existingParticipant) {
        report.participantsToCreate.push(participantCandidate);
      } else if (participantNeedsUpdate(existingParticipant, participantCandidate)) {
        report.participantsToUpdate.push({ existing: existingParticipant, candidate: participantCandidate });
      } else {
        report.participantsToSkip.push(existingParticipant);
      }
    }
  }

  updateSummary(report);
  return report;
}

module.exports = {
  deriveDirectConversationCandidate,
  runConversationBackfillDryRun,
};

