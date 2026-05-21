# BÁO CÁO ĐÁNH GIÁ KIẾN TRÚC VÀ SỨC KHỎE HỆ THỐNG (WEB-SOCKET)

---

## 📋 1. Tóm Tắt Sức Khỏe Hệ Thống (Health Summary)

* **Kiến trúc tổng thể ổn định & Coherent:** * `MongoDB` đóng vai trò là *Source of Truth* duy nhất cho dữ liệu bền vững.
  * `Redis` đảm nhận tốt các vai trò bổ trợ bao gồm: *Socket.IO adapter*, quản lý trạng thái hiển thị (*presence*), và tầng *cache*.
  * `RabbitMQ` hoạt động đúng bản chất như một *Side-effect Bus* xử lý không đồng bộ các tác vụ phụ (avatar, xử lý hình ảnh, gửi email, ghi nhận audit log).
* **Luồng Realtime tin cậy:** Phần tin nhắn realtime được truyền trực tiếp qua `Socket.IO`, hoàn toàn tách biệt khỏi critical path của `RabbitMQ` để đảm bảo hiệu năng tối ưu. Logic xử lý khi publish audit failure bị lỗi cũng đã được bao bọc (swallow) một cách chuẩn xác tại:
  `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\socket\handlers\messageHandler.js:98`
* **⚠️ Rủi ro cốt lõi cần lưu ý:** Luồng xử lý cuộc gọi (*call-flow*) hiện tại đang sử dụng trạng thái lưu trữ trực tiếp trong bộ nhớ (*state in-memory*) theo từng process. Cơ chế này không an toàn khi ứng dụng được scale-out (chạy nhiều Docker replicas) thông qua Redis adapter.
* **Đánh giá tích cực:** Tích hợp `RabbitMQ` được hoàn thiện tương đối tốt với đầy đủ các cơ chế nâng cao như *confirm channel*, *durable queues*, *retry queue TTL*, *Dead Letter Queue (DLQ)*, và cơ chế tự động kết nối lại (*worker reconnect*), tất cả đều đã được bao phủ bởi kiểm thử (test coverage).
* **Khuyến nghị chung:** Không thực hiện các đợt tái cấu trúc (refactor) lớn ngay lập tức. Cần ưu tiên dọn dẹp nhỏ (cleanup) theo ranh giới module (*boundary*) và bổ sung kiểm thử trước khi can thiệp vào tầng trạng thái cuộc gọi (*call state*).

---

## 🚨 2. Top 10 Rủi Ro Hệ Thống (Risk Assessment)

### 🔴 Mức độ: P0 (Nghiêm trọng - Cần xử lý ngay)
1. **Call state in-memory không an toàn trong môi trường Multi-Replica**
   * **Chi tiết:** Các biến trạng thái như `activeTimeouts`, `activeSocketCalls`, `tempIdToDbId`, `callRateLimit` hiện đang lưu local trong tiến trình. Nếu một cuộc gọi được khởi tạo (`initCall`) ở Backend A nhưng sự kiện phản hồi (`answer`/`reject`/`end`) lại định tuyến đến Backend B, hệ thống sẽ bị lệch timeout, mất ánh xạ ID tạm thời hoặc lỗi liên kết socket.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\socket\handlers\call\state.js:10`
2. **Cấu hình Nginx Load Balancing thiếu tính kiểm soát**
   * **Chi tiết:** Nginx hiện tại đang sử dụng biến cấu hình tĩnh `set $backend_upstream backend:3000`. Cách tiếp cận này chưa tối ưu hóa cơ chế DNS/Load-balancing của Docker khi có nhiều bản sao (replica) hoạt động như một khối `upstream` chính thống. Dù WebSocket giữ kết nối bền vững theo từng connection (stateful), nhưng các yêu cầu REST hoặc kết nối Socket ban đầu (`initial connect`) có thể phân bổ không đồng đều.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\nginx\nginx.conf:33`

