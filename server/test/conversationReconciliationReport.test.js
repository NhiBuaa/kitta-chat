const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const { runConversationReconciliationReport } = require("../src/services/conversationReconciliationReport");
const { parseReconciliationArgs } = require("../scripts/reconcileConversations");

const objectId = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));
const date = (value) => new Date(value);

function readonlyModel(rows, calls, name) {
  return {
    find(query = {}) {
      calls.push([`${name}.find`, query]);
      return {
        lean() {
          return rows;
        },
      };
    },
  };
}

function message(overrides = {}) {
  return {
    _id: objectId("101"),
    conversationId: `${objectId("a")}_${objectId("b")}`,
    sender: objectId("a"),
    receiver: objectId("b"),
    isRead: false,
    readBy: [],
    createdAt: date("2026-06-05T10:00:00.000Z"),
    ...overrides,
  };
}

function fixture({ messages = [message()], groups = [], conversations = [], participants = [] } = {}) {
  const calls = [];
  return {
    calls,
    models: {
      Message: readonlyModel(messages, calls, "Message"),
      Group: readonlyModel(groups, calls, "Group"),
      Conversation: readonlyModel(conversations, calls, "Conversation"),
      ConversationParticipant: readonlyModel(participants, calls, "ConversationParticipant"),
    },
  };
}

test("reconciliation report returns zero drift for matching direct read-model data", async () => {
  const latestMessage = message();
  const conversationId = objectId("401");
  const legacyConversationId = latestMessage.conversationId;
  const context = fixture({
    messages: [latestMessage],
    conversations: [{
      _id: conversationId,
      kind: "direct",
      legacyConversationId,
      directKey: legacyConversationId,
      participantUserIds: [latestMessage.sender, latestMessage.receiver],
      lastMessageId: latestMessage._id,
      lastMessageAt: latestMessage.createdAt,
    }],
    participants: [
      {
        conversationId,
        legacyConversationId,
        userId: latestMessage.sender,
        state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 0 },
      },
      {
        conversationId,
        legacyConversationId,
        userId: latestMessage.receiver,
        state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 1 },
      },
    ],
  });

  const report = await runConversationReconciliationReport({ models: context.models });

  assert.equal(report.mode, "report-only");
  assert.equal(report.summary.legacyConversationsScanned, 1);
  assert.equal(report.summary.totalDrift, 0);
  assert.deepEqual(report.drift, []);
  assert.equal(context.calls.some((call) => /create|update|bulkWrite|delete|save/i.test(call[0])), false);
});

test("reconciliation report flags missing conversation", async () => {
  const context = fixture();

  const report = await runConversationReconciliationReport({ models: context.models });

  assert.equal(report.summary.missingConversations, 1);
  assert.equal(report.drift[0].type, "missing_conversation");
  assert.equal(report.drift[0].legacyConversationId, message().conversationId);
});

test("reconciliation report flags missing participant", async () => {
  const latestMessage = message();
  const conversationId = objectId("401");
  const context = fixture({
    messages: [latestMessage],
    conversations: [{
      _id: conversationId,
      kind: "direct",
      legacyConversationId: latestMessage.conversationId,
      directKey: latestMessage.conversationId,
      participantUserIds: [latestMessage.sender, latestMessage.receiver],
      lastMessageId: latestMessage._id,
      lastMessageAt: latestMessage.createdAt,
    }],
    participants: [{
      conversationId,
      legacyConversationId: latestMessage.conversationId,
      userId: latestMessage.sender,
      state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 0 },
    }],
  });

  const report = await runConversationReconciliationReport({ models: context.models });

  assert.equal(report.summary.missingParticipants, 1);
  assert.equal(report.drift[0].type, "missing_participant");
  assert.equal(report.drift[0].userId, latestMessage.receiver.toString());
});

