# Next Session — Slice 2: Overview & Preference Domain

Mục tiêu tiếp theo là triển khai **Slice 2** để triển khai hoàn chỉnh Metadata API (Giai đoạn 1) của Conversation Panel, bao gồm tích hợp thông tin Overview và Preferences thực tế, hỗ trợ HTTP ETag loại trừ Presence, và cập nhật preferences (ghim, tắt thông báo, tên tùy chỉnh) từ phía Client.

## Slice Mục tiêu
**Slice 2 — Overview & Preference Domain**

## Bối cảnh
*   Slice 1 đã hoàn tất: cơ sở hạ tầng phân quyền `PermissionService` và layout trượt `ConversationPanel` ở Frontend đã sẵn sàng.
*   Hiện tại các thông tin Overview và Preferences của panel vẫn đang là dữ liệu giả (mock data).

## Mục tiêu cụ thể
1.  **Backend: Triển khai Overview & Preference logic:**
    *   Xây dựng `OverviewService` cung cấp thông tin động (avatar, tên, trạng thái hoạt động online/offline từ `PresenceService` hoặc số thành viên thực tế của Group).
    *   Tích hợp `PreferenceService` để đọc trạng thái cá nhân (`pinnedAt`, `mutedUntil`, `customTitle`) từ `ConversationParticipant`.
    *   Triển khai ETag/Last-Modified caching cho Metadata API (loại trừ trường `isOnline` của Presence).
2.  **Frontend: Hiển thị Overview & Preference thực tế:**
    *   Hiển thị thông tin tên, avatar thật của cuộc hội thoại trong Conversation Panel.
    *   Hỗ trợ chuyển đổi trạng thái ghim (`isPinned`) và tắt thông báo (`isMuted`) trực tiếp từ UI Panel thông qua API.
3.  **Viết tests:**
    *   Viết unit/integration tests cho các service/endpoints của Overview và Preference.

## Guardrails bắt buộc
*   Trạng thái online/offline của Presence Service hoàn toàn loại trừ khỏi phép tính ETag của Metadata endpoint.
*   `PermissionService` phải được gọi để kiểm tra trước khi nạp metadata.