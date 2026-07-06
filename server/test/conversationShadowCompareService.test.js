const assert = require("node:assert/strict");
const test = require("node:test");

const servicePath = require.resolve("../src/services/conversationShadowCompareService");
const conversationPath = require.resolve("../src/models/Conversation");
const participantPath = require.resolve("../src/models/ConversationParticipant");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearServiceCache = () => {
  for (const path of [servicePath, conversationPath, participantPath]) {
    delete require.cache[path];
  }
};

const idString = (value) => value?.toString?.() ?? String(value);

function createFindQuery(rows) {
  return {
    populate() {
      return this;
    },
    lean() {
      return rows;
    },
  };
}

function loadService({ participants = [] } = {}) {
  clearServiceCache();
  mockModule(participantPath, {
    find(query) {
      assert.ok(query.userId);
      return createFindQuery(participants);
    },
  });
  mockModule(conversationPath, {});
  return require(servicePath);
}

function participant(overrides = {}) {
  return {
    conversationId: {
      kind: "direct",
      legacyConversationId: "user-a_user-b",
    },
    legacyConversationId: "user-a_user-b",
    userId: "user-a",
    leftAt: null,
    state: {
      archivedAt: null,
      deletedAt: null,
      lastMessageId: "message-1",
      lastMessageAt: new Date("2026-06-05T08:00:00.000Z"),
      unreadCount: 2,
    },
    ...overrides,
  };
}

function legacyDirect(overrides = {}) {
  return {
    _id: "user-b",
    lastMessage: {
      messageId: "message-1",
      createdAt: new Date("2026-06-05T08:00:00.000Z"),
    },
    unreadCount: 2,
    ...overrides,
  };
}

test("shadow compare returns no mismatches for matching direct sidebar candidate", async () => {
  const service = loadService({ participants: [participant()] });

  const report = await service.compareSidebarForUser({
    userId: "user-a",
    scope: "direct",
    legacyItems: [legacyDirect()],
  });

  assert.deepEqual(report.mismatches, []);
});

test("shadow compare reports missing read-model conversation", async () => {
  const service = loadService({ participants: [] });

  const report = await service.compareSidebarForUser({
    userId: "user-a",
    scope: "direct",
    legacyItems: [legacyDirect()],
  });

  assert.equal(report.mismatches[0].type, "missing_read_model_candidate");
  assert.equal(report.mismatches[0].legacyConversationId, "user-a_user-b");
});

test("shadow compare reports different stable fields", async () => {
  const service = loadService({
    participants: [
      participant({
        state: {
          archivedAt: null,
          deletedAt: null,
          lastMessageId: "message-2",
          lastMessageAt: new Date("2026-06-05T09:00:00.000Z"),
          unreadCount: 3,
        },
      }),
    ],
  });

  const report = await service.compareSidebarForUser({
    userId: "user-a",
    scope: "direct",
    legacyItems: [legacyDirect()],
  });

  assert.deepEqual(
    report.mismatches.map((item) => item.field).sort(),
    ["lastMessageAt", "lastMessageId", "unreadCount"],
  );
});

test("shadow compare excludes archived or no-last-message participants from default sidebar", async () => {
  const service = loadService({
    participants: [
      participant({
        legacyConversationId: "archived",
        conversationId: { kind: "direct", legacyConversationId: "archived" },
        state: {
          archivedAt: new Date("2026-06-05T09:00:00.000Z"),
          deletedAt: null,
          lastMessageId: "message-3",
          lastMessageAt: new Date("2026-06-05T08:00:00.000Z"),
          unreadCount: 0,
        },
      }),
      participant({
        legacyConversationId: "empty",
        conversationId: { kind: "direct", legacyConversationId: "empty" },
        state: {
          archivedAt: null,
          deletedAt: null,
          lastMessageId: null,
          lastMessageAt: null,
          unreadCount: 0,
        },
      }),
    ],
  });

  const report = await service.compareSidebarForUser({
    userId: "user-a",
    scope: "direct",
    legacyItems: [],
  });

  assert.deepEqual(report.readModelCandidates, []);
  assert.deepEqual(report.mismatches, []);
});
test("shadow compare reports extra visible read-model candidate", async () => {
  const service = loadService({ participants: [participant()] });

  const report = await service.compareSidebarForUser({
    userId: "user-a",
    scope: "direct",
    legacyItems: [],
  });

  assert.equal(report.mismatches[0].type, "extra_read_model_candidate");
  assert.equal(report.mismatches[0].legacyConversationId, "user-a_user-b");
});