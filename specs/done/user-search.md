# User Search

## Why

Người dùng cần tìm người khác để xem profile, gửi lời mời kết bạn, hoặc bắt đầu tương tác.

## Behavior

- Tìm user theo query được hỗ trợ bởi backend.
- Trả về thông tin public phù hợp như display name, avatar, relationship flags.
- Không trả về credential hoặc dữ liệu nhạy cảm.
- Kết quả phản ánh quan hệ hiện tại: friend, sent request, received request nếu có.

## Done When

- User đã đăng nhập tìm được user phù hợp với query.
- Kết quả không chứa password, token, refresh cookie, provider secrets.
- Relationship flags đúng với dữ liệu hiện tại.
- Empty query hoặc không có match trả về kết quả an toàn, không crash.
