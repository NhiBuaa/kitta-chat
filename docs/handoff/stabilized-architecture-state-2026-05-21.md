# Handoff — Stabilized Architecture State

Date: 2026-05-21
Workspace: `D:\Study\HK5\NodeJS\Midterm\web-socket`
Suggested next skills: `diagnose` for bugs, `tdd` for implementation slices, `grill-with-docs` for architecture decisions, `handoff` before context switch.

## Current Architecture Contract

This repo is a KittaChat-style realtime chat/call app with React/Vite client, Express/Socket.IO server, MongoDB, Redis, RabbitMQ, nginx, and Docker Compose.

The stabilized call architecture now follows these ownership rules:

- MongoDB is the canonical durable source of truth.
- Redis is coordination/cache/presence only.
- RabbitMQ is background-only and must not participate in realtime call lifecycle decisions.
- Socket.IO is the synchronous realtime path for signaling, call UI cleanup, message delivery, presence, and call-history notifications.
- Local process state still exists for compatibility/fallback, but correctness must be gated by MongoDB conditional updates.

## Durable Ownership

MongoDB owns durable call lifecycle data:

- `CallHistory.status`
- `CallHistory.startedAt`
- `CallHistory.answeredAt`
- `CallHistory.endedAt`
- `CallHistory.duration`
- `CallHistory.endedBy`
- `CallHistory.callerId`
- `CallHistory.receiverId`
- `CallHistory.conversationId`
- `CallHistory.readBy`

MongoDB also owns durable message/call-log uniqueness:

- `Message` type `call_log`
- Unique/upsert semantics through `callData.callHistoryId`
- Idempotent message retry through `idempotencyKey`

Do not move durable call records into Redis.

## Redis Role

Redis is used for:

- Socket.IO adapter pub/sub across backend replicas.
- Presence/session/cache keys.
- Short-lived call coordination mirrors:
  - `call:temp:{tempCallId}` → `callHistoryId`, TTL 120s.
  - `call:timeouts` sorted set, score = timeout due timestamp.
  - `call:timeout:{callId}` debug/visibility key, TTL 180s.
  - `call:finalize-lock:{callId}` short lock for distributed timeout finalizer.
- Existing cache namespaces such as `presence:{userId}`, `user_sockets:{userId}`, `cache:user:{id}`, `cache:friends:{userId}`, `convs:{userId}`, `chat_history:{conversationId}`.

Redis keys must remain disposable and reconstructable from MongoDB or safely ignorable.

## RabbitMQ Role

RabbitMQ remains background-only:

- Audit/statistics jobs.
- Image/avatar processing jobs.
- Non-critical side effects.

RabbitMQ must not be used for:

- WebRTC call signaling.
- `initCall`, `callUser`, `answerCall`, `rejectCall`, `endCall`.
- Call timeout/finalization decisions.
- Presence correctness.
- Realtime UI cleanup.

## Socket.IO Realtime Invariants

Socket.IO remains the only realtime signaling path for calls:

- `initCall`
- `callUser`
- `answerCall`
- `rejectCall`
- `endCall`
- `toggleMedia`
- `callAccepted`
- `callRejected`
- `callEnded`
- `callTimeout`
- `callHistorySync`
- `callLogMessage`
- `updateMediaStatus`

Socket.IO identity is JWT-authoritative. `addNewUser` must not overwrite `socket.userId`.

Redis adapter readiness is explicit at startup: `initSocket` waits for Redis pub/sub adapter connection before `server.listen`.

## Call Finalization Architecture

`finalizeCallOnce` is the central Mongo-gated finalization service:

- File: `server/src/socket/handlers/call/services/callFinalizer.js`
- Gate:
  - `_id: callId`
  - `endedAt: null`
  - `status: { $in: activeStatuses }`
  - optional `answeredAt: null` when `requireUnanswered: true`
- Creates/upserts `call_log` only after the Mongo conditional update succeeds.
- Returns whether finalization happened now or the call was already finalized.

Correctness rule:

- Side effects (`callHistorySync`, `callLogMessage`, `callRejected`, `callEnded`, `callTimeout`) must run only when Mongo finalization succeeds now.
- Duplicate/replayed socket events should become no-ops, not second finalizations.

## Current Call Behavior

### `initCall`

