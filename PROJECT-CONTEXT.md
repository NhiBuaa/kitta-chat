---
name: using-superpowers
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
---

# SYSTEM RULES & REPOSITORY CONTEXT

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.
IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
This is not negotiable. This is not optional. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## Instruction Priority

Superpowers skills override default system prompt behavior, but **user instructions always take precedence**:
1. **User's explicit instructions** (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) — highest priority
2. **Superpowers skills** — override default system behavior where they conflict
3. **Default system prompt** — lowest priority

If AGENTS.md says "don't use TDD" and a skill says "always use TDD," follow the user's instructions. The user is in control.

## How to Access Skills

**In Codex / Codex Desktop App:** Use the `skill` tool equivalent or local skill trigger.
**In Claude Code:** Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you—follow it directly. Never use the Read tool on skill files.

## Using Skills Rule

**Invoke relevant or requested skills BEFORE any response or action.** Even a 1% chance a skill might apply means that you should invoke the skill to check. If an invoked skill turns out to be wrong for the situation, you don't need to use it.

### Red Flags (STOP & RATIONALIZE)
Questions are tasks. Check for skills BEFORE clarifying questions or exploring the codebase. Simple things become complex, use skills to maintain discipline.

### Skill Priority
1. **Process skills first** (brainstorming, debugging) - these determine HOW to approach the task
2. **Implementation skills second** (TDD, frontend-design) - these guide execution

---

## Part 1: Skills Workflow Shortcuts (Matt Pocock & Superpowers)

Khi người dùng nhập các lệnh tắt bằng dấu gạch chéo (`/`), hoặc khi hệ thống kích hoạt Workflow, hãy tra cứu và áp dụng chính xác các kỹ năng tương ứng dưới đây:

### Setup & Management
* Initialization → `setup-matt-pocock-skills`
* Issue triage → `triage`
* Issue creation → `to-issues`

### Design & Planning
* Feature design / Brainstorming → `grill-with-docs` (and Superpowers `brainstorming`)
* Non-code alignment → `grill-me`
* PRD synthesis → `to-prd`
* Implementation Plans → `writing-plans` (Break work into bite-sized tasks of 2-5 minutes)

### Development & Execution
* Prototyping → `prototype`
* Implementation / Test-Driven Development → `tdd` (Enforce RED-GREEN-REFACTOR cycle. Deletes code written before tests)
* Subagent Execution → `subagent-driven-development` or `executing-plans`

### Debugging & Quality
* Debugging / Hard bugs → `diagnose` (4-phase root cause process)
* Architecture review → `zoom-out`
* Refactor / Rescue ball of mud → `improve-codebase-architecture`

### Productivity & Session Wrap-up
* Session summary / Handoff → `handoff`
* Token saving → `caveman` (Ưu tiên kích hoạt chế độ siêu nén này để giảm dung lượng context và tiết kiệm token qua 9Router)
* Skill creation → `write-a-skill`

---

## Part 2: Web-Socket Repository Long-term Guidance

Long-term guidance for AI agents working in the `web-socket` repository.

This repository is a KittaChat-style realtime chat application: React/Vite client, Express server, Socket.IO, MongoDB/Mongoose, Redis, RabbitMQ workers, nginx, and Docker Compose. When modifying code, prioritize reading the existing flow first, keep changes small, and respect the existing MongoDB / Redis / Socket.IO / RabbitMQ boundaries.

### Overall Architecture

* `client/`: React 19 + Vite. The app is divided by feature inside `client/src/features`.
* `server/`: Express 5 + Socket.IO 4 + Mongoose. Process entry point is `server/server.js`; Express app wiring lives in `server/src/app.js`.
* `nginx/`: reverse proxy for static frontend, REST API, and `/socket.io/`.
* `docker-compose.yml`: runs nginx, 3 backend replicas, Redis, MongoDB, RabbitMQ, and background workers.
* MongoDB is the source of truth.
* Redis is used for the Socket.IO adapter, presence, profile cache, friends cache, recent conversations, and short chat history.
* RabbitMQ is background-only for image processing, notification/email, and audit jobs; never use RabbitMQ for realtime chat/call delivery or call lifecycle decisions.

