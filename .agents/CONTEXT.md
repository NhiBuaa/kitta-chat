# Current Project

KittaChat — realtime chat and calling platform.

The project provides direct messaging, group messaging, presence, friendships, file/avatar uploads, and audio/video calling with background workers for side effects.

## Architecture

Frontend: React 19, Vite, Tailwind CSS, Socket.IO Client, WebRTC APIs.

Backend: Node.js, Express 5, Socket.IO 4, Mongoose, JWT, Firebase Admin SDK.

Database: MongoDB.

Cache / Coordination: Redis for Socket.IO adapter support, presence/cache, recent conversation cache, and short-lived coordination mirrors.

Background Jobs: RabbitMQ workers for image/avatar processing, notification/email jobs, and audit/statistics jobs.

Reverse Proxy / Runtime: nginx and Docker Compose.

## Current Priorities

- Preserve MongoDB as the durable source of truth.
- Preserve legacy `Message.conversationId` as the public/socket/cache bridge.
- Continue Conversation Read Model migration in small, testable slices.
- Keep sidebar/search legacy-authoritative until shadow compare and reconciliation are trusted.
- Keep Redis as cache/coordination only.
- Keep RabbitMQ background-only.
- Avoid exposing backend-internal `Conversation._id` to clients.

## Language

**Conversation Read Model**:
A backend read model for conversations and per-user conversation state, represented by `Conversation` and `ConversationParticipant`.
_Avoid_: treating it as the current source of truth before a read-switch slice is approved.

**Legacy Conversation Id**:
The existing public identifier carried by `Message.conversationId`, Socket.IO rooms/payloads, and Redis conversation cache keys.
_Avoid_: replacing it with `Conversation._id` in client-visible contracts.

**Conversation Participant**:
A per-user row of conversation state such as unread count, last visible message, archive state, mute state, delete state, and membership timing.
_Avoid_: using it as a replacement for `Group.members` before group lifecycle integration is complete.

**Dual-Write**:
A guarded migration path that updates the Conversation Read Model after confirmed legacy message persistence.
_Avoid_: enabling it by default or using it to change client behavior directly.

**Shadow Compare**:
A read-only migration safety step that compares legacy sidebar output with read-model candidates and only logs or reports mismatches.
_Avoid_: changing API responses, switching reads, or repairing data during shadow compare.

**Backfill**:
A manual migration operation that derives or writes read-model rows from existing legacy MongoDB data.
_Avoid_: automatic startup backfills or destructive index/data migrations without explicit approval.
