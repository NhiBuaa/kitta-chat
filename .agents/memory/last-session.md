# Last Session Handoff — Slice 4: Shared Files & Links Domain Completed

## 1. Trạng Thái Hiện Tại (Current State)
* **Slice 4 (Shared Files & Links Domain)** đã hoàn thành 100% (cả Backend và Frontend), sửa các lỗi pre-save hook/findOneAndUpdate bypass, và hoàn thành refactoring làm đẹp hiển thị (size tệp tin, click links).
* **Tổng số test suite**:
  - Backend: **285/285 passed** (100% xanh, bao gồm unit tests của `resourceService` cho files/links và `saveMessageInBackground` mock tests).
  - Frontend: Hoạt động mượt mà không lỗi.

## 2. Công Việc Đã Hoàn Thành (Work Accomplished)
* **Backend Models & Services**:
  - Phát triển hàm tĩnh `extractAndNormalizeLinks(text)` trên model `Message` để trích xuất URL và chuẩn hóa hostname (chuyển sang lowercase, loại bỏ `www.`).
  - Thiết lập pre-save hook gọi hàm tĩnh trên để tự động gán trường `hasLink` và `links` khi lưu tin nhắn qua `.save()`.
  - Tích hợp logic trên vào `saveMessageInBackground.js` trước khi gọi `findOneAndUpdate` để đảm bảo tin nhắn realtime gửi qua Socket.IO vẫn được trích xuất link chính xác (tránh bypass của pre-save hook).
  - Phát triển hàm `loadFiles` và `loadLinks` trong `ResourceService` với đầy đủ visibility filter, cursor-based pagination giảm dần, giới hạn 6 items.
  - Tích hợp các loader vào endpoint `/panel/resources` thông qua `Promise.all` và kiểm soát timeout 2 giây độc lập.
* **Frontend UI (Conversation Panel & Chat Window)**:
  - Tích hợp nạp bất đồng bộ `files` và `links` song song, hỗ trợ skeleton loaders, trạng thái lỗi và nút **Retry độc lập** cho từng phần.
  - Tái cấu trúc (Refactoring): Thêm helper `formatFileSize(bytes)` hiển thị linh hoạt dung lượng file (`B`, `KB`, `MB`, `GB`,...) thay vì cố định `KB`.
  - Tái cấu trúc (Refactoring): Tích hợp helper `renderMessageTextWithLinks(text, isMe)` vào bong bóng tin nhắn chính của [ChatWindow.jsx](file:///d:/Developer/Projects/shotter/shot-chat/client/src/features/chat/components/ChatWindow.jsx) để chuyển đổi tự động URL thô thành thẻ `<a>` có thể click mở tab mới an toàn, có màu sắc tối ưu theo role (isMe).

## 3. Các Ràng Buộc & Quyết Định Kỹ Thuật (Guardrails & Decisions)
* **Pre-save Hook & Update query bypass**: Nhận thức rõ `findOneAndUpdate` không chạy pre-save hook. Đã giải quyết triệt để ở tầng ứng dụng trước khi lưu DB.
* **Defensive tests setup**: Kiểm tra an toàn `typeof Message.extractAndNormalizeLinks === "function"` để bảo vệ test suite khi model `Message` bị mock trống ở một số file unit tests.
* **Retry Scope**: Retry files hay links chỉ gọi lại đúng scope tương ứng qua query string để tối ưu hóa hiệu năng và tuân thủ ADR-005.

## 4. Kế Hoạch Cho Phiên Kế Tiếp (Next Steps - Slice 5)
* **Slice 5: Conversation Membership Domain**:
  1. Backend: Triển khai loader tải thành viên cho Group Chat (`loadGroupMembers`) kèm phân trang cursor-based trên `ConversationParticipant._id`.
  2. Backend: Triển khai loader tải nhóm chung cho 1-1 Chat (`loadCommonGroups`) giữa 2 người tham gia.
  3. Frontend: Vẽ preview 3-5 thành viên (Group chat) hoặc nhóm chung (1-1 chat), có nút "Xem tất cả" mở rộng chi tiết, hỗ trợ loading skeleton và Retry độc lập.
