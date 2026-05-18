# AGENTS.

## Skills Workflow

- Feature design → grill-with-docs
- Implementation → tdd
- Debugging → diagnose
- Architecture review → zoom-out
- Refactor → improve-codebase-architecture
- Session summary → handoff

Huong dan dai han cho AI agents lam viec trong repo `web-socket`.

Repo nay la ung dung chat realtime KittaChat-style: React/Vite client, Express
server, Socket.IO, MongoDB/Mongoose, Redis, nginx va Docker Compose. Khi sua code,
uu tien doc luong hien co truoc, giu thay doi nho, va ton trong cac pattern Redis
/ Mongo / Socket.IO da co.

## Kien Truc Tong Quan

- `client/`: React 19 + Vite. App chia theo feature trong `client/src/features`.
- `server/`: Express 5 + Socket.IO 4 + Mongoose. Entry point la `server/server.js`.
- `nginx/`: reverse proxy cho static frontend, REST API va `/socket.io/`.
- `docker-compose.yml`: chay nginx, 3 backend replicas, Redis va MongoDB.
- MongoDB la source of truth.
- Redis dung cho Socket.IO adapter, presence, cache profile, cache friends,
  recent conversations va chat history ngan.

Server chi listen sau khi MongoDB ket noi thanh cong, sau do goi
`connectCacheRedis()` va `initSocket(server, app)`.

## Folder Quan Trong

- `server/server.js`: Express middleware, routes, health checks, shutdown,
  startup DB/cache/socket.
- `server/src/socket/index.js`: khoi tao Socket.IO, Redis adapter, JWT socket auth,
  dang ky cac handler.
- `server/src/socket/handlers/`: event handlers cho presence, message, friend,
  typing va call.
- `server/src/socket/handlers/call/`: WebRTC signaling, call state, timeout,
  call log.
- `server/src/controllers/`: REST business logic.
- `server/src/models/`: Mongoose schemas.
- `server/src/services/`: Redis cache/presence/S3 services.
- `client/src/services/socket/SocketProvider.jsx`: socket lifecycle tren client.
- `client/src/constants/socketEvents.js`: ten event socket dung chung.
- `client/src/features/chat/hooks/useChatMessages.js`: fetch, optimistic send,
  retry, pagination tin nhan.
- `client/src/features/chat/socket/useMessageSocket.js`: nhan message/read/call log.
- `client/src/features/calls/context/`: call state va socket event tren client.

## Authentication Flow

Local auth:

1. `POST /api/auth/register` validate email/password, bcrypt hash password,
   tao `User`.
2. `POST /api/auth/login` verify bcrypt, update `activityStatus`, tra ve JWT
   signed voi payload `{ id: user._id }`, het han sau `1d`.
3. Client luu `token` va `user` trong `localStorage`.

Google auth:

1. Client lay Firebase ID token.
2. `POST /api/auth/google` verify token bang `firebase-admin`.
3. Server tao/update `User` provider `google`, co the upload Google avatar len S3.
4. Server tra ve JWT app nhu local login.

REST auth:

- `client/src/services/api/axiosClient.js` gan `Authorization: Bearer <token>`.
- Khi REST tra `401` hoac `403`, client xoa `token`, `user`, emit
  `auth-changed`, redirect ve `/login`.
- `ProtectedRoute` trong client chi check co token hay khong.

Socket auth:

- Client connect Socket.IO bang `auth: { token }`.
- `server/src/socket/index.js` dung `jwt.verify(token, JWT_SECRET)`, set
  `socket.userId`, reject missing/invalid/expired token truoc khi connection.

Can luu y:

- `server/src/middlewares/auth.js` hien co bug export:
  `module.exports = verifyToken, getUserIdFromToken` chi export
  `getUserIdFromToken`. Cac route import `authMiddleware` co the bi sai/hang vi
  middleware khong goi `next()`. Khi sua auth REST, sua export truoc.

## WebSocket Flow

Client lifecycle:

1. `SocketProvider` doc `user` va `token` tu `localStorage`.
2. Connect toi `VITE_API_URL` bang `transports: ["websocket"]`.
3. On `connect`, emit `addNewUser` voi `userId`.
4. Neu co `last_message_id`, goi REST sync missed messages.
5. Gui `heartbeat` moi 20 giay.
6. Cleanup disconnect socket, clear heartbeat va debounce timer.

