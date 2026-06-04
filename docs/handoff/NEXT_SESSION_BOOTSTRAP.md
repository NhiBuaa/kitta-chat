# Conversation Read Model — Next Session Bootstrap

This handoff captures the approved state after the Conversation Read Model ADR discussion. The next session should start from here and implement only the approved first slice: models and indexes.

## Suggested Skills

- `handoff` if this file needs to be compacted again after new decisions.
- `tdd` if the next session begins implementation of Slice 1 with tests first.
- `diagnose` only if existing tests or model index behavior fail unexpectedly.
- `grill-with-docs` only if a new architectural decision is proposed beyond the approved Slice 1 scope.

## Current Stabilized Architecture

### MongoDB Canonical Ownership

- MongoDB remains the source of truth for durable application state.
- `Message.conversationId` is currently the stable conversation key.
- Direct `conversationId` values are sorted user IDs joined with `_`.
- Group `conversationId` values are the `Group._id` string.
- No `Conversation` collection exists yet.
- Current chat, call, friend, unfriend, and group behavior is stable and must not be disturbed by the first migration slice.

### Redis Coordination And Cache Role

- Redis is coordination/cache infrastructure, not durable source of truth.
- Socket.IO uses the Redis adapter for multi-node realtime delivery.
- Presence uses Redis online-user state and socket/user bindings.
- Conversation/sidebar recency uses Redis sorted sets keyed by user, with legacy conversation IDs as values.
- Recent message/sidebar cache may be rebuilt from MongoDB.

### RabbitMQ Background-Only Role

- RabbitMQ is background-only.
- It must not become part of synchronous message delivery, conversation access control, or sidebar correctness.
- Background jobs may observe `conversationId`, but the migration should keep legacy IDs compatible.

### Socket.IO Realtime Invariants

- Socket rooms and public realtime payloads continue using legacy `conversationId` during early migration phases.
- `Conversation._id` is backend-internal only in early phases.
- Message delivery must remain stable if conversation read-model writes fail while feature flags are disabled or in early dual-write phases.
- Redis adapter connectivity is a core Socket.IO dependency.

## Call Architecture State

### `finalizeCallOnce`

- Call finalization is centralized through `finalizeCallOnce`.
- Reject, end, timeout, and disconnect paths should converge through this idempotent finalizer.
- Finalization is responsible for preventing duplicate terminal updates and duplicate call-log side effects.

### Reject/End/Timeout/Disconnect Behavior

- Reject and end handlers finalize the call explicitly.
- Timeout finalization handles unanswered or stale calls.
- Disconnect cleanup must not create competing terminal states.
- Call-log message creation remains tied to finalized call state and still uses legacy `conversationId`.

### Distributed Timeout Finalizer

- A distributed timeout finalizer scans Redis timeout due state and finalizes due calls.
- Redis lock/failure paths are logged and should be safe to retry.
- This supports multi-node timeout correctness.

### `activeTimeouts` Fallback

- In-process `activeTimeouts` remains a local fallback for timeout behavior.
- It is not the distributed source of truth.
- It should be cleaned when calls finalize to avoid stale timers.

### Redis Socket/User Bindings

- Redis maintains socket/user/call bindings used by presence and call coordination.
- These bindings support resolving users/sockets across nodes.
- They remain separate from durable call history in MongoDB.

## Unfriend Architecture State

### Backend `remove-friend`

- Backend remove-friend updates both users' friendship state and Redis friend cache.
- It emits `friendRemoved` to both users.
- It checks whether a direct conversation has messages to decide UI preservation semantics.

### Frontend `friendRemoved` Flow

- Frontend listens for `friendRemoved` socket events.
- If message history exists, the sidebar row is preserved as a non-friend conversation.
- If no message history exists, the friend-only sidebar row can be removed.
- Active chat and search state are updated safely without treating groups as direct friend conversations.

### History Preservation Semantics

- Unfriending does not delete message history.
- Unfriending does not delete call history.
- Unfriending does not remove future `ConversationParticipant` rows.
- Existing direct conversation access is controlled by conversation participation, not current friendship state.
- Friendship remains scoped to friend lists, friend requests, friend-only UI, and possible future chat-initiation policy.

## Conversation Read Model ADR — Approved

### Chosen Direction

- Add `Conversation` and `ConversationParticipant` collections.
- Keep `Message.conversationId` unchanged during migration.
- Keep `legacyConversationId` as the public/socket/cache bridge.
- Keep `Conversation._id` internal backend-only in early phases.
- Do not migrate Friendship/User friend state, Group membership ownership, Message attachments, Call participants, or the `Message` schema yet.

