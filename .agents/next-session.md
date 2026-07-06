# Next Session — Slice 8 Expand Dual-Write Coverage

## Slice mục tiêu

Plan and implement Conversation Read Model Migration — Slice 8: Expand dual-write coverage only.

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

Runtime hiện tại vẫn legacy-authoritative:

- `Message.conversationId` không đổi.
- Socket.IO payloads/rooms không đổi.
- Redis sidebar/cache keys không đổi.
- RabbitMQ không đổi.
- Sidebar/search vẫn legacy.
- `Conversation._id` không expose ra client.
- `CONVERSATION_DUAL_WRITE_ENABLED=false` mặc định.
- `CONVERSATION_SHADOW_COMPARE_ENABLED=false` mặc định.

## Mục tiêu Slice 8

Mở rộng dual-write coverage cho các path message persistence còn thiếu, nếu path đó đã confirmed legacy write thành công và có thể gọi `ensureConversationForConfirmedMessage` an toàn.

## Phạm vi cần khảo sát trước khi code

1. REST message paths trong `messageController` / routes liên quan.
2. System message paths của group lifecycle.
3. Call-log message creation paths.
4. Bất kỳ path nào tạo `Message` durable nhưng chưa đi qua `saveMessageInBackground`.

## Guardrails bắt buộc

- Mọi dual-write path vẫn phải guard bằng `CONVERSATION_DUAL_WRITE_ENABLED=false` mặc định.
- Chỉ gọi read-model service sau confirmed legacy MongoDB message persistence.
- Duplicate/idempotent retries không được double-increment unread.
- Read-model errors phải log/swallow để legacy behavior tiếp tục.
- Không đổi client responses.
- Không đổi Socket.IO payloads/rooms.
- Không đổi Redis keys/schema hoặc RabbitMQ behavior.
- Không switch sidebar/search sang read model.
- Không expose `Conversation._id`.
- Không chạy backfill/repair tự động.

## Tests cần có

- Targeted tests cho từng persistence path được mở rộng.
- Flag off: không gọi read-model service.
- Flag on: gọi read-model service sau legacy write thành công.
- Failure in read-model service: legacy response/event vẫn giữ nguyên.
- Duplicate/idempotent behavior nếu path có retry semantics.

## Non-goals

- Không implement reconciliation/drift report.
- Không implement sidebar candidate read service.
- Không switch read path.
- Không sửa historical visibility/search guard.
- Không tích hợp group lifecycle participant membership ngoài tác động của message-created dual-write.