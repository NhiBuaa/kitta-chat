# Next Session — Slice 1: Permission Service & UI Panel Base Layout

Mục tiêu tiếp theo là triển khai **Slice 1** để xây dựng cơ sở hạ tầng đánh giá quyền và dựng khung giao diện ban đầu cho Conversation Panel.

## Slice Mục tiêu
**Slice 1 — Permission Service & UI Panel Base Layout**

## Bối cảnh
*   Slice 0 đã hoàn tất: hạ tầng skeletons, ADRs và rate limits đã sẵn sàng.
*   Hiện tại chưa có module đánh giá quyền cụ thể (`PermissionService`) để bảo vệ các endpoints của panel, và Frontend chưa có layout cấu trúc của panel.

## Mục tiêu cụ thể
1.  **Backend: Triển khai `PermissionService`:**
    *   Tạo `server/src/services/permissionService.js`.
    *   Hàm `getPermissions(userId, conversationId)` trả về đối tượng Permission DTO gồm các flags: `canRead`, `canWrite`, `canLeave`, `canArchive`, `canDelete`, `canMute`, `canPin`.
    *   Đảm bảo đây là pure service (chỉ đọc dữ liệu, không thay đổi trạng thái).
2.  **Frontend: Thiết lập UI Panel Base Layout:**
    *   Dựng layout khung panel trượt (slide-over panel) bên phải chat box.
    *   Áp dụng các micro-animations cho hiệu ứng đóng/mở panel mượt mà.
3.  **Viết tests:**
    *   Viết unit/integration tests cho `PermissionService` (test riêng các trường hợp chat group và chat direct).

## Guardrails bắt buộc
*   `PermissionService` không được ghi dữ liệu vào database (chỉ được thực hiện read-only).
*   Không được thay đổi các endpoint routes và contract API đã thống nhất.