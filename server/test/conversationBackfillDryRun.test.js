const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const {
  deriveDirectConversationCandidate,
  runConversationBackfillDryRun,
} = require("../src/services/conversationBackfillDryRun");

const objectId = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));
const idString = (value) => value?._id?.toString?.() || value?.toString?.() || String(value);
const date = (iso) => new Date(iso);

function message(overrides = {}) {
  return {
    _id: objectId("101"),
    conversationId: `${objectId("a")}_${objectId("b")}`,
    sender: objectId("a"),
    receiver: objectId("b"),
    createdAt: date("2026-06-05T10:00:00.000Z"),
    ...overrides,
  };
}

function createReadOnlyModel(items, calls, name) {
  const query = {
    lean() {
      calls.push(`${name}.lean`);
      return Promise.resolve(items);
    },
  };

  return {
    find() {
      calls.push(`${name}.find`);
      return query;
    },
    create() {
      throw new Error(`${name}.create must not be called during dry-run`);
    },
    updateOne() {
      throw new Error(`${name}.updateOne must not be called during dry-run`);
    },
    updateMany() {
      throw new Error(`${name}.updateMany must not be called during dry-run`);
    },
    findOneAndUpdate() {
      throw new Error(`${name}.findOneAndUpdate must not be called during dry-run`);
    },
    bulkWrite() {
      throw new Error(`${name}.bulkWrite must not be called during dry-run`);
    },
    deleteOne() {
      throw new Error(`${name}.deleteOne must not be called during dry-run`);
    },
    deleteMany() {
      throw new Error(`${name}.deleteMany must not be called during dry-run`);
    },
  };
}

function dryRunFixture({ messages = [], groups = [], conversations = [], participants = [] } = {}) {
  const calls = [];
  return {
    calls,
    run: () => runConversationBackfillDryRun({
      Message: createReadOnlyModel(messages, calls, "Message"),
      Group: createReadOnlyModel(groups, calls, "Group"),
      Conversation: createReadOnlyModel(conversations, calls, "Conversation"),
      ConversationParticipant: createReadOnlyModel(participants, calls, "ConversationParticipant"),
    }),
  };
}

test("dry-run direct messages produce one conversation candidate and two participants", async () => {
  const { run } = dryRunFixture({ messages: [message()] });

  const report = await run();

  assert.equal(report.conversationsToCreate.length, 1);
  assert.equal(report.conversationsToCreate[0].kind, "direct");
  assert.equal(report.conversationsToCreate[0].legacyConversationId, message().conversationId);
  assert.deepEqual(
    report.conversationsToCreate[0].participantUserIds.map(idString).sort(),
    [objectId("a").toString(), objectId("b").toString()].sort(),
  );
  assert.equal(report.participantsToCreate.length, 2);
});

test("dry-run reports malformed direct conversation ids", async () => {
  const { run } = dryRunFixture({
    messages: [message({ conversationId: "not_a_valid_direct_id" })],
  });

  const report = await run();

  assert.deepEqual(report.malformedDirectConversationIds, ["not_a_valid_direct_id"]);
  assert.equal(report.conversationsToCreate.length, 0);
});

test("dry-run group messages produce group candidate using Group.members", async () => {
  const groupId = objectId("301");
  const memberA = objectId("a");
  const memberB = objectId("b");
  const { run } = dryRunFixture({
    messages: [message({ conversationId: groupId.toString(), sender: memberA, receiver: groupId })],
    groups: [{ _id: groupId, members: [memberA, memberB], admin: memberA }],
  });

  const report = await run();

  assert.equal(report.conversationsToCreate.length, 1);
  assert.equal(report.conversationsToCreate[0].kind, "group");
  assert.equal(idString(report.conversationsToCreate[0].groupId), groupId.toString());
  assert.deepEqual(
    report.participantsToCreate.map((candidate) => idString(candidate.userId)).sort(),
    [memberA.toString(), memberB.toString()].sort(),
  );
});

test("dry-run reports missing group for group-shaped legacy ids", async () => {
  const groupId = objectId("301");
  const { run } = dryRunFixture({
    messages: [message({ conversationId: groupId.toString(), receiver: groupId })],
  });

  const report = await run();

  assert.deepEqual(report.missingGroups, [groupId.toString()]);
  assert.equal(report.conversationsToCreate.length, 0);
});

