# Next Session — Slice 9: View All Media Modal Integration & Lightbox

## Slice Mục tiêu
**Slice 9: View All Media Modal Integration & Lightbox**

## Bối cảnh
- Chúng ta đã hoàn thiện khung hạ tầng dùng chung (`ViewAllModalShell`), API client phân trang (`getPanelResources`), hook generic phân trang `useInfiniteScroll` và hook realtime `useExplorerFreshness`.
- Ở slice này, chúng ta cần triển khai chi tiết giao diện Xem tất cả Media, liên kết lưới ảnh và xem ảnh to.

## Mục tiêu cụ thể
1. **Triển khai `MediaExplorer.jsx`:**
   - Fetch tài nguyên media dạng snapshot qua `getPanelResources(conversationId, "media", cursor)`.
   - Hiển thị danh sách ảnh dạng Grid 3 cột. Các ô có tỉ lệ `aspect-square bg-gray-100` cố định để chống CLS, hiển thị skeleton khi đang fetch trang mới.
   - Tích hợp hook `useInfiniteScroll` để tự động tải thêm trang kế tiếp khi người dùng cuộn đến cuối.
   - Tích hợp hook `useExplorerFreshness` để hiển thị banner thông báo *"Có tài nguyên mới. Bấm để làm mới"*. Click vào banner sẽ reset danh sách và tải lại từ đầu (reset cursor).
   - Quản lý state `selectedMedia` và kích hoạt `MediaLightbox` khi click vào một ảnh.
2. **Triển khai `MediaLightbox.jsx`:**
   - Overlay nền đen (`fixed inset-0 z-50 bg-black/95 flex items-center justify-center`).
   - Có class CSS hoạt động `.media-lightbox-active`.
   - Có nút đóng (X) và hỗ trợ nhấn phím `Escape` để đóng chính nó (đồng thời gọi `e.stopPropagation()` để không làm đóng modal chính của Modal Shell).
3. **Tích hợp vào `ConversationPanel.jsx`:**
   - Khai báo state `activeModal` dạng `{ type: "media" }` (hoặc các type khác sau này) để quản lý mở modal.
   - Ráp `<ViewAllModalShell size="wide" title="Tất cả Media" isOpen={activeModal?.type === "media"} onClose={() => setActiveModal(null)}>` và chứa `<MediaExplorer>` bên trong.

## Guardrails bắt buộc
- **CLS Prevention:** Mọi thumbnail ảnh trong grid bắt buộc phải nằm trong container có chiều rộng/cao ổn định (dùng Tailwind class `aspect-square bg-gray-100`).
- **Memory Leak prevention:** Hủy đăng ký lắng nghe bàn phím ESC của Lightbox khi component unmount.
- **ESC Priority Rule:** Nhấn ESC khi Lightbox đang mở chỉ được đóng Lightbox, không được đóng modal lớn phía sau.