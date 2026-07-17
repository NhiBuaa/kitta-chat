# Session Handoff - 2026-07-17

## Durable Progress
*   **Triển khai thành công Slice 2: Overview & Preference Domain**:
    *   Xây dựng `OverviewService` lấy dữ liệu avatar, tên, trạng thái online/offline (truy xuất trực tiếp từ PresenceService/Redis, hỗ trợ fallback offline an toàn) và số lượng thành viên nhóm thực tế.
    *   Xây dựng `PreferenceService` đọc và ghi dữ liệu cá nhân (`isPinned`, `isMuted`, `mutedUntil`, `customTitle`) trong `ConversationParticipant`.
    *   Tối ưu hóa API Metadata (Express Controller): tích hợp logic ETag caching loại trừ trường `isOnline` của Presence (Architectural Invariant 1).
    *   Xây dựng endpoint `PATCH /api/conversations/:id/panel/preference` hỗ trợ cập nhật cấu hình cá nhân, tích hợp chặt chẽ với phân quyền từ `PermissionService` (Architectural Invariant 2).
    *   Tái cấu trúc UI Frontend (`ConversationPanel.jsx`): gỡ bỏ hoàn toàn thẻ input checkbox, chuyển thành các nút bấm tương tác trực tiếp, thay đổi icon/text động (`FaThumbtack` màu xám <-> `FaThumbtackSlash` màu xanh lá, `FaBell` màu xám <-> `FaBellSlash` màu đỏ). Điều này giúp giao diện không bị méo vỡ trên màn hình chia đôi hẹp.
    *   Định nghĩa hằng số `DEFAULT_MUTED_UNTIL = new Date("9999-12-31T23:59:59Z")` ở đầu file `preferenceService.js` để tránh nợ kỹ thuật (theo kết quả Code Review).
*   **Kiểm thử tự động:**
    *   Bổ sung 4 unit tests trong `overviewService.test.js` (xanh).
    *   Bổ sung 3 unit tests trong `preferenceService.test.js` (xanh).
    *   Bổ sung 4 integration tests trong `conversationPanel.integration.test.js` (xanh).
    *   Chạy kiểm thử hồi quy toàn backend: **272/272 tests passed** (100% xanh lá).

## Current State & Next Steps
*   **Workspace status:** Git sạch sẽ (`nothing to commit, working tree clean`), các thay đổi của Slice 2 đã được commit thành công với message: `feat(panel): implement Slice 2 Overview & Preference Domain, ETag caching and refactor UI`.
*   **Next Steps:** Phiên sau sẽ triển khai **Slice 3 — Shared Media Domain** (triển khai API Resources tải bất đồng bộ song song ở Giai đoạn 2 và vẽ lưới hình ảnh preview ở Frontend Panel).
