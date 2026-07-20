# Next Session — Slice 10: View All Files & Links Modals Integration

## Slice Mục tiêu
**Slice 10: View All Files & Links Modals Integration**

## Bối cảnh
- Slice 9 (Tích hợp và xem tất cả Shared Media cùng Lightbox phóng to ảnh/video) đã hoàn thành xuất sắc, vượt qua toàn bộ 146 client tests và 293 server tests (100% xanh).
- Tính năng Freshness Banner của Explorer đã được nâng cấp lên vị trí nổi cố định (Floating) `absolute top-[72px] left-1/2 -translate-x-1/2 z-20` đè lên scroll container để cải thiện tối đa trải nghiệm người dùng (UX).
- Phiên tiếp theo sẽ tiến hành tích hợp hai Explorer tài nguyên còn lại: Files (Tài liệu) và Links (Liên kết).

## Mục tiêu cụ thể
1. **Triển khai component `FilesExplorer.jsx`:**
   - Sử dụng hook `useInfiniteScroll` để tự động tải thêm trang tài liệu khi cuộn xuống.
   - Sử dụng hook `useExplorerFreshness` (type `files`) để hiển thị Freshness Banner nổi tuyệt đối (`absolute top-[72px] z-20`) khi có file tài liệu mới gửi đến. Click banner sẽ làm mới danh sách.
   - Định dạng hiển thị: Danh sách các file đính kèm kèm theo tên file, icon tương ứng định dạng, dung lượng file (dùng helper `formatFileSize`), và nút download.
2. **Triển khai component `LinksExplorer.jsx`:**
   - Sử dụng hook `useInfiniteScroll` để tự động tải thêm liên kết khi cuộn xuống.
   - Sử dụng hook `useExplorerFreshness` (type `links`) hiển thị Freshness Banner nổi tuyệt đối khi có tin nhắn chứa link mới.
   - Định dạng hiển thị: Danh sách liên kết URL, click để mở liên kết trong tab mới (`target="_blank"`).
3. **Tích hợp vào `ConversationPanel.jsx`:**
   - Thêm sự kiện click mở Modal cho nút "Xem tất cả" trong phần Tài liệu (Files) và Liên kết (Links) của panel.
   - Quản lý state mở/đóng các Modal này qua Portal bằng component `<ViewAllModalShell isOpen={...} title="..." size="normal">`.

## Guardrails bắt buộc
- **Stale Response Protection:** Sử dụng `AbortController` hủy bỏ request cũ khi chuyển đổi active conversation để chống đè dữ liệu.
- **Cursor Deduplication:** Lọc bỏ trùng lặp tệp tin/liên kết theo `_id` trước khi append vào danh sách hiển thị.