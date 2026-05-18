# Current Project Handoff

Last updated: 2026-05-18

## Scope

This handoff captures the current state after RabbitMQ hardening, the first socket architecture refactor slices, and the missed-message/sidebar unread fixes.

Recommended skills for next sessions:

- `diagnose` for bug reports and behavioral regressions.
- `tdd` for implementation slices.
- `improve-codebase-architecture` for the next architecture cleanup.

## Completed RabbitMQ Hardening

RabbitMQ is now treated as a background side-effect bus only. MongoDB remains the source of truth, Redis remains responsible for Socket.IO adapter traffic/presence/cache, and realtime chat delivery stays on the synchronous MongoDB + Socket.IO path.

Completed hardening summary:

- Queue topology covers primary, retry, and DLQ queues for image processing, notification email, and audit events.
- Publishers use confirm channels and persistent JSON messages.
- Workers use manual ack, retry queues, max-attempt DLQ routing, reconnect handling, and consumer re-registration after channel loss.
- Image jobs use MongoDB request idempotency around `requestId` and indexes.
- Queue API semantics were hardened so RabbitMQ outage does not silently corrupt primary state.
- Chat realtime delivery remains non-blocking when audit event publishing fails.

Primary reference:

- `docs/handoff-final-rabbitmq-hth4jl.md`
- `docs/adr/0001-rabbitmq-background-jobs.md`

## Completed Architecture Refactor

The first socket architecture refactor slice is complete:

- Server socket event constants were centralized.
- Realtime publisher helper functions were introduced so Socket.IO emits are less scattered.
- Frontend duplicate listener ownership was diagnosed.
- Legacy monolithic `useChatSocket.js` was removed after `rg "useChatSocket"` confirmed no active imports.
- Current frontend listener ownership is:
  - `useMessageSocket`: message receive/read/call-log message UI updates.
  - `useGroupSocket`: group lifecycle events.
  - `useFriendSocket`: friend request and presence-related user status updates.
  - `useTyping`: typing indicators.

This reduces the chance of accidentally registering duplicate Socket.IO listeners that double-apply UI updates.

## Missed Message / Sidebar Unread Fixes

### Refresh Case

Bug:

- After offline messages, a refresh could load missed messages while sidebar unread count stayed wrong.
- `GET /api/users/sidebar-list` calculated unread counts using a MongoDB aggregation `$match` with `receiver: currentUserId`.
- `Message.receiver` is an ObjectId.
- Mongoose aggregation does not auto-cast string ids to ObjectId.

Fix:

- `server/src/controllers/userController.js` imports `mongoose`.
- `getSidebarUsers` casts once with `new mongoose.Types.ObjectId(currentUserId)`.
- The sidebar unread aggregation now matches `receiver` using the ObjectId value.
- Response shape and sidebar logic were preserved.

### Reconnect Without Refresh Case

Bug:

- `SocketProvider` already synced missed messages on reconnect through `/api/messages/sync`.
- It dispatched the `window` CustomEvent `sync-message-recovered`.
- No hook consumed that event, so reconnect-without-refresh did not update the same UI state as realtime `getMessage`.

Fix:

- `client/src/features/chat/socket/useMessageSocket.js` now listens for `sync-message-recovered`.
- The handler safely reads `event.detail.messages`.
- Recovered messages are normalized and routed through the same unified message/sidebar update path used by realtime `getMessage`.
- Recovered messages dedupe by `_id` to avoid appending twice.
- Recovered batch messages suppress toast/audio to avoid notification spam.
- The window event listener is removed during hook cleanup.

Recovered messages now update:

- active chat message list when applicable,
- sidebar `lastMessage`,
- sidebar `hasUnread`,
- sidebar `unreadCount`.

## Verification Passed

Server:

- `npm.cmd test` from `server/` passed after the sidebar aggregation fix.
- Last observed server suite: 44 tests passed, 0 failed.

Client:

- `npm.cmd run build` from `client/` passed after removing `useChatSocket.js`.
- `npm.cmd run build` from `client/` passed after adding the `sync-message-recovered` listener.
- Vite only reported the existing large bundle warning.

Search checks:

- `rg "useChatSocket"` returned no active imports/usages after the cleanup.
- `rg "sync-message-recovered"` now shows one producer in `SocketProvider.jsx` and one consumer in `useMessageSocket.js`.

Manual smoke paths to keep using:

- Refresh case: user A offline, user B sends messages, user A refreshes/reconnects, sidebar shows latest/unread state.
- Reconnect-without-refresh case: user A remains on the app, goes offline, user B sends messages, user A comes online, sidebar and active chat update without refresh.
- Message basics: send message, mark read, verify unread clears.
- Realtime basics: typing indicator, group event if available, friend request notification if available.

## Current Known Risks

- There is no automated React hook test harness for `useMessageSocket`; client verification is currently build plus manual smoke testing.
- `useMessageSocket` is doing more work now because it handles both realtime messages and recovered sync messages.
- Recovered REST sync payloads are not identical to realtime Socket.IO payloads. The current fix normalizes group/direct state from `conversationId`.
- Group recovery assumes group sidebar entries are already present or can be fetched through the existing `fetchNewConversation` path.
- Call-log recovery should be smoke-tested separately if missed call-log UX is considered critical.
- RabbitMQ remaining ops risks are unchanged:
  - Docker Compose can still make backend startup depend on RabbitMQ health.
  - No DLQ inspection/replay tooling yet.
  - Password reset email jobs are not fully idempotent against crash-after-send.
  - Real-looking secrets in `.env` should be rotated and moved out of source control if shared.

## Next Recommended Slice

Recommended next architecture slice: extract message/sidebar update logic from `useMessageSocket` into a small pure helper or reducer-style module.

Goal:

- Keep `useMessageSocket` as the owner of message socket/custom-event subscriptions.
- Move deterministic state transition logic behind a small interface.
- Add focused tests for:
  - direct unread increment,
  - active-chat read behavior,
  - group sidebar preview,
  - recovered message dedupe by `_id`,
  - recovered batch suppressing notifications,
  - call-log preview/upsert behavior.

Keep this separate from behavior fixes. Use `improve-codebase-architecture` for the design pass, then `tdd` for the implementation slice.
