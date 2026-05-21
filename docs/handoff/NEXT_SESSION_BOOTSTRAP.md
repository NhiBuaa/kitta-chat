# Next Session Bootstrap

Purpose: fast startup context for the next Codex session. Read this first; open deeper files only when needed.

## Architecture Invariants

- MongoDB is canonical for durable call/message state: `CallHistory`, `Message`, `call_log`.
- Redis is coordination/cache/presence only; call Redis keys are short-lived/disposable.
- RabbitMQ is background-only; never use it for realtime call signaling or lifecycle decisions.
- Socket.IO is the synchronous realtime path for call signaling, media-state updates, presence, and call-history events.
- All call finalization correctness must go through Mongo-gated `finalizeCallOnce`.
- Local process state remains as rollout fallback; do not remove it yet.

## Latest Completed Milestone

Stabilized call hardening now includes:

- Redis temp-call mapping: `call:temp:{tempCallId}` -> `callHistoryId`, TTL 120s.
- Redis timeout due storage: `call:timeouts`, `call:timeout:{callId}`.
- `rejectCall` and `endCall` use `finalizeCallOnce`.
- Local timeout callbacks use `finalizeCallOnce({ status: "missed", requireUnanswered: true })`.
- Distributed timeout finalizer exists, is disabled by default, and has passed manual flag-ON smoke.
- Disconnect hardening Slice 2 is complete:
  - resolves active call local -> Redis socket -> Redis user.
  - finalizes through `finalizeCallOnce`.
  - answered disconnect => `completed`; pending disconnect => `rejected`; terminal states no-op.
  - Redis bindings/timeouts cleanup is best-effort.
- Media-state sync fixed: caller replays state after `callAccepted`; audio mute toggles all audio tracks.
- Call-history modal, call-history badge, and sidebar unread badge dedupe fixed.
- Unfriend Slice 1 backend is complete:
  - `POST /api/users/remove-friend` added.
  - `removeFriend` controller uses Mongo/Redis write-through.
  - `removeFriendWriteThrough` clears `friends` and stale `friendRequests`.
  - emits `friendRemoved` to both user rooms.
  - does not delete `Message`, `CallHistory`, or `call_log`.
- Unfriend Slice 2 frontend realtime state sync is complete:
  - `friendshipState` helper added.
  - `friendRemoved` socket listener added.
  - updates `users`, `searchResult`, and `activeChat`.
  - `hadMessages:true` keeps sidebar row as non-friend.
  - `hadMessages:false` removes sidebar row.
  - active chat updates safely.

## Feature Flags

- `CALL_DISTRIBUTED_TIMEOUT_ENABLED`: default OFF / unset.
- `CALL_DISTRIBUTED_TIMEOUT_POLL_MS`: optional poll interval, used only when the finalizer flag is ON.

Manual smoke confirmed `CALL_DISTRIBUTED_TIMEOUT_ENABLED=true` works in backend containers, but keep the default OFF and keep local `activeTimeouts` enabled as fallback for now.

## Manual Smoke Results

Passed:

- Docker/nginx 3-replica call smoke.
- Cross-replica `initCall` + `callUser` reused one `CallHistory`.
- Redis `call:temp:*` observed with TTL.
- No duplicate `CallHistory` / `call_log`.
- Receiver reject/pre-call cancel finalizes as `rejected` and cleans up caller immediately.
- Offline missed call creates one `CallHistory` and one `call_log`.
- Answered call no longer becomes missed after stale local timeout.
- SPA login badges hydrate correctly: call-history icon `1`, chat row unread `1`.
- Media-state smoke passed: both sides see mic/camera state after join; audio mute works before join and during call.
- Distributed timeout finalizer flag ON smoke passed:
  - `CALL_DISTRIBUTED_TIMEOUT_ENABLED=true` confirmed in backend container.
  - All 3 backend replicas started `CallTimeoutFinalizer` poller.
  - Offline timeout produced no duplicate `call_log`.
  - Redis `call:timeouts` and `call:timeout:*` cleaned after timeout.
  - Mongo duplicate `call_log` aggregation returned `[]`.
- Disconnect hardening Slice 2 tests passed:
  - disconnect tests `9/9`.
  - related call tests `51/51`.
  - full server regression `125/125`.
