# Manual Test Guide: Slice 4 — Real-time Socket events, Debounced UI Sorting, and Unread Sync

## Metadata
- **Feature:** Unified Sidebar Conversations
- **Slice:** Slice 4 (Real-time Socket events, Debounced UI Sorting, and Unread Sync)
- **Nguồn đặc tả:** [specs/active/unified-sidebar-conversations.md](file:///d:/Developer/Projects/shotter/shot-chat/specs/active/unified-sidebar-conversations.md)
- **Trạng thái mới nhất:** PASSED

---

## Tiền Điều Kiện (Prerequisites)
- **Environment:** Dev Server running at `http://localhost:3000` (Client) & `http://localhost:5000` (Backend)
- **Database / Seed Data:** Chạy `npm run db:seed:test`
- **Credentials / State:** Đăng nhập 2 tài khoản thử nghiệm trên 2 trình duyệt/tab riêng biệt (User A: `userA@example.com`, User B: `userB@example.com`)

---

## [KHÓA] Kịch bản Kiểm thử

### TC-01: Real-time lastMessage Update (Instant Content Update)
- **Mô tả:** Khi User B gửi tin nhắn cho User A, tin nhắn mới nhất `lastMessage` và thời gian `lastMessageAt` trên Sidebar của User A cập nhật ngay lập tức mà không bị gián đoạn hay trễ.
- **Các bước thực hiện (Steps):**
  1. Mở Sidebar ở User A (đang ở tab "Tất cả").
  2. Từ User B, gửi tin nhắn "Xin chào User A!" đến User A.
- **Kết quả mong đợi (Expected Results):**
  - Nội dung dòng xem trước (preview text) trên row hội thoại với User B của Sidebar User A lập tức đổi thành "Xin chào User A!".
  - Không cần F5 / reload trang.

### TC-02: Debounced UI Sorting (Reordering Positions)
- **Mô tả:** Khi nhận nhiều tin nhắn dồn dập từ các cuộc trò chuyện khác nhau trong khoảng thời gian ngắn (<300ms), thứ tự hiển thị (reorder position) của Sidebar được gom lại và đẩy lên đầu sau khoảng debounce (300-500ms), tránh giật/giật nảy UI liên tục.
- **Các bước thực hiện (Steps):**
  1. User A đang xem Sidebar với danh sách 5 cuộc trò chuyện.
  2. Bơm liên tiếp 3 tin nhắn từ 3 cuộc trò chuyện khác nhau đến User A trong vòng 100ms.
- **Kết quả mong đợi (Expected Results):**
  - Nội dung message preview của từng row cập nhật ngay lập tức.
  - Vị trí thứ tự sắp xếp lại của các row chỉ được tính toán và re-render sắp xếp lại 1 lần duy nhất sau khoảng delay 300-500ms.

### TC-03: Unread Count Increment & Active Chat Guard
- **Mô tả:** Đảm bảo đếm tin chưa đọc `unreadCount` chỉ tăng khi tin nhắn gửi từ người khác và cuộc trò chuyện đó KHÔNG phải là `activeChat` hiện tại.
- **Các bước thực hiện (Steps):**
  - **Kịch bản A (Active Chat):** User A đang mở cuộc trò chuyện với User B (`activeChat` = User B). User B gửi tin nhắn.
    - *Expected:* `unreadCount` của User B trên Sidebar giữ nguyên (hoặc 0), client phát ngay sự kiện `mark-as-read` về backend.
  - **Kịch bản B (Inactive Chat):** User A đang mở cuộc trò chuyện với User C. User B gửi tin nhắn cho User A.
    - *Expected:* `unreadCount` của hội thoại User B trên Sidebar tăng thêm 1 badge đỏ.
  - **Kịch bản C (Self Message):** User A gửi tin nhắn từ 1 tab khác của chính mình.
    - *Expected:* `unreadCount` không tăng.

### TC-04: New Conversation Ingestion via Socket
- **Mô tả:** Khi User A nhận được tin nhắn từ một cuộc trò chuyện mới (chưa từng xuất hiện trong danh sách local state Sidebar hiện tại), Sidebar tự động chèn 1 row mới lên đầu danh sách với đầy đủ metadata `target` (displayName, avatar...).
- **Các bước thực hiện (Steps):**
  1. User D (tài khoản chưa từng nhắn tin với User A) gửi tin nhắn "Chào bạn mới!".
  2. Quan sát Sidebar của User A.
- **Kết quả mong đợi (Expected Results):**
  - Row mới đại diện cho User D xuất hiện ngay lập tức ở đầu danh sách Sidebar.
  - Đầy đủ avatar, tên hiển thị User D, preview text "Chào bạn mới!" và không bị crash hay hiển thị fallback rác (`undefined`).

### TC-05: Filter Chip Scope Respect on Real-time Updates
- **Mô tả:** Tin nhắn nhận từ nhóm chat hay chat cá nhân chỉ hiển thị/reorder trong đúng tab tương ứng hoặc tab "Tất cả".
- **Các bước thực hiện (Steps):**
  1. User A chọn tab Filter Chip "Cá nhân".
  2. Một nhóm chat bất kỳ (Group Chat) nhận tin nhắn mới.
- **Kết quả mong đợi (Expected Results):**
  - Tab "Cá nhân" không tự nhảy row nhóm chat đó vào.
  - Khi User A chuyển sang tab "Nhóm" hoặc "Tất cả", nhóm chat đó đã ở vị trí trên cùng với tin nhắn mới nhất.

### TC-06: Memory Leak & Cleanup Guard (Unmount/Re-subscribe)
- **Mô tả:** Khi chuyển đổi giữa các màn hình/tab hoặc remount component Sidebar, listener socket không bị đăng ký trùng lặp (duplicate events) và debounce timer được cleanup sạch sẻ.
- **Các bước thực hiện (Steps):**
  1. Chuyển tab qua lại 5 lần giữa "Tất cả", "Cá nhân", "Nhóm".
  2. Nhận 1 tin nhắn mới từ User B.
- **Kết quả mong đợi (Expected Results):**
  - Event listener chỉ trigger 1 lần duy nhất, unreadCount chỉ tăng 1 (không bị tăng 5 lần).

---

## [CẬP NHẬT] Lịch sử Nghiệm thu

| Lần chạy | Ngày | Người test | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | Tổng kết | Ghi chú / Link Log |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Run #1 | 2026-07-22 | Agent / Dev | PASS | PASS | PASS | PASS | PASS | PASS | **PASSED** | Pass 182/182 client unit tests (bao gồm 4/4 realtime socket tests) & 298/298 server tests |
| Run #2 | 2026-07-22 | Agent / Dev | PASS | PASS | PASS | PASS | PASS | PASS | **PASSED** | Pass 193/193 client unit tests (bao gồm 6/6 tests sửa lỗi realtime presence, search merge & header status) |

---

## Ghi Chú & Troubleshooting
- **Log Location:** Kiểm tra log console trình duyệt và server log tại terminal.
- **Reset State:** Chạy `npm run db:seed:test` nếu cần đưa DB về trạng thái chuẩn.