- Creates pending `CallHistory`.
- Stores local `tempIdToDbId` fallback.
- Stores Redis temp mapping `call:temp:{tempCallId}` → `callHistoryId`, TTL 120s.
- Stores Redis timeout due metadata in `call:timeouts` and `call:timeout:{callId}`.
- Starts local `activeTimeouts` timer as fallback.
- Timeout callback now calls `finalizeCallOnce({ status: "missed", requireUnanswered: true, activeStatuses: ["pending"] })`.

### `callUser`

- Resolves `temp_*` ids via:
  - Redis `call:temp:{tempCallId}`
  - local `tempIdToDbId`
  - recent pending Mongo fallback
- Reuses the `CallHistory` created by `initCall` when possible.
- Creates fallback `CallHistory` if resolver misses.
- Stores Redis temp mapping when fallback creation happens.
- Stores Redis timeout due metadata and starts local timeout fallback.
- Timeout callback uses the same Mongo-gated `finalizeCallOnce` path with `requireUnanswered: true`.

### `answerCall`

- Sets `answeredAt`.
- Removes Redis timeout due metadata.
- Attempts local `activeTimeouts` cleanup only in the current process.
- Emits `callAccepted`.
- Correctness no longer depends on clearing the local timer because timeout finalization is Mongo-gated by `answeredAt: null`.

### `rejectCall`

- Uses `finalizeCallOnce`.
- Receiver reject / receiver pre-call cancel maps to `rejected`.
- Caller cancel before answer maps to `missed` via reason `cancelled`, preserving existing behavior.
- Duplicate reject does not overwrite final status, recreate `call_log`, or re-emit duplicate side effects.
- Removes Redis timeout due metadata best-effort.

### `endCall`

- Uses `finalizeCallOnce`.
- If answered, finalizes as `completed` and computes duration from `answeredAt`.
- If not answered, finalizes as `missed`.
- Duplicate end does not recreate `call_log` or duplicate side effects.
- End after `rejected` or `missed` does not overwrite final status.
- Removes Redis timeout due metadata best-effort.

### Timeout Finalization

There are two timeout mechanisms now:

- Local `activeTimeouts` / `setTimeout` remains enabled as fallback.
- Distributed timeout finalizer exists but is disabled by default.

Both must rely on MongoDB conditional finalization for correctness.

## Redis Temp Mapping

Implemented slice:

- Service: `server/src/socket/handlers/call/services/callSessionResolver.js`
- Key: `call:temp:{tempCallId}`
- TTL: 120 seconds
- Value: `callHistoryId`

Purpose:

- Allows `initCall` on backend A and `callUser` on backend B to reuse the same `CallHistory`.
- Prevents duplicate `CallHistory`/`call_log` during cross-replica call start.
- Local `tempIdToDbId` remains as rollback/fallback.

Manual smoke result:

- Docker/nginx 3-replica call smoke passed.
- `initCall`/`callUser` reused one `CallHistory`.
- Redis `call:temp:*` key observed with TTL.
- No duplicate `CallHistory` or `call_log`.

## Redis Timeout Due Storage

Implemented slice:

- Service: `server/src/socket/handlers/call/services/callTimeoutDueStore.js`
- Sorted set: `call:timeouts`
- Debug key: `call:timeout:{callId}`
- Debug TTL: 180 seconds

Behavior:

- `initCall` and fallback-created `callUser` add timeout due metadata.
- `answerCall`, `rejectCall`, `endCall`, and timeout callbacks remove due metadata best-effort.
- Redis failure is swallowed/logged and does not break local timeout fallback.

## Redis Socket/User Call Bindings

Implemented for disconnect hardening:

- Service: `server/src/socket/handlers/call/services/callSocketBindingStore.js`
- Keys:
  - `call:socket:{socketId}` -> `callHistoryId`
  - `call:user:{userId}` -> `callHistoryId`
- TTL: 6 hours.
- Redis failure is swallowed/logged and does not break calls.

Binding writes:

- `initCall` writes caller socket + caller user binding.
- `callUser` writes/refreshes caller socket + caller user binding.
- `callUser` writes receiver user active call when ringing/offer is sent.
- `answerCall` writes receiver socket + receiver user binding.

Disconnect Slice 2:

- `server/src/socket/handlers/call/disconnect.js` now resolves active call in order:
  1. local `activeSocketCalls` / `unbindSocketFromCall(socket.id)`
  2. Redis `call:socket:{socket.id}`
  3. Redis `call:user:{socket.userId}`