Server lifecycle:

1. Socket.IO middleware verify JWT.
2. On `connection`, emit `me`, dang ky handler presence/message/friend/typing/call.
3. `addNewUser` join room userId va tat ca group room cua user.
4. Redis `user_sockets:{userId}` ho tro multi-tab.
5. First tab online thi write-through presence vao MongoDB + Redis va broadcast
   `userStatusChanged`.
6. Disconnect xoa socket id, dat grace period 5s de tranh flicker khi refresh.

Core events:

- `sendMessage` -> server save/upsert Message -> update Redis -> emit `getMessage`.
- `markRead` -> direct update `isRead`, group push `readBy`.
- `typing` / `stopTyping` -> `getTyping` / `getStopTyping`.
- Friend REST thay doi DB/cache, socket event cap nhat realtime sidebar.
- Group REST thay doi DB, tao system message, emit group events.
- Call events: `initCall`, `callUser`, `answerCall`, `rejectCall`, `endCall`,
  `toggleMedia`.

## Message Flow

Client send:

1. `useChatMessages.handleSendMessage` tao optimistic message voi `_id=temp_*`.
2. Tao `idempotencyKey` bang UUID.
3. Luu pending queue vao `localStorage`.
4. Emit `sendMessage` voi sender, receiver, text, attachments, isGroup,
   conversationId, idempotencyKey.
5. Callback thanh cong thi thay temp id bang `realId`; loi thi set status `error`.

Server receive:

1. `messageHandler.sendMessage` lay sender/receiver/isGroup.
2. Lay sender profile moi nhat bang Redis cache-aside
   `getCachedUserProfile`.
3. Tinh `conversationId`: group = groupId, direct =
   sorted `senderId_receiverId`.
4. Goi `saveMessageInBackground`.
5. Emit:
   - Group: `io.to(groupId).emit("getMessage", payload)`.
   - Direct: emit cho ca `receiverId` va `senderId` rooms.
6. Callback `{ success, realId, isDuplicate }`.

Dedup/retry pattern:

- `Message` co unique sparse index tren `{ sender, idempotencyKey }`.
- Client retry gui lai cung `idempotencyKey`.
- Server upsert de tranh duplicate.

## Presence Flow

Presence Redis keys:

- `presence:{userId}` HASH `{ status, lastSeen }`, TTL 30s.
- `user_sockets:{userId}` SET danh sach socket id dang mo.
- `offline_timer:{userId}` key tam 5s khi disconnect.
- `global_online_users` SET con ton tai cho mot so logic cu.

Pattern:

- First connection: `setPresenceWriteThrough(userId, "online")`.
- Heartbeat: chi renew Redis TTL, khong ghi MongoDB.
- Offline thuc su: sau grace period, neu khong con socket thi update MongoDB va
  Redis, broadcast cho friend/group rooms.

## Call Flow

Call signaling nam trong `server/src/socket/handlers/call/`.

- `initCall`: tao `CallHistory` pending, map temp call id sang DB id, set timeout.
- `callUser`: forward WebRTC offer, tao record neu chua co, check receiver online,
  rate limit, xu ly glare khi hai ben goi nhau cung luc.
- `answerCall`: clear timeout, set `answeredAt`, emit `callAccepted`.
- `rejectCall`: set status `rejected`, `busy`, hoac `missed` tuy reason.
- `endCall`: neu da answer thi `completed` va tinh duration; neu chua answer thi
  `missed`.
- Finalized call tao/upsert `Message` type `call_log`, emit `getMessage` va
  `callLogMessage` cho ca hai participant.

`CallHistory` statuses: `pending`, `completed`, `missed`, `rejected`,
`unreachable`, `busy`.

## Database Models

`User`:

- email unique, password, provider `local|google`, displayName, avatar, status,
  activityStatus, friends, friendRequests.
- Indexes cho friends, friendRequests, displayName.

`Message`:

- `conversationId`, type `text|file|system|call_log`, sender, receiver, text,
  attachments, callData, isRead, readBy, idempotencyKey.
- Indexes cho pagination theo conversationId, sender, idempotencyKey unique,
  call log unique theo `callData.callHistoryId`.

`Group`:

- name, admin, members, avatar.
- Group conversationId chinh la group `_id`.

`File`:

- Metadata file upload, dung cho attachments.

