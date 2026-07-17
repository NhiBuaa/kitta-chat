# Last Session Handoff — Slice 3: Shared Media Domain Completed

## 1. Trạng Thái Hiện Tại (Current State)
* **Slice 3 (Shared Media Domain)** đã hoàn thành 100% (cả Backend và Frontend) và toàn bộ các bài test đều chạy xanh.
* Môi trường dev local hoạt động trơn tru sau khi sửa lỗi biến môi trường và xung đột UI.
* **Tổng số test suite**: 
  - Backend: **281/281 passed** (bao gồm 5 unit tests mới của `resourceService` và 2 tests mới của `conversationVisibilityHelpers`).
  - Frontend: **121/121 passed** và compile build thành công.

## 2. Công Việc Đã Hoàn Thành (Work Accomplished)
* **Backend Resource Service**:
  - Triển khai hàm `loadMedia` thực hiện gom attachments (ảnh/video) từ tin nhắn, query `$in` tối ưu tránh N+1 và hỗ trợ phân trang cursor-based (`Message._id`).
  - Tích hợp timeout 2s qua `Promise.race` và xử lý error contract (trả về 200 OK kèm `status: "error"` khi loader lỗi/timeout).
  - **Sửa bug Visibility Filter**: Cập nhật `buildMessageVisibilityFilter` lọc tin nhắn theo `joinedAt` cho group chat. Khi B rời nhóm rồi quay lại, B chỉ có quyền đọc tin nhắn kể từ mốc `joinedAt` (ngày quay lại nhóm gần nhất), không đọc được tin nhắn gửi trong lúc vắng mặt.
  - **Sửa cấu hình môi trường**: Bật cờ `CONVERSATION_PANEL_RESOURCES_ENABLED=true` trong `.env` để kích hoạt API nạp tài nguyên trên dev local.
* **Frontend Conversation Panel**:
  - Bổ sung `mediaState` và hàm `fetchMedia()` nạp media bất đồng bộ từ endpoint `/panel/resources?scopes=media`.
  - Hiển thị lưới hình ảnh 3 cột (grid preview), loading skeleton, error banner và nút **Thử lại (Retry)** độc lập cho vùng Media.
  - **Sửa lỗi UX group chat**: Hiển thị song song icon `FaUsers` (mở modal thành viên nhóm chứa nút Rời nhóm) và `FaInfoCircle` (mở panel) trên Header chat nhóm để giải phóng lối vào modal thành viên bị chiếm dụng.

## 3. Các Ràng Buộc & Quyết Định Kỹ Thuật (Guardrails & Decisions)
* **ETag loại trừ Presence**: Vẫn giữ nguyên cơ chế tính toán ETag không phụ thuộc vào trạng thái online/offline của Presence Service để tránh reload panel vô ích.
* **Retry Scope**: Retry nạp media chỉ gọi đúng scope `media` qua `?scopes=media` để tránh gọi lại Metadata API hoặc các loader khác.
* **Timeout & Error Contract**: Lỗi loader không được làm sập endpoint mà được bọc gọn gàng trả về `status: "error"` để frontend hiển thị nút Retry độc lập.

## 4. Kế Hoạch Cho Phiên Kế Tiếp (Next Steps - Slice 4)
* **Slice 4: Shared Files & Links Domain**:
  1. Backend: Phát triển `loadFiles` tải tài liệu đính kèm (không phải ảnh/video) gần nhất, phân trang cursor.
  2. Backend: Phát triển `loadLinks` trích xuất và chuẩn hóa URL (URL Normalization - lowercase hostname, bỏ query thừa) từ tin nhắn.
  3. Frontend: Hiển thị danh sách File (tên, dung lượng, nút tải) và Link (tiêu đề, preview, domain) có skeleton loader và Retry độc lập.