- Disconnect finalizes through `finalizeCallOnce`.
- Answered disconnect finalizes as `completed`.
- Pending/unanswered disconnect finalizes as `rejected`.
- Terminal states (`missed`, `rejected`, `completed`, `busy`, `unreachable`) no-op.
- Redis bindings and timeout due metadata cleanup is best-effort.
- Local `activeSocketCalls` remains as fallback.

Tests:

- Disconnect tests passed `9/9`.
- Related call regression passed `51/51`.
- Full server regression passed `125/125`.

Manual smoke result:

- Active call resolves through local/Redis bindings.
- Answered disconnect finalizes `completed`.
- Pending disconnect finalizes `rejected`.
- Duplicate disconnect/end paths do not duplicate `call_log`.
- Terminal states remain unchanged.

## Distributed Timeout Finalizer

Implemented behind feature flag:

- Service: `server/src/socket/handlers/call/services/callTimeoutFinalizer.js`
- Startup wiring: `server/src/socket/index.js`
- Default OFF.
- Flag: `CALL_DISTRIBUTED_TIMEOUT_ENABLED=true`
- Optional interval: `CALL_DISTRIBUTED_TIMEOUT_POLL_MS`

Behavior when enabled:

- Scans `call:timeouts` for due ids.
- Acquires `call:finalize-lock:{callId}` with short TTL.
- Calls `finalizeCallOnce({ status: "missed", requireUnanswered: true, activeStatuses: ["pending"] })`.
- Emits side effects only when Mongo finalization succeeds now.
- Removes stale due ids when call is already answered/finalized.
- Redis lock only reduces duplicate work; MongoDB remains exactly-once gate.

Current default behavior:

- Disabled unless env flag is explicitly true.
- Local `activeTimeouts` remains enabled.
- No user-visible behavior change while flag is off.

Manual flag-ON smoke result:

- `CALL_DISTRIBUTED_TIMEOUT_ENABLED=true` was confirmed inside the backend container.
- All 3 backend replicas started the `CallTimeoutFinalizer` poller.
- Offline timeout finalized without duplicate `call_log`.
- Redis `call:timeouts` and `call:timeout:*` were cleaned after timeout.
- Mongo duplicate `call_log` aggregation returned `[]`.
- Keep local `activeTimeouts` enabled as fallback for now.

## Stale Local Timeout Cross-Replica Fix

Bug fixed:

- In Docker/nginx multi-backend replicas, an answered call could later be marked `missed` by a stale local `setTimeout` from another backend process.

Root cause:

- `answerCall` removed Redis timeout metadata and cleared only the current process `activeTimeouts`.
- The backend process that created the local timer could still fire later.
- Old timeout callback filtered only `{ _id, status: "pending" }`.
- `answerCall` set `answeredAt` but left `status` as `pending`, so stale timeout could mark the call missed.

Fix:

- `initCall` and `callUser` local timeout callbacks now use `finalizeCallOnce` with `requireUnanswered: true`.
- If `answeredAt` exists, stale timeout no-ops.
- Timeout side effects run only when finalization succeeds now.

Manual smoke result:

- Docker/nginx 3-replica: A calls B, B accepts, both enter call, waiting beyond timeout no longer marks answered call as missed.
- Offline unanswered timeout still creates one missed call and one `call_log`.
- Distributed timeout finalizer flag ON smoke passed with all 3 backend replicas polling and no duplicate `call_log`.
- Redis timeout due keys were cleaned after timeout; Mongo duplicate `call_log` aggregation returned `[]`.

## Media-State Sync Fixes

### Caller State Replay After Accept

Bug fixed:

- If A turned off mic/camera before B joined, B did not see A's current media state after joining.

Root cause:

- `toggleMedia` was live-only.
- B sent current media state to A through `answerCall` → `callAccepted`, but A did not replay current state back to B.

Fix:

- `client/src/features/calls/context/callMediaState.js`
  - Derives media status from actual stream tracks.
  - Sends current media snapshot using existing `toggleMedia`.
  - Persists partner media status for incoming call-window hydration.
- `useCallActions.js`
  - Caller sends current local media-state snapshot after receiving `callAccepted`.
- `useSocketEvents.js`
  - `updateMediaStatus` persists latest partner state to `tempCallerMediaStatus`.

Manual smoke result:

- Both users toggling mic/camera off before join now see each other's off state after join.
- Live mic/camera toggles still update both sides.

### Audio Mic Mute Correctness + UI

Bug fixed:

- In audio call, muting mic could still let the other participant hear audio.

