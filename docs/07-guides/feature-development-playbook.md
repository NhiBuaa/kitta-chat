# Playbook 2 — Phát triển một tính năng

**Dành cho developer:** triển khai **từng tính năng**, kể cả tính năng đầu tiên. Dựa trên kiến trúc, database và User Flow tổng quan (nếu có UI) để thiết kế đúng phần cần làm. Agent chỉ sửa repo khi được phép; bạn xem diff, chỉnh sửa và duyệt trước khi code. Không thiết kế lại cả dự án.

Nếu bắt đầu với một ý tưởng chưa có dự án, xem [Playbook 1 — Bắt đầu từ con số 0](project-start-playbook.md).

## 6 bước thực hiện

### 1. Xem kiến trúc và code liên quan

- **Bạn làm:** Đọc System Architecture, **thiết kế dữ liệu tương ứng với database đang dùng** và code/test liên quan nếu đã có. Với tính năng đầu tiên, dựa trên thiết kế đã chốt ở Playbook 1.
- **Agent giúp:** Chỉ ra thành phần nào xử lý tính năng và giải thích code hiện tại.
- **Xong khi:** Bạn biết tính năng sẽ nằm ở đâu, dữ liệu liên quan là gì.

*Ví dụ:* Trước khi thêm Archive Conversation, xem nơi lưu Conversation và API lấy danh sách.

### 2. Ghi rõ yêu cầu của tính năng

- **Bạn làm:** Với tính năng đang triển khai, ghi rõ **đầu vào/dữ liệu, kết quả, lỗi và quyền truy cập**: ai cần đăng nhập, vai trò nào được thao tác, có cần kiểm tra **chủ sở hữu dữ liệu** không. Nếu có UI, ghi rõ thao tác người dùng.
- **Agent giúp:** Gợi ý trường hợp còn thiếu và cách kiểm thử.
- **Xong khi:** Có thể xác định tính năng đã làm đúng hay chưa.

*Ví dụ — Archive Conversation:* Chủ sở hữu bấm Archive thì cuộc trò chuyện rời danh sách đang hoạt động nhưng vẫn xem được trong Archived; người dùng khác không được archive cuộc trò chuyện đó.

Đây là **Requirements chi tiết của tính năng**. Ghi vào GitHub Issue đủ rõ để test, không bắt buộc spec riêng. Nếu phát sinh actor/chức năng mới, cập nhật **Use Case Diagram** của dự án khi cần.

### 3. Xem thay đổi ảnh hưởng những đâu

- **Bạn làm:** Kiểm tra có phải sửa UI, API, database, quyền truy cập hoặc xử lý nền không. Xác định chức năng cũ nào phải tiếp tục hoạt động.
- **Agent giúp:** Tìm chỗ gọi tới code đó và rủi ro bị ảnh hưởng.
- **Xong khi:** Bạn biết cần sửa những phần nào và cần giữ nguyên những gì.

*Ví dụ:* Archive có thể cần một cột trạng thái trong database, cập nhật API và lọc danh sách trên UI.

### 4. Vẽ hoặc cập nhật Workflow kiến trúc của tính năng

- **Bạn làm:** Thể hiện **frontend/API/backend/database/worker liên quan** và các bước xử lý, truyền dữ liệu; xác định **nơi xác thực danh tính, kiểm tra quyền/vai trò và chủ sở hữu ở backend** khi có truy cập được bảo vệ. Từ đó chốt code/API cần sửa.
- **Agent giúp:** Giải thích luồng trong code hiện tại, đề xuất cách thay đổi đơn giản.
- **Xong khi:** Bạn hiểu phần nào thay đổi và dữ liệu được xử lý ra sao; Workflow/thiết kế liên quan đã được bạn review và duyệt.

*Ví dụ — Archive Conversation:* Frontend → API → kiểm tra quyền → Backend cập nhật trạng thái trong Database → API trả kết quả → Frontend cập nhật danh sách.

**Nếu có UI:** Dựa trên User Flow tổng quan, [Chuẩn chất lượng UI/UX](../../docs/04-standards/README.md) (`docs/04-standards/ui-quality.md`) và luật điều phối skill (`.agents/rules/ui-skill-routing.md`), thiết kế **wireframe/màn hình cần sửa** (dùng `emil-design-eng` hoặc `animate` cho micro-interaction, dùng `chrome-devtools` và `a11y-debugging` để kiểm chứng render thực tế), tái sử dụng đúng design tokens/components đã có và bổ sung đầy đủ các **UI states**:
- `Loading`: Khung xương (skeleton) hoặc spinner giữ nguyên kích thước để tránh giật bố cục (layout shift).
- `Empty`: Hướng dẫn ngắn kèm nút hành động tiếp theo.
- `Error`: Giải thích dễ hiểu kèm đường khôi phục (thử lại, quay về).
- `Success`: Phản hồi rõ ràng sau khi hoàn thành.
- `Dữ liệu dài/tràn` và `Thiếu quyền (Permission Denied)`.

