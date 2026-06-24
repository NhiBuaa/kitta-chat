# Current Session — Conversation Read Model Migration

## Mục tiêu tính năng

Xây dựng và rollout dần Conversation Read Model cho hệ thống chat, trong khi vẫn giữ legacy runtime an toàn:

- MongoDB vẫn là source of truth.
- `Message.conversationId` vẫn là public/socket/cache bridge.
- Redis vẫn là cache/coordination, không phải source of truth.
- RabbitMQ vẫn background-only.
- `Conversation._id` chỉ dùng nội bộ backend, không expose ra client.
- Sidebar/search chưa chuyển sang read model.

## Trạng thái hiện tại

Đã hoàn thành nền tảng read model, backfill, dual-write guarded cho socket message, và fix lỗi index null trong MongoDB.

Runtime hiện vẫn legacy-authoritative:

- Socket.IO payloads/rooms vẫn dùng legacy `conversationId`.
- Redis sidebar/cache keys không đổi.
- Sidebar direct/group vẫn đọc legacy flow.
- Search vẫn legacy.
- REST `createMessage`, `createSystemMessage`, call-log path chưa được dual-write.

## Các slice đã hoàn thành

### Slice 1 — Models + Indexes

- Thêm `Conversation` model.
- Thêm `ConversationParticipant` model.
- Thêm indexes phục vụ legacy id, direct/group uniqueness, sidebar ordering, unread lookup.
- Không runtime wiring.

### Slice 2 — ensureConversationForConfirmedMessage Service

- Thêm service idempotent `ensureConversationForConfirmedMessage(message)`.
- Tạo/reuse `Conversation` và `ConversationParticipant`.
- Maintain global last-message fields.
- Maintain participant last-message fields.
- Increment unread cho visible non-sender participants.
- Chưa wire runtime ở slice này.

### Slice 3 — Visibility / Access Helpers

- Thêm `conversationVisibilityHelpers`.
- Helpers gồm:
  - `isParticipantReadable`
  - `buildMessageVisibilityFilter`
  - `isSidebarVisible`
  - `isArchivedVisible`
  - `applySoftDeleteState`
  - `canIncrementUnreadForParticipant`
  - `getNotificationSuppressionState`
- Chưa wire vào controllers/routes/search/sidebar.

### Slice 4 — Backfill Dry-Run + Reconciliation Checks

- Thêm read-only dry-run scanner.
- Quét legacy `Message` grouped by `conversationId`.
- Dùng `Group` để derive group participants.
- Report create/update/skip candidates và data-shape warnings.
- Zero writes.

### Slice 5 — Backfill Write Service + Manual Runner

- Thêm write backfill service.
- Thêm manual runner `server/scripts/backfillConversations.js`.
- Runner default dry-run.
- Write mode yêu cầu explicit `--write`.
- Chỉ tạo/update `Conversation` và `ConversationParticipant`.
- Không startup hook, không package script runtime, không dual-write activation.

### Slice 6 — Guarded Dual-Write Hook For Socket Message Persistence

- Thêm `CONVERSATION_DUAL_WRITE_ENABLED`, default `false`.
- Wire guarded hook trong `saveMessageInBackground`.
- Hook chỉ chạy khi:
  - flag là `true`
  - `savedMessage` tồn tại
  - `isDuplicate === false`
- Gọi `ensureConversationForConfirmedMessage(savedMessage)`.
- Lỗi read-model được log/swallow.
- Existing Redis chat cache và conversation recency behavior không đổi.

### Slice 6b — Conversation Index / Null Schema Fix

- Fix lỗi Docker dual-write từng gặp:
  - `E11000 duplicate key error collection: shot-chat.conversations index: groupId_1 dup key: { groupId: null }`
- Root cause:
  - MongoDB unique sparse indexes vẫn index field tồn tại với `null`.
  - Direct conversations từng lưu `groupId: null`.
  - Group conversations có risk tương tự với `directKey: null`.
- Fix state:
  - Direct conversations omit `groupId`.
  - Group conversations omit `directKey`.
  - Unique indexes dùng `partialFilterExpression`.
  - Write payloads tránh ghi non-applicable null fields.

## Manual verification đã có

- Hệ thống chạy qua Docker Compose.
- Host shell env không tự ảnh hưởng backend container env.
- Muốn test dual-write trong Docker phải truyền `CONVERSATION_DUAL_WRITE_ENABLED=true` vào backend container qua Compose env/override.
- Đã confirm backend container thấy flag bằng `printenv`.
- Đã confirm UI socket message thật trigger dual-write.
- Sau index/schema fix, gửi message từ UI cập nhật được `conversations` trong MongoDB.

## Test results gần nhất

- Sau Slice 6: targeted suite `63/63`, full server regression `224/224`.
- Sau index/schema fix: targeted env/save/read-model suite `66/66`, full regression `227/227`.

## Rủi ro hiện tại

- Dual-write hiện chỉ cover socket message persistence.
- REST message, system message, call-log, group lifecycle paths chưa được dual-write.
- Direct sidebar legacy vẫn hiển thị friends chưa nhắn tin; read model chỉ có rows sau message/backfill.
- Group sidebar legacy dựa trên `Group.members`; read model participants có thể drift nếu group lifecycle chưa được tích hợp.
- Unread semantics legacy và read model khác nguồn:
  - direct legacy dùng `receiver + isRead=false`
  - group legacy dùng `readBy`
  - read model dùng `ConversationParticipant.state.unreadCount`
- Không nên switch sidebar trước khi có shadow compare/reconciliation evidence.

## Slice tiếp theo khuyến nghị

### Slice 7 — Shadow Compare Scaffolding

Mục tiêu:

- Thêm `CONVERSATION_SHADOW_COMPARE_ENABLED=false`.
- Thêm read-only shadow compare service.
- So sánh legacy sidebar/conversation list output với read-model candidate.
- Chỉ log/report mismatch.
- Không thay đổi response client.
- Không switch sidebar sang read model.

Phạm vi đề xuất:

- Direct sidebar compare sau khi `getSidebarUsers` build legacy result.
- Group sidebar compare sau khi `getMyGroups` build legacy result.
- Compare stable fields:
  - `legacyConversationId`
  - `lastMessageId`
  - `lastMessageAt`
  - `unreadCount`
  - visibility/default sidebar inclusion
- Swallow/log shadow compare errors để legacy response vẫn thành công.

## Explicit non-goals cho slice tiếp theo

- Không enable read model source of truth.
- Không switch sidebar/search reads.
- Không expose `Conversation._id`.
- Không đổi `Message.conversationId`.
- Không đổi Socket.IO payloads/rooms.
- Không đổi Redis keys/schema.
- Không đổi RabbitMQ behavior.
- Không mở rộng dual-write sang REST/system/call-log trong Slice 7.
- Không implement search guard trong Slice 7.

## Prompt khuyến nghị tiếp theo

```text
Use the tdd skill.

Implement Conversation Read Model Migration — Slice 7: Shadow Compare Scaffolding only.

Add CONVERSATION_SHADOW_COMPARE_ENABLED=false, a read-only shadow compare service, and guarded controller hooks that compare legacy sidebar/group sidebar output with read-model candidates. Only log/report mismatches. Do not change client responses, do not switch sidebar/search reads, do not expose Conversation._id, and do not alter Redis/RabbitMQ/Socket.IO behavior.
```
