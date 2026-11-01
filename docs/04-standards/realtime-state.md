# Realtime State Rules

## Purpose

Các rule này phân biệt state realtime tạm thời với durable domain data.

## Rules

- Socket.IO event names, payload shape, và room identifiers là client contract; không thay đổi nếu chưa có migration/slice riêng.
- Presence heartbeat không được ghi MongoDB liên tục.
- Presence heartbeat chỉ nên cập nhật Redis state/TTL hoặc realtime state phù hợp.
- Typing indicator là ephemeral realtime state.
- Typing indicator không được lưu bền vững vào MongoDB.
- Redis TTL/mirrors có thể hết hạn mà không làm mất durable domain state.
- Socket listener/client event cleanup phải tránh duplicate handlers khi thay đổi frontend realtime flows.

## Examples

- User typing trong conversation chỉ emit realtime event, không tạo message/document.
- Presence offline do TTL hết hạn không được coi là user data bị xóa.
- Thay đổi Socket.IO payload cho message/call/friendship update cần được coi là thay đổi contract.
