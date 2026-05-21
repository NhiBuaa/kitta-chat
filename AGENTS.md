# AGENTS.

## Skills Workflow

* Feature design → grill-with-docs
* Implementation → tdd
* Debugging → diagnose
* Architecture review → zoom-out
* Refactor → improve-codebase-architecture
* Session summary → handoff

Long-term guidance for AI agents working in the `web-socket` repository.

This repository is a KittaChat-style realtime chat application: React/Vite client, Express
server, Socket.IO, MongoDB/Mongoose, Redis, nginx, and Docker Compose. When modifying code,
prioritize reading the existing flow first, keep changes small, and respect the existing Redis
/ Mongo / Socket.IO patterns.

## Overall Architecture

* `client/`: React 19 + Vite. The app is divided by feature inside `client/src/features`.
* `server/`: Express 5 + Socket.IO 4 + Mongoose. Entry point is `server/server.js`.
* `nginx/`: reverse proxy for static frontend, REST API, and `/socket.io/`.
* `docker-compose.yml`: runs nginx, 3 backend replicas, Redis, and MongoDB.
* MongoDB is the source of truth.
* Redis is used for the Socket.IO adapter, presence, profile cache, friends cache,
  recent conversations, and short chat history.

The server only listens after MongoDB connects successfully, then calls
`connectCacheRedis()` and `initSocket(server, app)`.

## Important Folders

* `server/server.js`: Express middleware, routes, health checks, shutdown,
  startup DB/cache/socket.
* `server/src/socket/index.js`: initializes Socket.IO, Redis adapter, JWT socket auth,
  registers handlers.
* `server/src/socket/handlers/`: event handlers for presence, message, friend,
  typing, and call.
* `server/src/socket/handlers/call/`: WebRTC signaling, call state, timeout,
  call log.
* `server/src/controllers/`: REST business logic.
* `server/src/models/`: Mongoose schemas.
* `server/src/services/`: Redis cache/presence/S3 services.
* `client/src/services/socket/SocketProvider.jsx`: socket lifecycle on the client.
* `client/src/constants/socketEvents.js`: shared socket event names.
* `client/src/features/chat/hooks/useChatMessages.js`: fetch, optimistic send,
  retry, message pagination.
* `client/src/features/chat/socket/useMessageSocket.js`: receive message/read/call log.
* `client/src/features/calls/context/`: call state and socket events on the client.

## Authentication Flow

Local auth:

1. `POST /api/auth/register` validates email/password, bcrypt hashes the password,
   creates `User`.
2. `POST /api/auth/login` verifies bcrypt, updates `activityStatus`, returns JWT
   signed with payload `{ id: user._id }`, expires after `1d`.
3. Client stores `token` and `user` in `localStorage`.

Google auth:

1. Client gets Firebase ID token.
2. `POST /api/auth/google` verifies token using `firebase-admin`.
3. Server creates/updates `User` provider `google`, may upload Google avatar to S3.
4. Server returns app JWT similar to local login.

REST auth:

* `client/src/services/api/axiosClient.js` attaches `Authorization: Bearer <token>`.
* When REST returns `401` or `403`, client clears `token`, `user`, emits
  `auth-changed`, redirects to `/login`.
* `ProtectedRoute` on the client only checks whether a token exists.

Socket auth:

* Client connects Socket.IO using `auth: { token }`.
* `server/src/socket/index.js` uses `jwt.verify(token, JWT_SECRET)`, sets
  `socket.userId`, rejects missing/invalid/expired token before connection.

Important note:

* `server/src/middlewares/auth.js` currently has an export bug:
  `module.exports = verifyToken, getUserIdFromToken` only exports
  `getUserIdFromToken`. Routes importing `authMiddleware` may break/hang because
  middleware does not call `next()`. When fixing REST auth, fix the export first.

## WebSocket Flow

Client lifecycle:

1. `SocketProvider` reads `user` and `token` from `localStorage`.
2. Connects to `VITE_API_URL` using `transports: ["websocket"]`.
3. On `connect`, emits `addNewUser` with `userId`.
4. If `last_message_id` exists, calls REST sync missed messages.
5. Sends `heartbeat` every 20 seconds.
6. Cleanup disconnect socket, clear heartbeat and debounce timer.

Server lifecycle:

1. Socket.IO middleware verifies JWT.
2. On `connection`, emits `me`, registers presence/message/friend/typing/call handlers.
3. `addNewUser` joins userId room and all group rooms of the user.
4. Redis `user_sockets:{userId}` supports multi-tab.
5. First online tab performs write-through presence to MongoDB + Redis and broadcasts
   `userStatusChanged`.
6. Disconnect removes socket id, sets 5s grace period to avoid flicker during refresh.

Core events:

* `sendMessage` -> server save/upsert Message -> update Redis -> emit `getMessage`.
* `markRead` -> direct update `isRead`, group push `readBy`.
* `typing` / `stopTyping` -> `getTyping` / `getStopTyping`.
* Friend REST changes DB/cache, socket events update realtime sidebar.
* Group REST changes DB, creates system message, emits group events.
* Call events: `initCall`, `callUser`, `answerCall`, `rejectCall`, `endCall`,
  `toggleMedia`.

## Message Flow

Client send:

1. `useChatMessages.handleSendMessage` creates optimistic message with `_id=temp_*`.
2. Creates `idempotencyKey` using UUID.
3. Stores pending queue in `localStorage`.
4. Emits `sendMessage` with sender, receiver, text, attachments, isGroup,
   conversationId, idempotencyKey.
5. Successful callback replaces temp id with `realId`; error sets status `error`.

Server receive:

1. `messageHandler.sendMessage` gets sender/receiver/isGroup.
2. Gets latest sender profile using Redis cache-aside
   `getCachedUserProfile`.
3. Calculates `conversationId`: group = groupId, direct =
   sorted `senderId_receiverId`.
4. Calls `saveMessageInBackground`.
5. Emits:

   * Group: `io.to(groupId).emit("getMessage", payload)`.
   * Direct: emit to both `receiverId` and `senderId` rooms.
6. Callback `{ success, realId, isDuplicate }`.

Dedup/retry pattern:

* `Message` has unique sparse index on `{ sender, idempotencyKey }`.
* Client retries sending with the same `idempotencyKey`.
* Server upserts to avoid duplicates.

## Presence Flow

Presence Redis keys:

* `presence:{userId}` HASH `{ status, lastSeen }`, TTL 30s.
* `user_sockets:{userId}` SET list of currently open socket ids.
* `offline_timer:{userId}` temporary 5s key during disconnect.
* `global_online_users` SET still exists for some legacy logic.

Pattern:

* First connection: `setPresenceWriteThrough(userId, "online")`.
* Heartbeat: only renews Redis TTL, does not write MongoDB.
* Actual offline: after grace period, if no remaining sockets then update MongoDB and
  Redis, broadcast to friend/group rooms.

## Call Flow

Call signaling is located in `server/src/socket/handlers/call/`.

* `initCall`: creates pending `CallHistory`, maps temp call id to DB id, sets timeout.
* `callUser`: forwards WebRTC offer, creates record if missing, checks receiver online,
  rate limits, handles glare when both users call each other simultaneously.
* `answerCall`: clears timeout, sets `answeredAt`, emits `callAccepted`.
* `rejectCall`: sets status `rejected`, `busy`, or `missed` depending on reason.
* `endCall`: if answered then `completed` and calculates duration; if not answered then
  `missed`.
* Finalized call creates/upserts `Message` type `call_log`, emits `getMessage` and
  `callLogMessage` to both participants.

`CallHistory` statuses: `pending`, `completed`, `missed`, `rejected`,
`unreachable`, `busy`.

## Database Models

`User`:

* email unique, password, provider `local|google`, displayName, avatar, status,
  activityStatus, friends, friendRequests.
* Indexes for friends, friendRequests, displayName.

`Message`:

* `conversationId`, type `text|file|system|call_log`, sender, receiver, text,
  attachments, callData, isRead, readBy, idempotencyKey.
* Indexes for pagination by conversationId, sender, unique idempotencyKey,
  unique call log by `callData.callHistoryId`.

`Group`:

* name, admin, members, avatar.
* Group conversationId is the group `_id`.

`File`:

* File upload metadata, used for attachments.

`CallHistory`:

* callerId, receiverId, conversationId, type `video|audio`, status, timestamps,
  duration, readBy, endedBy.
* Collection name `call-histories`.

## Redis Cache Patterns

Key names are separated by namespace to avoid conflicts with the Socket.IO adapter:

* `cache:user:{id}`: profile cache-aside, TTL 900s.
* `cache:friends:{userId}`: Redis SET of friend ids, write-through + warm-up.
* `convs:{userId}`: Sorted Set of recent conversation ids, score is timestamp.
* `presence:{userId}`: presence HASH with TTL.
* `chat_history:{conversationId}`: LIST of latest 50 messages.

Principles:

* MongoDB remains the source of truth.
* Redis miss performs warm-up from MongoDB.
* Write-through for operations intentionally changing friends/conversations/presence.
* Heartbeat must not write MongoDB.

Important bugs:

* `server/src/controllers/userController.js` uses `setPresenceWriteThrough` in
  `updateUserProfile` but has not imported it.
* `server/src/services/friendCacheService.js` uses `updateConversationRemove`
  but has not imported it from `conversationCacheService`.

## REST API Map

Auth:

* `POST /api/auth/register`
* `POST /api/auth/login`
* `POST /api/auth/google`
* `POST /api/auth/forgot-password`
* `POST /api/auth/reset-password/:id/:token`

Users:

* `GET /api/users/profile`
* `PUT /api/users/profile`
* `GET /api/users/friends`
* `GET /api/users/friend-requests`
* `POST /api/users/friend-request`
* `POST /api/users/accept-friend`
* `POST /api/users/reject-friend`
* `GET /api/users/sidebar-list`
* `GET /api/users/online-friends`
* `GET /api/users/search`
* `GET /api/users/:id`

Messages:

* `POST /api/messages`
* `GET /api/messages/:userId1/:userId2`
* `GET /api/messages/sync`

Groups:

* mounted under `/api/groups`.
* Group operations also emit socket events and system messages.

Calls:

* mounted under `/api/calls`.
* Call socket events create/update `CallHistory` and inline call log messages.

Files:

* mounted under `/api/files`.
* Upload logic uses S3 service and may use image compression/sharp.

## Frontend Patterns

* Alias `@/` points to `client/src`.
* Socket event names should come from `client/src/constants/socketEvents.js`.
* Shared socket state lives in `SocketProvider`.
* Auth changes are synced by `auth-changed` and browser `storage` events.
* Chat sends are optimistic; never casually remove idempotency/retry behavior.
* Message UI must handle sender as either populated object or raw id.
* Attachments may appear as DB ids, populated docs, or normalized client metadata.
* Group chat is detected by `Boolean(activeChat.members)`.
* Direct chat target is a user `_id`; group target is group `_id`.

## Deployment / Nginx Notes

* Client build is served from `client/dist`.
* `/api/` proxies to backend.
* `/api/auth/` has stricter nginx rate limiting.
* `/socket.io/` sets WebSocket upgrade headers and disables buffering.
* Client uses websocket-only transport, so no long-polling fallback is expected.
* Redis adapter allows events across multiple backend replicas.

## When Modifying Code

* Use `rg` to search for files/events/functions.
* Read both server and client flow of the same event before modifying.
* If modifying REST auth, check `middlewares/auth.js` export first.
* If modifying socket events, update both server handler, client listener/emitter, and
  `socketEvents.js` if needed.
* If modifying message send, preserve `idempotencyKey`, optimistic UI, and pending queue.
* If modifying presence, do not write MongoDB during heartbeat.
* If modifying Redis keys, preserve separate namespace and inspect warm-up paths.
* If modifying group membership, ensure join/leave room and realtime events still work.
* If modifying call flow, check temp id -> DB id mapping, timeout cleanup, and
  `call_log` upsert.
* Do not revert unrelated changes in the working tree.

## Common Commands

Server:

```powershell
cd server
npm run dev
```

Client:

```powershell
cd client
npm run dev
npm run build
```

Docker:

```powershell
docker compose up --build
```

Search:

```powershell
rg "sendMessage"
rg "SOCKET_EVENTS"
rg "conversationId"
```

## Checklist Before Finishing a Change

* Build/lint/test the relevant parts if possible.
* Verify auth token flow is not broken.
* Verify socket events have listener cleanup (`socket.off`) on the client.
* Verify Mongo queries have appropriate indexes if adding new queries.
* Verify Redis fallback when cache miss or Redis is not open.
* Verify group/direct chat conversationId is not mixed.
* Clearly state if tests/build could not be run.
