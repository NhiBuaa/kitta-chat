# Next Session — Slice 11: View All Common Groups Modal Integration & Quality Gate

## Slice Mục tiêu
**Slice 11: View All Common Groups Modal Integration & Quality Gate**

## Bối cảnh
- Slice 10 (Tích hợp và xem tất cả Shared Files và Links) đã hoàn thành xuất sắc.
- Đã sửa đổi Freshness Banner của cả 3 Explorer (Media, Files, Links) sang dạng `sticky` trôi nổi cố định tại `top-0` để luôn hiển thị rõ ràng cho người dùng ở mọi vị trí cuộn trang.
- Đã nâng kích thước của Freshness Banner lên `py-3 px-6 text-sm font-bold shadow-lg` để tăng khả năng tương tác và dễ click chuột.
- Bộ test client regression `155/155` passed và server `293/293` passed (100% xanh).

## Mục tiêu cụ thể
1. **Triển khai component `CommonGroupsExplorer.jsx`:**
   - Sử dụng hook `useInfiniteScroll` để tự động tải thêm nhóm trò chuyện chung khi cuộn xuống.
   - Định dạng hiển thị: Danh sách các nhóm chat chung của hai người dùng, bao gồm ảnh đại diện nhóm (avatar), tên nhóm, số lượng thành viên, và nút chuyển hướng.
   - Khi click vào một nhóm trong danh sách, tự động điều hướng người dùng (chuyển đổi active chat) trực tiếp tới nhóm chat đó và đóng Modal Shell.
2. **Tích hợp vào `ConversationPanel.jsx`:**
   - Thêm sự kiện click mở Modal cho nút "Xem tất cả" trong phần Nhóm chung (Common Groups) của panel.
   - Quản lý state mở/đóng Modal qua Portal bằng component `<ViewAllModalShell isOpen={...} title="Nhóm chung" size="normal">`.
3. **Rà soát chất lượng toàn diện (Quality Gate):**
   - Chạy skill `/code-check` để rà soát bảo mật và chất lượng code của toàn bộ các Explorer và Panel Service trước khi merge code.

## Guardrails bắt buộc
- **Active Chat Redirection Safety:** Chuyển đổi chat cần giải phóng và cleanup các hook/socket event của cuộc trò chuyện cũ để tránh rò rỉ bộ nhớ hoặc gọi API sai ngữ cảnh.
- **UI consistency:** Modal nhóm chung được cấu hình ở dạng `size="normal"`.