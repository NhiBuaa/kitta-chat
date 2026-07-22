# Next Session Plan: Slice 3 — Client Infinite Scroll (loadMore) Integration

## Bối cảnh
- **Slice 1 (Backend API)** và **Slice 2 (Client Layout & Filter Chips)** đã hoàn thành 100% với 175/175 unit tests xanh.
- Đã khắc phục toàn bộ 5 lỗi ban đầu (Bug A, B, C, D, E) và lỗi nháy Empty State khi chuyển tab.
- Trạng thái hiện tại: Sidebar hiển thị trang đầu tiên (20 items), chuyển tab mượt mà bằng filter chips có skeleton loader.

## Slice Mục Tiêu
**Slice 3: Client Infinite Scroll (loadMore) Integration**

## Mục Tiêu Cụ Thể
1. **Sentinel Node & Intersection Observer:**
   - Thêm Sentinel DOM element tại vị trí cuối danh sách cuộc trò chuyện trong `Sidebar.jsx`.
   - Thiết lập `IntersectionObserver` lắng nghe khi Sentinel vào viewport để kích hoạt `onLoadMore`.
2. **Phân Trang Độc Lập Theo Tab:**
   - Sử dụng cursor dạng `<lastMessageAt>_<conversationId>` trả về từ backend API.
   - Khi cuộn xuống cuối, gửi request trang tiếp theo với `cursor` tương ứng của tab active (`all`, `direct`, `group`).
3. **Guard Anti-duplicate & Race Condition:**
   - Tránh nạp trùng cuộc trò chuyện trùng `conversationId`.
   - Giữ nguyên bảo vệ race condition bằng `AbortController` khi cuộn hoặc đổi tab nhanh.
4. **Viết Automated Tests:**
   - Thêm test suite cho Infinite Scroll behavior, Intersection Observer trigger, và cursor state management.

## Guardrails Bắt Buộc
- **Format Cursor:** Giữ nguyên định dạng string `<lastMessageAt>_<conversationId>`.
- **Reset State khi đổi Tab:** Luôn reset `cursor = null` và xóa mảng khi đổi tab filter chip.
- **Tải Trang:** Chỉ fetch trang kế tiếp khi `hasMore === true` và `isFetching === false`.