# Session Handoff Summary - 2026-07-17

## Những gì đã làm
Trong session này, chúng ta đã giải quyết triệt để 4 lỗi quan trọng phát sinh từ việc Tối ưu hóa UI Sidebar, Xóa lịch sử và Đồng bộ hóa Realtime:
1. **Thoát màn hình chat trống:** Cập nhật `handleDeleteHistory` để gọi `setActiveChat(null)` giúp đóng giao diện chat ngay lập tức khi xóa lịch sử.
2. **Reload/F5 không mất sidebar:** Thay đổi bộ lọc candidates ở Backend (`getSidebarCandidatesForUser`) để giữ lại các cuộc hội thoại đã bị soft-delete nếu có tin nhắn mới gửi đến sau thời điểm xóa (`lastMessageAt > deletedAt`).
3. **Chống trùng lặp realtime sidebar (React Strict Mode):** Bổ sung cơ chế `fetchingIdsRef` trong `useMessageSocket.js` để tránh gọi API trùng lặp, đồng thời thêm kiểm tra `prev.some` trong `fetchNewConversation` để đảm bảo không bị nhân đôi (trùng lặp) user hiển thị trên sidebar.
4. **Hiển thị icon Ghim/Mute realtime:** Đính kèm trực tiếp preference cá nhân của người dùng hiện tại khi gọi API lấy chi tiết nhóm (`getGroupById`) và chi tiết user (`getUserById`).
5. **Reset Ghim/Mute khi xóa lịch sử:** Cập nhật helper `applySoftDeleteState` tự động đưa `pinnedAt` và `mutedUntil` về `null` để tránh lỗi logic nhận tin nhắn mới nhưng vẫn bị tắt thông báo.

## Trạng thái hệ thống
- Toàn bộ suite test backend (293 tests) đều chạy thành công 100% xanh.
- Không có tiến trình ngầm nào cần dừng hoạt động.

## Kế hoạch phiên tiếp theo
- Tiếp tục thực hiện nốt các mục tiêu của **Slice 7 - Realtime Sync & Client State** (Metadata rename/avatar sync, membership sync realtime).
