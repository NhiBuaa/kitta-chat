# Calls Rules

## Purpose

Các rule này bảo vệ audio/video call lifecycle và call log behavior.

## Rules

- Realtime call signaling đi qua Socket.IO.
- Call status phải nằm trong lifecycle/status set hiện có: `pending`, `completed`, `missed`, `rejected`, `unreachable`, `busy`.
- Finalized call phải tạo hoặc upsert `Message` type `call_log` khi flow yêu cầu hiển thị trong chat/sidebar.
- Không tạo duplicate call log message cho cùng `CallHistory`.
- Call history chỉ accessible với participant liên quan.
- Redis call mirrors/locks/TTL chỉ là short-lived coordination, không phải durable call history.

## Examples

- End answered call => status `completed`, duration được tính, call log message xuất hiện trong conversation.
- Missed/rejected/busy call phải phản ánh đúng unread missed-call behavior.
- Retry/finalizer không được tạo nhiều `call_log` cho cùng `callData.callHistoryId`.
