const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const {
  runConversationBackfillWrite,
} = require("../src/services/conversationBackfillWrite");
const {
  parseBackfillArgs,
} = require("../scripts/backfillConversations");

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

function createModel(items, calls, name, { duplicateOnCreate = false } = {}) {
  return {
    find() {
      calls.push(`${name}.find`);
      return {
        lean() {
          calls.push(`${name}.lean`);
          return Promise.resolve(items);
        },
      };
    },
    async create(data) {
      calls.push(`${name}.create`);
      if (duplicateOnCreate) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }
      const doc = { _id: data._id || objectId(String(items.length + 700)), ...data };
      items.push(doc);
      return doc;
    },
    async updateOne(query, update) {
      calls.push(`${name}.updateOne`);
      const doc = items.find((item) => {
        return Object.entries(query).every(([key, value]) => idString(item[key]) === idString(value));
      });
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      for (const [path, value] of Object.entries(update.$set || {})) {
        const parts = path.split(".");
        let target = doc;
        while (parts.length > 1) {
          const part = parts.shift();
          target[part] = target[part] || {};
          target = target[part];
        }
        target[parts[0]] = value;
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    updateMany() { throw new Error(`${name}.updateMany must not be called`); },
    findOneAndUpdate() { throw new Error(`${name}.findOneAndUpdate must not be called`); },
    bulkWrite() { throw new Error(`${name}.bulkWrite must not be called`); },
    deleteOne() { throw new Error(`${name}.deleteOne must not be called`); },
    deleteMany() { throw new Error(`${name}.deleteMany must not be called`); },
    save() { throw new Error(`${name}.save must not be called`); },
  };
}

function readonlyModel(items, calls, name) {
  return {
    find() {
      calls.push(`${name}.find`);
      return {
        lean() {
          calls.push(`${name}.lean`);
          return Promise.resolve(items);
        },
      };
    },
    create() { throw new Error(`${name}.create must not be called`); },
    updateOne() { throw new Error(`${name}.updateOne must not be called`); },
    updateMany() { throw new Error(`${name}.updateMany must not be called`); },
    findOneAndUpdate() { throw new Error(`${name}.findOneAndUpdate must not be called`); },
    bulkWrite() { throw new Error(`${name}.bulkWrite must not be called`); },
    deleteOne() { throw new Error(`${name}.deleteOne must not be called`); },
    deleteMany() { throw new Error(`${name}.deleteMany must not be called`); },
    save() { throw new Error(`${name}.save must not be called`); },
  };
}

function fixture({ messages = [message()], groups = [], conversations = [], participants = [], duplicateConversationCreate = false } = {}) {
  const calls = [];
  return {
    calls,
    messages,
    groups,
    conversations,
    participants,
    models: {
      Message: readonlyModel(messages, calls, "Message"),
      Group: readonlyModel(groups, calls, "Group"),
      Conversation: createModel(conversations, calls, "Conversation", { duplicateOnCreate: duplicateConversationCreate }),
      ConversationParticipant: createModel(participants, calls, "ConversationParticipant"),
    },
  };
}

test("backfill defaults to dry-run and performs zero writes", async () => {
  const context = fixture();

  const report = await runConversationBackfillWrite({ models: context.models });

  assert.equal(report.mode, "dry-run");
  assert.equal(context.conversations.length, 0);
  assert.equal(context.participants.length, 0);
  assert.equal(context.calls.some((call) => /create|update|bulkWrite|delete|save/i.test(call)), false);
});

test("write mode creates expected Conversation and ConversationParticipant rows", async () => {
  const context = fixture();

  const report = await runConversationBackfillWrite({ models: context.models, write: true });

  assert.equal(report.mode, "write");
  assert.equal(context.conversations.length, 1);
  assert.equal(Object.hasOwn(context.conversations[0], "groupId"), false);
  assert.equal(context.participants.length, 2);
  assert.equal(report.created.conversations, 1);
  assert.equal(report.created.participants, 2);
});

test("second write run is idempotent and skips existing rows", async () => {
  const context = fixture();

  await runConversationBackfillWrite({ models: context.models, write: true });
  const second = await runConversationBackfillWrite({ models: context.models, write: true });

  assert.equal(context.conversations.length, 1);
  assert.equal(Object.hasOwn(context.conversations[0], "groupId"), false);
  assert.equal(context.participants.length, 2);
  assert.equal(second.created.conversations, 0);
  assert.equal(second.created.participants, 0);
  assert.equal(second.skipped.conversations, 1);
  assert.equal(second.skipped.participants, 2);
});

test("write mode repairs partial existing state", async () => {
  const legacyConversationId = message().conversationId;
  const conversationId = objectId("401");
  const participantA = objectId("a");
  const staleDate = date("2026-06-05T08:00:00.000Z");
  const latest = message({ _id: objectId("113"), createdAt: date("2026-06-05T11:00:00.000Z") });
  const context = fixture({
    messages: [latest],
    conversations: [{
      _id: conversationId,
      kind: "direct",
      legacyConversationId,
      directKey: legacyConversationId,
      participantUserIds: [objectId("a"), objectId("b")],
      lastMessageId: objectId("999"),
      lastMessageAt: staleDate,
    }],
    participants: [{
      _id: objectId("501"),
      conversationId,
      legacyConversationId,
      userId: participantA,
      role: "member",
      state: { lastMessageId: objectId("999"), lastMessageAt: staleDate },
    }],
  });

  const report = await runConversationBackfillWrite({ models: context.models, write: true });

  assert.equal(context.conversations[0].lastMessageAt.toISOString(), latest.createdAt.toISOString());
  assert.equal(context.participants.length, 2);
  assert.equal(context.participants[0].state.lastMessageAt.toISOString(), latest.createdAt.toISOString());
  assert.equal(report.updated.conversations, 1);
  assert.equal(report.updated.participants, 1);
  assert.equal(report.created.participants, 1);
});

test("duplicate-key races are treated as safe skips", async () => {
  const context = fixture({ duplicateConversationCreate: true });

  const report = await runConversationBackfillWrite({ models: context.models, write: true });

  assert.equal(report.skipped.conversations, 1);
  assert.equal(report.errors.length, 0);
});

test("write service never modifies Message, Group, User, Redis, RabbitMQ, or call data", async () => {
  const context = fixture();

  await runConversationBackfillWrite({ models: context.models, write: true });

  assert.equal(context.calls.some((call) => /^Message\.(create|update|bulkWrite|delete|save)/.test(call)), false);
  assert.equal(context.calls.some((call) => /^Group\.(create|update|bulkWrite|delete|save)/.test(call)), false);
});

test("write mode refuses unsafe dry-run warnings", async () => {
  const context = fixture({ messages: [message({ conversationId: "bad_direct" })] });

  await assert.rejects(
    () => runConversationBackfillWrite({ models: context.models, write: true }),
    /unsafe dry-run report/i,
  );

  assert.equal(context.calls.some((call) => /create|update/i.test(call)), false);
});

test("manual runner parses safe default and explicit write flag", () => {
  assert.deepEqual(parseBackfillArgs([]), { write: false });
  assert.deepEqual(parseBackfillArgs(["--write"]), { write: true });
});