`CallHistory`:

- callerId, receiverId, conversationId, type `video|audio`, status, timestamps,
  duration, readBy, endedBy.
- Collection name `call-histories`.

## Redis Cache Patterns

Ten key duoc tach namespace de khong xung dot voi Socket.IO adapter:

- `cache:user:{id}`: profile cache-aside, TTL 900s.
- `cache:friends:{userId}`: Redis SET friend ids, write-through + warm-up.
- `convs:{userId}`: Sorted Set recent conversation ids, score la timestamp.
- `presence:{userId}`: HASH presence co TTL.
- `chat_history:{conversationId}`: LIST 50 message moi nhat.

Nguyen tac:

- MongoDB van la source of truth.
- Redis miss thi warm-up tu MongoDB.
- Write-through khi thao tac thay doi friends/conversations/presence co chu dich.
- Heartbeat khong duoc ghi MongoDB.

Can luu y bug:

- `server/src/controllers/userController.js` dung `setPresenceWriteThrough` trong
  `updateUserProfile` nhung chua import.
- `server/src/services/friendCacheService.js` dung `updateConversationRemove`
  nhung chua import tu `conversationCacheService`.

## REST API Map

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password/:id/:token`

Users:

- `GET /api/users/profile`
- `PUT /api/users/profile`
- `GET /api/users/friends`
- `GET /api/users/friend-requests`
- `POST /api/users/friend-request`
- `POST /api/users/accept-friend`
- `POST /api/users/reject-friend`
- `GET /api/users/sidebar-list`
- `GET /api/users/online-friends`
- `GET /api/users/search`
- `GET /api/users/:id`

Messages:

- `POST /api/messages`
- `GET /api/messages/:userId1/:userId2`
- `GET /api/messages/sync`

Groups:

- mounted under `/api/groups`.
- Group operations also emit socket events and system messages.

Calls:

- mounted under `/api/calls`.
- Call socket events create/update `CallHistory` and inline call log messages.

Files:

- mounted under `/api/files`.
- Upload logic uses S3 service and may use image compression/sharp.

## Frontend Patterns

- Alias `@/` points to `client/src`.
- Socket event names should come from `client/src/constants/socketEvents.js`.
- Shared socket state lives in `SocketProvider`.
- Auth changes are synced by `auth-changed` and browser `storage` events.
- Chat sends are optimistic; never remove idempotency/retry behavior casually.
- Message UI must handle sender as either populated object or raw id.
- Attachments may appear as DB ids, populated docs, or normalized client metadata.
- Group chat is detected by `Boolean(activeChat.members)`.
- Direct chat target is a user `_id`; group target is group `_id`.

## Deployment / Nginx Notes

- Client build is served from `client/dist`.
- `/api/` proxies to backend.
- `/api/auth/` has stricter nginx rate limit.
- `/socket.io/` sets WebSocket upgrade headers and disables buffering.
- Client uses websocket-only transport, so no long-polling fallback is expected.
- Redis adapter allows events across multiple backend replicas.

## Khi Sua Code

- Dung `rg` de tim file/event/function.
- Doc server va client flow cua cung mot event truoc khi sua.
- Neu sua auth REST, kiem tra `middlewares/auth.js` export truoc.
- Neu sua socket event, cap nhat ca server handler, client listener/emitter va
  `socketEvents.js` neu can.
- Neu sua message send, giu `idempotencyKey`, optimistic UI va pending queue.
- Neu sua presence, khong ghi MongoDB trong heartbeat.
- Neu sua Redis key, giu namespace rieng va xem cac warm-up path.
- Neu sua group membership, dam bao join/leave room va realtime event van dung.
- Neu sua call flow, can kiem tra temp id -> DB id mapping, timeout cleanup va
  call_log upsert.
- Khong revert thay doi khong lien quan trong working tree.

## Lenh Hay Dung

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

## Checklist Truoc Khi Ket Thuc Mot Thay Doi

- Build/lint/test phan lien quan neu co the.
- Kiem tra khong pha auth token flow.
- Kiem tra socket event co listener cleanup (`socket.off`) tren client.
- Kiem tra Mongo query co index phu hop neu them query moi.
- Kiem tra Redis fallback khi cache miss hoac Redis chua open.
- Kiem tra group/direct chat khong bi lan conversationId.
- Ghi ro neu khong chay duoc test/build.
