# Current Project Handoff

Last updated: 2026-05-18

## Scope

This handoff captures the current state of the `web-socket` project after RabbitMQ hardening, secrets cleanup, socket architecture slices, missed-message/sidebar unread fixes, and group sidebar preview/unread fixes.

Recommended skills for next sessions:

- `diagnose` for bug reports and behavioral regressions.
- `tdd` for implementation slices.
- `zoom-out` when re-orienting around socket lifecycle or feature ownership.
- `improve-codebase-architecture` for the next architecture cleanup.

## Completed RabbitMQ Hardening

RabbitMQ is a background side-effect bus only. MongoDB remains the source of truth, Redis remains responsible for Socket.IO adapter traffic/presence/cache, and realtime chat delivery stays on the synchronous MongoDB + Socket.IO path.

Completed:

- Queue topology for image processing, notification email, and audit events, including primary, retry, and DLQ queues.
- Confirm-channel publishers with persistent JSON messages.
- Workers with manual ack, retry queues, max-attempt DLQ routing, reconnect handling, and consumer re-registration after channel loss.
- Image job idempotency using MongoDB `requestId`/indexes.
- API semantics for RabbitMQ outage so primary state is not silently corrupted.
- Realtime chat delivery remains non-blocking if audit event publishing fails.

Primary references:

- `docs/handoff-final-rabbitmq-hth4jl.md`
- `docs/adr/0001-rabbitmq-background-jobs.md`

## Completed Secrets Cleanup

Secrets cleanup is considered completed for the current handoff state.

Keep this invariant for future work:

- Do not introduce real credentials into tracked files.
- Keep environment-specific values in local `.env` files or deployment secret stores.
- Treat any old shared `.env` values as rotated if they were ever exposed outside the local machine.

## Completed Socket Architecture Refactor

Server-side:

- Socket event constants were centralized.
- Realtime publisher helpers were introduced so Socket.IO emits are less scattered.
- Event names and payload shapes were preserved.

Frontend:

- Duplicate listener ownership was diagnosed.
- Legacy monolithic `client/src/features/chat/socket/useChatSocket.js` was removed after `rg "useChatSocket"` confirmed no active imports.
- Current ownership:
  - `SocketProvider`: socket lifecycle, auth-bound connection, heartbeat, online users, `last_message_id`, missed-message sync dispatch, global file/avatar bridge events.
  - `useMessageSocket`: `getMessage`, read receipts, `callLogMessage`, `sync-message-recovered`, active message list, sidebar preview/unread state.
  - `useFriendSocket`: friend request and user status/presence patching.
  - `useGroupSocket`: group lifecycle events.
  - `useTyping`: typing indicators and typing emits.

## Missed Message / Sidebar Unread Fixes

### Refresh Case

Bug:

- After offline messages, a refresh could load missed messages while sidebar unread count stayed wrong.
- `GET /api/users/sidebar-list` calculated unread counts using aggregation `$match` with `receiver: currentUserId`.
- `Message.receiver` is an ObjectId.
- Mongoose aggregation does not auto-cast string ids to ObjectId.

Fix:

- `server/src/controllers/userController.js` imports `mongoose`.
- `getSidebarUsers` casts `currentUserId` with `new mongoose.Types.ObjectId(currentUserId)`.
- Sidebar unread aggregation matches `receiver` using the ObjectId value.
- Response shape and sidebar logic were preserved.

### Reconnect Without Refresh Case

Bug:

- `SocketProvider` already synced missed messages on reconnect through `/api/messages/sync`.
- It dispatched `window` CustomEvent `sync-message-recovered`.
- No hook consumed the event, so reconnect-without-refresh did not update the same UI state as realtime `getMessage`.

Fix:

- `client/src/features/chat/socket/useMessageSocket.js` listens for `sync-message-recovered`.
- The handler safely reads `event.detail.messages`.
- Recovered messages are normalized and routed through the same unified message/sidebar update path used by realtime `getMessage`.
- Recovered messages dedupe by `_id`.
- Recovered batch messages suppress toast/audio to avoid reconnect notification spam.
- Listener cleanup uses `window.removeEventListener`.

