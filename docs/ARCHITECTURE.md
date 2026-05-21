# Architecture Overview

This document captures the current stabilized architecture for the `web-socket` chat project.

## Ownership Rules

- MongoDB is the source of truth for durable state: users, friendships, messages, groups, files, call histories, and call log messages.
- Redis is a coordination/cache/presence layer. Redis data must be disposable or reconstructable from MongoDB.
- RabbitMQ is a background side-effect bus only. It must not be used for realtime chat delivery, call signaling, call lifecycle decisions, or Socket.IO event ordering.
- Socket.IO is the synchronous realtime path for chat, typing, presence, friend updates, WebRTC signaling, call media state, and call lifecycle notifications.

## Runtime Topology

Docker Compose starts `nginx`, 3 `backend` replicas, `mongo`, `redis`, `rabbitmq`, `image-worker`, `notification-worker`, and `audit-worker`.

## MongoDB Role

MongoDB stores durable `User`, `Message`, `Group`, `File`, and `CallHistory` records. All call finalization correctness is gated by MongoDB conditional updates through `finalizeCallOnce`.

## Redis Role

Redis is used for Socket.IO adapter fan-out, presence, cache-aside/write-through user/friend/conversation caches, and short-lived call coordination keys:

- `call:temp:{tempCallId}` -> `callHistoryId` with TTL.
- `call:timeouts` sorted set of due timeout timestamps.
- `call:timeout:{callId}` debug/metadata key.
- `call:socket:{socketId}` -> `callHistoryId` with TTL.
- `call:user:{userId}` -> active call id with TTL.
- `call:finalize-lock:{callId}` short Redis lock for distributed timeout polling.

Redis failures should be logged/swallowed on coordination/cache paths where MongoDB/local fallback can preserve behavior.

## RabbitMQ Role

RabbitMQ is used for background work only: image/file processing, notification/email jobs, and audit/statistics/background processing. It must not decide realtime call/chat lifecycle.

## Socket.IO Realtime Flow

Socket auth verifies JWT and joins the authenticated user room. Messages, typing, presence, friend updates, call signaling, media state, and call lifecycle notifications are delivered synchronously through Socket.IO.

## Call Lifecycle Hardening

Current call hardening includes:

- `finalizeCallOnce`: shared Mongo-gated idempotent call finalization service.
- `rejectCall`, `endCall`, local timeout callbacks, distributed timeout finalizer, and disconnect finalization use Mongo-gated semantics.
- Redis temp id mapping supports cross-replica `initCall` -> `callUser` resolution.
- Redis timeout due storage records timeout metadata without making Redis durable state.
- Distributed timeout finalizer exists behind `CALL_DISTRIBUTED_TIMEOUT_ENABLED`; local `activeTimeouts` remain fallback.
- Disconnect resolves active call local -> Redis socket binding -> Redis user binding.
- Answered disconnect finalizes `completed`; pending unanswered disconnect finalizes `rejected`; terminal states no-op.

## Unfriend Flow

- Backend endpoint: `POST /api/users/remove-friend` with `{ friendId }`.
- MongoDB removes friendship both directions and clears stale friend requests.
- Redis friend cache is updated via write-through service.
- No messages, call histories, or call log messages are deleted.
- Socket.IO emits `friendRemoved` to both user rooms.
- Frontend marks users/search/activeChat as non-friend.
- `hadMessages:true` keeps the sidebar row; `hadMessages:false` removes it.
- ChatWindow uses an in-app confirmation modal and leaves final UI state to realtime `friendRemoved`.

## Testing Strategy

Use targeted tests first, then broader regression:

- Server: `cd server && npm test`
- Client: `cd client && npm test`
- Client build: `cd client && npm run build`

For multi-replica behavior, use Docker Compose and nginx manual smoke tests.
