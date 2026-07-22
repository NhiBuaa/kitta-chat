# Next Session Plan: Slice 4 — Real-time Socket events, Debounced UI Sorting, and Unread Sync

## Bối cảnh
- **Slice 1 (Backend API)**, **Slice 2 (Client Layout)**, và **Slice 3 (Client Infinite Scroll)** đã hoàn thành 100% với 178/178 client unit tests và 298/298 server integration tests xanh.
- Đã hỗ trợ Sentinel DOM Node, Callback Ref re-observe khi remount/chuyển tab mượt mà.
- Trạng thái hiện tại: Sidebar hiển thị phân trang cursor, chuyển tab giữ nguyên state, cuộn trang tự động nạp tiếp.

## Slice Mục Tiêu
**Slice 4: Real-time Socket events, Debounced UI Sorting, and Unread Sync**

## Mục Tiêu Cụ Thể
1. **Real-time Socket Updates:**
   - Lắng nghe sự kiện socket tin nhắn mới (`getMessage`, `receive_message`).
   - Cập nhật `lastMessage` và `lastMessageAt` lập tức trên UI để không bị trễ thông tin.
2. **Debounced UI Sorting (300-500ms):**
   - Tích hợp debounce timer (300-500ms) cho hành vi sắp xếp lại vị trí (reorder) phần tử trên danh sách Sidebar khi có tin nhắn mới dồn dập, tránh giật UI.
3. **Unread Badge & Multi-tab Sync Guard:**
   - Nếu `senderId === currentUserId`, không tăng unread.
   - Nếu tin nhắn thuộc `activeChat`, không tăng unread và bắn ngay sự kiện `mark-as-read` về backend.
   - Nếu tin nhắn thuộc cuộc trò chuyện khác `activeChat`, tăng unreadCount lên 1.
4. **Ingestion Cuộc Trò Chuyện Mới Qua Socket:**
   - Nếu nhận tin nhắn từ cuộc trò chuyện chưa có trong danh sách local, tự động thêm mới row với đầy đủ metadata `target`.

## Slice Verification Checklist
- File kịch bản kiểm thử nghiệm thu thủ công sẽ được khởi tạo tại:
  [.agents/manual-tests/unified-sidebar-conversations/slice-4-realtime-socket-sync.md](file:///d:/Developer/Projects/shotter/shot-chat/.agents/manual-tests/unified-sidebar-conversations/slice-4-realtime-socket-sync.md)

## Guardrails Bắt Buộc
- **Không trễ tin nhắn:** Cập nhật nội dung `lastMessage` bắt buộc thực thi tức thời (instant), chỉ debounce hành vi sắp xếp lại thứ tự (reorder index).
- **Active Chat Guard:** Không tăng unread count khi cuộc trò chuyện đó đang mở active trên màn hình.
- **Dữ liệu Socket:** Đóng gói đầy đủ object `target` khi emit sự kiện socket mới cho người dùng.