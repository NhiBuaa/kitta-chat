# Handoff — web-socket safe architecture cleanup

Date: 2026-05-20
Workspace: D:\Study\HK5\NodeJS\Midterm\web-socket
Suggested next skills: `diagnose` for bugs, `tdd` for safe fixes, `zoom-out` before any larger architecture work.

## Context

This session continued from a zoom-out architecture review of the realtime chat app. Main architecture rules preserved:

- MongoDB remains source of truth for durable state.
- Redis remains Socket.IO adapter + presence/cache layer.
- RabbitMQ remains background side-effect bus only.
- Socket.IO remains critical realtime path for messaging/calls/presence.
- Changes were intentionally small safe slices, test-driven where possible.

## Completed slices

1. Enforced Socket.IO auth identity for `addNewUser`
   - Problem: client-provided `addNewUser(userId)` could overwrite `socket.userId` from JWT.
   - Fix: `socket.userId` from JWT is authoritative; mismatched payload logs/rejects and does not join rooms.
   - Preserved multi-tab presence behavior.

2. Fixed `friendCacheService` missing `updateConversationRemove` import
   - Problem: unfriend path called `updateConversationRemove` without importing it.
   - Fix: added the missing import from `conversationCacheService`.

3. Fixed duplicate message retry detection
   - Problem: `saveMessageInBackground` forced `isDuplicate = false`, so retries could publish audit jobs again.
   - Fix: `findOneAndUpdate` now uses `includeResultMetadata: true`; `lastErrorObject.updatedExisting` drives `isDuplicate`.
   - Preserved callback shape: `{ success, realId, isDuplicate }`.

4. Made Socket.IO Redis adapter readiness explicit at startup
   - Problem: `initSocket` returned before Redis adapter connection/attachment completed.
   - Fix: `initSocket` is async and resolves only after Redis pub/sub clients connect and adapter attaches.
   - `server.listen` now awaits `initSocket`; Redis adapter failure rejects startup chain and fails fast.

5. Fixed stale frontend online display after offline
   - Problem: `checkIsOnline` trusted cached `activityStatus.active/online`, making offline users look online.
   - Fix: extracted `presenceState.js`; online display now trusts realtime `onlineUsers` only.
   - `UserStatus`, `Sidebar`, and `ChatWindow` already use `checkIsOnline`, so no UI component refactor needed.

6. Hydrated friend presence after accepting friend request
   - Problem: after A/B become friends, `onlineUsers` may not include the new friend because they were not friends during initial `getOnlineFriends` fetch.
   - Fix: after friendship write-through, backend reads current presence for sender/receiver and emits `userStatusChanged` online to the opposite user room when appropriate.
   - Offline users are not marked online.

## Files changed

Client:

- `client/package.json`
  - Includes `presenceState.test.js` in `npm test`.
- `client/src/features/profile/hooks/usePresence.js`
  - Delegates online check to `isUserOnline`.
- `client/src/features/profile/hooks/presenceState.js`
  - New pure helper for realtime-authoritative online detection.
- `client/src/features/profile/hooks/presenceState.test.js`
  - New tests for realtime online detection and stale activityStatus protection.

Server:

- `server/server.js`
  - Awaits async `initSocket` before `server.listen`.
  - Startup catch message made generic (`[Server] Startup Error`) because failures can now be Redis adapter as well as Mongo.
- `server/src/socket/index.js`
  - `initSocket` is async; awaits Redis adapter readiness; throws on Redis connection failure instead of calling `process.exit` inside socket module.
- `server/src/socket/handlers/presenceHandler.js`
  - Rejects `addNewUser` payload mismatches with JWT `socket.userId`.
- `server/src/services/friendCacheService.js`
  - Imports `updateConversationRemove`.
- `server/src/utils/saveMessageInBackground.js`
  - Uses Mongo result metadata to detect duplicate idempotent retries.
- `server/src/controllers/userController.js`
  - Imports `getUserPresence` and emits current online presence after accept-friend.

New server tests:

- `server/test/presenceHandlerAuth.test.js`
- `server/test/friendCacheService.test.js`
- `server/test/saveMessageInBackground.test.js`
- `server/test/socketInitReadiness.test.js`
- `server/test/acceptFriendPresence.test.js`

Updated server tests:

