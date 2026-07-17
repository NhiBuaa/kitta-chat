const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applySoftDeleteState,
  buildMessageVisibilityFilter,
  canIncrementUnreadForParticipant,
  getNotificationSuppressionState,
  isArchivedVisible,
  isParticipantReadable,
  isSidebarVisible,
} = require("../src/services/conversationVisibilityHelpers");

const date = (iso) => new Date(iso);

function participant(overrides = {}) {
  const { state = {}, settings = {}, ...rest } = overrides;

  return {
    leftAt: null,
    ...rest,
    state: {
      pinnedAt: null,
      archivedAt: null,
      mutedUntil: null,
      deletedAt: null,
      lastReadMessageId: null,
      lastReadAt: null,
      unreadCount: 3,
      lastMessageId: "message-1",
      lastMessageAt: date("2026-06-05T10:00:00.000Z"),
      ...state,
    },
    settings: {
      notifications: "default",
      customTitle: null,
      ...settings,
    },
  };
}

test("buildMessageVisibilityFilter adds lower bound after deletedAt", () => {
  const deletedAt = date("2026-06-05T09:00:00.000Z");

  assert.deepEqual(
    buildMessageVisibilityFilter(participant({ state: { deletedAt } })),
    { createdAt: { $gt: deletedAt } },
  );
});

test("buildMessageVisibilityFilter adds upper bound at leftAt", () => {
  const leftAt = date("2026-06-05T11:00:00.000Z");

  assert.deepEqual(
    buildMessageVisibilityFilter(participant({ leftAt })),
    { createdAt: { $lte: leftAt } },
  );
});

test("buildMessageVisibilityFilter combines deletedAt and leftAt bounds", () => {
  const deletedAt = date("2026-06-05T09:00:00.000Z");
  const leftAt = date("2026-06-05T11:00:00.000Z");

  assert.deepEqual(
    buildMessageVisibilityFilter(participant({ leftAt, state: { deletedAt } })),
    { createdAt: { $gt: deletedAt, $lte: leftAt } },
  );
});

test("buildMessageVisibilityFilter adds lower bound at joinedAt for group chats", () => {
  const joinedAt = date("2026-06-05T10:00:00.000Z");

  assert.deepEqual(
    buildMessageVisibilityFilter(participant({ role: "member", joinedAt })),
    { createdAt: { $gte: joinedAt } }
  );
});

test("buildMessageVisibilityFilter takes max of deletedAt and joinedAt for group chats", () => {
  const joinedAt = date("2026-06-05T10:00:00.000Z");
  const deletedAt = date("2026-06-05T09:00:00.000Z");

  // joinedAt > deletedAt -> lấy joinedAt ($gt vì có deletedAt trước đó)
  assert.deepEqual(
    buildMessageVisibilityFilter(participant({ role: "member", joinedAt, state: { deletedAt } })),
    { createdAt: { $gt: joinedAt } }
  );

  const newDeletedAt = date("2026-06-05T11:00:00.000Z");
  // deletedAt > joinedAt -> lấy deletedAt
  assert.deepEqual(
    buildMessageVisibilityFilter(participant({ role: "member", joinedAt, state: { deletedAt: newDeletedAt } })),
    { createdAt: { $gt: newDeletedAt } }
  );
});

test("applySoftDeleteState nulls participant last message fields and resets unread", () => {
  const deletedAt = date("2026-06-05T12:00:00.000Z");

  assert.deepEqual(applySoftDeleteState(participant(), deletedAt), {
    $set: {
      "state.deletedAt": deletedAt,
      "state.lastMessageId": null,
      "state.lastMessageAt": null,
      "state.unreadCount": 0,
    },
  });
});

test("isSidebarVisible excludes archived conversations from default sidebar", () => {
  assert.equal(isSidebarVisible(participant()), true);
  assert.equal(
    isSidebarVisible(participant({ state: { archivedAt: date("2026-06-05T12:00:00.000Z") } })),
    false,
  );
});

test("isArchivedVisible includes archived conversations with lastMessageAt", () => {
  assert.equal(
    isArchivedVisible(participant({ state: { archivedAt: date("2026-06-05T12:00:00.000Z") } })),
    true,
  );
  assert.equal(
    isArchivedVisible(
      participant({
        state: {
          archivedAt: date("2026-06-05T12:00:00.000Z"),
          lastMessageAt: null,
        },
      }),
    ),
    false,
  );
});

test("muted conversations still allow unread increment but suppress notifications", () => {
  const muted = participant({
    state: { mutedUntil: date("2026-06-05T13:00:00.000Z") },
  });

  assert.equal(canIncrementUnreadForParticipant(muted, date("2026-06-05T12:30:00.000Z")), true);
  assert.deepEqual(getNotificationSuppressionState(muted, date("2026-06-05T12:30:00.000Z")), {
    suppressed: true,
    reason: "mutedUntil",
  });
  assert.deepEqual(
    getNotificationSuppressionState(participant({ settings: { notifications: "muted" } }), date("2026-06-05T12:30:00.000Z")),
    { suppressed: true, reason: "settings" },
  );
});

test("leftAt blocks unread increment after leave", () => {
  assert.equal(
    canIncrementUnreadForParticipant(
      participant({ leftAt: date("2026-06-05T11:00:00.000Z") }),
      date("2026-06-05T11:00:01.000Z"),
    ),
    false,
  );
});

test("deletedAt blocks unread increment for old hidden messages", () => {
  assert.equal(
    canIncrementUnreadForParticipant(
      participant({ state: { deletedAt: date("2026-06-05T11:00:00.000Z") } }),
      date("2026-06-05T11:00:00.000Z"),
    ),
    false,
  );
  assert.equal(
    canIncrementUnreadForParticipant(
      participant({ state: { deletedAt: date("2026-06-05T11:00:00.000Z") } }),
      date("2026-06-05T11:00:01.000Z"),
    ),
    true,
  );
});

test("direct conversations keep leftAt null readability simple", () => {
  assert.equal(isParticipantReadable(participant(), { kind: "direct" }), true);
  assert.equal(isParticipantReadable(null, { kind: "direct" }), false);
});

test("group readability allows active members and historical reads up to leftAt", () => {
  const leftAt = date("2026-06-05T11:00:00.000Z");

  assert.equal(isParticipantReadable(participant(), { kind: "group" }), true);
  assert.equal(
    isParticipantReadable(participant({ leftAt }), {
      kind: "group",
      messageCreatedAt: date("2026-06-05T10:59:59.000Z"),
    }),
    true,
  );
  assert.equal(
    isParticipantReadable(participant({ leftAt }), {
      kind: "group",
      messageCreatedAt: date("2026-06-05T11:00:01.000Z"),
    }),
    false,
  );
});

test("visibility helpers do not change Message schema", () => {
  const Message = require("../src/models/Message");
  const beforePaths = Object.keys(Message.schema.paths).sort();

  buildMessageVisibilityFilter(participant());
  applySoftDeleteState(participant(), new Date());

  assert.deepEqual(Object.keys(Message.schema.paths).sort(), beforePaths);
  assert.equal(Message.schema.path("conversationObjectId"), undefined);
});

