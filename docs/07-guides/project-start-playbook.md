# Playbook 1 — Bắt đầu dự án từ con số 0

**Dành cho developer:** tạo repo trước, rồi thiết kế nền tảng: **giá trị cốt lõi → Use Case Diagram → UI/UX tổng quan (nếu có) → System Architecture → Security tổng quan → công nghệ → database → phases (MVP trước)**. Requirements, kiểm tra quyền, Workflow kiến trúc và thiết kế UI chi tiết theo từng tính năng thuộc **[Playbook 2](feature-development-playbook.md)**.

**Cách làm xuyên suốt:** Sau mỗi bước, khi bạn cho phép, agent ghi **bản nháp vào đúng nơi trong repo** và đưa diff/PR để developer **đọc → sửa → duyệt**. Chỉ dùng quyết định đã được duyệt làm cơ sở cho bước tiếp theo. Không tạo file trống hay sao chép cùng nội dung nhiều nơi.

## 9 bước thực hiện

### 1. Khởi tạo repository

- **Bạn làm:** Tạo GitHub repo, đặt tên và viết README mô tả tạm 1–2 dòng; dùng branch/PR để review các thay đổi. Chưa cần chốt stack hay dựng toàn bộ source code.
- **Agent giúp:** Dùng skill `init-agentic-repo` (hoặc script `scripts/init-repo.ps1` từ bộ công cụ Agentic Repo Kit) để tự động dựng sẵn các thư mục chuẩn (`docs/01-` đến `docs/99-`, `.agents/`), tạo sẵn `PROJECT-OVERVIEW.md`, `AGENTS.md`, `CONTEXT.md` và `DESIGN.md` (nếu dự án có UI).
- **Xong khi:** Repo có đầy đủ khung xương chuẩn, sẵn sàng để lưu và review kết quả các bước tiếp theo.

**Ghi ở đâu?** `PROJECT-OVERVIEW.md` cho mục tiêu và quyết định nền tảng; `docs/` cho thiết kế ổn định; GitHub Issues/PRs cho công việc, thay đổi và review. Chỉ tạo tài liệu khi có nội dung.

### 2. Xác định ý tưởng và giá trị cốt lõi

- **Bạn làm:** Viết ngắn gọn **ai sẽ dùng sản phẩm, họ gặp vấn đề gì, sản phẩm giải quyết được điều gì quan trọng nhất**. Ghi vào `PROJECT-OVERVIEW.md` để review.
- **Agent giúp:** Hỏi lại khi vấn đề hoặc giá trị cốt lõi chưa rõ.
- **Xong khi:** Bạn mô tả được **một kết quả chính** mà sản phẩm phải mang lại, không cần nói về công nghệ.

*Ví dụ:* Người dùng có nhiều PDF và khó tìm thông tin. Giá trị cốt lõi: **hỏi nội dung PDF và nhận câu trả lời có trích dẫn để kiểm chứng**.

### 3. Vẽ Use Case Diagram

- **Bạn làm:** **Vẽ sơ đồ Use Case** với actor (ai sử dụng), ranh giới hệ thống và các chức năng actor có thể thực hiện. Bao gồm chức năng cần cho giá trị cốt lõi và các chức năng dự kiến mở rộng; lưu sơ đồ trong `docs/03-product/` để review.
- **Agent giúp:** Phát hiện actor hoặc use case bị thiếu; giữ sơ đồ dễ đọc.
- **Xong khi:** Có **Use Case Diagram được bạn duyệt**, thể hiện rõ ai sử dụng chức năng nào.

*Ví dụ:* Actor **Người dùng** liên kết với các use case **Upload PDF**, **Đặt câu hỏi**, **Xem trích dẫn**, **Quản lý hội thoại**. Việc chọn chức năng nào thuộc MVP sẽ chốt ở Bước 9.

### 4. Thiết kế UI/UX tổng quan (với ứng dụng có giao diện)