Làm **prototype để thử luồng khi tương tác chưa rõ**; không bắt buộc cho mọi tính năng. Developer duyệt trước khi code.

**Nếu thay đổi cấu trúc database:** Cập nhật **ERD + Relational Schema** với SQL; hoặc **collection/document schema và indexes liên quan** với MongoDB. Không thay đổi dữ liệu thì không vẽ lại. Với tính năng đầu tiên, dùng thiết kế đã duyệt ở Playbook 1.

**Sequence/State Diagram chỉ bổ sung nếu thật sự cần.** Thay công nghệ/kiến trúc lớn thì xem thêm cách chuyển dữ liệu cũ và rollback.

### 5. Chia việc và triển khai

- **Bạn làm:** Sau khi duyệt thiết kế, chia việc trong Issue, nêu cách test từng phần rồi code trên branch riêng. Review diff khi agent thay đổi code.
- **Agent giúp:** Đề xuất kế hoạch, code và viết test đúng phạm vi được giao.
- **Xong khi:** Tính năng chạy được, các trường hợp quan trọng đã được kiểm tra, không có thay đổi ngoài yêu cầu.

*Ví dụ:* Cập nhật database/API → test quyền và archive/restore → cập nhật UI → thử toàn bộ luồng.

### 6. Kiểm tra kết quả và review PR

- **Bạn làm:** Chạy ứng dụng, thử đúng/lỗi; với dữ liệu được bảo vệ, **test khi chưa đăng nhập, sai quyền hoặc truy cập dữ liệu người khác**. Đọc diff, kiểm tra chức năng cũ và chỉ merge khi bạn hiểu thay đổi.
- **Agent giúp:** Tổng hợp những gì đã sửa, kết quả test và điểm chưa kiểm chứng.
  - **Với tính năng UI:** Áp dụng vòng kiểm tra kết quả render: **Nhìn → Thao tác → Ghi lỗi → Sửa → Kiểm lại**. Thu thập bằng chứng theo 4 lớp của `docs/04-standards/ui-quality.md`:
    1. *Hình ảnh:* Chụp ảnh màn hình (screenshot) bản render ở kích thước mục tiêu;
    2. *Sử dụng:* Thử hoàn thành tác vụ, xử lý lỗi và quay lại;
    3. *Chuyển động:* Kiểm tra tương tác trực tiếp, thao tác nhanh/bấm liên tục không bị gián đoạn, hỗ trợ reduced-motion;
    4. *Kỹ thuật:* Responsive, độ tương phản (contrast) và điều hướng bàn phím/focus.
  - *Lưu ý:* Nếu môi trường của agent thiếu công cụ trình duyệt hoặc quyền chạy ứng dụng thực tế, agent **bắt buộc phải báo rõ phần chưa thể kiểm chứng bằng mắt/thao tác thật**, không tự nhận UI đã đạt chỉ dựa vào việc code không lỗi.
- **Xong khi:** PR rõ ràng, tests có kết quả thực, bạn tự xác nhận chức năng và giao diện đạt yêu cầu.

Nếu kiến trúc hoặc cách dùng đã thay đổi, cập nhật **đúng tài liệu liên quan**; không tạo bản sao của Issue trong `docs/`.

Khi closeout, chọn bài học thực sự tái sử dụng theo [Selective Issue/PR Closeout](../../AGENTS.md#selective-issuepr-closeout): không có bài học mới cũng hợp lệ. Agent được tự sửa nhỏ, an toàn trong phạm vi đã duyệt; thay đổi chính sách, kiến trúc hoặc nguồn tri thức ngoài phạm vi phải được đề xuất để duyệt, không chặn việc hoàn tất phần đã duyệt.

## Trước khi giao agent code, tự hỏi

**Tôi hiểu kiến trúc và code liên quan chưa? Yêu cầu đúng là gì? Workflow kỹ thuật và màn hình/trạng thái UI (nếu có) đã rõ chưa? Kiểm tra thế nào?**

Nếu chưa rõ, yêu cầu agent **giải thích hoặc phân tích**, chưa yêu cầu code. Developer vẫn là người duyệt thiết kế và kết quả.