### 🟠 Mức độ: P1 (Cao - Ảnh hưởng đến tính đúng đắn của logic)
3. **Khởi tạo Socket Adapter Redis không đồng bộ (Async Race Condition)**
   * **Chi tiết:** Redis adapter được kết nối bất đồng bộ sau khi hàm `initSocket()` trả về giá trị. Điều này tạo ra rủi ro hệ thống bắt đầu chấp nhận các kết nối từ client trước khi adapter được gắn kết thực sự thành công.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\socket\index.js:44`
4. **Lỗ hổng định danh trong Presence Handler**
   * **Chi tiết:** Module quản lý trạng thái trực tuyến cho phép client gửi sự kiện `addNewUser(userId)` tùy ý và gán trực tiếp vào socket: `socket.userId = userId`. Mặc dù JWT của socket đã được xác thực trước đó, hệ thống lại chưa bắt buộc kiểm tra xem payload dữ liệu của event gửi lên có trùng khớp với User ID đã được chứng thực trong token hay không.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\socket\handlers\presenceHandler.js:71`
5. **Trùng lặp logic khởi tạo Call Timeout (Double-Timeout)**
   * **Chi tiết:** Bộ đếm thời gian chờ cuộc gọi (`Call timeout`) được khởi tạo độc lập ở cả hai nhánh xử lý `initCall` và `callUser`. Logic này dễ dẫn đến hiện tượng hủy cuộc gọi hai lần (*double-finalize*) hoặc lỗi chạy đua dữ liệu (*reconnect race condition*) nếu client kích hoạt đồng thời cả hai sự kiện. Tệ hơn, việc dọn dẹp trạng thái hoàn toàn phụ thuộc vào một Map cục bộ.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\socket\handlers\call\handlers\initCall.js:17`
6. **Vô hiệu hóa bộ lọc trùng lặp trong Nền (Save Message Background)**
   * **Chi tiết:** Hàm `saveMessageInBackground` chứa logic phát hiện trùng lặp nhưng hiện đang bị ép cứng giá trị vô hiệu hóa (`isDuplicate = false`). Điều này khiến tác vụ audit log có thể liên tục gửi lại các yêu cầu xử lý trùng lặp lên MQ, mặc dù tầng Database vẫn đang được bảo vệ bởi một Unique Index.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\utils\saveMessageInBackground.js:73`
7. **Lỗi tham chiếu hàm chưa import trong Friend Cache Service**
   * **Chi tiết:** Hàm `friendCacheService` gọi logic `updateConversationRemove` nhưng thực tế tệp tin chỉ mới import hàm `updateConversationWriteThrough`. Lỗi này chắc chắn sẽ gây crash hệ thống ngay lập tức khi luồng nghiệp vụ chạy vào nhánh hủy kết bạn (remove friend) nếu chưa được vá kịp thời.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\services\friendCacheService.js:23`

### 🟡 Mức độ: P2 (Trung bình - Cần cải tiến kiến trúc)
8. **Vi phạm ranh giới thiết kế giữa REST Controllers và Realtime Socket**
   * **Chi tiết:** Các REST controllers (đặc biệt là group và user controller) vẫn đang trực tiếp phát tin realtime ra bên ngoài thông qua việc gọi `req.app.get("socketio")`. Mô hình này chấp nhận được với quy mô ứng dụng nhỏ, nhưng đang làm mờ ranh giới trách nhiệm (*boundary separation*) giữa Controller, Service và Socket layer.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\src\controllers\groupController.js:103`