- `server/test/messageCreatedJobs.test.js`
  - Added duplicate retry/audit suppression coverage.

## Tests run and results

Server targeted tests:

- `npm.cmd test -- --test-name-pattern "addNewUser"` → pass, 17/17.
- `node --test test/friendCacheService.test.js` → pass, 1/1.
- `node --test test/messageCreatedJobs.test.js test/saveMessageInBackground.test.js` → pass, 8/8.
- `node --test test/socketInitReadiness.test.js` → pass, 2/2.
- `node --test test/acceptFriendPresence.test.js` → pass, 3/3.

Server regression:

- `npm.cmd test` after final backend change → pass, 61/61.

Client targeted/regression:

- `node --test src/features/profile/hooks/presenceState.test.js` → pass, 4/4.
- `npm.cmd test` → pass, 15/15.
- `npm.cmd run build` → pass.
  - Vite emitted existing chunk-size warning (>500 kB), unrelated to these changes.

## Manual test results

Continuation on 2026-05-20:

- Ran `docker compose -f docker-compose.yml up -d --build` so the stack used the
  main compose file with 3 healthy backend replicas behind nginx.
- Ran a scripted two-user smoke through `http://localhost` using REST auth,
  REST friend request/accept, and Socket.IO websocket-only clients.
- Presence passed:
  - A and B registered/logged in.
  - A and B connected sockets and emitted `addNewUser`.
  - A sent friend request, B accepted while both were online.
  - A received `friendRequestAccepted` and B `userStatusChanged: online`.
  - `GET /api/users/online-friends` for A included B.
  - B disconnected, grace period elapsed, A received B
    `userStatusChanged: offline`.
  - `GET /api/users/online-friends` for A no longer included B.
- Call smoke passed:
  - B reconnected.
  - A emitted `initCall` with a temp call id.
  - A emitted `callUser`.
  - B received `callUser` with real DB call id.
  - B emitted `rejectCall` with `reason: "busy"`.
  - A received `callRejected`.
  - A received `callLogMessage` with `callData.status: "busy"`.
  - Waited past the call timeout window and found no duplicate/missed call log
    or timeout error in backend logs.
- Backend logs showed all three backend replicas healthy and Redis adapter ready.
  The call path crossed backend processes; `rejectCall` logged
  `timeoutCancelled: false`, which is expected with current process-local
  timeout state when another replica owns the timer. It did not cause a
  duplicate call log because MongoDB status had already moved from `pending` to
  `busy`.

CallHistoryModal duplicate UI fix on 2026-05-20:

- Bug: after A called B and B rejected, MongoDB correctly contained only one
  `CallHistory` and one `call_log`, but opening call history from the sidebar
  could show the same call history item twice.
- Root cause: frontend-only duplication in `CallHistoryModal`. A reset fetch
  and pagination fetch could overlap via rapid open/double click, React
  StrictMode, or immediate `IntersectionObserver` trigger. The modal appended
  fetched pages with `[...prev, ...newCalls]` and did not dedupe by `_id`.
- Fix:
  - Added `client/src/features/calls/components/callHistoryState.js` with a pure
    `mergeCallHistoryPage` helper.
  - Reset fetch now replaces with a deduped response.
  - Pagination fetch now appends only unseen calls.
  - `CallHistoryModal` now uses ref-based fetch guards to avoid stale
    `isLoading` races, ignore stale responses, block pagination while reset is
    in flight, and skip pagination when there is no cursor and no existing
    calls.
- Tests/build:
  - Added `client/src/features/calls/components/callHistoryState.test.js`.
  - `node --test src/features/calls/components/callHistoryState.test.js src/features/chat/socket/messageSocketState.test.js`
    → pass, 14/14.
  - `npm.cmd test` in `client/` → pass, 20/20.
  - `npm.cmd run build` in `client/` → pass; existing Vite chunk-size warning
    remains unrelated.
- Manual test: rapid open/double click on sidebar call history no longer
  duplicates call history items.

Sidebar unread badge dedupe fix on 2026-05-20:

- Bug: after B was offline and missed one call, then logged in through the SPA,
  the chat/conversation row badge for A sometimes became `2` even though MongoDB
  contained exactly one `CallHistory` and one `call_log`.