- **Bạn làm:** Từ Use Case Diagram và giá trị cốt lõi:
  - Xác định **cấu trúc điều hướng** (các khu vực/màn hình chính) và vẽ **User Flow chính**: người dùng đi qua những bước nào để hoàn thành việc quan trọng nhất.
  - Chốt **định hướng giao diện & độ nhận dạng** nếu sản phẩm cần cá tính riêng: phân loại mục đích màn hình (thuyết phục, thao tác nhanh, hay đọc tài liệu), chọn phong cách, font chữ chính, màu chủ đạo và một bộ icon duy nhất (như Lucide, Phosphor; không dùng emoji hoặc icon chắp vá làm nút bấm). Lưu vào file `DESIGN.md` ở thư mục gốc của dự án (tham khảo `templates/DESIGN.md`).
  - Áp dụng **tiêu chuẩn chất lượng UI/UX** từ `docs/04-standards/ui-quality.md` (tham khảo `templates/ui-quality.md`): ít chữ nhưng đủ hiểu, chia khối dễ quét, chuyển động nhẹ không cản trở thao tác và đủ các trạng thái thực tế.
- **Agent giúp:** Gợi ý cách điều hướng dễ hiểu, phát hiện bước thừa hoặc điểm người dùng bị kẹt; đề xuất tokens và quy tắc chất lượng phù hợp với ngữ cảnh sản phẩm. Tuân thủ ma trận điều phối skill trong `.agents/rules/ui-skill-routing.md` (chỉ dùng `impeccable` hoặc `design-taste-frontend` cho giai đoạn lên khung layout và tokens, không tự ý nạp chồng chéo nhiều skill phong cách).
- **Xong khi:** Bạn chỉ được người dùng bắt đầu ở đâu, đi qua những bước nào để đạt giá trị cốt lõi, và định hình được ngôn ngữ thị giác cơ bản của sản phẩm.

*Ví dụ:* Workspace → chọn Upload → chọn PDF → xem tiến trình xử lý → nhận kết quả → đặt câu hỏi. Định hướng: giao diện dạng công cụ (workspace), ưu tiên quét dữ liệu nhanh, font rõ ràng, màu accent dùng có chủ đích cho nút hành động chính, icon Lucide đồng bộ.

**Chưa cần wireframe từng màn hình, đầy đủ UI states hay prototype tại đây.** Thiết kế chúng khi làm tính năng ở [Playbook 2](feature-development-playbook.md). Nếu dự án không có giao diện người dùng (chỉ API/backend), bỏ qua bước này.

### 5. Thiết kế System Architecture

- **Bạn làm:** Dựa trên giá trị cốt lõi và Use Case Diagram, vẽ các thành phần chính của hệ thống (frontend, backend, database, storage, dịch vụ ngoài nếu cần), trách nhiệm và kết nối. Đưa bản nháp vào `docs/02-architecture/` để review.
- **Agent giúp:** Đề xuất cách chia trách nhiệm, giải thích các kết nối và điểm chưa hợp lý.
- **Xong khi:** Bạn giải thích được cấu trúc chung của hệ thống.

*Ví dụ:* Frontend ↔ Backend ↔ Database; Backend ↔ File Storage; Backend ↔ AI Service.

**Chưa cần vẽ Workflow của từng chức năng tại đây.**

### 6. Xác định Authentication, Authorization & Security

- **Bạn làm:** Từ Use Case và System Architecture, chốt **người dùng được nhận diện bằng cách nào** (đăng nhập/không đăng nhập), **vai trò và quyền ở mức tổng quan**, **ai sở hữu dữ liệu** và các **ranh giới tin cậy** giữa client, backend, dịch vụ ngoài. Xác định secrets sẽ được lưu ở đâu, **không đưa secrets vào repo**.
- **Agent giúp:** Chỉ ra trường hợp truy cập trái phép, dữ liệu giữa người dùng bị lộ hoặc ranh giới tin cậy chưa rõ.
- **Xong khi:** Bạn trả lời được **ai được xem/sửa/xóa dữ liệu nào và bộ phận nào chịu trách nhiệm kiểm tra quyền**.

**Authentication** xác định *người dùng là ai*; **Authorization** quyết định *người đó được làm gì*. Ví dụ: người dùng đã đăng nhập vẫn **không được xem PDF của người khác**; backend phải kiểm tra quyền sở hữu, không chỉ ẩn nút trên giao diện.

Chỉ chốt **mô hình tổng quan** ở đây; cách xác thực từng request, kiểm tra quyền cho từng API và test trường hợp trái phép thuộc [Playbook 2](feature-development-playbook.md). Nếu sản phẩm không có tài khoản, ghi rõ dữ liệu nào công khai và phần nào cần bảo vệ.

### 7. Chọn công nghệ

