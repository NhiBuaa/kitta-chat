# Conversation Identity Rules

## Purpose

Các rule này bảo vệ identity contract của chat/conversation để không phá REST, Socket.IO, Redis cache, hoặc client payloads.

## Rules

- `Message.conversationId` là legacy public/socket/cache bridge.
- Không thay `Message.conversationId` bằng `Conversation._id` trong client-visible contract.
- `Conversation._id` là backend-internal identifier.
- Không expose `Conversation._id` ra Socket.IO payloads, REST responses, Redis keys, hoặc client state nếu chưa có slice/decision riêng được duyệt.
- Direct legacy conversation id tiếp tục là id được build từ hai user ids theo convention hiện có.
- Group legacy conversation id tiếp tục là `Group._id`.
- Redis conversation cache keys/values tiếp tục dùng legacy conversation id.
- Socket.IO rooms/payloads tiếp tục dùng legacy conversation id nếu chưa có migration contract riêng.

## Examples

- `legacyConversationId` trong read model phải map về `Message.conversationId`.
- Sidebar response không được trả `Conversation._id` chỉ vì read model đã tồn tại.
- Group message path không được đổi group conversation id sang id mới khác `Group._id`.