### `Conversation` Schema

```js
Conversation {
  _id: ObjectId,

  kind: "direct" | "group",

  legacyConversationId: String,
  directKey: String | null,
  groupId: ObjectId | null,

  participantUserIds: [ObjectId],

  lastMessageId: ObjectId | null,
  lastMessageAt: Date | null,

  createdAt: Date,
  updatedAt: Date
}
```

Schema rules:

- `legacyConversationId` is the public/socket/cache bridge.
- `directKey` is required for direct conversations and equals the normalized sorted user-id pair.
- `groupId` is set only for group conversations.
- `participantUserIds` is a denormalized helper only, not canonical membership.
- `Conversation.lastMessageId/lastMessageAt` represent global latest message for reconciliation, analytics, administration, and repair jobs.
- `Conversation.search` is deferred to a later search-metadata slice.

### `ConversationParticipant` Schema

```js
ConversationParticipant {
  _id: ObjectId,

  conversationId: ObjectId,
  legacyConversationId: String,
  userId: ObjectId,

  role: "member" | "admin" | "owner" | null,

  joinedAt: Date,
  leftAt: Date | null,

  state: {
    pinnedAt: Date | null,
    archivedAt: Date | null,
    mutedUntil: Date | null,
    deletedAt: Date | null,

    lastReadMessageId: ObjectId | null,
    lastReadAt: Date | null,

    unreadCount: Number,

    lastMessageId: ObjectId | null,
    lastMessageAt: Date | null
  },

  settings: {
    notifications: "default" | "muted",
    customTitle: String | null
  },

  createdAt: Date,
  updatedAt: Date
}
```

Schema rules:

- `ConversationParticipant` is canonical for conversation access, unread state, mute/archive state, soft-delete state, and participant-level last-message state.
- `state.lastMessageId/lastMessageAt` represent the latest message visible to that participant.
- Sidebar sorting uses participant-level `state.lastMessageAt`.
- Sidebar preview uses participant-level `state.lastMessageId`.
- `leftAt` is meaningful only for group conversations; direct conversations keep `leftAt = null`.

### Approved Indexes

```js
// Conversation
{ legacyConversationId: 1 } unique
{ kind: 1, directKey: 1 } unique sparse
{ groupId: 1 } unique sparse
{ participantUserIds: 1, lastMessageAt: -1 }
{ kind: 1, lastMessageAt: -1 }

// ConversationParticipant
{ conversationId: 1, userId: 1 } unique
{ legacyConversationId: 1, userId: 1 }
{ userId: 1, leftAt: 1, "state.deletedAt": 1 }
{ userId: 1, "state.archivedAt": 1, "state.pinnedAt": -1, "state.lastMessageAt": -1 }
{ userId: 1, "state.unreadCount": -1 }
{ conversationId: 1, leftAt: 1 }
```

### `deletedAt` Semantics

- `deletedAt` is a per-user soft-delete watermark, not membership removal.
- Messages created at or before `deletedAt` are hidden for that user.
- Messages created after `deletedAt` are visible.
- `deletedAt` is kept as a historical watermark and is not automatically cleared.
- When `deletedAt` is set:
  - `state.lastMessageId = null`
  - `state.lastMessageAt = null`
  - `state.unreadCount = 0`
- A new visible message after `deletedAt` repopulates participant-level last-message fields and restores sidebar visibility.
- Hard delete is out of scope.

### `archivedAt` Semantics

- `archivedAt` excludes a conversation from the default sidebar only.
- Archived conversations remain readable and searchable.
- Archived conversations retain unread count.
- Archived conversations appear through an explicit archived view/filter.
- New messages do not clear `archivedAt`.
- Restore/unarchive is an explicit user action.

### Muted Semantics

- Muted conversations still increment `unreadCount`.
- Muted conversations still update participant-level `lastMessageId/lastMessageAt`.
- Mute only suppresses notifications and alert delivery.
- Muting must never mark messages read.
- Notification logic consults `mutedUntil/settings.notifications`, not `unreadCount`.

### Unread Semantics

- `state.unreadCount` is denormalized visible unread count.
- Sidebar must use `state.unreadCount` and must not compute unread with `countDocuments` or aggregation in the hot path.
- Setting `deletedAt` resets `unreadCount` to `0`.
- Hidden messages must never contribute to unread count.
- Only messages visible to the user can increment unread count.
- Unread increments only after `Message` insert is confirmed non-duplicate.

### Participant-Level Last Message Fields

