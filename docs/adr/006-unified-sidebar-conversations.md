# ADR-006: Unified Sidebar Conversations

## Status
Accepted

## Context
Hiện tại, hệ thống KittaChat đang phân tách sidebar thành hai mục riêng biệt: "Tin nhắn" (chat 1-1) và "Nhóm chat". Điều này dẫn đến việc gọi hai API backend riêng lẻ (`/api/users/sidebar-list` và `/api/groups`) rồi hiển thị thành hai khối UI riêng biệt. 
Khi muốn gộp hai danh sách này lại thành một luồng hội thoại duy nhất ("Tin nhắn" chứa cả hai loại chat) để cải thiện trải nghiệm người dùng và tính nhất quán, việc gộp ở client sẽ dẫn đến lỗi logic phân trang (pagination) và sắp xếp khi số lượng cuộc trò chuyện tăng lên. Do đó, chúng ta cần thiết lập một hệ thống tải phân trang vô hạn (Infinite Scroll) hoàn chỉnh sử dụng Cursor-based pagination tích hợp thẳng vào Conversation Read Model ở cả client và backend.

## Decision
1. **API gộp Backend hỗ trợ Cursor-based Pagination & Filtering:**
   * Tạo route mới `GET /api/sidebar/conversations` hỗ trợ ba tham số truy vấn: `cursor`, `limit` (mặc định là 20), và `kind` (`direct` | `group` | empty cho tất cả).
   * Khi chọn bộ lọc khác "Tất cả" ở client, backend sẽ áp dụng filter theo `kind` **trước khi** thực hiện logic phân trang cursor/limit.
   * API trả về payload có cấu trúc: `{ success: true, conversations: [...], nextCursor: String, hasMore: Boolean }`.

2. **Cơ chế xử lý Pinned Conversations:**
   * Các cuộc hội thoại được ghim (`isPinned === true`) sẽ được tách riêng logic query để tránh lặp lại ở các trang tiếp theo.
   * **Trang đầu tiên (cursor = null):** Backend truy vấn **tất cả** các cuộc hội thoại được ghim của user hiện tại (lọc theo `kind` nếu có), sau đó truy vấn trang đầu tiên của các cuộc hội thoại không được ghim (non-pinned), ghép chúng lại và trả về: `[...pinnedConversations, ...nonPinnedConversations]`.
   * **Các trang tiếp theo (cursor != null):** Backend chỉ truy vấn các cuộc hội thoại không được ghim (non-pinned) dựa trên cursor truyền lên, hoàn toàn không query lại pinned nữa.

3. **Cấu trúc Cursor và Tie-breaker:**
   * Cursor được thiết kế dạng kết hợp giữa thời gian tin nhắn cuối cùng (`lastMessageAt`) và định danh ObjectId chuẩn của Conversation: `<lastMessageAt>_<conversationId>`.
   * Để đảm bảo so sánh thứ tự chuẩn xác và nhất quán trong database, tie-breaker trong cursor sử dụng **ObjectId của bản ghi Conversation trong read-model (tức `Conversation._id`)**, hoàn toàn không sử dụng `legacyConversationId` (vì trường này là string tự do chứa ký tự `_` đối với direct chat, không đảm bảo so sánh `$lt` chuẩn xác).
   * Khi truy vấn non-pinned conversations ở backend, ta sử dụng filter sau:
     ```javascript
     const filter = {
       userId,
       leftAt: null,
       "state.pinnedAt": null, // Chỉ lấy các item không ghim
     };
     if (kind) {
       // Filter kind theo conversationId.kind
       filter["conversationId.kind"] = kind; 
     }
     if (cursor) {
       const [cursorTime, cursorId] = decodeCursor(cursor);
       filter.$or = [
         { "state.lastMessageAt": { $lt: new Date(cursorTime) } },
         {
           "state.lastMessageAt": new Date(cursorTime),
           // Sử dụng ObjectId của Conversation làm tie-breaker
           conversationId: { $lt: new mongoose.Types.ObjectId(cursorId) } 
         }
       ];
     }
     ```
     Sắp xếp trong database: `.sort({ "state.lastMessageAt": -1, conversationId: -1 })` để đảm bảo thứ tự chính xác.

4. **Schema Response:**
   * Cấu trúc JSON phẳng chứa thông tin phân loại `kind: "direct" | "group"`, các cấu hình per-user (`isPinned`, `isMuted`, `unreadCount`), trường sắp xếp top-level `lastMessageAt`, đối tượng tin nhắn cuối cùng `lastMessage`, và đối tượng chi tiết đối phương/nhóm `target`.
   * Chi tiết `lastMessage` bao gồm cả thông tin người gửi (`senderName`, `senderAvatar`) để hiển thị dạng "Tên: Nội dung" trong group chat mà không cần client tra cứu thêm.
   * Bước enrich thông tin `target` và `lastMessage.sender` ở backend bắt buộc sử dụng cơ chế **Batch Query** (toán tử `$in` trên User và Group collections) để loại bỏ hoàn toàn lỗi hiệu năng N+1 query.