9. **Cơ chế Health Check bị chậm do tích hợp RabbitMQ**
   * **Chi tiết:** Trạng thái kết nối của RabbitMQ được đưa vào kiểm tra trực tiếp trong route `/healthz` nhưng lại không tham gia vào việc quyết định tiến trình backend có "unhealthy" hay không. Điều này tuy đúng với triết lý "side-effect bus", nhưng có khả năng làm nghẽn hoặc chậm phản hồi của endpoint healthcheck khi broker xảy ra sự cố mất kết nối.
   * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\server\server.js:58`
10. **Tác dụng phụ (Side-effect) khi Render phía Frontend Client**
    * **Chi tiết:** Mặc dù phía client có các bộ lắng nghe dọn dẹp dữ liệu tương đối tốt, cấu trúc `SocketProvider` lại thực hiện lệnh `setSocket(null)` trực tiếp ngay trong luồng render khi không tìm thấy thông tin người dùng. Điều này dễ tạo ra các hiệu ứng lặp render (render side-effect) rất khó kiểm vết và debug.
    * **Vị trí:** `D:\Study\HK5\NodeJS\Midterm\web-socket\client\src\services\socket\SocketProvider.jsx:31`

---

## ✨ 3. Điểm Sáng Hệ Thống (What's Working Well)

* **Thiết kế luồng tin nhắn tối ưu:** Luồng gửi tin nhắn (`Message path`) đi đúng lộ trình ưu tiên cao: Lưu trữ vào MongoDB trước -> Phát tín hiệu trực tiếp qua Socket.IO luôn -> Đẩy việc ghi nhận audit sang RabbitMQ xử lý sau dưới dạng side-effect. Thiết kế này đảm bảo nếu tầng RabbitMQ có gặp sự cố thì hành vi gửi tin nhắn của người dùng cuối vẫn hoàn tất thành công không bị gián đoạn.
  *(Vị trí: `server\src\socket\handlers\messageHandler.js:57`)*
* **Phân định Không gian tên (Redis Namespace) tường minh:** Tách biệt rạch ròi các vùng lưu trữ: Thư viện nội bộ Socket.IO sử dụng adapter riêng, dữ liệu ứng dụng phân chia rõ ràng theo tiền tố cấu trúc: `cache:*`, `presence:*`, `user_sockets:*`, `chat_history:*`.
* **Hạ tầng Worker hoàn thiện tốt:** Tầng chạy ngầm (Worker runtime) sở hữu kiến trúc xử lý lỗi toàn diện: có retry cơ chế, có hàng đợi lỗi DLQ, tự động tái kết nối đi kèm bộ test suite bao phủ rất chi tiết.
  *(Vị trí: `server\test\rabbitmqInfrastructure.test.js:256`)*
* **Tối ưu hóa phía Client:** Mã nguồn xử lý socket tin nhắn ở Client tích hợp sẵn kịch bản kiểm thử cho chống trùng lặp dữ liệu (`dedupe`) và khôi phục tin nhắn (`recovered-message`). Khuyến nghị không can thiệp hay refactor lớn vào phần Optimistic UI hoặc Idempotency tại đây để tránh phá vỡ tính ổn định sẵn có.
  *(Vị trí: `client\src\features\chat\socket\messageSocketState.test.js:119`)*
* **Áp dụng mẫu thiết kế tốt cho Call Log:** Cơ chế lưu log cuộc gọi sử dụng kỹ thuật `upsert` căn cứ theo trường định danh duy nhất `callData.callHistoryId`. Đây là giải pháp kỹ thuật rất tốt giúp triệt tiêu hoàn toàn rủi ro trùng lặp bản tin log cuộc gọi (`call_log`).
  *(Vị trí: `server\src\socket\handlers\call\callLog.js:16`)*

---

## 🛠️ 4. Kế Hoạch Dọn Dẹp An Toàn (Safe Small Cleanups)

Cần ưu tiên triển khai ngay các hạng mục dọn dẹp quy mô nhỏ, ít rủi ro phá vỡ cấu trúc hiện tại:
1. **Ràng buộc bảo mật định danh:** Bắt buộc sự kiện `addNewUser` phải sử dụng trường định danh `socket.userId` được trích xuất trực tiếp từ token bảo mật JWT; nếu phát hiện dữ liệu truyền lên bị lệch, hệ thống lập tức từ chối và ghi nhận cảnh báo bảo mật (security warning log).
2. **Đồng bộ hóa thứ tự khởi động mạng lưới:** Thực hiện cơ chế `await` trạng thái sẵn sàng của Redis adapter trước khi thực thi lệnh `server.listen()`, hoặc chuyển đổi cấu trúc hàm `initSocket` thành hàm bất đồng bộ (`async`) nhằm giúp phân định ranh giới khởi tạo hệ thống một cách minh bạch.
3. **Sửa lỗi import thiếu:** Thực hiện bổ sung và vá lỗi kết nối hàm `updateConversationRemove` bên trong tệp `friendCacheService`.
4. **Vá lỗi bộ lọc trùng lặp tin nhắn:** Chỉnh sửa lại cờ logic xác định trùng lặp trong hàm `saveMessageInBackground` để tránh việc các job thực hiện retry gửi trùng lặp bản tin liên tục lên hệ thống audit.
5. **Trích xuất tầng Realtime Service mỏng:** Gom các hàm bổ trợ bao gồm `emitUserStatus`, `emitGroupSystemMessage`, `emitCallLogMessage` chuyển dịch vào một lớp dịch vụ phát tin trung gian (`realtime service`) để các REST Controllers không còn phải thao tác và can thiệp sâu vào chi tiết triển khai của Socket.IO.

---

## 🧭 5. Phân Loại Phân Mảnh Lộ Trình (Refactor Slices)

Lộ trình tái cấu trúc hệ thống cần được phân chia theo các cấp độ rủi ro từ thấp đến cao để kiểm soát rủi ro:

| Mức độ rủi ro | Hạng mục công việc chi tiết | Lưu ý triển khai |
| :--- | :--- | :--- |
| **🟢 Thấp nhất** | Sửa đổi các lỗi liên quan đến import, cấu trúc cache và cờ logic phát hiện trùng lặp dữ liệu. | Đi kèm các unit test quy mô nhỏ để chứng minh tính đúng đắn. |
| **🟡 An toàn** | Bổ sung lớp phòng vệ xác thực người dùng (`auth-user guard`) đối với sự kiện `addNewUser`. | Viết test kiểm thử presence handler với kịch bản User ID truyền lên bị sai lệch. |
| **🟠 Vừa phải** | Chuyển đổi luồng khởi động socket thành bất đồng bộ (`async`) để ép Redis adapter phải sẵn sàng hoàn toàn trước khi listen kết nối. | Viết test bao phủ các kịch bản lỗi khởi tạo (`init failure`) và kịch bản sẵn sàng (`ready path`). |
| **🟠 Vừa phải** | Gom toàn bộ các hàm helper phát tin realtime tập trung lại phục vụ cho tầng REST controllers. | Tuyệt đối giữ nguyên vẹn cấu trúc tên sự kiện (`event names`) và cấu trúc dữ liệu truyền tải (`payloads`). |
| **🔴 Cao** | Di chuyển toàn bộ trạng thái cuộc gọi từ bộ nhớ cục bộ (`in-memory`) sang hệ thống lưu trữ tập trung được quản lý bởi Redis hoặc MongoDB (`Redis/Mongo-backed call session`). | Cần triển khai cuốn chiếu theo từng sự kiện đơn lẻ, tuyệt đối không áp dụng phương pháp thay thế toàn bộ một lúc (big bang approach). |
| **🚨 Cao nhất** | Điều chỉnh hành vi cân bằng tải của Nginx, cấu trúc phân bổ kết nối ổn định (`sticky sessions`), hoặc cơ chế phân giải tên miền DNS nội bộ. | Yêu cầu bắt buộc phải tiến hành thực nghiệm (smoke test) trực tiếp trên môi trường thực tế với cấu hình chạy đa bản sao (multi-replica) kèm kịch bản mất và tái kết nối liên tục. |

---

## 🧪 6. Chiến Lược Kiểm Thử Kỹ Thuật (Required Tests)

Trước khi bắt tay vào bất cứ hành động refactor nào, hệ thống bắt buộc phải có sẵn các bộ test suite bao phủ các kịch bản cốt lõi sau:

* **Presence (Trạng thái trực tuyến):**
  * Kiểm thử sự kiện `addNewUser` truyền dữ liệu sai lệch so với JWT phải bị từ chối.
  * Đảm bảo hành vi ngắt kết nối trên một tab (multi-tab disconnect) không làm kích hoạt trạng thái ngoại tuyến (offline) sớm nếu người dùng vẫn còn tab khác đang mở.
  * Kịch bản tái kết nối trong vòng 5 giây phải hủy bỏ thành công bộ đếm thời gian chuyển sang trạng thái offline.
* **Socket Adapter Startup:**
  * Xác thực việc Redis adapter kết nối thành công trước khi server mở cổng listen.
  * Nếu kết nối đến Redis thất bại, toàn bộ tiến trình hệ thống phải kích hoạt cơ chế dừng khẩn cấp lập tức (`fail-fast`).
* **Tính Khả Thao (Message Idempotency):**
  * Gửi lại một tin nhắn có cùng mã định danh duy nhất `idempotencyKey` phải trả về đúng dữ liệu ID thực tế đang có trong DB, đánh dấu trường dữ liệu `isDuplicate = true`, và chặn đứng hành vi đẩy lệnh audit log lần hai lên MQ.
* **Mô Phỏng Cuộc Gọi Đa Bản Sao (Call Multi-Replica Simulation):**
  * Giả lập tình huống các sự kiện tuần tự bao gồm `initCall` -> `callUser` -> `answerCall` được định tuyến chạy qua hai thực thể backend xử lý hoàn toàn khác biệt nhau nhưng vẫn phải định danh và resolve chính xác thông tin Call ID chung.
* **Vòng Đời Cuộc Gọi (Call Lifecycle):**
  * Cơ chế timeout chỉ được phép thực thi logic dọn dẹp và kết thúc cuộc gọi (`finalize`) đúng một lần duy nhất.
  * Các hành vi từ chối (`reject`) hoặc ngắt cuộc gọi (`end`) xuất hiện sau khi timeout đã kích hoạt không được phép sinh ra bản tin log cuộc gọi (`call_log`) trùng lặp.
* **Hạ Tầng RabbitMQ:**
  * Tận dụng nền tảng kiểm thử chất lượng cao có sẵn, chỉ bổ sung thêm kịch bản giả lập lỗi từ phía nhà sản xuất bản tin (`producer failure`) để minh chứng rằng sự cố này không gây ra lỗi rollback dữ liệu sai lệch tại các luồng nghiệp vụ REST, thông tin hồ sơ (profile) hay đường truyền tin nhắn cốt lõi (`message critical path`).
* **Môi Trường Nginx/Docker:**
  * Tiến hành chạy thử nghiệm khói (smoke test) với cấu hình tối thiểu 3 replicas backend; chứng minh tình huống hai người dùng duy trì kết nối ở hai cụm server backend khác nhau hoàn toàn vẫn nhận được đầy đủ các sự kiện chat riêng tư, sự kiện nhóm, và cuộc gọi trực tiếp thông qua tầng trung chuyển dữ liệu Redis adapter.

---

## 📝 7. Nội Dung Ghi Nhận Vào Handoff và Tài Liệu ADR

### 🏛️ Kiến trúc & Quyết định Kỹ thuật (ADR)
* **ADR 01:** *"Khẳng định RabbitMQ chỉ đóng vai trò là một Side-effect Bus bổ trợ, hoàn toàn không được phép can thiệp hoặc nằm trên đường truyền dữ liệu thời gian thực (critical path) của các tính năng realtime chat, lõi trò chuyện hoặc cuộc gọi."*
* **ADR 02:** *"Trạng thái phiên cuộc gọi (Call session state) hiện tại bắt buộc phải nằm cục bộ tại từng tiến trình (process-local). Để đáp ứng bài toán mở rộng quy mô hệ thống đa bản sao (production multi-replica), yêu cầu tiên quyết là phải hoàn thiện cơ chế quản lý phiên cuộc gọi lưu trữ tập trung qua Redis (Redis-backed call session) trước khi thực hiện bất cứ hoạt động scale-out hạ tầng cuộc gọi nghiêm túc nào."*

### 🤝 Tài liệu Bàn Giao Kỹ Thuật (Handoff)
* **Danh mục Quản lý Sự kiện:** Cung cấp bảng tài liệu chi tiết liệt kê rõ ràng toàn bộ danh sách tên sự kiện (`event names`) đi kèm module chịu trách nhiệm xử lý trực tiếp bao gồm các hàm cốt lõi: `sendMessage`, `initCall`, `callUser`, `answerCall`, `rejectCall`, `endCall`, `call_log`.
* **Ràng buộc Bất Biến của Hệ Thống (Invariants):**
  * Khẳng định cơ sở dữ liệu `MongoDB` là *Source of Truth* tối cao cho toàn hệ thống.
  * `Redis` chỉ đóng vai trò thứ cấp phục vụ lưu cache, quản lý presence và làm adapter trung chuyển socket.
  * Trong tình huống hệ thống Redis gặp sự cố sập nguồn hoàn toàn, hệ thống phải thực hiện kích hoạt quy trình nạp lại dữ liệu ấm (`warm-up`) hoặc dừng tiến trình an toàn (`fail-fast`) tùy thuộc vào tính chất đặc thù của từng domain nghiệp vụ.
* **Bảng Kiểm Tra Khi Sửa Luồng Cuộc Gọi (Call-flow Checklist):** Bất cứ kỹ sư nào khi thực hiện chỉnh sửa luồng call-flow bắt buộc phải kiểm tra qua đầy đủ các hạng mục: cơ chế ánh xạ ID tạm thời (`temp id mapping`), logic dọn dẹp bộ đếm thời gian (`timeout cleanup`), giải pháp ghi nhận bản tin tránh trùng lặp log cuộc gọi (`duplicate call_log upsert`), logic dọn dẹp khi mất kết nối (`disconnect finalize`), và cơ chế định tuyến phân phối gói tin giữa các backend (`multi-backend routing`).