The server only listens after MongoDB connects successfully, then calls `connectCacheRedis()` and `initSocket(server, app)`.

### Important Folders

* `server/server.js`: process startup/shutdown, MongoDB connect, Redis cache connect, Socket.IO init, HTTP listen.
* `server/src/app.js`: Express middleware, routes, request logging, health/readiness, error handling, and testable app factory.
* `server/src/queues/`: RabbitMQ topology, producers, job builders, and correlation helpers.
* `server/src/workers/`: RabbitMQ worker runtime and image/notification/audit consumers.
* `server/src/socket/index.js`: initializes Socket.IO, Redis adapter, JWT socket auth, registers handlers.
* `server/src/socket/handlers/`: event handlers for presence, message, friend, typing, and call.
* `server/src/socket/handlers/call/`: WebRTC signaling, call state, timeout, call log.
* `server/src/controllers/`: REST business logic.
* `server/src/models/`: Mongoose schemas.
* `server/src/services/`: Redis cache/presence/S3 services.
* `client/src/services/socket/SocketProvider.jsx`: socket lifecycle on the client.
* `client/src/constants/socketEvents.js`: shared socket event names.
* `client/src/features/chat/hooks/useChatMessages.js`: fetch, optimistic send, retry, message pagination.
* `client/src/features/chat/socket/useMessageSocket.js`: receive message/read/call log.
* `client/src/features/calls/context/`: call state and socket events on the client.

### Authentication Flow

Local auth:
1. `POST /api/auth/register` validates email/password, bcrypt hashes the password, creates `User`.
2. `POST /api/auth/login` verifies bcrypt, updates `activityStatus`, returns JWT signed with payload `{ id: user._id }`, expires after `1d`.
3. Client keeps the access token and current user in memory only; it must not persist `token` or `user` in `localStorage`.
4. Reload/session recovery uses the HttpOnly `kittachat_refresh` cookie through `/api/auth/refresh`.

Google auth:
1. Client gets Firebase ID token.
2. `POST /api/auth/google` verifies token using `firebase-admin`.
3. Server creates/updates `User` provider `google`, may upload Google avatar to S3.
4. Server returns app JWT similar to local login.

REST auth:
* `client/src/services/api/axiosClient.js` attaches `Authorization: Bearer <token>` using the access token from memory.
* When REST returns `401` or `403`, `axiosClient` attempts one refresh-cookie retry, hydrates memory token/user on success, emits `auth-changed`, and retries the original request.
* If refresh fails, the client clears auth memory plus legacy auth storage keys, emits `auth-changed`, and redirects to `/login`.
* `ProtectedRoute` reads AuthProvider state through `useAuth()` (`isChecking`, `isAuthenticated`).

Socket auth:
* Client connects Socket.IO using `auth: { token }`.
* `server/src/socket/index.js` uses `jwt.verify(token, JWT_SECRET)`, sets `socket.userId`, rejects missing/invalid/expired token before connection.

Important note:
* `server/src/middlewares/auth.js` currently exports both the middleware itself and named helpers. Preserve that compatibility if touching REST auth.

### WebSocket Flow

Client lifecycle:
1. `SocketProvider` reads `user` and `token` from `useAuth()` / AuthProvider memory state.
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
5. First online tab performs write-through presence to MongoDB + Redis and broadcasts `userStatusChanged`.
6. Disconnect removes socket id, sets 5s grace period to avoid flicker during refresh.

Core events:
* `sendMessage` -> server save/upsert Message -> update Redis -> emit `getMessage`.
* `markRead` -> direct update `isRead`, group push `readBy`.
* `typing` / `stopTyping` -> `getTyping` / `getStopTyping`.
* Friend REST changes DB/cache, socket events update realtime sidebar.
* Group REST changes DB, creates system message, emits group events.
* Call events: `initCall`, `callUser`, `answerCall`, `rejectCall`, `endCall`, `toggleMedia`.

