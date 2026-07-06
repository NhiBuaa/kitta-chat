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
- Next slice là mở rộng dual-write coverage.

## Done When

- Read model rows có thể được tạo qua manual backfill hoặc guarded socket dual-write.
- Multiple direct/group conversations không bị lỗi unique index với null fields.
- `Conversation._id` không expose ra client.
- `Message.conversationId` vẫn không đổi.
- Redis/RabbitMQ behavior không đổi.
- Sidebar/search chưa switch trước khi shadow compare/reconciliation đủ tin cậy.
