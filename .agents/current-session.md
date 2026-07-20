# Conversation Information Panel — Current Session Roadmap

## Mục tiêu tổng thể
Triển khai tính năng Conversation Information Panel (Bảng thông tin chi tiết cuộc hội thoại) theo mô hình Two-Stage Loading, phân tách rõ các bounded context (Overview, Preference, Permission, Resource, Membership, Action), và bảo đảm 10 luật bất biến kiến trúc (Architecture Invariants).

## Các Invariant Bắt buộc (Architecture Invariants)
1. **Presence không tham gia ETag:** Trạng thái online/offline của Presence Service hoàn toàn loại trừ khỏi phép tính ETag của Metadata endpoint.
2. **PermissionService chỉ đọc, không ghi:** Dịch vụ pure service chỉ đánh giá quyền truy cập (Permission DTO), không chứa logic sửa đổi dữ liệu.
3. **Resource loaders hoàn toàn độc lập:** `loadMedia`, `loadFiles`, `loadLinks`, `loadMembership` độc lập hoàn toàn về mã nguồn và logic.
4. **Không chia sẻ mutable state giữa các loaders:** Tránh rò rỉ dữ liệu hoặc tranh chấp tài nguyên bất đồng bộ.
5. **Membership Preview và View All cùng cơ chế:** Dùng chung canonical ordering (`newest Message._id first`) và cấu trúc cursor (`ConversationParticipant._id`).
6. **Cursor bất biến (immutable):** Con trỏ phân trang tài nguyên không đổi sau khi tải panel; tin nhắn realtime mới chỉ hiển thị trước mốc cursor hiện tại trên UI.
7. **Retry chỉ reload loader lỗi:** Nhấp nút Retry chỉ gọi lại loader bị thất bại (qua query param `?scopes=<scope>`).
8. **Retry không reload metadata:** Tuyệt đối không gọi lại Metadata endpoint khi đang retry tài nguyên.
9. **View All là source of truth:** UI store chỉ là eventually consistent, trang Xem chi tiết luôn là nguồn chân lý tối cao của dữ liệu.
10. **Orchestration Layer mỏng:** `ConversationPanelService` chỉ điều phối kết quả trả về từ các domain service con độc lập, không tự thực thi logic cụ thể.

## Slice Roadmap

| Slice | Tên | Trạng thái | Ghi chú |
|---|---|---|---|
| 0 | Infrastructure, ADRs & Skeletons | **DONE** | Tạo ADR-004, ADR-005, config Feature Flags, base route/controller skeleton, rate limiting và test tích hợp skeleton. |
| 1 | Permission Service & UI Panel Layout | **DONE** | Viết pure PermissionService (backend), dựng layout panel thô (frontend), viết unit/integration tests và tích hợp kiểm tra quyền truy cập. |
| 2 | Overview & Preference Domain | **DONE** | Triển khai Metadata API (Giai đoạn 1) hoàn chỉnh, hỗ trợ ETag loại trừ Presence và preferences update. |
| 3 | Shared Media Domain | **DONE** | Triển khai Media loader (Giai đoạn 2), trả về thumbnail URL/metadata, phân trang cursor, sửa lỗi joinedAt group chat và UI Group members modal button. |
| 4 | Shared Files & Links Domain | **DONE** | Triển khai File loader & Link parser/normalization, lưu trữ link khi persist tin nhắn. |
| 5 | Conversation Membership Domain | **DONE** | Tải thành viên/nhóm chung, tối ưu hóa cache Redis, và sửa lỗi preferences rate limit. |
| 6 | Conversation Action Domain | **DONE** | Viết orchestrator xử lý các write actions: rời nhóm, ghim, tắt thông báo, xóa lịch sử trò chuyện. Sửa lỗi thoát màn hình chat và reset preference khi xóa lịch sử. |
| 7 | Realtime Sync & Client State | **DONE** | Đồng bộ hóa realtime qua Socket.IO. Sửa lỗi ẩn hiện/reload sidebar, gộp preferences realtime và chống double-fetching. |
| 8 | View All Core API, Generic Hooks & Shell Framework | **DONE** | Cập nhật API client `getPanelResources` hỗ trợ `cursor`, tạo hook generic `useInfiniteScroll`, hook `useExplorerFreshness` + utilities so khớp, và component `ViewAllModalShell` (Centered Modal + `size` prop + ESC handling). |
| 9 | View All Media Modal Integration & Lightbox | **TODO** | Triển khai component `MediaExplorer.jsx` và `MediaLightbox.jsx`. Tích hợp Infinite Scroll, Lightbox và Freshness Banner. |
| 10 | View All Files & Links Modals Integration | **TODO** | Triển khai `FilesExplorer.jsx` và `LinksExplorer.jsx`, tích hợp Infinite Scroll và Freshness Banner. |
| 11 | View All Common Groups Modal Integration & Quality Gate | **TODO** | Triển khai `CommonGroupsExplorer.jsx` (click điều hướng active chat) và rà soát chất lượng thông qua `/code-check`. |

## Trạng thái kiểm thử gần nhất
*   Sau Slice 8 (View All Core API, Generic Hooks & Shell Framework): Bộ test client regression `138/138` passed (100% xanh).