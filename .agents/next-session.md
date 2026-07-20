# Next Session — Slice 2: Client Unified Sidebar Layout & Filter Chips Integration

## Slice Mục tiêu
**Slice 2: Client Unified Sidebar Layout & Filter Chips Integration**

## Bối cảnh
- Slice 1 (Backend Unified Sidebar API với Cursor Pagination & Batch Queries) đã hoàn thành xuất sắc, được verify qua 4 test cases tích hợp backend.
- Toàn bộ regression test suite của Backend chạy thành công 100% (`298/298` passed).
- Sẵn sàng tích hợp giao diện và bộ lọc Filter Chips ở Client.

## Mục tiêu cụ thể
1. **Thay thế UI Sidebar phân mảng thành danh sách phẳng gộp chung:**
   - Thay thế việc render danh sách tách biệt Users và Groups trong `Sidebar.jsx` thành một danh sách phẳng duy nhất `conversations` hiển thị kết quả từ API gộp.
   - Hiển thị avt, displayName, và lastMessage format:
     - Group chat: `"{lastMessage.senderName}: {lastMessage.content}"`. Nếu không có message, hiển thị fallback `"{target.memberCount} thành viên"`.
     - Direct chat: `"{lastMessage.content}"`. Nếu không có message, hiển thị fallback status text hoặc `"Bắt đầu trò chuyện"`.
2. **Thiết lập Filter Chips UI:**
   - Tạo 3 chips lọc dạng viên thuốc (Filter Chips) nằm dưới thanh tìm kiếm: "Tất cả", "Cá nhân", "Nhóm".
   - Khi click chọn chip, client sẽ update filter state, reset cursor về `null`, và gọi API fetch tương ứng (`kind = direct | group` hoặc empty).
   - Lưu trữ preference chip đang chọn vào `localStorage` (`kitta_sidebar_filter`).
3. **Logic lọc kết hợp AND:**
   - Việc search trong ô tìm kiếm sẽ lọc local trên tập kết quả của Filter Chip đang active.
4. **Empty States chuyên biệt:**
   - Hiển thị layout Empty State chuyên biệt cho từng tab lọc nếu danh sách rỗng.
   - Thêm nút CTA "Tạo nhóm mới" ở Empty State của tab "Nhóm".
5. **Đăng ký unit test (Client Seam):**
   - Viết tệp test `client/src/components/layout/Sidebar.test.js` để verify:
     - Chuyển tab reset cursor và load lại trang đầu.
     - `localStorage` persistence.
     - Logic lọc search kết hợp AND.
     - Render rules cho Empty States và nút CTA tạo nhóm.

## Guardrails bắt buộc
- **Independent State Partitioning:** Cấm dùng chung cursor state giữa các tab lọc. Mỗi tab lọc phải có cursor và state data riêng biệt, reset cursor khi switch tab.
- **AND Logic Enforcement:** Không reset filter chip về "Tất cả" khi user gõ search. Kết quả search bắt buộc phải AND với filter chip hiện tại.