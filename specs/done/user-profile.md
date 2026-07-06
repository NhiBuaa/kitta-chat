# User Profile

## Why

Người dùng cần xem và cập nhật thông tin cá nhân để định danh trong chat, bạn bè, nhóm, và cuộc gọi.

## Behavior

- Xem profile hiện tại.
- Xem profile user khác theo id.
- Cập nhật display name và thông tin profile được hỗ trợ.
- Cập nhật avatar qua upload/processing flow.
- Profile có thể được cache và warm-up từ MongoDB khi cache miss.
- Presence/status liên quan đến user được hiển thị trong các danh sách phù hợp.

## Done When

- User xem được profile sau khi đăng nhập.
- User cập nhật profile hợp lệ và dữ liệu được lưu bền vững trong MongoDB.
- Avatar mới được xử lý và hiển thị khi upload thành công.
- Cache miss không làm mất khả năng đọc profile.
- Dữ liệu profile không làm lộ secret hoặc credential nội bộ.
