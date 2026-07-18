# Issues & Tasks: View All Modals in Conversation Panel

Tài liệu này phân rã đặc tả PRD và Quyết định kiến trúc của tính năng **View All Modals** thành các lát cắt dọc (Tracer Bullets) độc lập để theo dõi và triển khai.

---

## Danh sách các Issues (Tracer Bullets)

### Issue #8: View All Core API, Generic Hooks & Shell Framework
*   **Blocked by**: None - can start immediately.
*   **User stories covered**: Infrastructure support for US-1, US-2, US-3, US-4.

#### What to build
Xây dựng cơ sở hạ tầng phía Client bao gồm:
1. API client support cursor-based pagination.
2. Custom hook generic `useInfiniteScroll` quản lý IntersectionObserver, liên kết với scroll container và đồng bộ `isFetchingRef` lock chống duplicate fetch.
3. Component hạ tầng dùng chung `ViewAllModalShell` (Centered Modal, hỗ trợ prop `size`, Escape key handling với ESC Blocker check, Backdrop click, Portal).
4. Custom hook `useExplorerFreshness` điều phối Socket.IO, đối sánh conversation, và các hàm utility so khớp tin nhắn (`belongsToConversation`, `matchesMedia`, `matchesFile`, `matchesLink`).

#### Acceptance criteria
- [ ] Hàm `getPanelResources` gửi đúng cursor param trong query string (đã viết test kiểm chứng).
- [ ] Hàm utility so khớp tin nhắn hoạt động chính xác (đã viết unit test đầy đủ).
- [ ] Hook `useInfiniteScroll` đăng ký observer đúng `rootRef` và tự động lock khi `isFetchingRef.current` là true.
- [ ] Component `ViewAllModalShell` render portal vào `document.body` thành công, có animation transition đẹp mắt, đóng được bằng Escape (khi không mở lightbox) và click backdrop.

---

### Issue #9: Media Explorer and Lightbox Integration
*   **Blocked by**: Issue #8
*   **User stories covered**: US-1 (Xem tất cả Media)

#### What to build
Triển khai component `MediaExplorer.jsx` và `MediaLightbox.jsx`:
1. `MediaExplorer` fetch và hiển thị ảnh/video dạng Grid 3 cột tỉ lệ `aspect-square bg-gray-100` chống CLS.
2. Tích hợp hook `useInfiniteScroll` để phân trang tự động khi cuộn cuối grid.
3. Tích hợp hook `useExplorerFreshness` lắng nghe socket `getMessage`, hiển thị Freshness Banner khi có ảnh mới, bấm banner sẽ refresh tạo snapshot mới.
4. Triển khai `MediaLightbox` hiển thị ảnh phóng to dạng overlay đen, hỗ trợ ESC Blocker để đóng chính nó mà không đóng Modal Shell.

#### Acceptance criteria
- [ ] Mở modal Media hiển thị lưới ảnh sắc nét, cuộn xuống dưới tự động tải thêm trang tiếp theo mượt mà.
- [ ] Nhận tin nhắn có ảnh/video qua socket hiển thị banner freshness. Click banner tải lại trang đầu thành công.
- [ ] Click vào ảnh mở ra `MediaLightbox` xem ảnh to. Bấm ESC lúc này chỉ đóng Lightbox, không đóng modal chính. Bấm ESC lần nữa mới đóng modal chính.

---

### Issue #10: Files & Links Explorers Integration
*   **Blocked by**: Issue #8
*   **User stories covered**: US-2 (Xem tất cả Files), US-3 (Xem tất cả Links)

#### What to build
Triển khai component `FilesExplorer.jsx` và `LinksExplorer.jsx`:
1. `FilesExplorer` hiển thị danh sách hàng dọc (tên file, icon định dạng, dung lượng). Click tải xuống. Phân trang bằng `useInfiniteScroll`.
2. `LinksExplorer` hiển thị danh sách URL (tiêu đề, hostname, mô tả). Click mở tab mới. Phân trang bằng `useInfiniteScroll`.
3. Cả hai tích hợp `useExplorerFreshness` để hiển thị Freshness Banner tương ứng cho file đính kèm/URL mới qua socket.

#### Acceptance criteria
- [ ] Modal Files hiển thị đúng icon định dạng, dung lượng file, click tải được file. Phân trang tự động hoạt động tốt.
- [ ] Modal Links hiển thị đúng hostname trích xuất, click mở liên kết trong tab mới.
- [ ] Cả hai modal hiển thị banner thông báo độ tươi mới chính xác khi có tài nguyên tương thích gửi đến qua socket.

---

### Issue #11: Common Groups Explorer & Quality Gate
*   **Blocked by**: Issue #8
*   **User stories covered**: US-4 (Xem tất cả Nhóm chung)

#### What to build
Triển khai component `CommonGroupsExplorer.jsx` và hoàn thiện chất lượng:
1. `CommonGroupsExplorer` hiển thị các nhóm chung có avatar và tên nhóm. Click vào nhóm sẽ kích hoạt callback chuyển đổi active chat của `ConversationPanel` và đóng modal.
2. Không tích hợp freshness listener cho Common Groups.
3. Rà soát chất lượng thông qua `/code-check`, dọn dẹp các event listener, bảo đảm không rò rỉ bộ nhớ.

#### Acceptance criteria
- [ ] Modal Nhóm chung hiển thị chính xác các nhóm chung của hai người dùng.
- [ ] Click vào tên nhóm thực hiện điều hướng chuyển đổi phòng chat hoạt động thành công và đóng modal.
- [ ] Không có socket listener nào đăng ký trong CommonGroupsExplorer.
- [ ] Chạy linter, test suite client xanh 100% không có lỗi/cảnh báo.