Root cause:

- Audio pre-call mute and some pre-call controls toggled only `getAudioTracks()[0]`.
- Audio-call init previously created mixed/fresh streams, increasing risk of toggling a different track than the one sent to WebRTC.

Fix:

- `setAudioEnabled(stream, enabled)` toggles every audio track.
- `setVideoEnabled(stream, enabled)` toggles every video track.
- `getMediaStatusFromStream` now aggregates all tracks.
- `CallPage` connected and pre-call mic/cam toggles now use helpers.
- Audio-call media init requests `{ video: false, audio: true }` directly.
- Audio-call remote muted UI now uses a red mic badge/pill instead of awkward standalone text.

Manual smoke expected/passed:

- Audio call pre-call mute prevents peer from hearing audio after join.
- Connected audio mute/unmute works.
- Video mic/cam toggles still work.
- Audio muted UI displays a cleaner red mic badge.

## Unread / Badge Dedupe Fixes

### CallHistoryModal Duplicate Items

Bug fixed:

- UI could show duplicate call history items while DB had one record.

Root cause:

- `CallHistoryModal` appended duplicate fetch responses without dedupe.
- Reset fetch and pagination fetch could race via rapid open/double click, StrictMode, or IntersectionObserver.

Fix:

- `client/src/features/calls/components/callHistoryState.js`
  - Pure `mergeCallHistoryPage` helper.
- Reset fetch replaces with deduped response.
- Pagination appends only unseen calls.
- Ref-based fetch guards prevent duplicate concurrent fetches/stale responses.

Manual smoke result:

- Rapid open/double click no longer duplicates call history items.

### Call History Missed Badge Hydration

Bug fixed:

- Offline missed call existed in MongoDB, but call-history icon badge stayed 0 after SPA login until browser refresh.

Root cause:

- `CallHistoryProvider` mounted before auth/current user availability and did not hydrate missed count after SPA login.

Fix:

- `CallHistoryProvider` hydrates missed count on:
  - mount if token exists
  - `call-history-refresh-needed`
  - `auth-changed`
  - `storage`
  - `SocketProvider.currentUser` availability/change
- In-flight guard prevents duplicate fetches.

Manual smoke result:

- B offline/logout → A calls B → missed timeout → B SPA login without refresh → call-history icon badge shows `1`.

### Sidebar Chat Row Badge Dedupe

Bug fixed:

- After offline missed call, SPA login/reconnect could make chat row unread badge become `2` while DB had one `CallHistory` and one `call_log`.

Root cause:

- `/api/users/sidebar-list` returned `unreadCount: 1` but `lastMessage` lacked stable `messageId` / `callHistoryId`.
- Reconnect sync replayed the same `call_log`, and frontend incremental update could not dedupe it.

Fix:

- `server/src/controllers/userController.js`
  - Sidebar `lastMessage` includes `messageId`.
  - Sidebar `lastMessage` includes `callHistoryId` for `call_log`.
- Existing frontend `messageSocketState.updateListWithMessagePreview` dedupes recovered messages/call logs.

Manual smoke result:

- B offline/logout → A calls B → missed timeout → B SPA login.
- Call-history icon badge `1`.
- Chat row badge remains `1`, not `2`.
- DB remains one `CallHistory` and one `call_log`.

## Unfriend Slice 1 Backend API

Implemented:

- Route: `POST /api/users/remove-friend`
- Controller: `removeFriend` in `server/src/controllers/userController.js`
- Service: existing `removeFriendWriteThrough` in `server/src/services/friendCacheService.js`

Behavior:

- Authenticated user removes `friendId`.
- Self-remove is rejected.
- Missing target user returns `404`.
- Already-not-friends returns idempotent success: `{ success: true, alreadyRemoved: true }`.
- Existing friendship removal:
  - removes both users from each other's `friends` arrays.
  - clears stale `friendRequests` in both directions.
  - updates Redis `cache:friends:*` via write-through.
  - determines `conversationId` and `hadMessages`.
  - emits `friendRemoved` to both user rooms.
- Does not delete `Message`, `CallHistory`, or `call_log`.
- RabbitMQ is not involved.
- Friends-only messaging/calling is not enforced yet.

Socket event:

- `friendRemoved`
- Current user payload: `{ removedUserId: friendId, byUserId: currentUserId, conversationId, hadMessages }`
- Removed friend payload: `{ removedUserId: currentUserId, byUserId: currentUserId, conversationId, hadMessages }`