- The call-history icon badge was already fixed separately and remained correct.
- Root cause: `/api/users/sidebar-list` hydrated the sidebar row with
  `unreadCount: 1`, but its `lastMessage` payload lacked stable identifiers.
  When `SocketProvider` reconnect sync replayed the same `call_log`,
  `useMessageSocket` treated it as a new incremental event because
  `lastMessage.messageId` / `lastMessage.callHistoryId` were missing, so the
  frontend incremented the row unread count to `2`.
- Fix:
  - `server/src/controllers/userController.js` now builds sidebar `lastMessage`
    through `buildSidebarLastMessage`.
  - Sidebar `lastMessage` now includes `messageId` for all latest messages.
  - Sidebar `lastMessage` now includes `callHistoryId` when the latest message is
    a `call_log`.
  - Existing frontend dedupe in `messageSocketState.updateListWithMessagePreview`
    can now recognize recovered duplicate messages/call logs and keep
    `unreadCount` at `1`.
- Tests/build:
  - Added `server/test/sidebarLastMessage.test.js`.
  - Added client regression coverage in
    `client/src/features/chat/socket/messageSocketState.test.js` for hydrated
    `messageId` and `callHistoryId` dedupe.
  - Targeted server: `node --test test/sidebarLastMessage.test.js` → pass, 3/3.
  - Targeted client:
    `node --test src/features/chat/socket/messageSocketState.test.js` → pass,
    11/11.
  - Full client: `npm.cmd test` → pass, 40/40.
  - Full server: `npm.cmd test` → pass, 82/82.
  - Client build: `npm.cmd run build` → pass; existing Vite chunk-size warning
    remains unrelated.
- Manual test passed: B offline/logout → A calls B → missed timeout creates one
  missed call → B SPA login without browser refresh. The call-history icon badge
  shows `1`, the chat row badge stays `1` rather than becoming `2`, and DB still
  has exactly one `CallHistory` and one `call_log`.

Call media-state sync fix on 2026-05-20:

- Bug: in a call where A turned off mic/camera before or while B joined, B did
  not see A's current mic/camera off state after joining. A could see B's
  mic/camera off state because B's `answerCall` payload already sent B's
  current media state through `callAccepted`.
- Root cause: `toggleMedia` was live-only. If A toggled before B's call window
  joined or its listener was ready, B missed that realtime update. A's current
  media state was not replayed after `callAccepted`.
- Fix:
  - Added `client/src/features/calls/context/callMediaState.js` with pure
    helpers to derive media status from actual local stream tracks, send a
    `toggleMedia` snapshot, and persist partner media status.
  - `client/src/features/calls/context/useCallActions.js` now sends the caller's
    current local media-state snapshot to the callee immediately after the
    caller receives `callAccepted`, using the existing `toggleMedia` event and
    payload shape.
  - `client/src/features/calls/context/useSocketEvents.js` now persists
    `updateMediaStatus` into `tempCallerMediaStatus` so a newly opened incoming
    call window hydrates from the freshest known caller state.
- Tests/build:
  - Added `client/src/features/calls/context/callMediaState.test.js`.
  - Added the new test file to `client/package.json` `npm test`.
  - Targeted client:
    `node --test src/features/calls/context/callMediaState.test.js` → pass,
    5/5.
  - Full client: `npm.cmd test` → pass, 45/45.
  - Client build: `npm.cmd run build` → pass; existing Vite chunk-size warning
    remains unrelated.
- Manual tests passed: both users toggling mic/camera off before join now see
  each other's off state after join; toggling mic/camera back on/off during the
  connected call still updates both sides through the existing live
  `toggleMedia` path.

Stale local timeout safety fix on 2026-05-20:

- Bug: in Docker/nginx multi-backend replicas, an answered call could later be
  marked `missed` / `Đã bỏ lỡ` by a stale local `setTimeout` running in another
  backend process.
- Root cause: `answerCall` removed Redis timeout metadata and attempted to clear
  `activeTimeouts` only in the backend process that handled `answerCall`.
  If `initCall` or `callUser` created the local timer in another backend
  process, that process-local timer kept running. The old timeout callback
  updated `{ _id, status: "pending" }` to `missed`, while `answerCall` had only
  set `answeredAt`, leaving `status` as `pending`.
