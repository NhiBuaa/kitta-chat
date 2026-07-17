# Next Session — Slice 4: Shared Files & Links Domain

Mục tiêu tiếp theo là triển khai **Slice 4** nhằm hoàn thành phần tải Files (tài liệu đã chia sẻ) và Links (các liên kết đã chia sẻ) trong cuộc trò chuyện cho Conversation Panel (Giai đoạn 2 - Resources API), tích hợp phân trang cursor-based, áp dụng URL normalization và hiển thị giao diện preview trên Frontend.

## Slice Mục tiêu
**Slice 4 — Shared Files & Links Domain**

## Bối cảnh
* Slice 3 đã hoàn tất: Lưới preview Shared Media (ảnh/video) hoạt động mượt mà ở cả Frontend và Backend, hỗ trợ loading skeleton, error state độc lập, loader timeout 2s và retry scope.
* Đã sửa lỗi ẩn tin nhắn/media được gửi trong khoảng thời gian rời nhóm cho group chat (lọc theo `joinedAt`) và sửa lỗi ẩn nút mở GroupMembersModal trên Header.
* Hiện tại Resources API (`GET /api/conversations/:id/panel/resources`) vẫn đang trả về danh sách trống cho `files` và `links`.

## Mục tiêu cụ thể
1. **Backend: Triển khai File Loader:**
   * Phát triển hàm `loadFiles(conversationId, limit, cursor, userId)` trong `ResourceService`.
   * Tải tối đa 6 files (tài liệu đính kèm không phải là ảnh/video) gần nhất từ các tin nhắn thuộc cuộc trò chuyện.
   * Áp dụng visibility filter (`leftAt`, `deletedAt`, `joinedAt` cho group chat) để lọc tài nguyên được xem.
   * Sắp xếp theo thứ tự tin nhắn mới nhất trước (`newest Message._id first` - giảm dần), phân trang cursor-based `Message._id`.
   * Trả về thông tin tối thiểu (originalName, size, url, mimeType, messageId).
2. **Backend: Triển khai Link Loader & Normalization:**
   * Phát triển hàm `loadLinks(conversationId, limit, cursor, userId)` trong `ResourceService`.
   * Lọc và chuẩn hóa các liên kết (URL) được chia sẻ trong tin nhắn.
   * Sử dụng URL parser của Node.js để chuẩn hóa hostname (Link Normalization - chuyển lowercase, loại bỏ tham số query không cần thiết) khi lưu/truy xuất để tránh trùng lặp.
   * Phân trang cursor-based dựa trên `Message._id`.
3. **Frontend: Hiển thị Files & Links:**
   * Tải bất đồng bộ danh sách files qua `?scopes=files` và links qua `?scopes=links`.
   * Hiển thị danh sách File (tên file kèm icon định dạng, dung lượng, nút tải về) và danh sách Link (tiêu đề, preview description, domain name) trên UI Panel.
   * Hỗ trợ Retry độc lập cho từng section.
4. **Viết tests:**
   * Unit tests cho `loadFiles` và `loadLinks`.
   * Integration tests tương ứng trong `conversationPanel.integration.test.js`.

## Guardrails bắt buộc
* **Timeout 2s:** Mỗi loader có timeout ứng dụng là 2 giây độc lập.
* **Link Normalization:** Không dùng regex phức tạp ở database layer để trích xuất hostname; chuẩn hóa URL khi lưu/truy xuất.
* **Quyền truy cập:** Đánh giá quyền đọc trước khi tải tài nguyên.