Tests/manual smoke:

- Targeted unfriend tests passed `9/9`.
- Full server regression passed `133/133`.
- API removes both users from each other's `friends` arrays.
- Stale `friendRequests` are cleared both directions.
- Redis `cache:friends:*` entries are updated/removed.
- `friendRemoved` emits to both user rooms.
- `Message`, `CallHistory`, and `call_log` remain intact.

## Unfriend Slice 2 Frontend Realtime State Sync

Implemented:

- Helper: `client/src/features/friends/socket/friendshipState.js`
- Listener: `friendRemoved` in `client/src/features/friends/socket/useFriendSocket.js`
- Wiring: `client/src/features/chat/pages/ChatPage.jsx`

Behavior:

- `friendRemoved` updates `users`, `searchResult`, and `activeChat`.
- Clears relationship flags:
  - `isFriend:false`
  - `isSent:false`
  - `isReceived:false`
  - `isIncomingRequest:false`
- `hadMessages:true` keeps the sidebar row as a non-friend conversation.
- `hadMessages:false` removes the sidebar row.
- Search results keep the row as non-friend even when `hadMessages:false`.
- Active direct chat updates safely to non-friend.
- Groups and unrelated active chats are ignored.

Tests/manual smoke:

- Targeted frontend unfriend tests passed `7/7`.
- Full client tests passed `56/56`.
- Client build passed.
- Realtime smoke passed:
  - `friendRemoved` marks sidebar/search/active chat as non-friend.
  - `hadMessages:true` keeps sidebar row.
  - `hadMessages:false` removes sidebar row.
  - active chat remains stable and updates safely.
  - both current user and removed friend sessions update without refresh.

## Latest Test Results

Recent full regressions after final slices:

- Client:
  - `npm.cmd test` → pass, 56/56 after unfriend Slice 2 frontend realtime state sync.
  - Unfriend frontend targeted tests → pass, 7/7.
  - `npm.cmd run build` → pass.
  - Vite large chunk warning remains unrelated.
- Server:
  - `npm.cmd test` → pass, 133/133 after unfriend Slice 1 backend API.
  - Unfriend targeted tests → pass, 9/9.
  - Previous disconnect hardening full regression passed, 125/125.
  - Disconnect targeted tests → pass, 9/9.
  - Related call regression → pass, 51/51.

Important targeted suites:

- `server/test/callFinalizer.test.js`
- `server/test/rejectCallSemantics.test.js`
- `server/test/endCallFinalizer.test.js`
- `server/test/callTimeoutDueHandlers.test.js`
- `server/test/callTimeoutDueStore.test.js`
- `server/test/callTimeoutFinalizer.test.js`
- `server/test/callSocketBindingStore.test.js`
- `server/test/disconnectFinalizer.test.js`
- `server/test/removeFriendController.test.js`
- `server/test/friendCacheService.test.js`
- `server/test/sidebarLastMessage.test.js`
- `client/src/features/calls/context/callMediaState.test.js`
- `client/src/features/calls/context/callHistoryBadgeState.test.js`
- `client/src/features/calls/components/callHistoryState.test.js`
- `client/src/features/friends/socket/friendshipState.test.js`
- `client/src/features/friends/socket/useFriendSocket.test.js`
- `client/src/features/chat/socket/messageSocketState.test.js`

## Latest Manual Smoke Results

Passed/manual-confirmed:

- Docker/nginx 3-replica call smoke with `docker compose -f docker-compose.yml up -d --build`.
- `initCall` on one backend and `callUser` on another reused one `CallHistory` via Redis temp mapping.
- Redis `call:temp:*` key observed with TTL.
- No duplicate `CallHistory` / `call_log`.
- Receiver reject and receiver pre-call cancel store/display `rejected` / `Từ chối`.
- Caller receives immediate cleanup on receiver pre-call cancel.
- Sidebar/call-history badge dedupe remains correct:
  - call-history icon badge hydrates after SPA login.
  - chat row unread badge stays `1`.
- Answered call no longer becomes missed after stale local timeout in another backend replica.
- Offline unanswered timeout still creates one missed call and one `call_log`.
- Distributed timeout finalizer flag ON smoke passed on all 3 backend replicas.
- Disconnect hardening smoke passed:
  - active call resolves through local/Redis bindings.
  - answered disconnect finalizes `completed`.
  - pending disconnect finalizes `rejected`.
  - duplicate disconnect/end paths do not duplicate `call_log`.
  - terminal states remain unchanged.
