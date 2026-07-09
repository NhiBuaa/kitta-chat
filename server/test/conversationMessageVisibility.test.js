const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const messageControllerPath = require.resolve("../src/controllers/messageController");
const conversationParticipantPath = require.resolve("../src/models/ConversationParticipant");
const groupPath = require.resolve("../src/models/Group");
const messagePath = require.resolve("../src/models/Message");

const paths = [messageControllerPath, conversationParticipantPath, groupPath, messagePath];

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearCache = () => {
  for (const path of paths) delete require.cache[path];
};

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

function loadController({ participant = null, findCalls = [], participants = [], groups = [] } = {}) {
  clearCache();
  const participantsList = participant ? [participant] : participants;
  mockModule(conversationParticipantPath, {
    findOne(query) {
      const found = participantsList.find(
        (p) => p.legacyConversationId === query.legacyConversationId && p.userId === query.userId,
      );
      return { lean: async () => found || null };
    },
    find(query) {
      const found = participantsList.filter((p) => p.userId === query.userId);
      return { lean: async () => found };
    },
  });
  mockModule(groupPath, {
    find() {
      return {
        select: async () => groups,
      };
    },
  });
  mockModule(messagePath, {
    find(query) {
      findCalls.push(query);
      return {
        sort() {
          return {
            limit() {
              return {
                populate() {
                  return {
                    populate() {
                      return [];
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  });

  return require(messageControllerPath);
}

test("getMessages applies visibility filter from ConversationParticipant", async () => {
  const deletedAt = new Date("2026-06-05T08:00:00.000Z");
  const findCalls = [];
  const controller = loadController({
    findCalls,
    participant: {
      legacyConversationId: "user-a_user-b",
      userId: "user-a",
      state: { deletedAt },
    },
  });
  const res = createResponse();

  await controller.getMessages(
    {
      params: { userId1: "user-a", userId2: "user-b" },
      query: {},
      user: { id: "user-a" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(findCalls.length, 1);
  assert.equal(findCalls[0].conversationId, "user-a_user-b");
  assert.deepEqual(findCalls[0].createdAt, { $gt: deletedAt });
});

test("getMessages falls back to legacy query when participant is missing", async () => {
  const findCalls = [];
  const controller = loadController({
    findCalls,
    participant: null,
  });
  const res = createResponse();

  await controller.getMessages(
    {
      params: { userId1: "user-a", userId2: "user-b" },
      query: {},
      user: { id: "user-a" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(findCalls.length, 1);
  assert.equal(findCalls[0].conversationId, "user-a_user-b");
  assert.equal(Object.hasOwn(findCalls[0], "createdAt"), false);
});

test("getMessages falls back to legacy query on database query error", async () => {
  clearCache();
  mockModule(conversationParticipantPath, {
    findOne() {
      throw new Error("DB down");
    },
  });
  const findCalls = [];
  mockModule(messagePath, {
    find(query) {
      findCalls.push(query);
      return {
        sort() {
          return {
            limit() {
              return {
                populate() {
                  return {
                    populate() {
                      return [];
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  });
  const controller = require(messageControllerPath);
  const res = createResponse();

  await controller.getMessages(
    {
      params: { userId1: "user-a", userId2: "user-b" },
      query: {},
      user: { id: "user-a" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(findCalls.length, 1);
  assert.equal(findCalls[0].conversationId, "user-a_user-b");
  assert.equal(Object.hasOwn(findCalls[0], "createdAt"), false);
});

test("getMessages applies leftAt visibility filter for group conversation", async () => {
  const leftAt = new Date("2026-06-05T09:00:00.000Z");
  const findCalls = [];
  const controller = loadController({
    findCalls,
    participant: {
      legacyConversationId: "group-1",
      userId: "user-a",
      leftAt,
    },
  });
  const res = createResponse();

  await controller.getMessages(
    {
      params: { userId1: "user-a", userId2: "group-1" },
      query: { isGroup: "true" },
      user: { id: "user-a" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(findCalls.length, 1);
  assert.equal(findCalls[0].conversationId, "group-1");
  assert.deepEqual(findCalls[0].createdAt, { $lte: leftAt });
});

test("syncMissedMessages applies visibility bounds for groups and direct conversations", async () => {
  const deletedAt = new Date("2026-06-05T08:00:00.000Z");
  const leftAt = new Date("2026-06-05T09:00:00.000Z");
  const findCalls = [];
  const controller = loadController({
    findCalls,
    groups: [{ _id: "group-1" }],
    participants: [
      {
        legacyConversationId: "user-a_user-b",
        userId: "user-a",
        state: { deletedAt },
      },
      {
        legacyConversationId: "group-1",
        userId: "user-a",
        leftAt,
      },
    ],
  });
  const res = createResponse();

  await controller.syncMissedMessages(
    {
      query: {},
      user: { id: "user-a" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(findCalls.length, 1);

  const or = findCalls[0].$or;
  assert.ok(Array.isArray(or));

  const directClause = or.find((c) => c.conversationId === "user-a_user-b");
  assert.ok(directClause);
  assert.deepEqual(directClause.createdAt, { $gt: deletedAt });

  const groupClause = or.find((c) => c.conversationId === "group-1");
  assert.ok(groupClause);
  assert.deepEqual(groupClause.createdAt, { $lte: leftAt });

  const fallbackClause = or.find((c) => c.conversationId?.$regex === "user-a");
  assert.ok(fallbackClause);
  assert.deepEqual(fallbackClause.conversationId.$nin, ["user-a_user-b", "group-1"]);
});
