# Unified Sidebar Conversations — Current Session Roadmap

## Mục tiêu tổng thể
Triển khai tính năng Unified Sidebar Conversations (Gộp danh sách Chat cá nhân và Nhóm chat trên Sidebar) sử dụng Cursor-based Pagination hoàn chỉnh ở cả Client & Backend, hỗ trợ Filter Chips lọc tại Backend và đồng bộ real-time mượt mà (chống giật UI).

## Các Invariant Bắt buộc (Architecture Invariants)
1. **Cursor theo định dạng chuẩn:** Cursor là chuỗi mã hóa hoặc string dạng `<lastMessageAt>_<conversationId>` sử dụng ObjectId của Conversation (`Conversation._id`) làm tie-breaker duy nhất, không dùng legacyConversationId.
2. **Batch Query tuyệt đối:** Enrich thông tin target (User/Group) và lastMessage.sender bằng batch query `$in`. Cấm sử dụng vòng lặp (N+1 query) trong code database.
3. **Cursor độc lập theo bộ lọc:** Cursor và dữ liệu trang được phân vùng và quản lý độc lập cho từng tab filter chip ("Tất cả", "Cá nhân", "Nhóm") ở Client. Khi chuyển tab, bắt buộc reset cursor = null để bắt đầu tải lại.
4. **Không merge dữ liệu khi reload:** Sự kiện reload/pull-to-refresh thay thế 100% mảng local state bằng trang 1 từ API, không viết cơ chế merge phức tạp.
5. **Debounce sắp xếp real-time:** Chỉ debounce (300-500ms) cho hành vi sắp xếp lại vị trí (reorder) hiển thị của phần tử trên UI, cập nhật data tin nhắn mới (lastMessage) bắt buộc thực thi tức thời.
6. **Multi-tab Sync & Active Chat Guard:** Tin nhắn từ chính mình không tăng unread. Nhận tin nhắn từ active chat không tăng unread và bắn ngay sự kiện mark-as-read về backend.

## Slice Roadmap

| Slice | Tên | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Backend Unified Sidebar API with Cursor Pagination & Batch Queries | **DONE** | Viết endpoint `GET /api/sidebar/conversations`, tách query pinned/non-pinned, phân trang bằng ObjectId tie-breaker, batch query `$in` và integration tests. |
| 2 | Client Unified Sidebar Layout & Filter Chips Integration | **DONE** | Thay thế UI sidebar cũ, tích hợp Filter Chips ("Tất cả", "Cá nhân", "Nhóm") lưu localStorage, AND search logic, Empty States, Skeleton Loaders và fix 6 lỗi giao diện/data contract. |
| 3 | Client Infinite Scroll (loadMore) Integration | **TODO** | Tích hợp Sentinel DOM, Intersection Observer tải trang kế tiếp bằng cursor của tab active, và test chuyển tab giữ nguyên tiến trình. |
| 4 | Real-time Socket events, Debounced UI Sorting, and Unread Sync | **TODO** | Đóng gói target ở backend socket, tích hợp client socket listener, debounce sorting (300-500ms), unread sync (active mark-as-read, multi-tab bypass), và test tích hợp real-time/pagination. |

## Trạng thái kiểm thử gần nhất
*   Sau Slice 2: Client tests `175/175` passed (100% xanh), Server integration tests `4/4` passed.