- Disconnect manual smoke passed:
  - active call resolves via local/Redis bindings.
  - answered disconnect finalizes `completed`.
  - pending disconnect finalizes `rejected`.
  - duplicate disconnect/end paths do not duplicate `call_log`.
  - terminal states remain unchanged.
- Unfriend Slice 1 backend tests passed:
  - targeted tests `9/9`.
  - full server regression `133/133`.
- Unfriend manual API/DB/Redis smoke passed:
  - API removes both users from each other's `friends` arrays.
  - stale `friendRequests` are cleared both directions.
  - Redis `cache:friends:*` entries are updated/removed.
  - `friendRemoved` emits to both user rooms.
  - `Message`, `CallHistory`, and `call_log` remain intact.
- Unfriend Slice 2 frontend tests/build passed:
  - targeted tests `7/7`.
  - full client tests `56/56`.
  - client build passed.
- Unfriend realtime smoke passed:
  - `friendRemoved` marks sidebar/search/active chat as non-friend.
  - `hadMessages:true` keeps sidebar row.
  - `hadMessages:false` removes sidebar row.
  - active chat remains stable and updates safely.
  - both current user and removed friend sessions update without refresh.

## Remaining Risks

- Local `activeSocketCalls` still exists as fallback, but disconnect can now resolve Redis socket/user bindings across replicas.
- `callRateLimit` is still process-local.
- Some glare branches still have direct updates and process-local assumptions.
- `CallPage.jsx` and `SocketProvider` are large/complex; avoid broad refactors without tests and browser smoke.

## Next Recommended Tasks

1. Implement unfriend UI button/API trigger Slice 3.
2. Move `callRateLimit` to Redis TTL counters.
3. Harden glare paths through `finalizeCallOnce`.
4. Add production-readiness visibility for distributed timeout finalizer while keeping default OFF.
5. Move noisy call diagnostic logs behind a debug flag.

## Read Only When Needed

Architecture/history:

- `docs/handoff/stabilized-architecture-state-2026-05-21.md`
- `docs/handoff/safe-architecture-cleanup-2026-05-20.md`
- `AGENTS.md`

Call server:

- `server/src/socket/handlers/call/services/callFinalizer.js`
- `server/src/socket/handlers/call/services/callSessionResolver.js`
- `server/src/socket/handlers/call/services/callTimeoutDueStore.js`
- `server/src/socket/handlers/call/services/callTimeoutFinalizer.js`
- `server/src/socket/handlers/call/services/callSocketBindingStore.js`
- `server/src/socket/handlers/call/handlers/initCall.js`
- `server/src/socket/handlers/call/handlers/callUser.js`
- `server/src/socket/handlers/call/handlers/answerCall.js`
- `server/src/socket/handlers/call/handlers/rejectCall.js`
- `server/src/socket/handlers/call/handlers/endCall.js`
- `server/src/socket/handlers/call/disconnect.js`
- `server/src/socket/handlers/call/state.js`

Call client:

- `client/src/features/calls/pages/CallPage.jsx`
- `client/src/features/calls/context/useCallActions.js`
- `client/src/features/calls/context/useSocketEvents.js`
- `client/src/features/calls/context/callMediaState.js`
- `client/src/features/calls/context/CallHistoryProvider.jsx`

Badge/sidebar:

- `server/src/controllers/userController.js`
- `server/src/routes/user.js`
- `server/src/services/friendCacheService.js`
- `client/src/features/chat/socket/messageSocketState.js`
- `client/src/features/friends/socket/friendshipState.js`
- `client/src/features/friends/socket/useFriendSocket.js`
- `client/src/features/chat/pages/ChatPage.jsx`
- `client/src/features/calls/components/CallHistoryModal.jsx`

Focused tests:

- `server/test/callFinalizer.test.js`
- `server/test/callTimeoutDueHandlers.test.js`
- `server/test/callTimeoutFinalizer.test.js`
- `server/test/callSocketBindingStore.test.js`
- `server/test/disconnectFinalizer.test.js`
- `server/test/removeFriendController.test.js`
- `server/test/rejectCallSemantics.test.js`
- `server/test/endCallFinalizer.test.js`
- `client/src/features/calls/context/callMediaState.test.js`
- `client/src/features/calls/context/callHistoryBadgeState.test.js`
- `client/src/features/friends/socket/friendshipState.test.js`
- `client/src/features/friends/socket/useFriendSocket.test.js`
- `client/src/features/chat/socket/messageSocketState.test.js`
