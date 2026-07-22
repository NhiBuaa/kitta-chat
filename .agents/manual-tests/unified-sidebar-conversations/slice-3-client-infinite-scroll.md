# Manual Test Guide: Slice 3 — Client Infinite Scroll (loadMore) Integration

## Metadata
- **Feature:** Unified Sidebar Conversations
- **Slice:** Slice 3 — Client Infinite Scroll (loadMore) Integration
- **Nguồn đặc tả:** [specs/active/unified-sidebar-conversations.md](file:///d:/Developer/Projects/shotter/shot-chat/specs/active/unified-sidebar-conversations.md)
- **Trạng thái mới nhất:** PASSED

---

## Tiền Điều Kiện (Prerequisites)
- **Environment:** Dev Server running at `http://localhost:3000` (Client) and `http://localhost:5000` (Backend)
- **Database / Seed Data:** Có ít nhất > 25 cuộc trò chuyện (cá nhân và nhóm) trong DB để kiểm thử phân trang (> 20 items trên trang 1).
- **Credentials / State:** Đăng nhập vào ứng dụng KittaChat bằng tài khoản test.

---

## [KHÓA] Kịch bản Kiểm thử

### TC-01: Tự động nạp trang tiếp theo khi cuộn xuống Sentinel Node (Happy Path)
- **Mô tả:** Khi danh sách trò chuyện ở trang 1 (20 items) được cuộn xuống cuối màn hình, Sentinel DOM Node vào viewport kích hoạt `IntersectionObserver` gửi request nạp thêm (page 2).
- **Các bước thực hiện (Steps):**
  1. Đăng nhập và xem danh sách Sidebar ở tab "Tất cả" (hiển thị 20 items trang đầu tiên).
  2. Cuộn danh sách Sidebar xuống tới phần tử cuối cùng.
  3. Quan sát network request và danh sách Sidebar.
- **Kết quả mong đợi (Expected Results):**
  - Sentinel Node kích hoạt hàm `onLoadMore`.
  - Hiển thị loading spinner/indicator ở vị trí dưới cùng danh sách trong khi fetch.
  - Gửi request `GET /api/sidebar/conversations?cursor=<lastMessageAt>_<conversationId>&limit=20`.
  - Nối tiếp các item trang 2 vào danh sách hiện tại mà không làm mất 20 item trang 1.

### TC-02: Phân trang độc lập và reset state khi chuyển Filter Chips
- **Mô tả:** Mỗi tab ("Tất cả", "Cá nhân", "Nhóm") duy trì cursor và trạng thái phân trang riêng biệt. Khi chuyển tab, cursor được reset về `null` và danh sách được tải mới từ trang 1.
- **Các bước thực hiện (Steps):**
  1. Ở tab "Tất cả", cuộn xuống nạp trang 2 (tổng cộng 40 items).
  2. Switch sang tab "Cá nhân".
  3. Switch quay lại tab "Tất cả".
- **Kết quả mong đợi (Expected Results):**
  - Khi sang tab "Cá nhân", danh sách reset và nạp trang 1 của "Cá nhân" (`kind=direct&cursor=null`).
  - Khi quay lại tab "Tất cả", state reset cursor = null và fetch lại trang 1 của "Tất cả" mượt mà.

### TC-03: Guard Anti-duplicate & Dừng nạp khi `hasMore === false`
- **Mô tả:** Tránh nạp trùng lặp cuộc trò chuyện cùng `conversationId` và không gửi request khi đã hết dữ liệu (`hasMore === false`).
- **Các bước thực hiện (Steps):**
  1. Cuộn danh sách liên tục cho đến khi backend trả về `hasMore: false` và `nextCursor: null`.
  2. Thử cuộn lại xuống cuối danh sách.
- **Kết quả mong đợi (Expected Results):**
  - Sentinel Node dừng lắng nghe/không kích hoạt request nạp thêm.
  - Không xuất hiện bất kỳ item nào bị lặp `conversationId` (trùng key React).

### TC-04: Guard Race Condition bằng AbortController khi cuộn hoặc chuyển Tab nhanh
- **Mô tả:** Nếu người dùng chuyển tab liên tục hoặc cuộn nhanh trong khi request `loadMore` đang chạy, `AbortController` sẽ hủy request cũ để tránh ghi đè dữ liệu tab mới.
- **Các bước thực hiện (Steps):**
  1. Đang ở tab "Tất cả", cuộn nhanh xuống cuối để trigger `loadMore`.
  2. Ngay lập tức click chuyển sang tab "Nhóm" trước khi request `loadMore` của tab "Tất cả" hoàn tất.
- **Kết quả mong đợi (Expected Results):**
  - Request `loadMore` cũ bị aborted (hủy).
  - Dữ liệu trả về muộn của tab "Tất cả" không bị append nhầm vào danh sách tab "Nhóm".

---

## [CẬP NHẬT] Lịch sử Nghiệm thu

| Lần chạy | Ngày | Người test | TC-01 | TC-02 | TC-03 | TC-04 | Tổng kết | Ghi chú / Link Log |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| Run #1 | 2026-07-22 | Agent | PASS | PASS | PASS | PASS | **PASSED** | 178/178 client tests xanh, Sentinel Node & Infinite Scroll đã hoạt động chuẩn |

---

## Ghi Chú & Troubleshooting
- **Sentinel DOM Element:** Element ẩn ở cuối danh sách dùng để IntersectionObserver quan sát.
- **Cursor Format:** Chuỗi dạng `<lastMessageAt>_<conversationId>`.
