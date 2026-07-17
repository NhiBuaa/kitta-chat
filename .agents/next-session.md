# Next Session — Slice 6: Conversation Action Domain

Mục tiêu tiếp theo là triển khai **Slice 6** nhằm thực thi các thao tác tương tác ghi (write actions) của cuộc hội thoại từ bảng điều khiển Conversation Panel (bao gồm rời nhóm, xóa lịch sử chat, ghim và tắt thông báo) bảo đảm phân quyền chặt chẽ bởi `PermissionService` và cập nhật dữ liệu nhất quán.

## Slice Mục tiêu
**Slice 6 — Conversation Action Domain**

## Bối cảnh
* Slice 5 đã hoàn tất xuất sắc:
  - Triển khai đầy đủ loaders thành viên nhóm và nhóm chung, tối ưu hoá với Redis cache và cursor-based pagination.
  - Giao diện `ConversationPanel.jsx` hiển thị trực quan các thành viên/nhóm chung kèm skeleton loading và retry riêng biệt.
  - Khắc phục triệt để lỗi rate limit `429 (Too Many Requests)` khi bật/tắt preferences liên tục bằng `useRef` (`loadedConvIdRef`).
  - Toàn bộ bộ test (290 tests backend và 121 tests frontend) chạy xanh 100%.

## Mục tiêu cụ thể
1. **Backend: Triển khai luồng Rời nhóm (Leave Group):**
   - Viết API/Service xử lý cho phép user rời khỏi nhóm trò chuyện.
   - Cập nhật trường `leftAt` trong `ConversationParticipant` và đồng bộ hóa qua Read Model.
   - Phát đi socket event báo cho các thành viên khác trong nhóm để cập nhật danh sách trực tuyến.
2. **Backend: Triển khai luồng Xóa lịch sử trò chuyện (Delete Chat History - Soft Delete):**
   - Viết API/Service cho phép user xóa lịch sử hội thoại (soft delete) cho riêng họ.
   - Cập nhật `state.deletedAt` bằng thời điểm hiện tại trong bản ghi `ConversationParticipant` của user đó.
   - Bảo đảm các truy vấn tin nhắn sau này của user này sẽ áp dụng filter `createdAt > state.deletedAt`.
3. **Backend & Frontend: Đồng bộ hóa Ghim (Pin) & Mute:**
   - Hoàn thiện và tích hợp triệt để API `PATCH /panel/preference` với state trên Frontend.
   - Đồng bộ hóa ngay lập tức trạng thái ghim/tắt thông báo trên sidebar/danh sách chat mà không cần reload tài nguyên nhờ cơ chế chặn re-render vừa tối ưu ở Slice 5.
4. **Kiểm tra quyền truy cập (Permission Check):**
   - Bảo đảm các thao tác ghi đều được bảo vệ nghiêm ngặt bằng Permission DTO (`canLeave`, `canDelete`).
5. **Viết tests:**
   - Viết unit tests độc lập cho các action services mới.
   - Viết integration tests bảo vệ các API endpoints thực thi actions.

## Guardrails bắt buộc
- **Soft Delete cô lập:** Hành động xóa lịch sử trò chuyện của một user không được ảnh hưởng đến tin nhắn hiển thị của người khác (dữ liệu tin nhắn trong MongoDB vẫn giữ nguyên).
- **Socket Realtime:** Việc rời nhóm phải kích hoạt socket event tương ứng tới các thành viên còn lại ngay lập tức để cập nhật UI danh sách thành viên của họ.