### Message Flow

Client send:
1. `useChatMessages.handleSendMessage` creates optimistic message with `_id=temp_*`.
2. Creates `idempotencyKey` using UUID.
3. Stores pending queue in `localStorage`.
4. Emits `sendMessage` with sender, receiver, text, attachments, isGroup, conversationId, idempotencyKey.
5. Successful callback replaces temp id with `realId`; error sets status `error`.

Server receive:
1. `messageHandler.sendMessage` gets sender/receiver/isGroup.
2. Gets latest sender profile using Redis cache-aside `getCachedUserProfile`.
3. Calculates `conversationId`: group = groupId, direct = sorted `senderId_receiverId`.
4. Calls `saveMessageInBackground`.
5. Emits: Group (`io.to(groupId).emit("getMessage", payload)`), Direct (emit to both `receiverId` and `senderId` rooms).
6. Callback `{ success, realId, isDuplicate }`.

Dedup/retry pattern:
* `Message` has unique sparse index on `{ sender, idempotencyKey }`.
* Client retries sending with the same `idempotencyKey`.
* Server upserts to avoid duplicates.

### Presence Flow

Presence Redis keys:
* `presence:{userId}` HASH `{ status, lastSeen }`, TTL 30s.
* `user_sockets:{userId}` SET list of currently open socket ids.
* `offline_timer:{userId}` temporary 5s key during disconnect.
* `global_online_users` SET still exists for some legacy logic.

Pattern:
* First connection: `setPresenceWriteThrough(userId, "online")`.
* Heartbeat: only renews Redis TTL, does not write MongoDB.
* Actual offline: after grace period, if no remaining sockets then update MongoDB and Redis, broadcast to friend/group rooms.

### Call Flow

Call signaling is located in `server/src/socket/handlers/call/`.
* `initCall`: creates pending `CallHistory`, maps temp call id to DB id, sets timeout.
* `callUser`: forwards WebRTC offer, creates record if missing, checks receiver online, rate limits, handles glare when both users call each other simultaneously.
* `answerCall`: clears timeout, sets `answeredAt`, emits `callAccepted`.
* `rejectCall`: sets status `rejected`, `busy`, or `missed` depending on reason.
* `endCall`: if answered then `completed` and calculates duration; if not answered then `missed`.
* Finalized call creates/upserts `Message` type `call_log`, emits `getMessage` and `callLogMessage` to both participants.

`CallHistory` statuses: `pending`, `completed`, `missed`, `rejected`, `unreachable`, `busy`.

### Database Models

`User`: email unique, password, provider `local|google`, displayName, avatar, status, activityStatus, friends, friendRequests. Indexes for friends, friendRequests, displayName.

`Message`: `conversationId`, type `text|file|system|call_log`, sender, receiver, text, attachments, callData, isRead, readBy, idempotencyKey. Indexes for pagination by conversationId, sender, unique idempotencyKey, unique call log by `callData.callHistoryId`.

`Group`: name, admin, members, avatar. Group conversationId is the group `_id`.

`File`: File upload metadata, used for attachments.

`CallHistory`: callerId, receiverId, conversationId, type `video|audio`, status, timestamps, duration, readBy, endedBy. Collection name `call-histories`.

### Redis Cache Patterns

Key names are separated by namespace to avoid conflicts with the Socket.IO adapter:
* `cache:user:{id}`: profile cache-aside, TTL 900s.
* `cache:friends:{userId}`: Redis SET of friend ids, write-through + warm-up.
* `convs:{userId}`: Sorted Set of recent conversation ids, score is timestamp.
* `presence:{userId}`: presence HASH with TTL.
* `chat_history:{conversationId}`: LIST of latest 50 messages.

