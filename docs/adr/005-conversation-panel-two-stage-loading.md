# ADR-005: Conversation Panel Two-Stage Loading & Architecture Invariants

## Status
Accepted

## Context
Conversation Information Panel chứa nhiều loại dữ liệu nghiệp vụ khác nhau từ thông tin tĩnh (tên, avatar), cài đặt cá nhân (ghim, mute), quyền hạn truy cập cho đến các tài nguyên nặng (ảnh, video, file, liên kết chia sẻ) và các kết nối nhóm. 
Nếu nạp toàn bộ các tài nguyên này trong một API duy nhất, thời gian xử lý và phản hồi sẽ rất lớn, gây ra cảm giác giao diện bị đơ (poor perceived latency) và làm tăng tải cùng lúc lên cơ sở dữ liệu.

## Decision
1. **Phân tách API thành 2 giai đoạn (Two-Stage Loading):**
   * **Giai đoạn 1 (Metadata):** Endpoint `GET /api/conversations/:id/panel/metadata` trả về thông tin Header, Preferences và Permissions.
   * **Giai đoạn 2 (Resources & Membership):** Endpoint `GET /api/conversations/:id/panel/resources` tải bất đồng bộ song song bằng `Promise.allSettled()` ở Orchestration Layer (Controller) để nạp Media, Files, Links và Groups/Members Preview.
2. **Quy tắc Timeout & API Error Contract:**
   * Mỗi loader độc lập có timeout cấp ứng dụng (application-level timeout) là 2 giây. Hỗ trợ truyền `AbortSignal` nếu driver cơ sở dữ liệu hỗ trợ cancellation; ngược lại, timeout chỉ có tác dụng ngắt kết nối xử lý API response sớm.
   * Khi một hoặc nhiều loaders thất bại hoặc timeout, API vẫn trả về `200 OK` nhưng payload JSON phản ánh rõ trạng thái lỗi của riêng loader đó (`status: "error"`).
3. **Quy tắc Retry (Retry Behavior):**
   * Nút Retry trên giao diện chỉ tải lại duy nhất loader bị thất bại (truyền query param `?scopes=media|files|links|membership`). Các loaders thành công tuyệt đối không được thực thi lại. Không reload Metadata API. Giữ nguyên tài nguyên đã tải thành công trước đó.
4. **API Versioning & Versioning Policy:**
   * Phản hồi API đi kèm trường `"version": 1` và HTTP Header `X-Panel-Version: 1`. Chỉ nâng version khi có breaking changes trong response schema. Bổ sung trường mới không làm nâng version.
5. **Feature Flag Behavior:**
   * Khi cờ `CONVERSATION_PANEL_ENABLED=false`, UI ẩn điểm truy cập và API backend trả về `404 Not Found`.

## Architecture Invariants (Các luật kiến trúc bất biến)
Các nguyên tắc bất biến sau đây bắt buộc phải được duy trì nghiêm ngặt trong suốt vòng đời dự án:

1. **Presence không tham gia ETag:** Trạng thái online/offline của Presence Service hoàn toàn loại trừ khỏi phép tính ETag của Metadata endpoint để ngăn chặn việc cache bị invalid liên tục. Cache ETag chỉ áp dụng cho thông tin hội thoại tĩnh và preference ổn định.
2. **PermissionService chỉ đọc, không ghi:** `PermissionService` là pure service, chỉ chịu trách nhiệm đánh giá và trả về DTO quyền truy cập, tuyệt đối không chứa business logic thay đổi hoặc ghi dữ liệu.
3. **Resource loaders hoàn toàn độc lập:** Các loader tài nguyên (`loadMedia`, `loadFiles`, `loadLinks`) độc lập về cả logic xử lý lẫn mã nguồn, không loader nào phụ thuộc vào loader khác.
4. **Không chia sẻ mutable state giữa các loaders:** Tuyệt đối không chia sẻ trạng thái có thể biến đổi (mutable state) giữa các loader con để tránh rò rỉ dữ liệu hoặc tranh chấp tài nguyên bất đồng bộ.
5. **Membership Preview và View All dùng chung cơ chế:** Phải sử dụng cùng một kiểu sắp xếp (ordering) và cùng một cấu trúc con trỏ phân trang (`ConversationParticipant._id` cursor semantics).
6. **Cursor bất biến (immutable):** Con trỏ phân trang của tài nguyên không đổi sau khi tải panel. Tin nhắn realtime mới chỉ hiển thị trước mốc cursor hiện tại trên UI và không làm tính toán lại cursor trên Client.
7. **Retry chỉ reload loader lỗi:** Khi click nút Retry, client chỉ thực hiện gọi lại duy nhất loader của domain tài nguyên/membership bị thất bại trước đó.
8. **Retry không reload metadata:** Hành động tải lại tài nguyên lỗi tuyệt đối không được gọi lại Metadata endpoint (Giai đoạn 1). Giao diện metadata phải được giữ nguyên.
9. **View All luôn là source of truth:** Client-side store là eventually consistent; trang Xem chi tiết (View All) luôn đóng vai trò là nguồn chân lý tối cao của dữ liệu.
10. **Orchestration Layer mỏng:** `ConversationPanelService` chỉ chịu trách nhiệm điều phối (orchestrate) kết quả trả về từ các domain service con độc lập, tuyệt đối không tự thực thi business logic nghiệp vụ cụ thể.

## Snapshot Consistency
* Nhằm tối ưu hóa latency và khả năng scale, Resources API hoạt động theo mô hình **eventual consistency**. Các loaders chạy song song qua `Promise.allSettled()` được phép đọc dữ liệu ở các thời điểm hơi lệch nhau; không yêu cầu cùng database/transaction snapshot. View All là source of truth.

## Response Payload Boundary
* Preview API chỉ trả về các metadata tối thiểu cần thiết để render UI, tuyệt đối không trả về dữ liệu nhị phân (binary), base64 hoặc nội dung thô của file để bảo đảm hiệu năng và giới hạn response size.

## Observability Requirements
* **Metrics:** Thu thập metrics độ trễ, thời gian thực thi của loader, timeout, lỗi, lượt retry, cache hits/misses.
* **Structured Logs:** Ghi log tối thiểu: `requestId`, `conversationId`, `userId`, `endpoint`, `loaderName`, `duration`, `timeout`, `status`.
* **Distributed Tracing:** Trace độc lập: Metadata endpoint, Resources endpoint, `loadMedia`, `loadFiles`, `loadLinks`, `loadMembership`.

## Consequences
* Trải nghiệm người dùng (Perceived Latency) cực tốt nhờ cơ chế tải 2 giai đoạn.
* Codebase sạch sẽ, tuân thủ đúng nguyên tắc CQRS và Clean Architecture nhờ sự tách biệt rõ ràng giữa các domain service độc lập.
* Khả năng giám sát hệ thống (observability) được nâng lên mức Enterprise.

## References
* [PRD: Conversation Information Panel](file:///d:/Developer/Projects/shotter/shot-chat/specs/active/conversation-information-panel.md)
* [Implementation Plan](file:///C:/Users/Nhi/.gemini/antigravity/brain/1cae5bf1-75e0-4d6c-a299-137bc6b489d3/implementation_plan.md)