- **Bạn làm:** Dựa trên use case, dữ liệu cần xử lý, System Architecture và mô hình Security vừa chốt, chọn công nghệ cho frontend, backend, **loại database (SQL/NoSQL)** và các phần cần thiết; ghi ngắn gọn lý do.
- **Agent giúp:** So sánh phương án theo dữ liệu, cách truy vấn và độ phức tạp thực tế.
- **Xong khi:** Bạn biết dùng công nghệ gì và vì sao, đặc biệt là loại database.

*Ví dụ:* Next.js + FastAPI; chọn PostgreSQL nếu cần dữ liệu quan hệ hoặc MongoDB nếu mô hình document phù hợp. Không thêm công nghệ chỉ để cho đủ stack.

### 8. Thiết kế database theo công nghệ đã chọn

- **Bạn làm:** Dựa trên Use Case Diagram, kiến trúc và **loại database ở Bước 7**, thiết kế dữ liệu cần cho MVP và các quan hệ cốt lõi trước khi code:
  - **SQL (PostgreSQL, MySQL...):** Bắt buộc có **ERD + Relational Schema** (bảng, cột, PK, FK).
  - **NoSQL dạng document (MongoDB...):** Thiết kế **collections, cấu trúc documents, embedded/reference và indexes cần thiết**. Không ép vẽ Relational Schema.
- **Agent giúp:** Đề xuất cấu trúc và rà soát nó có đáp ứng cách đọc/ghi dữ liệu không.
- **Xong khi:** Bạn hiểu dữ liệu lưu thế nào và đã review thiết kế trong `docs/02-architecture/`.

Nếu không dùng database, ghi rõ không áp dụng. Các sơ đồ khác chỉ bổ sung khi thực sự cần.

### 9. Lập kế hoạch theo phases triển khai

- **Bạn làm:** Lấy **giá trị cốt lõi ở Bước 2** làm mục tiêu cho **MVP**: bản đầu tiên mà người dùng thực sự hoàn thành được việc chính. Chia công việc thành **Phase 1 (MVP)** rồi các phase mở rộng, theo thứ tự phụ thuộc. Mỗi phase cần ghi rõ **mục tiêu, chức năng, demo phải chạy được và các trường hợp cần test**. Tạo GitHub Issues; developer review, chỉnh sửa và duyệt kế hoạch trước khi code.
- **Agent giúp:** Gợi ý phạm vi MVP nhỏ nhất nhưng đủ giá trị, thứ tự phụ thuộc và cách demo/test từng phase.
- **Xong khi:** Có kế hoạch theo phases; **mỗi phase có kết quả demo/test cụ thể**, và MVP chứng minh được giá trị cốt lõi.

*Ví dụ — Ứng dụng hỏi đáp PDF:*
- **Phase 1 — MVP:** Upload PDF → đặt câu hỏi → nhận câu trả lời có trích dẫn. **Demo:** Upload một PDF và hỏi một câu có thể đối chiếu với nguồn. **Test:** File không hợp lệ bị từ chối; câu trả lời hiển thị được nguồn.
- **Phase 2 — Mở rộng:** Quản lý tài liệu và lịch sử hội thoại. **Demo:** Xem lại tài liệu và cuộc trò chuyện đã lưu. **Test:** Dữ liệu lưu và tải lại đúng, người dùng không xem được dữ liệu của người khác.

**MVP không chỉ là phần mềm chạy được:** nó phải giải quyết **đúng vấn đề chính ở Bước 2**. Các tính năng khác tiếp tục ở phase sau.

Sau khi kế hoạch được duyệt, bắt đầu Issue đầu tiên của **Phase 1** bằng **[Playbook 2 — Phát triển tính năng](feature-development-playbook.md)**. Workflow và Requirements chi tiết được thiết kế khi thực hiện từng tính năng, không làm trước cho toàn bộ hệ thống.

## Trước khi chuyển sang code, tự hỏi

**Tôi đã chốt giá trị cốt lõi, Use Case Diagram và User Flow chính (nếu có UI) chưa? Kiến trúc, quyền truy cập/dữ liệu, công nghệ và database đã rõ chưa? Phase MVP có demo/test chứng minh được giá trị đó chưa?**

Nếu chưa trả lời được câu liên quan trực tiếp đến phần sắp code, quay lại bước tương ứng. **Developer quyết định; agent hỗ trợ.**
