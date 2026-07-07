# Next Session — Slice 10 Sidebar Candidate Read Service

## Slice mục tiêu

Implement Conversation Read Model Migration — Slice 10: sidebar candidate read service only.

## Bối cảnh

Đã hoàn thành Slice 9:

- Added read-only reconciliation/drift report service.
- Added manual `server/scripts/reconcileConversations.js` runner.
- Runner rejects `--write`; no repair/backfill writes are performed.
- Full server regression after Slice 9: `254/254`.

Runtime hiện tại vẫn legacy-authoritative:

- `Message.conversationId` không đổi.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Sidebar/search vẫn legacy.
- `Conversation._id` không expose ra client.
- `CONVERSATION_DUAL_WRITE_ENABLED=false` mặc định.
- `CONVERSATION_SHADOW_COMPARE_ENABLED=false` mặc định.

## Mục tiêu Slice 10

Build read-model sidebar candidate service, but do not switch API responses.

The service should be callable by tests and future shadow/read-switch slices to produce sidebar candidates from `ConversationParticipant` + `Conversation` rows.

## Guardrails bắt buộc

- Read-only service; no DB writes.
- Do not change existing sidebar API responses.
- Do not wire read-model candidates into runtime responses unless only behind existing shadow/compare logging.
- Do not switch sidebar/search to read model.
- Do not expose `Conversation._id` to clients.
- Do not change Socket.IO payloads/rooms.
- Do not change Redis/RabbitMQ behavior.

## Gợi ý scope

- Add a service that queries visible `ConversationParticipant` rows for a user.
- Populate or join enough `Conversation` metadata to emit stable candidate fields.
- Respect existing visibility helper semantics for deleted/archived/default sidebar visibility.
- Preserve legacy public identifier as `legacyConversationId` / `conversationId`, not internal `_id`.
- Keep output deterministic for tests.

## Tests cần có

- Direct candidate includes legacy conversation id, last-message fields, unread count, and kind.
- Archived/deleted/no-last-message participants are excluded from default sidebar candidates.
- Group candidate uses legacy group conversation id without exposing internal `Conversation._id`.
- Ordering is deterministic by pinned state and last-message time if supported by existing model semantics.
- Service performs read-only model calls and no writes.

## Non-goals

- Không switch sidebar response.
- Không đổi REST API shape.
- Không đổi Redis cache/sidebar keys.
- Không repair reconciliation drift.
- Không integrate group lifecycle membership changes.
