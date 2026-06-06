const DefaultMessage = require("../models/Message");
const DefaultGroup = require("../models/Group");
const DefaultConversation = require("../models/Conversation");
const DefaultConversationParticipant = require("../models/ConversationParticipant");
const { runConversationBackfillDryRun } = require("./conversationBackfillDryRun");

const toIdString = (value) => value?._id?.toString?.() || value?.toString?.() || String(value);

function createEmptyWriteReport({ mode, dryRun }) {
  return {
    mode,
    dryRun,
    created: { conversations: 0, participants: 0 },
    updated: { conversations: 0, participants: 0 },
    skipped: { conversations: 0, participants: 0 },
    errors: [],
  };
}

function hasUnsafeWarnings(dryRun) {
  return (
    dryRun.malformedDirectConversationIds.length > 0 ||
    dryRun.missingGroups.length > 0 ||
    dryRun.duplicateOrAmbiguousLegacyIds.length > 0
  );
}

function duplicateKey(error) {
  return error?.code === 11000;
}

function conversationSet(candidate) {
  return {
    kind: candidate.kind,
    legacyConversationId: candidate.legacyConversationId,
    directKey: candidate.directKey,
    groupId: candidate.groupId,
    participantUserIds: candidate.participantUserIds,
    lastMessageId: candidate.lastMessageId,
    lastMessageAt: candidate.lastMessageAt,
  };
}

function participantSet(candidate) {
  return {
    conversationId: candidate.conversationId,
    legacyConversationId: candidate.legacyConversationId,
    userId: candidate.userId,
    role: candidate.role,
    "state.lastMessageId": candidate.state?.lastMessageId || null,
    "state.lastMessageAt": candidate.state?.lastMessageAt || null,
  };
}

function resolveConversationId(candidate, conversationByLegacyId) {
  return candidate.conversationId || conversationByLegacyId.get(candidate.legacyConversationId)?._id || null;
}

async function runConversationBackfillWrite({ models = {}, write = false } = {}) {
  const Message = models.Message || DefaultMessage;
  const Group = models.Group || DefaultGroup;
  const Conversation = models.Conversation || DefaultConversation;
  const ConversationParticipant = models.ConversationParticipant || DefaultConversationParticipant;
  const dryRun = await runConversationBackfillDryRun({
    Message,
    Group,
    Conversation,
    ConversationParticipant,
  });
  const report = createEmptyWriteReport({ mode: write ? "write" : "dry-run", dryRun });

  if (!write) return report;

  if (hasUnsafeWarnings(dryRun)) {
    throw new Error("Unsafe dry-run report; refusing write backfill.");
  }

  const conversationByLegacyId = new Map(
    dryRun.conversationsToSkip.map((conversation) => [conversation.legacyConversationId, conversation]),
  );
  for (const item of dryRun.conversationsToUpdate) {
    conversationByLegacyId.set(item.candidate.legacyConversationId, item.existing);
  }

  for (const candidate of dryRun.conversationsToCreate) {
    try {
      const created = await Conversation.create(conversationSet(candidate));
      conversationByLegacyId.set(candidate.legacyConversationId, created);
      report.created.conversations += 1;
    } catch (error) {
      if (duplicateKey(error)) {
        report.skipped.conversations += 1;
        continue;
      }
      report.errors.push({ type: "conversationCreate", legacyConversationId: candidate.legacyConversationId, message: error.message });
    }
  }

  for (const item of dryRun.conversationsToUpdate) {
    try {
      await Conversation.updateOne(
        { legacyConversationId: item.candidate.legacyConversationId },
        { $set: conversationSet(item.candidate) },
      );
      report.updated.conversations += 1;
    } catch (error) {
      if (duplicateKey(error)) {
        report.skipped.conversations += 1;
        continue;
      }
      report.errors.push({ type: "conversationUpdate", legacyConversationId: item.candidate.legacyConversationId, message: error.message });
    }
  }

  report.skipped.conversations += dryRun.conversationsToSkip.length;

  for (const candidate of dryRun.participantsToCreate) {
    const conversationId = resolveConversationId(candidate, conversationByLegacyId);
    if (!conversationId) {
      report.skipped.participants += 1;
      continue;
    }

    try {
      await ConversationParticipant.create({
        ...candidate,
        conversationId,
      });
      report.created.participants += 1;
    } catch (error) {
      if (duplicateKey(error)) {
        report.skipped.participants += 1;
        continue;
      }
      report.errors.push({ type: "participantCreate", legacyConversationId: candidate.legacyConversationId, userId: toIdString(candidate.userId), message: error.message });
    }
  }

  for (const item of dryRun.participantsToUpdate) {
    const conversationId = resolveConversationId(item.candidate, conversationByLegacyId);
    try {
      await ConversationParticipant.updateOne(
        {
          legacyConversationId: item.candidate.legacyConversationId,
          userId: item.candidate.userId,
        },
        { $set: participantSet({ ...item.candidate, conversationId }) },
      );
      report.updated.participants += 1;
    } catch (error) {
      if (duplicateKey(error)) {
        report.skipped.participants += 1;
        continue;
      }
      report.errors.push({ type: "participantUpdate", legacyConversationId: item.candidate.legacyConversationId, userId: toIdString(item.candidate.userId), message: error.message });
    }
  }

  report.skipped.participants += dryRun.participantsToSkip.length;

  if (report.errors.length > 0) {
    const error = new Error("Conversation backfill write completed with errors.");
    error.report = report;
    throw error;
  }

  return report;
}

module.exports = {
  runConversationBackfillWrite,
};

