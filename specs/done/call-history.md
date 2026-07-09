# Call History

## Why

Người dùng cần xem lại lịch sử cuộc gọi và xử lý badge cuộc gọi nhỡ.

## Behavior

- REST endpoint trả về call history có phân trang/limit.
- Missed/rejected/unreachable/busy calls có unread state theo user.
- User có thể mark một call là read.
- User có thể mark all unread missed calls là read.
- Call history chỉ accessible với participant liên quan.

## Done When

- User thấy đúng lịch sử cuộc gọi của mình.
- Missed count phản ánh unread missed-like calls.
- Mark read cập nhật đúng `readBy`/read state.
- User không truy cập được call history không liên quan.
