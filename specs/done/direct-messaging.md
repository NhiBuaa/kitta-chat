# Direct Messaging

## Why

Người dùng cần gửi và nhận tin nhắn 1-1 realtime với optimistic UI, retry an toàn, unread state, và lịch sử tin nhắn.

## Behavior

- Gửi tin nhắn direct qua Socket.IO path chính.
- Tin nhắn được lưu vào MongoDB `Message`.
- `Message.conversationId` là legacy public/socket/cache bridge.
- Client có optimistic send và idempotency key để tránh duplicate khi retry.
- Người nhận nhận realtime message nếu online.
- Chat history cache lưu các tin nhắn gần nhất trong Redis khi Redis sẵn sàng.
- Redis conversation ZSET cập nhật thứ tự recent conversation.
- REST message endpoints vẫn tồn tại cho một số luồng legacy/sync.

## Done When

- Sender gửi tin nhắn và thấy UI cập nhật.
- Receiver online nhận message realtime.
- Message tồn tại trong MongoDB.
- Retry cùng idempotency key không tạo duplicate user-visible message.
- Redis down không làm mất message persistence.
- `Message.conversationId` không bị thay bằng `Conversation._id`.