- Unfriend Slice 1 backend smoke passed:
  - API removes both users from each other's `friends` arrays.
  - stale `friendRequests` are cleared both directions.
  - Redis `cache:friends:*` entries are updated/removed.
  - `friendRemoved` emits to both user rooms.
  - `Message`, `CallHistory`, and `call_log` remain intact.
- Unfriend Slice 2 realtime smoke passed:
  - `friendRemoved` marks sidebar/search/active chat as non-friend.
  - `hadMessages:true` keeps sidebar row.
  - `hadMessages:false` removes sidebar row.
  - active chat remains stable and updates safely.
  - both current user and removed friend sessions update without refresh.
- Media-state sync:
  - both sides see current mic/camera off state after join.
  - audio pre-call/connected mic mute works.
  - audio muted UI improved with badge/pill.

## Known Remaining Technical Debt

Call flow still has process-local state:

- `server/src/socket/handlers/call/state.js`
  - `activeTimeouts`
  - `activeSocketCalls`
  - `tempIdToDbId`
- `callRateLimit` remains process-local.

Mitigations now exist:

- Redis temp mapping covers cross-replica temp id resolution.
- Redis timeout due metadata exists.
- Redis socket/user call bindings cover cross-replica disconnect resolution.
- Distributed timeout finalizer exists behind flag and passed manual flag-ON smoke.
- MongoDB conditional finalization is the correctness gate.
- Disconnect finalization now uses `finalizeCallOnce`.
- Local timeouts remain fallback.

Remaining risks:

- Local `activeSocketCalls` still exists as fallback; Redis socket/user bindings now mitigate cross-replica disconnect misses.
- `callRateLimit` is process-local; multi-replica callers may bypass intended rate limit.
- Glare handling still uses process-local assumptions and direct Mongo updates in some branches.
- Some old diagnostic logs remain noisy in call handlers.
- `cleanup.js` still has periodic cleanup side effect on module load; review before larger call architecture work.
- REST controllers still directly emit Socket.IO events in places.
- `SocketProvider` lifecycle is complex and globally mounted; avoid broad refactor without browser/e2e coverage.
- `UserStatus` still has fallback paths that can display stale status if future callers do not pass realtime `isOnline`.
- Audio/video call UI still lives in one large `CallPage.jsx`; future UI changes should extract pure helpers/components carefully.

## Recommended Next Roadmap Slices

Keep slices small and TDD-first.

1. Implement unfriend UI button/API trigger Slice 3
   - Add `removeFriend` client API helper.
   - Add direct-chat unfriend action with confirm.
   - Reuse existing `friendRemoved` realtime state sync.
   - Do not enforce friends-only messaging/calling in this slice.

2. Move `callRateLimit` to Redis counters
   - Short TTL counters, disposable.
   - Preserve current UX.
   - Tests for multi-replica bypass prevention.

3. Finish glare hardening
   - Replace direct `findByIdAndUpdate(... status: "missed")` glare branches with `finalizeCallOnce`.
   - Ensure no duplicate call logs or status overwrite.

4. Wire distributed timeout finalizer production readiness checks
   - Add health/log visibility around finalizer enabled/disabled state.
   - Add metrics-like logs for scan count, lock miss, finalized, no-op.
   - Keep default OFF until rollout decision.

5. Reduce call handler log noise
   - Keep important warnings/errors.
   - Move verbose `[CALL_DIAG]` logs behind debug flag.

6. Extract CallPage UI components
   - Only after behavior is stable.
   - Start with pure presentational components for audio remote panel, video remote panel, controls.
   - Do not alter signaling in same slice.

7. Browser/e2e smoke harness
   - Add repeatable manual or Playwright-style checklist for two users:
     - audio call mute
     - video call media state
     - reject/end/timeout
     - offline missed badge hydration
     - reconnect message/call_log dedupe

## Guardrails For Next Agent

- Do not move durable call lifecycle state to Redis.
- Do not use RabbitMQ for realtime call signaling/finalization.
- Do not remove local `activeTimeouts` yet.
- Do not enable distributed timeout finalizer by default without an explicit rollout decision.
- Any new finalization path must use `finalizeCallOnce`.
- Any Redis key added for calls must have TTL or be safely disposable.
- Any socket event change must preserve existing event names/payload compatibility unless explicitly planned.
- Run targeted tests first, then full server/client regression when practical.
