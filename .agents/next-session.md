# Next Session — Slice 7: Realtime Sync & Client State (Continuation)

Mục tiêu tiếp theo là hoàn tất các phần còn lại của **Slice 7** nhằm đồng bộ hóa realtime trạng thái hội thoại qua Socket.IO và tối ưu hóa bộ lưu trữ state ở phía client.

## Slice Mục tiêu
**Slice 7 — Realtime Sync & Client State**

## Bối cảnh
* Trong session này, chúng ta đã sửa các lỗi quan trọng liên quan đến Xóa lịch sử và Đồng bộ Sidebar:
  - Sửa lỗi không thoát màn hình chat sau khi xóa lịch sử (thêm `setActiveChat(null)`).
  - Sửa lỗi group chat biến mất khi refresh/F5 trang sau khi nhận tin nhắn mới (sửa bộ lọc `deletedAt` trong candidate service ở Backend).
  - Khắc phục lỗi trùng lặp/nhân đôi user trên sidebar khi nhận tin nhắn realtime do React Strict Mode (áp dụng cơ chế `fetchingIdsRef` và kiểm tra trùng lặp `prev.some` ở client).
  - Tự động gộp cấu hình cá nhân Ghim/Mute khi gọi API chi tiết user/group để các icon Ghim/Mute hiển thị realtime ngay lập tức.
  - Reset cài đặt Ghim/Mute về mặc định khi xóa lịch sử trò chuyện.
  - Bảo đảm bộ test 293 tests tiếp tục xanh 100%.

## Mục tiêu cụ thể
1. **Hoàn thiện Realtime Sync (Socket.IO):**
   - Xử lý các sự kiện thay đổi metadata nhóm realtime: đổi tên nhóm (`renameGroup`), cập nhật avatar nhóm.
   - Đồng bộ hóa realtime danh sách thành viên hiển thị trên panel khi có thành viên rời nhóm hoặc được thêm/xóa khỏi nhóm.
2. **Tối ưu hóa Client State:**
   - Đảm bảo tính nhất quán dữ liệu giữa các view: Sidebar, Chat Window, Conversation Panel.
   - Tối ưu hiệu năng render của Sidebar khi Presence Service phát các sự kiện cập nhật trạng thái liên tục.
3. **Regression Tests:**
   - Chạy lại suite test backend/frontend để đảm bảo không phát sinh lỗi mới.

## Guardrails bắt buộc
- **Socket.IO Room isolation:** Chỉ phát sự kiện tới các socket thuộc room của cuộc hội thoại đó hoặc của từng user cụ thể.
- **Tránh race condition:** Bảo đảm thứ tự xử lý sự kiện socket và update local state ở client diễn ra chính xác.