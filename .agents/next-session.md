# Next Session — Slice 9 Reconciliation / Drift Report

## Slice mục tiêu

Implement Conversation Read Model Migration — Slice 9: Reconciliation/drift report only.

## Bối cảnh

Đã hoàn thành:

- Slice 1: `Conversation` + `ConversationParticipant` models/indexes.
- Slice 2: `ensureConversationForConfirmedMessage` service.
- Slice 3: visibility/access helpers.
- Slice 4: read-only backfill dry-run.
- Slice 5: manual backfill write service + runner.
- Slice 6: guarded socket-message dual-write hook.
- Slice 6b: fixed MongoDB unique sparse/null index bug.
- Slice 7: disabled-by-default shadow compare for direct/group sidebar.
- Slice 8: expanded guarded dual-write coverage for REST messages, group system messages, and inserted call-log messages.

Runtime hiện tại vẫn legacy-authoritative:

- `Message.conversationId` không đổi.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Sidebar/search vẫn legacy.
- `Conversation._id` không expose ra client.
- `CONVERSATION_DUAL_WRITE_ENABLED=false` mặc định.
- `CONVERSATION_SHADOW_COMPARE_ENABLED=false` mặc định.

## Mục tiêu Slice 9

Thêm reconciliation/drift report thủ công, read-only, để so sánh legacy MongoDB data với Conversation Read Model và báo cáo drift có thể hành động.

## Guardrails bắt buộc

- Report-only/read-only, không ghi DB.
- Không repair data tự động.
- Không chạy ở startup.
- Không switch sidebar/search sang read model.
- Không đổi API/socket payloads.
- Không expose `Conversation._id` ra client.
- Không đổi Redis/RabbitMQ behavior.

## Gợi ý scope

- Manual script/service scan legacy `Message` grouped by `conversationId`.
- Compare existence of `Conversation` by `legacyConversationId`.
- Compare participant rows expected from direct IDs or `Group.members`.
- Compare stable last-message fields and unread counts where semantics are trusted.
- Output counts and warnings; keep JSON/report shape deterministic for tests.

## Tests cần có

- Matching legacy/read-model data returns zero drift.
- Missing conversation is reported.
- Missing participant is reported.
- Last-message mismatch is reported.
- Group participant drift is reported.
- Script defaults to report-only and performs no writes.

## Non-goals

- Không repair/backfill write.
- Không switch read path.
- Không add runtime hooks.
- Không expand dual-write further.