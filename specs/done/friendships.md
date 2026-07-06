# Friendships

## Why

Người dùng cần kết nối với nhau trước hoặc song song với trải nghiệm chat direct, sidebar, presence, và call.

## Behavior

- Gửi lời mời kết bạn.
- Xem lời mời đã nhận.
- Chấp nhận lời mời kết bạn.
- Từ chối lời mời kết bạn.
- Xóa bạn bè.
- Xem danh sách bạn bè.
- Xem bạn bè đang online.
- Redis friend cache dùng write-through và warm-up từ MongoDB.
- Khi friendship thay đổi, hệ thống phát realtime events cho user liên quan nếu có Socket.IO connection.

## Done When

- Friend request được tạo đúng và không duplicate bất hợp lệ.
- Accept request thêm quan hệ bạn bè hai chiều.
- Reject/remove cập nhật đúng dữ liệu bền vững.
- Friend list và online friends phản ánh trạng thái mới.
- Cache miss Redis vẫn fallback được từ MongoDB.
- Realtime friendship update đến đúng user liên quan.
