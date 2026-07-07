# Conversation Read Model Migration

## Why

Legacy sidebar/conversation state hiện được derive từ `Message`, `Group`, Redis cache, và per-route aggregation. Conversation Read Model được xây dựng để có foundation tốt hơn cho sidebar, visibility, unread, archive/delete, search guard, và reconciliation trong tương lai.

## Behavior

- `Conversation` lưu metadata hội thoại backend-internal.
- `ConversationParticipant` lưu per-user conversation state.
- `legacyConversationId` bridge về `Message.conversationId`.
- Backfill dry-run quét legacy MongoDB data và báo cáo candidates/warnings mà không ghi.
- Manual backfill write tạo/update read-model rows khi chạy explicit `--write`.
- Socket message dual-write có guard `CONVERSATION_DUAL_WRITE_ENABLED=false` mặc định.
- Dual-write chỉ chạy sau confirmed non-duplicate socket message persistence.
- Read-model errors trong dual-write được log/swallow để legacy behavior tiếp tục.
- Sidebar/search vẫn legacy-authoritative.
- Shadow compare direct/group sidebar có guard `CONVERSATION_SHADOW_COMPARE_ENABLED=false` mặc định.
- Shadow compare chỉ read-only log/report mismatch, không đổi client response.
- Guarded dual-write now covers socket message persistence, REST `createMessage`, group `createSystemMessage`, and newly inserted `call_log` messages.
- Existing call-log updates do not dual-write again, avoiding duplicate unread increments.
- Manual reconciliation/drift report is read-only and compares legacy `Message` groups with read-model rows.
- Reconciliation reports missing conversations, missing participants, stable last-message drift, unread-count drift, and group participant drift without repairing data.
- Read-model sidebar candidate service can build deterministic candidates from `ConversationParticipant` + `Conversation` rows without switching client responses.
- Direct sidebar read switch exists behind `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED=false` by default, preserving response shape and falling back to legacy behavior on read-model errors or unsafe candidate state.
- Message visibility rules (deletedAt/leftAt bounds) are applied to `getMessages` and `syncMissedMessages` query paths.
- Next slice is read receipts / unread reconciliation.

## Done When

- Read model rows có thể được tạo qua manual backfill hoặc guarded socket dual-write.
- Multiple direct/group conversations không bị lỗi unique index với null fields.
- `Conversation._id` không expose ra client.
- `Message.conversationId` vẫn không đổi.
- Redis/RabbitMQ behavior không đổi.
- Sidebar/search chưa switch trước khi shadow compare/reconciliation đủ tin cậy.
- Reconciliation can report actionable drift without writing DB or changing runtime paths.
- Sidebar candidate service can return read-model candidates without exposing `Conversation._id` or changing existing API responses.
- Sidebar read switch remains disabled by default and can fall back to the legacy sidebar path.
- Message history and sync paths enforce soft-delete and membership visibility bounds.
