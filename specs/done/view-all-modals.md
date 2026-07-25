# PRD: Các Modal Xem Tất Cả Trong Conversation Panel (View All Modals)

## Problem Statement
Trong Giao diện Panel thông tin cuộc hội thoại (Conversation Information Panel), các mục chia sẻ (Media, Files, Links) và mục Nhóm chung (Common Groups) chỉ hiển thị một số lượng giới hạn các phần tử gần nhất (tối đa 6 phần tử). Nút "Xem tất cả" (View All) hiện tại ở các phần này đều đang là placeholder, khi click chỉ hiển thị toast thông báo "Tính năng đang được phát triển". Người dùng cần có khả năng xem toàn bộ lịch sử các tệp tin, liên kết, và nhóm chung này một cách trực quan và hỗ trợ phân trang mượt mà.

## Solution
Xây dựng kiến trúc Explorer độc lập và Shell hợp nhất để hiển thị chi tiết lịch sử tài nguyên, tách biệt hạ tầng hiển thị và logic nghiệp vụ, đồng thời cô lập sự kiện socket realtime thông qua hook trung gian:
1. **ViewAllModalShell:** Component container chịu trách nhiệm quản lý hạ tầng hiển thị (Portal, Backdrop, Escape key handling, Focus Trap, Close Button, Animation, Scroll Container, Loading Boundary). Shell hỗ trợ prop `size` (`"normal" | "wide" | "fullscreen"`) để điều chỉnh linh hoạt kích thước giới hạn max-width dựa trên loại tài nguyên hiển thị. Trên mobile, mọi kích thước tự động chuyển sang fullscreen.
2. **Các Explorer Component:** 4 component độc lập (`MediaExplorer`, `FilesExplorer`, `LinksExplorer`, `CommonGroupsExplorer`). Mỗi Explorer sẽ tự fetch dữ liệu của mình qua API dùng con trỏ cursor, quản lý logic phân trang riêng, render layout, và sử dụng custom hook `useInfiniteScroll` để phân trang.
3. **Bộ xem ảnh đầy đủ (MediaLightbox):** Tách biệt bộ hiển thị Lightbox thành một component riêng `MediaLightbox`. `MediaExplorer` quản lý state `{ selectedMedia }` (kiểu đối tượng hỗ trợ mở rộng) và truyền xuống `MediaLightbox`.
4. **Cơ chế Snapshot + Freshness Notification:**
   - Dữ liệu hiển thị trong Explorer là một **ảnh chụp tĩnh (Snapshot)** tại thời điểm mở modal.
   - Khi có tin nhắn mới realtime thích hợp gửi đến, hiển thị một banner thông báo độ tươi mới. Nhấp vào banner này sẽ làm mới hoàn toàn dữ liệu (reset cursor, refetch trang đầu tiên và tạo snapshot mới).
5. **Quy tắc phím bấm ESC (Escape Key Handling):**
   - Nếu `MediaLightbox` đang mở: Bấm phím `ESC` chỉ thực hiện đóng Lightbox, **không** được đóng `ViewAllModalShell`.
   - Nếu `MediaLightbox` không mở: Bấm phím `ESC` sẽ đóng `ViewAllModalShell` như bình thường.
   - Cơ chế chặn được kiểm soát thông qua sự diện diện của lớp CSS hoạt động (ví dụ: `media-lightbox-active`) trong DOM.
6. **Tách biệt Realtime Concerns & Utilities:**
   - Xây dựng Custom Hook `useExplorerFreshness` đảm nhận toàn bộ việc subscribe/unsubscribe sự kiện socket `getMessage` realtime, khớp cuộc hội thoại và phân loại loại tài nguyên.
   - Tách biệt logic so khớp thành các utility function thuần khiết: `belongsToConversation`, `matchesMedia`, `matchesFile`, `matchesLink`.
7. **Custom Hook Phân Trang Dùng Chung (useInfiniteScroll):**
   - Thiết kế hook generic `useInfiniteScroll({ enabled, hasMore, isFetching, onLoadMore, rootRef })` để quản lý IntersectionObserver.
   - `rootRef.current` là scroll container của Shell.
   - Sử dụng `isFetchingRef` làm khóa đồng bộ (synchronous locking) bên trong hook để triệt tiêu hoàn toàn rủi ro duplicate fetch.

## User Stories
1. **US-1 (Xem tất cả Media):** Khi click "Xem tất cả" ở phần Media, `ViewAllModalShell` kích hoạt ở dạng `size="wide"` (đảm bảo không gian ngang tối ưu cho grid hiển thị) chứa `MediaExplorer`. `MediaExplorer` tự load dữ liệu dạng lưới (Grid) hiển thị toàn bộ ảnh và video. Rê chuột vào ảnh/video sẽ có hiệu ứng hover mượt mà, hỗ trợ phân trang. Click vào ảnh sẽ mở `MediaLightbox` để xem ảnh kích thước đầy đủ. Nhấn `ESC` khi Lightbox mở sẽ đóng Lightbox trước; nhấn `ESC` lần nữa mới đóng Shell.
2. **US-2 (Xem tất cả Files):** Khi click "Xem tất cả" ở phần Files, `ViewAllModalShell` kích hoạt dạng `size="normal"` chứa `FilesExplorer` được bật. `FilesExplorer` load dữ liệu danh sách hiển thị tên file, dung lượng, định dạng và icon tương ứng. Click vào file để tải xuống. Hỗ trợ phân trang. Banner thông báo xuất hiện khi có file mới gửi đến.
3. **US-3 (Xem tất cả Links):** Khi click "Xem tất cả" ở phần Links, `ViewAllModalShell` kích hoạt dạng `size="normal"` chứa `LinksExplorer`. `LinksExplorer` hiển thị danh sách URL chia sẻ. Click để mở link trong tab mới. Hỗ trợ phân trang. Banner thông báo xuất hiện khi có liên kết mới.
4. **US-4 (Xem tất cả Nhóm chung):** Khi click "Xem tất cả" ở phần Nhóm chung, `ViewAllModalShell` kích hoạt dạng `size="normal"` chứa `CommonGroupsExplorer`. `CommonGroupsExplorer` hiển thị các nhóm chung của hai người dùng và cho phép click điều hướng thẳng tới group chat đó. Hỗ trợ phân trang.

## Proposed Test Seams
1. **API Integration Test:** Cập nhật API client `getPanelResources` hỗ trợ tham số `cursor` và viết test case kiểm chứng request được build đúng URL định dạng query string.
2. **State & Paginate Helper Test:** Viết unit test cho các helpers xử lý cập nhật danh sách (appending items) và quản lý con trỏ trang `nextCursor`/`hasMore` của từng explorer để tránh trùng lặp tệp tin khi tải trang mới.
3. **Matching Logic Test:** Viết unit test cho các domain functions khớp tin nhắn (`belongsToConversation`, `matchesMedia`, `matchesFile`, `matchesLink`).
4. **UI Manual Verification:** Kiểm chứng các modal hiển thị đẹp mắt dưới dạng Centered Card Modal, kiểm tra tính đáp ứng (responsiveness) của các kích cỡ `"normal" | "wide" | "fullscreen"`, tự động đóng khi bấm backdrop hoặc phím `Esc`, xử lý phím `ESC` ưu tiên đóng Lightbox trước khi đóng Modal Shell, hiển thị banner freshness chính xác và hoạt động refresh sạch sẽ.