test("reconciliation report flags last-message mismatch", async () => {
  const latestMessage = message({ _id: objectId("102"), createdAt: date("2026-06-05T12:00:00.000Z") });
  const conversationId = objectId("401");
  const context = fixture({
    messages: [latestMessage],
    conversations: [{
      _id: conversationId,
      kind: "direct",
      legacyConversationId: latestMessage.conversationId,
      directKey: latestMessage.conversationId,
      participantUserIds: [latestMessage.sender, latestMessage.receiver],
      lastMessageId: objectId("999"),
      lastMessageAt: date("2026-06-05T09:00:00.000Z"),
    }],
    participants: [
      {
        conversationId,
        legacyConversationId: latestMessage.conversationId,
        userId: latestMessage.sender,
        state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 0 },
      },
      {
        conversationId,
        legacyConversationId: latestMessage.conversationId,
        userId: latestMessage.receiver,
        state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 1 },
      },
    ],
  });

  const report = await runConversationReconciliationReport({ models: context.models });

  assert.equal(report.summary.lastMessageMismatches, 1);
  assert.equal(report.drift[0].type, "last_message_mismatch");
  assert.deepEqual(report.drift[0].fields, ["lastMessageId", "lastMessageAt"]);
});

test("reconciliation report flags group participant drift", async () => {
  const groupId = objectId("501");
  const memberA = objectId("a");
  const memberB = objectId("b");
  const memberC = objectId("c");
  const latestMessage = message({ conversationId: groupId.toString(), sender: memberA, receiver: groupId });
  const conversationId = objectId("601");
  const context = fixture({
    messages: [latestMessage],
    groups: [{ _id: groupId, members: [memberA, memberB, memberC] }],
    conversations: [{
      _id: conversationId,
      kind: "group",
      legacyConversationId: groupId.toString(),
      groupId,
      participantUserIds: [memberA, memberB],
      lastMessageId: latestMessage._id,
      lastMessageAt: latestMessage.createdAt,
    }],
    participants: [memberA, memberB, memberC].map((userId) => ({
      conversationId,
      legacyConversationId: groupId.toString(),
      userId,
      state: {
        lastMessageId: latestMessage._id,
        lastMessageAt: latestMessage.createdAt,
        unreadCount: userId.equals(memberA) ? 0 : 1,
      },
    })),
  });

  const report = await runConversationReconciliationReport({ models: context.models });

  assert.equal(report.summary.groupParticipantMismatches, 1);
  assert.equal(report.drift[0].type, "group_participant_mismatch");
  assert.deepEqual(report.drift[0].expectedUserIds, [memberA, memberB, memberC].map(String).sort());
});

test("reconciliation report flags unread-count mismatch", async () => {
  const latestMessage = message();
  const conversationId = objectId("401");
  const context = fixture({
    messages: [latestMessage],
    conversations: [{
      _id: conversationId,
      kind: "direct",
      legacyConversationId: latestMessage.conversationId,
      directKey: latestMessage.conversationId,
      participantUserIds: [latestMessage.sender, latestMessage.receiver],
      lastMessageId: latestMessage._id,
      lastMessageAt: latestMessage.createdAt,
    }],
    participants: [
      {
        conversationId,
        legacyConversationId: latestMessage.conversationId,
        userId: latestMessage.sender,
        state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 0 },
      },
      {
        conversationId,
        legacyConversationId: latestMessage.conversationId,
        userId: latestMessage.receiver,
        state: { lastMessageId: latestMessage._id, lastMessageAt: latestMessage.createdAt, unreadCount: 0 },
      },
    ],
  });

  const report = await runConversationReconciliationReport({ models: context.models });

  assert.equal(report.summary.unreadMismatches, 1);
  assert.equal(report.drift[0].type, "unread_count_mismatch");
  assert.equal(report.drift[0].expectedUnreadCount, 1);
});

test("manual reconciliation runner stays report-only", () => {
  assert.deepEqual(parseReconciliationArgs([]), { mode: "report-only" });
  assert.throws(() => parseReconciliationArgs(["--write"]), /report-only/i);
});
