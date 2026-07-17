# Next Session — Slice 3: Shared Media Domain

Mục tiêu tiếp theo là triển khai **Slice 3** nhằm hoàn thành phần tải ảnh/video đã chia sẻ (Shared Media) trong cuộc trò chuyện cho Conversation Panel (Giai đoạn 2 - Resources API), tích hợp phân trang cursor-based và hiển thị giao diện preview trên Frontend.

## Slice Mục tiêu
**Slice 3 — Shared Media Domain**

## Bối cảnh
*   Slice 2 đã hoàn tất: Metadata API cung cấp Overview và Preference thực tế, hỗ trợ ETag cache loại trừ Presence. Frontend đã gỡ bỏ checkbox và thay thế bằng các button tương tác Ghim/Mute trực tiếp.
*   Hiện tại Resources API (`GET /api/conversations/:id/panel/resources`) vẫn đang trả về danh sách trống cho phần media.

## Mục tiêu cụ thể
1.  **Backend: Triển khai Media Loader:**
    *   Phát triển hàm `loadMedia(conversationId, limit, cursor, visibilityFilter)` trong `ResourceService`.
    *   Tải tối đa 6 media (ảnh/video) gần nhất từ các tin nhắn có tài nguyên đính kèm.
    *   Sắp xếp theo thứ tự chuẩn: `newest Message._id first` (giảm dần).
    *   Phân trang sử dụng cursor `Message._id`.
    *   Áp dụng visibility filter dựa trên thời gian tham gia/rời nhóm (`leftAt`, `deletedAt`) để lọc tài nguyên được phép xem.
    *   Chỉ trả về thông tin tối thiểu (thumbnail URL, original URL, mimeType, size) - Tuyệt đối không trả về binary/base64.
2.  **Frontend: Hiển thị Shared Media:**
    *   Tải bất đồng bộ danh sách media thông qua API `/panel/resources?scopes=media` (hoặc load toàn bộ).
    *   Hiển thị lưới hình ảnh (grid preview) 6 ảnh/video gần nhất trên UI Panel.
    *   Hỗ trợ nút "Xem tất cả" chuyển hướng đến giao diện xem chi tiết.
3.  **Viết tests:**
    *   Bổ sung unit tests cho `loadMedia`.
    *   Bổ sung integration tests cho API resources với scope `media`.

## Guardrails bắt buộc
*   **Timeout 2s:** Loader phải có timeout ứng dụng 2 giây. Nếu lỗi hoặc timeout, trả về trạng thái `"status": "error"`, không làm sập toàn bộ API (API vẫn trả về 200).
*   **Không chia sẻ mutable state:** Không chia sẻ trạng thái có thể thay đổi giữa các loader tài nguyên.
*   **Quyền truy cập:** Sử dụng `PermissionService` để đánh giá quyền đọc trước khi tải tài nguyên.