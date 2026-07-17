const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const { getSidebarCandidatesForUser } = require("../src/services/conversationSidebarCandidateService");

const objectId = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));
const date = (value) => new Date(value);

function createFindQuery(rows) {
  return {
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    lean() {
      return rows;
    },
  };
}

function participant(overrides = {}) {
  const conversationId = objectId("401");
  const userId = objectId("a");
  const otherUserId = objectId("b");
  const legacyConversationId = `${userId}_${otherUserId}`;
  const lastMessageAt = date("2026-06-05T10:00:00.000Z");
  const lastMessageId = objectId("101");

  const row = {
    _id: objectId("501"),
    conversationId: {
      _id: conversationId,
      kind: "direct",
      legacyConversationId,
      directKey: legacyConversationId,
    },
    legacyConversationId,
    userId,
    leftAt: null,
    state: {
      pinnedAt: null,
      archivedAt: null,
      deletedAt: null,
      lastMessageId,
      lastMessageAt,
      unreadCount: 2,
    },
    ...overrides,
  };

  if (overrides.legacyConversationId && !overrides.conversationId) {
    row.conversationId = {
      ...row.conversationId,
      legacyConversationId: overrides.legacyConversationId,
      directKey: overrides.legacyConversationId,
    };
  }

  return row;
}

function fixture({ participants = [participant()] } = {}) {
  const calls = [];
  return {
    calls,
    models: {
      ConversationParticipant: {
        find(query) {
          calls.push(["ConversationParticipant.find", query]);
          return createFindQuery(participants);
        },
      },
    },
  };
}

test("sidebar candidate service returns direct read-model candidates without internal ids", async () => {
  const row = participant();
  const context = fixture({ participants: [row] });

  const candidates = await getSidebarCandidatesForUser({
    userId: row.userId,
    models: context.models,
  });

  assert.deepEqual(candidates, [{
    kind: "direct",
    conversationId: row.legacyConversationId,
    legacyConversationId: row.legacyConversationId,
    lastMessageId: row.state.lastMessageId.toString(),
    lastMessageAt: row.state.lastMessageAt.toISOString(),
    unreadCount: 2,
    hasUnread: true,
    pinnedAt: null,
    mutedUntil: null,
  }]);
  assert.equal(Object.hasOwn(candidates[0], "_id"), false);
  assert.equal(Object.hasOwn(candidates[0], "internalConversationId"), false);
  assert.equal(context.calls.some((call) => /create|update|bulkWrite|delete|save/i.test(call[0])), false);
});

test("sidebar candidate service excludes archived deleted left and no-last-message rows", async () => {
  const visible = participant({ legacyConversationId: "visible" });
  const context = fixture({
    participants: [
      visible,
      participant({ legacyConversationId: "archived", state: { ...visible.state, archivedAt: date("2026-06-06T10:00:00.000Z") } }),
      participant({ legacyConversationId: "deleted", state: { ...visible.state, deletedAt: date("2026-06-06T10:00:00.000Z") } }),
      participant({ legacyConversationId: "left", leftAt: date("2026-06-06T10:00:00.000Z") }),
      participant({ legacyConversationId: "empty", state: { ...visible.state, lastMessageId: null, lastMessageAt: null } }),
    ],
  });

  const candidates = await getSidebarCandidatesForUser({
    userId: visible.userId,
    models: context.models,
  });

  assert.deepEqual(candidates.map((candidate) => candidate.legacyConversationId), ["visible"]);
});

test("sidebar candidate service returns group candidate with legacy group id only", async () => {
  const groupId = objectId("777");
  const row = participant({
    conversationId: {
      _id: objectId("888"),
      kind: "group",
      legacyConversationId: groupId.toString(),
      groupId,
    },
    legacyConversationId: groupId.toString(),
  });
  const context = fixture({ participants: [row] });

  const candidates = await getSidebarCandidatesForUser({
    userId: row.userId,
    models: context.models,
  });

  assert.equal(candidates[0].kind, "group");
  assert.equal(candidates[0].conversationId, groupId.toString());
  assert.equal(candidates[0].legacyConversationId, groupId.toString());
  assert.equal(JSON.stringify(candidates).includes(objectId("888").toString()), false);
});

test("sidebar candidate service orders pinned rows before latest message rows", async () => {
  const olderPinned = participant({
    legacyConversationId: "pinned",
    state: {
      ...participant().state,
      pinnedAt: date("2026-06-05T08:00:00.000Z"),
      lastMessageAt: date("2026-06-05T08:00:00.000Z"),
    },
  });
  const newest = participant({
    legacyConversationId: "newest",
    state: {
      ...participant().state,
      pinnedAt: null,
      lastMessageAt: date("2026-06-05T12:00:00.000Z"),
    },
  });
  const middle = participant({
    legacyConversationId: "middle",
    state: {
      ...participant().state,
      pinnedAt: null,
      lastMessageAt: date("2026-06-05T10:00:00.000Z"),
    },
  });
  const context = fixture({ participants: [middle, newest, olderPinned] });

  const candidates = await getSidebarCandidatesForUser({
    userId: olderPinned.userId,
    models: context.models,
  });

  assert.deepEqual(candidates.map((candidate) => candidate.legacyConversationId), ["pinned", "newest", "middle"]);
});