5. **Fallback hiển thị dòng phụ:**
   * Nếu có `lastMessage`: hiển thị `"{lastMessage.senderName}: {lastMessage.content}"` (cho group chat) hoặc `"{lastMessage.content}"` (cho direct chat).
   * Nếu `lastMessage` bằng `null` (hội thoại mới): hiển thị fallback là `"{target.memberCount} thành viên"` (cho group chat) hoặc status text / `"Bắt đầu trò chuyện"` (cho direct chat).

6. **UI Filter Chips ở Client:**
   * Thiết kế 3 nút lọc dạng viên thuốc (Filter Chips) ngay dưới thanh tìm kiếm: **"Tất cả"**, **"Cá nhân"** (gửi `kind=direct`), và **"Nhóm"** (gửi `kind=group`).
   * Quản lý state cursor độc lập cho từng tab filter ở Client. Khi người dùng chuyển tab, client sẽ **reset cursor về null** và load lại trang đầu tiên của tab đó (không tái sử dụng dữ liệu/cursor cũ).
   * Tương tác giữa Filter Chip và ô Tìm kiếm tuân theo logic **AND** (lọc từ khóa trong tập con đã chọn).
   * Lưu trạng thái bộ lọc đang chọn vào `localStorage` (`kitta_sidebar_filter`).
   * Thiết kế Empty State cụ thể cho từng tab filter để cải thiện trải nghiệm người dùng.

7. **Xử lý Real-time, Socket và Tải lại:**
   * Khi có tin nhắn mới, client nhận sự kiện socket. Nếu cuộc trò chuyện chưa tồn tại trong mảng `conversations` (ví dụ: nhóm mới tạo), backend phát sự kiện kèm payload có cấu trúc đầy đủ thông tin `target` để client chèn trực tiếp.
   * Cập nhật `unreadCount`: Tăng unreadCount + 1 nếu user không ở active chat của cuộc trò chuyện đó. Ngược lại, bắn ngay sự kiện mark-as-read về backend. Tin nhắn từ chính mình (multi-tab sync) không tăng unreadCount.
   * Sử dụng Debounce khoảng 300-500ms đối với thao tác sắp xếp lại vị trí hiển thị (re-sort) trên UI khi có tin nhắn đến dồn dập để tránh hiện tượng giật/nhảy màn hình. Việc cập nhật nội dung tin nhắn (`lastMessage`/`lastMessageAt`) vẫn xử lý tức thời.
   * *Ghi chú về Cursor Real-time:* Khi có tin nhắn mới đẩy 1 conversation lên đầu danh sách qua socket, `nextCursor` cũ (tính từ lần fetch trước) vẫn sử dụng được bình thường vì cursor dựa trên giá trị của phần tử cuối cùng đã load (không phụ thuộc vào vị trí index vật lý trong danh sách).
   * Cơ chế reload/pull-to-refresh: Thay thế toàn bộ state của tab sidebar đang mở bằng dữ liệu mới nhất từ API (reset về trang 1), không dùng cơ chế merge phức tạp để tránh overhead.

## Consequences
* **Ưu điểm:**
  * Trải nghiệm người dùng mượt mà, phản hồi real-time nhanh và nhất quán trên toàn bộ danh sách hội thoại.
  * API được tối ưu hóa hiệu năng, giảm N+1 query và phân trang chuẩn xác bằng cursor-based pagination.
  * UI hiển thị rõ ràng, khoa học nhờ Filter Chips và Empty States chuyên biệt cho từng tab.
  * Hỗ trợ tải phân trang vô hạn độc lập cho từng bộ lọc mà không lo trùng lặp hay bỏ sót dữ liệu kể cả khi có tin nhắn mới liên tục gửi đến.
* **Đánh đổi & Rủi ro (Trade-offs & Risks):**
  * **Trễ hiển thị do Debounce:** Debounce 300-500ms cho việc sắp xếp lại vị trí hiển thị giúp UI ổn định khi tin nhắn đến dồn dập, nhưng sẽ tạo ra một độ trễ nhỏ có thể nhận thấy được giữa lúc nhận tin nhắn và lúc cuộc trò chuyện thực sự nhảy lên đầu danh sách.
  * **Tăng độ phức tạp ở Client:** Client bắt buộc tích hợp logic infinite scroll observer (Sentinel) vào sidebar và xử lý ghép trang một cách độc lập cho từng tab bộ lọc.
