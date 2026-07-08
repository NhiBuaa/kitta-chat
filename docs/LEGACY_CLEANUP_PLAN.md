# Kế Hoạch Dọn Dẹp Mã Nguồn Cũ (Legacy Cleanup Plan) — Conversation Read Model

Tài liệu này phác thảo kế hoạch dọn dẹp mã nguồn legacy và tối ưu hóa cơ sở dữ liệu sau khi quá trình chuyển đổi (Read-switch) sang Conversation Read Model hoàn tất và ổn định.

---

## 1. Đánh Giá Khác Biệt Kiến Trúc & Trade-offs (Đặc Biệt Với Redis)

### 1.1. Deprecate Redis ZSET Conversation Cache (`convs:{userId}`)
* **Hệ thống cũ**: Sử dụng Redis Sorted Set với Key `convs:{userId}` để duy trì danh sách ID cuộc hội thoại được sắp xếp theo timestamp tin nhắn mới nhất.
* **Trade-off & Quyết định**: 
  * Duy trì ZSET yêu cầu cơ chế dual-write/sync phức tạp khi người dùng Ghim (Pin), Lưu trữ (Archive) hoặc Xóa (Delete) cuộc trò chuyện.
  * Với **Conversation Read Model**, bảng `ConversationParticipant` đã được thiết kế sẵn chỉ mục tối ưu:
    `{ userId: 1, "state.pinnedAt": -1, "state.lastMessageAt": -1 }`
  * Nhờ chỉ mục này, MongoDB có thể truy vấn danh sách hội thoại được sắp xếp trong thời gian `O(log N)` cực kỳ nhanh chóng mà không cần cache trung gian.
  * **Kế hoạch**: Loại bỏ hoàn toàn dịch vụ `conversationCacheService.js` và giải phóng bộ nhớ Redis khỏi việc lưu trữ ZSET này.

---

## 2. Các Vùng Mã Nguồn Cũ Cần Xóa (Code Deprecation)

### 2.1. Trong `server/src/controllers/userController.js`
* **Hàm `getSidebarUsers`**:
  * Loại bỏ truy vấn aggregate tìm tin nhắn cuối cùng (`lastMsgMap`) của các cuộc hội thoại 1-1 từ bảng `Message`:
    ```javascript
    Message.aggregate([
      { $match: { conversationId: { $in: allConversationIds } } },
      ...
    ])
    ```
  * Loại bỏ truy vấn aggregate đếm tin nhắn chưa đọc (`unreadMap`) từ bảng `Message`:
    ```javascript
    Message.aggregate([
      { $match: { receiver: currentUserObjectId, isRead: false, ... } },
      ...
    ])
    ```
  * Loại bỏ hoàn toàn flag guard `conversationSidebarReadModelEnabled` và hàm dự phòng legacy fallback để chuyển sang sử dụng trực tiếp dữ liệu từ `getSidebarCandidatesForUser`.
* **Hàm `runSidebarShadowCompare`**:
  * Xóa bỏ hoàn toàn hàm này cùng với việc import `compareSidebarForUser`.

### 2.2. Trong `server/src/controllers/groupController.js`
* **Hàm `getMyGroups`**:
  * Tích hợp cơ chế lấy danh sách nhóm từ Read Model thông qua `getSidebarCandidatesForUser` với bộ lọc `kind: "group"`.
  * Loại bỏ các truy vấn aggregate đếm tin nhắn chưa đọc (`unreadCounts`) và tin nhắn mới nhất (`lastMessages`) của nhóm từ bảng `Message`.
* **Hàm `runSidebarShadowCompare`**:
  * Xóa bỏ hoàn toàn hàm này để không phát sinh chi phí so sánh chạy ngầm.

### 2.3. Các Service và Bộ Kiểm Thử
* **Xóa các file service hỗ trợ migration**:
  * `server/src/services/conversationShadowCompareService.js`
  * `server/src/services/conversationReconciliationReport.js`
  * `server/scripts/backfillConversations.js` & `server/scripts/reconcileConversations.js`
  * `server/scripts/analyzeShadowCompareLogs.js`
* **Xóa các file kiểm thử tương ứng**:
  * `server/test/conversationShadowCompareService.test.js`
  * `server/test/conversationShadowCompareController.test.js`
  * `server/test/conversationReconciliationReport.test.js`
  * `server/test/conversationBackfillDryRun.test.js`
  * `server/test/conversationBackfillWrite.test.js`

---

## 3. Các Chỉ Mục & Trường Dữ Liệu MongoDB Khả Thi Để Gỡ Bỏ

* **Trường dữ liệu**:
  * `Message.isRead` và `Message.readBy`: Mặc dù các trường này vẫn hữu ích để phục vụ render trạng thái tin nhắn đơn lẻ (đã đọc/chưa đọc) tại màn hình chat, tuy nhiên các chỉ mục phục vụ truy vấn đếm unread count tổng quát cho sidebar có thể được loại bỏ hoàn toàn.
* **Chỉ mục (Indexes) trên `Message`**:
  * Sau khi gỡ bỏ aggregate, chỉ mục hỗ trợ truy vấn tin nhắn chưa đọc hoặc tin nhắn cuối cùng theo nhóm `conversationId` có thể được tinh giản để tiết kiệm dung lượng RAM và tăng tốc độ ghi (Write IOPS) của MongoDB.

---

## 4. Lộ Trình Chuyển Giao Chính Thức (Promotion Checklist)

1. **Bước 1: Chuyển đổi đọc cho Group Sidebar**
   * Bổ sung hàm ánh xạ dữ liệu và kích hoạt đọc từ Conversation Read Model cho endpoint `/api/groups`.
2. **Bước 2: Chạy Shadow Run trên Production (2 tuần)**
   * Bật `CONVERSATION_SHADOW_COMPARE_ENABLED=true` và theo dõi cảnh báo qua `analyzeShadowCompareLogs.js`.
   * Khắc phục triệt để mọi lỗi mismatch phát sinh từ log.
3. **Bước 3: Bật Switch Đọc Chính Thức (Read-Switch Promotion)**
   * Cấu hình mặc định `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED=true`.
   * Giữ chế độ fallback trong 1 tuần để đề phòng rủi ro phát sinh.
4. **Bước 4: Dọn dẹp mã nguồn (Cleanup)**
   * Tiến hành xóa các đoạn code, chỉ mục cũ đã liệt kê ở phần 1 và 2.
   * Viết test hồi quy đảm bảo không xảy ra lỗi sau khi dọn dẹp.
