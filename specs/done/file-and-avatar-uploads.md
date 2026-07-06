# File And Avatar Uploads

## Why

Người dùng cần gửi file/ảnh trong chat và cập nhật avatar/profile media.

## Behavior

- File metadata được lưu trong MongoDB khi upload hoàn tất.
- S3-compatible storage được dùng khi provider credentials được cấu hình.
- Multipart upload hỗ trợ tạo upload, lấy presigned part URL, complete upload.
- Single image upload có thể queue image processing qua RabbitMQ.
- Image/avatar processing dùng `sharp` trong background worker.
- Processed file/avatar được thông báo bất đồng bộ qua Socket.IO event phù hợp.

## Done When

- Upload hợp lệ trả về file metadata và URL khi provider cấu hình đúng.
- Multipart upload hoàn tất lưu file record.
- Image upload quá lớn hoặc sai type trả lỗi an toàn.
- Queue unavailable không để lại staged file rác nếu flow có cleanup.
- Background processing không block request chính.
