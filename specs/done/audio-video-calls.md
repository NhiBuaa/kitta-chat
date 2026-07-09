# Audio And Video Calls

## Why

Người dùng cần gọi audio/video realtime qua WebRTC với signaling ổn định và trạng thái cuộc gọi rõ ràng.

## Behavior

- Socket.IO dùng cho WebRTC signaling.
- User có thể bắt đầu audio hoặc video call.
- Receiver có thể accept, reject, hoặc không phản hồi.
- Call status gồm pending, completed, missed, rejected, unreachable, busy.
- Kết thúc call tạo/cập nhật `CallHistory`.
- Finalized call tạo/upsert message type `call_log` để hiển thị trong chat/sidebar.
- Redis có thể dùng short-lived call mirrors/coordination.

## Done When

- Caller và receiver trao đổi signaling thành công khi online.
- Accept call thiết lập trạng thái answered/completed đúng khi kết thúc.
- Reject/missed/busy/unreachable được ghi nhận đúng.
- Call log message xuất hiện trong conversation phù hợp.
- Kết thúc call không tạo duplicate call log cho cùng call history.