test("dry-run reports group member mismatches from message sender or receiver", async () => {
  const groupId = objectId("301");
  const memberA = objectId("a");
  const outsider = objectId("c");
  const { run } = dryRunFixture({
    messages: [message({ conversationId: groupId.toString(), sender: outsider, receiver: groupId })],
    groups: [{ _id: groupId, members: [memberA], admin: memberA }],
  });

  const report = await run();

  assert.deepEqual(report.groupMemberMismatches, [
    {
      legacyConversationId: groupId.toString(),
      userIds: [outsider.toString()],
    },
  ]);
});

test("dry-run latest message candidate picks newest createdAt", async () => {
  const older = message({ _id: objectId("111"), createdAt: date("2026-06-05T09:00:00.000Z") });
  const newer = message({ _id: objectId("112"), createdAt: date("2026-06-05T11:00:00.000Z") });
  const { run } = dryRunFixture({ messages: [older, newer] });

  const report = await run();

  assert.deepEqual(report.lastMessageCandidates, [
    {
      legacyConversationId: older.conversationId,
      lastMessageId: newer._id,
      lastMessageAt: newer.createdAt,
    },
  ]);
});

test("dry-run reports existing Conversation and Participant rows as skip or update", async () => {
  const legacyConversationId = message().conversationId;
  const conversationId = objectId("401");
  const participantA = objectId("a");
  const participantB = objectId("b");
  const latest = message({ _id: objectId("113"), createdAt: date("2026-06-05T11:00:00.000Z") });
  const { run } = dryRunFixture({
    messages: [latest],
    conversations: [
      {
        _id: conversationId,
        kind: "direct",
        legacyConversationId,
        directKey: legacyConversationId,
        participantUserIds: [participantA, participantB],
        lastMessageId: objectId("999"),
        lastMessageAt: date("2026-06-05T08:00:00.000Z"),
      },
    ],
    participants: [
      {
        _id: objectId("501"),
        conversationId,
        legacyConversationId,
        userId: participantA,
        role: "member",
        state: { lastMessageId: latest._id, lastMessageAt: latest.createdAt },
      },
      {
        _id: objectId("502"),
        conversationId,
        legacyConversationId,
        userId: participantB,
        role: "member",
        state: { lastMessageId: objectId("999"), lastMessageAt: date("2026-06-05T08:00:00.000Z") },
      },
    ],
  });

  const report = await run();

  assert.equal(report.conversationsToCreate.length, 0);
  assert.equal(report.conversationsToUpdate.length, 1);
  assert.equal(report.participantsToCreate.length, 0);
  assert.equal(report.participantsToSkip.length, 1);
  assert.equal(report.participantsToUpdate.length, 1);
});

test("dry-run reports duplicate or ambiguous legacy ids safely", async () => {
  const first = objectId("b");
  const second = objectId("a");
  const unsortedLegacyId = `${first}_${second}`;

  assert.deepEqual(deriveDirectConversationCandidate(unsortedLegacyId), {
    malformed: false,
    ambiguous: true,
    legacyConversationId: unsortedLegacyId,
    directKey: `${second}_${first}`,
    participantUserIds: [second.toString(), first.toString()],
  });

  const { run } = dryRunFixture({
    messages: [message({ conversationId: unsortedLegacyId, sender: first, receiver: second })],
  });

  const report = await run();

  assert.deepEqual(report.duplicateOrAmbiguousLegacyIds, [
    {
      legacyConversationId: unsortedLegacyId,
      normalizedDirectKey: `${second}_${first}`,
    },
  ]);
});

test("dry-run never calls write methods", async () => {
  const { run, calls } = dryRunFixture({ messages: [message()] });

  await run();

  assert.ok(calls.includes("Message.find"));
  assert.ok(calls.includes("Conversation.find"));
  assert.equal(calls.some((call) => /create|update|bulkWrite|delete|save/i.test(call)), false);
});

test("dry-run summary counts are correct", async () => {
  const groupId = objectId("301");
  const { run } = dryRunFixture({
    messages: [
      message(),
      message({ conversationId: "bad_direct" }),
      message({ conversationId: groupId.toString(), receiver: groupId }),
    ],
  });

  const report = await run();

  assert.deepEqual(report.summary, {
    messagesScanned: 3,
    legacyConversationsScanned: 3,
    conversationsToCreate: 1,
    conversationsToUpdate: 0,
    conversationsToSkip: 0,
    participantsToCreate: 2,
    participantsToUpdate: 0,
    participantsToSkip: 0,
    malformedDirectConversationIds: 1,
    missingGroups: 1,
    groupMemberMismatches: 0,
    duplicateOrAmbiguousLegacyIds: 0,
    lastMessageCandidates: 1,
  });
});

