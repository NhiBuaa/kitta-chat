# Next Session — Slice 9: View All Media Modal Integration & Lightbox

## Slice Mục tiêu
**Slice 9: View All Media Modal Integration & Lightbox**

## Bối cảnh
- Hạ tầng Core API, generic hooks (`useInfiniteScroll`, `useExplorerFreshness`) và component nền tảng `ViewAllModalShell` đã được triển khai hoàn chỉnh, sửa lỗi qua code review và kiểm thử xanh 100%.
- Phiên này sẽ tiến hành tích hợp và xây dựng giao diện xem tài nguyên Media đầu tiên.

## Mục tiêu cụ thể
1. **Triển khai component `MediaExplorer.jsx`:**
   - Sử dụng hook `useInfiniteScroll` để tự động tải thêm trang ảnh/video khi cuộn xuống cuối container.
   - Sử dụng hook `useExplorerFreshness` để hiển thị Freshness Banner ("Có tài nguyên mới. Bấm để làm mới") khi có socket `getMessage` trùng khớp và thuộc dạng media. Click vào banner sẽ reset danh sách và tải lại từ trang đầu.
   - Thiết lập giao diện hiển thị ảnh dạng lưới (Grid 3 cột) với tỷ lệ `aspect-square bg-gray-100` để chống hiện tượng dịch chuyển bố cục (CLS).
2. **Triển khai component `MediaLightbox.jsx`:**
   - Hiển thị ảnh to với backdrop đen mờ (`fixed inset-0 z-50 bg-black/95 flex items-center justify-center`).
   - Gắn class `.media-lightbox-active` lên DOM khi lightbox hoạt động.
   - Hỗ trợ đóng qua nút close (X) và phím `Escape` (phải gọi `e.stopPropagation()` để chặn không cho sự kiện Escape nổi bọt lên đóng mất Modal Shell bên dưới).
3. **Tích hợp vào `ConversationPanel.jsx`:**
   - Thêm nút "Xem tất cả" vào phần hiển thị Media preview của Panel.
   - Quản lý state mở/đóng Modal qua Portal bằng `<ViewAllModalShell size="wide" title="Tất cả Media" isOpen={...}>`.

## Guardrails bắt buộc
- **Stale Response Protection:** Khi đổi cuộc trò chuyện, sử dụng `AbortController` hủy bỏ request cũ đang chạy tránh đè dữ liệu sai lệch.
- **Cursor Deduplication:** Lọc bỏ trùng lặp tin nhắn/attachments theo `_id` trước khi append vào state hiển thị.
- **ESC Priority Rule:** Nhấn ESC chỉ được đóng Lightbox nếu Lightbox đang mở, không được đóng modal to phía sau.