- Fix:
  - `server/src/socket/handlers/call/handlers/initCall.js` timeout callback now
    uses `finalizeCallOnce({ status: "missed", requireUnanswered: true,
    activeStatuses: ["pending"] })`.
  - `server/src/socket/handlers/call/handlers/callUser.js` timeout callback now
    uses the same Mongo-gated finalization.
  - Timeout side effects (`callHistorySync`, `callLogMessage`, `callTimeout`)
    run only when `finalizeCallOnce` actually finalizes the call.
  - If the call was already answered or finalized, the stale local timeout logs a
    no-op and does not create a `call_log` or emit timeout events.
  - Redis due cleanup remains best-effort metadata cleanup; local
    `activeTimeouts` remains active but is no longer a correctness gate.
- Tests:
  - Added/updated `server/test/callTimeoutDueHandlers.test.js` coverage for:
    - `initCall` stale timeout after answer does not mark missed.
    - `callUser` stale timeout after cross-replica answer no-ops.
    - unanswered pending local timeout still marks missed and emits side effects
      exactly once.
  - Targeted timeout test: `node --test test/callTimeoutDueHandlers.test.js` →
    pass, 7/7.
  - Targeted call regression:
    `node --test test/callTimeoutDueHandlers.test.js test/callTimeoutDueStore.test.js test/callFinalizer.test.js test/rejectCallSemantics.test.js test/endCallFinalizer.test.js`
    → pass, 28/28.
  - Full server regression: `npm.cmd test` in `server/` → pass, 99/99.
- Manual smoke passed: A calls B through Docker/nginx 3 replicas, B accepts and
  both enter the call, waiting beyond the timeout window no longer changes the
  answered call to missed. Offline/unanswered receiver timeout still creates one
  missed call and one `call_log`.

Suggested browser/manual smoke test still worth doing for UI rendering and media
permission behavior:

1. Login A and B in separate browser profiles.
2. Verify B online appears as `Đang hoạt động` for A once they are friends.
3. Close B tab completely, wait 6–10s.
4. Confirm A no longer sees `Đang hoạt động`.
5. Re-open B, confirm A receives online state again.
6. Friend request flow: A sends request, B accepts while online, A should immediately see B as `Đang hoạt động`.
7. Check backend logs for `disconnect`, `confirmedOffline`, and `userStatusChanged` behavior.
8. Optional Redis checks: `user_sockets:{B}`, `presence:{B}`, `offline_timer:{B}`.
9. Optional Mongo check: `User.activityStatus` moves to offline after real disconnect.

## Remaining zoom-out risks

Highest remaining risk:

- Call flow still uses process-local state in `server/src/socket/handlers/call/state.js`:
  - `activeTimeouts`
  - `activeSocketCalls`
  - `tempIdToDbId`
  - `callRateLimit`
- This is risky under Docker multi-backend replicas. If `initCall`, `callUser`, `answer`, `reject`, `end`, or disconnect land on different backend processes, local maps can diverge.

Other remaining risks:

- Nginx/load balancing for WebSocket and REST multi-replica behavior should be smoke-tested in Docker.
- Presence/offline flow is improved but should be manually tested with real browser tab close and Redis inspection.
- REST controllers still directly emit Socket.IO events; acceptable for now but boundary is not very clean.
- `SocketProvider` has complex lifecycle/state coupling; avoid broad refactor without browser-level tests.
- `UserStatus` still falls back to `activityStatus` if no `isOnline` prop is passed. Current chat/sidebar paths pass `isOnline`, but future use sites should be careful.

## Next recommended task

Recommended next task: perform the manual multi-user presence smoke test and fix only issues proven by that test.

If continuing code cleanup, safest next slice:

- Add a small frontend test/helper for `SocketProvider` onlineUsers reducer behavior, or extract the `userStatusChanged` onlineUsers update into a pure helper and test:
  - online adds user once
  - offline removes user
  - userId string/object mismatch is normalized

Do not start call-state refactor yet.

## Warning: do not refactor call state yet

Do not move call state to Redis or redesign call flow without a separate design + tests. Before touching call state, create tests for:

- temp call id → DB id mapping across handler boundaries
- timeout finalize exactly once
- answer/reject/end after timeout
- disconnect finalization
- call_log upsert uniqueness
- multi-replica simulation where events are handled by different process-local handler instances

Use `zoom-out` or a short ADR before any call-state architecture change.
