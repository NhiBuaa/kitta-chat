# Next Session — Slice 5: Conversation Membership Domain

Mục tiêu tiếp theo là triển khai **Slice 5** nhằm hoàn thiện phần tải thành viên nhóm (đối với Group Chat) và nhóm chung (đối với 1-1 Chat) trong bảng thông tin Conversation Panel (Giai đoạn 2 - Resources API), hỗ trợ tải bất đồng bộ song song, phân trang cursor-based, và hiển thị giao diện preview trên Frontend kèm Retry độc lập.

## Slice Mục tiêu
**Slice 5 — Conversation Membership Domain**

## Bối cảnh
* Slice 4 đã hoàn tất thành công: 
  * Cả hai loader `loadFiles` và `loadLinks` đã hoạt động tốt, hỗ trợ visibility filter và phân trang cursor-based giảm dần theo `Message._id`.
  * Pre-save hook và luồng lưu trữ tin nhắn ngầm (idempotent `saveMessageInBackground` dùng `findOneAndUpdate`) được tích hợp trích xuất link và chuẩn hóa hostname chính xác.
  * Phía Frontend đã hiển thị danh sách tài liệu (kèm định dạng dung lượng động B, KB, MB, GB) và danh sách liên kết có khả năng click được.
* Hiện tại, mục `membership` của Resources API (`GET /api/conversations/:id/panel/resources`) vẫn đang trả về mock rỗng.

## Mục tiêu cụ thể
1. **Backend: Triển khai Group Members Loader (cho Group Chat):**
   * Phát triển hàm `loadGroupMembers(conversationId, limit, cursor, userId)` trong `ResourceService`.
   * Tải danh sách thành viên tham gia nhóm hiện tại.
   * Áp dụng visibility filter (chỉ cho phép các thành viên hiện tại đọc).
   * Sắp xếp và phân trang cursor-based dựa trên `ConversationParticipant._id` bảo đảm đồng nhất semantic với các loader khác.
   * Trả về thông tin thành viên tối thiểu (tên hiển thị, avatar, vai trò admin/member, isOnline).
2. **Backend: Triển khai Common Groups Loader (cho 1-1 Chat):**
   * Phát triển hàm `loadCommonGroups(conversationId, limit, cursor, userId)` trong `ResourceService`.
   * Tìm và tải danh sách các cuộc trò chuyện nhóm (group chats) mà cả `userId` và người đối thoại (chat partner) đều cùng tham gia làm thành viên.
   * Hỗ trợ phân trang cursor-based hoặc preview giới hạn 6 nhóm chung.
3. **Backend: Tích hợp vào Orchestration Controller:**
   * Tích hợp các loaders này vào controller `getResources` trong [conversationPanelController.js](file:///d:/Developer/Projects/shotter/shot-chat/server/src/controllers/conversationPanelController.js) thay thế phần mock.
   * Áp dụng timeout 2 giây độc lập cho loader `membership`.
4. **Frontend: Hiển thị Membership Section:**
   * Tải bất đồng bộ thông tin thành viên qua `?scopes=membership`.
   * Giao diện Group Chat: Hiển thị preview 3-5 thành viên (tên, avatar, online status, badge Admin). Bổ sung nút "Xem tất cả thành viên" để mở rộng modal chi tiết.
   * Giao diện 1-1 Chat: Hiển thị preview các nhóm chung (tên nhóm, avatar nhóm, số lượng thành viên). Bổ sung nút "Xem tất cả nhóm chung".
   * Thiết lập Loading Skeleton, Error State, và nút **Retry độc lập** riêng biệt cho mục Membership.
5. **Viết tests:**
   * Unit tests cho `loadGroupMembers` và `loadCommonGroups` trong `resourceService.test.js`.
   * Integration tests tương ứng trong `conversationPanel.integration.test.js`.

## Guardrails bắt buộc
* **Timeout độc lập 2s:** Loader membership chạy bất đồng bộ song song với media/files/links và có timeout 2 giây riêng.
* **Cursor bất biến:** Giữ nguyên quy tắc cursor phân trang membership không bị thay đổi bởi tin nhắn realtime mới trên giao diện.