- `Conversation.lastMessageId/lastMessageAt` are global latest-message fields.
- `ConversationParticipant.state.lastMessageId/lastMessageAt` are user-visible latest-message fields.
- Hot-path sidebar rendering must not filter global conversation state.
- `deletedAt` and group `leftAt` visibility rules apply when maintaining participant-level fields.

### Friendship Boundary

- Conversation access is controlled by `ConversationParticipant`, not current friendship state.
- Existing direct conversations remain readable and searchable after unfriend if participant rows exist.
- Unfriending does not remove participants, message history, call history, unread state, archive state, mute state, or soft-delete state.
- Friendship controls friend lists, friend requests, friend-only UI, and future friend-gated chat initiation rules.

### Group `leftAt` Boundary

- `leftAt` is reserved for group membership lifecycle only.
- Former group members may read/search historical messages only up to `leftAt`.
- Message/search queries for former group members must apply `Message.createdAt <= leftAt`.
- New message delivery and unread increments must ignore `leftAt != null` participants.
- Sidebar excludes `leftAt != null` participants from active conversation lists.

### `Group.members` Ownership

- During migration, `Group.members` remains canonical for group membership writes.
- Existing group flows continue using `Group.members`.
- `ConversationParticipant` mirrors membership for the conversation read model.
- Adding a group member ensures a corresponding `ConversationParticipant` exists.
- Removing/leaving a group sets `ConversationParticipant.leftAt`.
- `Group.members` remains responsible for membership ownership, permissions, admin/owner checks, and existing group management flows.
- Migrating group membership ownership requires a future ADR.

### Feature Flags

All conversation migration flags default to false:

```env
CONVERSATION_DUAL_WRITE_ENABLED=false
CONVERSATION_READ_MODEL_ENABLED=false
CONVERSATION_SHADOW_COMPARE_ENABLED=false
```

### Rollout Phases

1. **Models And Flags**: Add models/services behind disabled-by-default flags.
2. **Dry-Run Backfill**: Scan legacy messages/groups, validate candidates, and report creates/updates/skips without writes.
3. **Backfill Write**: Create missing `Conversation` and `ConversationParticipant` rows idempotently.
4. **Dual-Write**: Enable `CONVERSATION_DUAL_WRITE_ENABLED`; confirmed non-duplicate message inserts update conversation state.
5. **Shadow Compare**: Enable `CONVERSATION_SHADOW_COMPARE_ENABLED`; keep legacy sidebar authoritative while comparing read-model output.
6. **Sidebar Read Model**: Enable `CONVERSATION_READ_MODEL_ENABLED`; sidebar reads from `ConversationParticipant` with legacy fallback.
7. **Search Guard Integration**: Search resolves authorized participant rows before querying `Message`.
8. **Future ADRs**: Decide later whether to add `Message.conversationObjectId`, migrate Redis keys, expose `Conversation._id`, add search metadata, or migrate group membership ownership.

## Current Approved Next Step

### Slice 1: Models And Indexes Only

Implement only:

- `Conversation` model.
- `ConversationParticipant` model.
- Approved indexes.
- Model/index tests if the existing test style supports them.
- Disabled-by-default feature flag definitions only if needed for model-level configuration visibility.

Do not implement Slice 2 or Slice 3 yet.

Future slices:

- **Slice 2**: `ensureConversationForConfirmedMessage` service.
- **Slice 3**: visibility/access helpers for `deletedAt`, `leftAt`, and search guards.

## Explicit Constraints For Next Session

- No runtime behavior changes.
- No dual-write.
- No sidebar migration.
- No search implementation.
- No backfill execution.
- No feature flag activation.
- Do not rewrite `Message` schema.
- Do not expose `Conversation._id` to clients.
- Do not migrate Friendship/User friend state.
- Do not migrate `Group.members` ownership.
- Do not migrate Message attachments or Call participants.

## Expected First Prompt For Next Session

Use the `tdd` skill. Implement Conversation Read Model Slice 1 only: add `Conversation` and `ConversationParticipant` Mongoose models with the approved schemas and indexes from `docs/handoff/NEXT_SESSION_BOOTSTRAP.md`. Do not change runtime behavior, do not enable feature flags, do not add dual-write, do not migrate sidebar/search/backfill, and do not touch `Message` behavior.

## Startup Instructions For The Next Agent

1. Read this file first.
2. Inspect existing model style in `server/src/models/Message.js`, `server/src/models/Group.js`, and `server/src/models/User.js`.
3. Check for any applicable `AGENTS.md` before editing files.
4. Implement only Slice 1 models and indexes.
5. Run the narrowest relevant model/test command available; if none exists, report that validation was limited to code inspection.
