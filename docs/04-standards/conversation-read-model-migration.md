# Conversation Read Model Migration Rules

## Purpose

Các rule này bảo vệ migration Conversation Read Model khỏi big-bang switch hoặc thay đổi runtime ngoài phạm vi slice được duyệt.

## Rules

- Conversation Read Model chưa phải source of truth cho sidebar/search cho tới khi có read-switch slice được duyệt.
- Sidebar/search vẫn legacy-authoritative cho tới khi shadow compare và reconciliation đủ tin cậy.
- Dual-write phải được guard bằng feature flag và disabled by default.
- Lỗi dual-write không được làm fail legacy message persistence; phải log/swallow trong path đã được duyệt.
- Backfill write phải manual-only, default dry-run, và write mode cần explicit opt-in như `--write`.
- Không chạy backfill tự động ở startup nếu chưa có approval riêng.
- Shadow compare phải read-only, chỉ log/report mismatch, không đổi client response.
- Không mở rộng dual-write sang path mới nếu slice hiện tại không cho phép.
- Direct conversations phải omit `groupId` thay vì lưu `groupId: null`.
- Group conversations phải omit `directKey` thay vì lưu `directKey: null`.
- Unique indexes cho direct/group nullable fields phải tránh indexing null fields, ví dụ dùng `partialFilterExpression`.
- Duplicate/idempotent message retry không được double-increment unread count.

## Examples

- Slice shadow compare không được switch sidebar sang read model.
- Manual backfill runner không được chạy write mode nếu user không truyền `--write`.
- Socket dual-write chỉ được gọi sau khi message persistence thành công và không phải duplicate.