Recovered messages now update:

- active chat message list when applicable,
- sidebar `lastMessage`,
- sidebar `hasUnread`,
- sidebar `unreadCount`.

## Completed Frontend Socket Lifecycle Zoom-Out

The frontend lifecycle review confirmed:

- `SocketProvider` is responsible for lifecycle/global bridge work, not feature UI ownership.
- `useMessageSocket`, `useFriendSocket`, `useGroupSocket`, and `useTyping` now have clearer feature ownership.
- Dangerous duplicate listeners from legacy `useChatSocket` are gone.
- Remaining duplicate listeners are intentional or bounded:
  - `FriendRequestModal` also listens to `newFriendRequest` / `friendRequestHandled` for modal-local request list state.
  - `CallHistoryProvider` also listens to `callLogMessage` for missed-call badge fallback, while `useMessageSocket` owns inline chat call-log rendering.

## Completed Message/Sidebar Helper Extraction

The message/sidebar state calculation was extracted from `useMessageSocket` into:

- `client/src/features/chat/socket/messageSocketState.js`

Extracted pure helpers cover:

- recovered message normalization,
- attachment resolution,
- incoming chat message append and `_id` dedupe,
- call-log upsert by `_id` or `callHistoryId`,
- preview content generation,
- sidebar `lastMessage`, `hasUnread`, and `unreadCount` updates.

`useMessageSocket` still owns listener registration and side effects:

- socket listeners,
- `window` listener for `sync-message-recovered`,
- `markRead` emits,
- scroll handling,
- toast/audio notifications.

## Completed Group Sidebar Preview / Unread

Group sidebar preview/unread is now implemented for both realtime/reconnect and refresh/initial load.

### Slice A: Frontend Realtime / Reconnect

Completed:

- `client/src/features/chat/socket/messageSocketState.test.js` now covers group preview/unread helper behavior.
- `client/src/features/chat/socket/useMessageSocket.js` routes group `getMessage` and `sync-message-recovered` payloads through `setGroups`.
- Direct chat message handling still updates `setUsers`; group messages no longer try to update the direct user sidebar list.
- `client/src/components/layout/Sidebar.jsx` renders group `lastMessage`, timestamp, unread highlight, and unread badge.
- `client/src/features/chat/pages/ChatPage.jsx` clears group `hasUnread` / `unreadCount` locally when opening a group and emits group `markRead`.

### Slice B: Backend Refresh / Initial Load

Completed:

- `server/src/controllers/groupController.js` enriches `GET /api/groups` with:
  - `lastMessage`,
  - `hasUnread`,
  - `unreadCount`.
- Existing group response fields are preserved:
  - `_id`,
  - `name`,
  - `admin`,
  - `members`,
  - `avatar`,
  - `createdAt`,
  - `updatedAt`.
- Group unread state uses `Message.readBy` with MongoDB as source of truth.
- Messages sent by the current user are excluded from that user's unread count.
- System messages intentionally count as unread for group sidebar.

### System Message Consistency

Decision:

- Group system messages should count as unread.
- Examples include group rename, member add/remove/leave, admin transfer, and delete/disband events.

Completed:

- `GET /api/groups` unread aggregation no longer excludes `type: "system"`.
- Group `markRead` in `server/src/socket/handlers/messageHandler.js` now marks system messages read too.
- Group `markRead` uses `$addToSet` for `readBy` so duplicate mark-read emits are idempotent.
- Realtime system message payloads emitted from `server/src/controllers/groupController.js` now include:
  - `_id`,
  - `conversationId`,
  - `senderId`,
  - `sender`,
  - `receiverId`,
  - `receiver`,
  - `text`,
  - `type: "system"`,
  - `createdAt`,
  - `isGroup: true`.

Expected behavior:

- If user B renames a group or changes membership while user A is not viewing that group, user A's sidebar should immediately show the latest system message and increment unread.
- Refresh should preserve the same group `lastMessage` and unread count.
- Opening the group should clear unread and write user A into `readBy` for unread group messages, including system messages.
- Refresh after opening the group should keep unread cleared.

## Verification Passed

Server:

- `npm.cmd test` from `server/` passed after the sidebar aggregation fix.
- `npm.cmd test` from `server/` passed after group sidebar Slice B, system-message unread consistency, group mark-read, and realtime system payload fixes.
- Last observed server suite: 49 tests passed, 0 failed.

Client:

- `npm.cmd run build` from `client/` passed after removing `useChatSocket`.
- `npm.cmd run build` from `client/` passed after adding `sync-message-recovered` handling.
- `npm.cmd run build` from `client/` passed after extracting `messageSocketState.js`.
- `npm.cmd test` from `client/` passed with 9 focused `messageSocketState.js` tests.
- `npm.cmd run build` from `client/` passed after group sidebar Slice A and backend payload fixes.
- Vite only reported the existing large bundle warning.

Manual socket/sidebar checks passed or should remain the smoke checklist for this area:

- direct message updates sidebar preview,
- active chat does not incorrectly increment unread,
- inactive chat increments unread,
- recovered messages dedupe by `_id`,
- call-log messages do not duplicate inline call-log rows,
- reconnect without refresh updates active chat/sidebar state,
- refresh after offline messages shows sidebar unread state through `/api/users/sidebar-list`.
- group realtime messages update group sidebar preview/unread,
- recovered group messages update group sidebar preview/unread,
- `GET /api/groups` returns group `lastMessage`, `hasUnread`, and `unreadCount` after refresh,
- group system messages count as unread,
- opening a group marks system messages read through `readBy`,
- realtime group system message payload includes `_id`, `conversationId`, and `receiver` fields for stable sidebar updates.

Search checks:

- `rg "useChatSocket"` returns no active imports/usages.
- `rg "sync-message-recovered"` shows the producer in `SocketProvider.jsx` and the consumer in `useMessageSocket.js`.

## Current Known Risks

- Client has focused pure-helper tests for `messageSocketState.js`, but still has no dedicated React hook/component test harness for `useMessageSocket` or `Sidebar`.
- REST sync payloads and realtime Socket.IO payloads are not identical; `messageSocketState.js` normalizes recovered group/direct state from `conversationId`.
- `useMessageSocket` is lighter after helper extraction, but still owns several side effects and should remain watched for growth.
- Group sidebar state now exists in both realtime frontend state and `GET /api/groups`; future changes should keep realtime payloads and refresh payloads aligned.
- `FriendRequestModal` can still update modal-local request state while `useFriendSocket` updates global request count/state; this is intentional but worth testing around modal open/close.
- `CallHistoryProvider` and `useMessageSocket` both listen to `callLogMessage` for different ownership concerns; current dedupe/upsert paths reduce duplicate UI risk, but missed-call UX should still be smoke-tested.
- RabbitMQ ops risks remain:
  - no DLQ inspection/replay tooling yet,
  - password reset email jobs may duplicate after crash-after-send,
  - queue health checks can create connection/log noise during RabbitMQ outage.

## Next Recommended Slice

Next slice: manual end-to-end smoke test of group sidebar unread behavior with two real users and then capture any remaining drift as a small targeted test/fix.

Suggested smoke checklist:

- user B sends normal group message while user A is not viewing that group,
- user B performs a group system action such as rename or add/remove member,
- user A sees group `lastMessage` and unread badge update immediately,
- user A refreshes and sees the same group `lastMessage` / unread count,
- user A opens the group and unread clears,
- user A refreshes and unread remains cleared.

After that, consider a React-level test harness for `useMessageSocket` / `Sidebar` or a small cleanup of friend request modal/global ownership if manual testing shows `requestCount` drift while the modal is open.