Principles:
* MongoDB remains the source of truth; Redis miss performs warm-up from MongoDB.
* Write-through for operations intentionally changing friends/conversations/presence.
* Heartbeat must not write MongoDB.

**CRITICAL BUGS TO REMEMBER:**
1. `server/src/controllers/userController.js` uses `setPresenceWriteThrough` in `updateUserProfile` but has **NOT imported it**.
2. `server/src/services/friendCacheService.js` uses `updateConversationRemove` but has **NOT imported it** from `conversationCacheService`.

### REST API Map

* Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/forgot-password`, `/api/auth/reset-password/:id/:token`.
* Users: profile (GET/PUT), friends, friend-requests, online-friends, search, sidebar-list, `:id`.
* Messages: `POST /api/messages`, `GET /api/messages/:userId1/:userId2`, `GET /api/messages/sync`.
* Groups: mounted under `/api/groups`. Emit socket events and system messages.
* Calls: mounted under `/api/calls`. Inline call log messages.
* Files: mounted under `/api/files`. Uses S3 service and sharp compression.

### Frontend Patterns

* Alias `@/` points to `client/src`.
* Socket event names should come from `client/src/constants/socketEvents.js`.
* Shared socket state lives in `SocketProvider`. Auth changes synced by `auth-changed`.
* Chat sends are optimistic; preserve idempotency/retry behavior.
* Message UI handles sender as populated object or raw id.
* Group chat detected by `Boolean(activeChat.members)`. Direct target is user `_id`; group target is group `_id`.

### Deployment / Nginx Notes

* Client build from `client/dist`. `/api/auth/` has stricter nginx rate limiting.
* `/socket.io/` sets WebSocket upgrade headers and disables buffering (websocket-only).
* Redis adapter allows events across multiple backend replicas.

### Backend Reliability / OPSWAT Prep Phase 1

* HTTP integration tests live in `server/test/httpCoreFlows.test.js`.
* Request ID & structured logger enabled via middlewares.
* Hardened `/healthz` and `/readyz` with MongoDB, Redis, RabbitMQ degraded semantics.
* RabbitMQ correlation propagation (`requestId` -> `correlationId`), retry, DLQ, and poison-message tests (`server/test/rabbitmqInfrastructure.test.js`).
* Safe to claim: request/correlation IDs, RabbitMQ retry/DLQ, health endpoints, multi-replica scaling docs. Do NOT claim full production observability or complete CI/CD yet.

### Unified Sidebar Domain Glossary

* **Unified Sidebar Conversation (Cuộc hội thoại Sidebar gộp chung):** Đại diện cho một phần tử hội thoại phẳng duy nhất trong sidebar hiển thị cả direct chat và group chat của user, được sắp xếp động theo `lastMessageAt` và `isPinned`.
* **Sidebar Filter Chip (Bộ lọc nhanh sidebar):** Nút chọn trạng thái lọc danh sách hội thoại tại client ("Tất cả", "Cá nhân", "Nhóm") để gửi truy vấn theo loại (`kind`) tương ứng lên backend, đồng thời kết hợp logic AND với từ khóa tìm kiếm.

### When Modifying Code (Mandatory Rules)

* Use `rg` to search for files/events/functions.
* Read both server and client flow of the same event before modifying.
* Preserve default/named exports in `middlewares/auth.js`.
* Preserve `idempotencyKey`, optimistic UI, and pending queue on client send.
* Do not write MongoDB during heartbeat.
* Preserve RabbitMQ `correlationId`, retry queue, DLQ, and poison-message behavior.
* Do not revert unrelated changes in the working tree.

### Checklist Before Finishing a Change

* Build/lint/test relevant parts. Verify auth token flow.
* Verify socket events have listener cleanup (`socket.off`) on the client.
* Verify Mongo queries have appropriate indexes.
* Verify Redis fallback when cache miss or Redis is down.
* Verify group/direct chat conversationId is not mixed.
* Clearly state if tests/build could not be run.
