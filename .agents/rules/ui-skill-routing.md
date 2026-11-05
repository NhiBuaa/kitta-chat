# UI Skill Routing & Governance

Quy tắc này điều phối cách thức các AI coding agent lựa chọn và thực thi các skill liên quan đến UI/UX trong repository KittaChat.

**Nguyên tắc tối cao:** Mọi triển khai giao diện người dùng PHẢI tuân thủ tuyệt đối nhận diện thương hiệu trong [DESIGN.md](../../DESIGN.md) và tiêu chuẩn chất lượng tại [docs/04-standards/ui-quality.md](../../docs/04-standards/ui-quality.md). Các Skill chỉ là công cụ hỗ trợ thực thi; KHÔNG BAO GIỜ được phép ghi đè thẩm quyền thiết kế của repository.

---

## 1. Ma trận thực thi UI 4 giai đoạn

Agent PHẢI kích hoạt skill theo đúng giai đoạn phát triển UI đang thực hiện. KHÔNG ĐƯỢC nạp đồng thời nhiều skill phong cách hoặc thiết kế cùng lúc.

| Giai đoạn | Trọng tâm | Skill được phép | Đầu ra / Mốc hoàn thành |
|---|---|---|---|
| **1. Bố cục & Nhận diện** | Phân cấp thị giác, thang khoảng cách, độ tương phản typography, cấu trúc component, tuân thủ token. | `impeccable`<br/>*hoặc* `design-taste-frontend` | Bố cục component có cấu trúc rõ ràng, khớp token trong `DESIGN.md`; không rập khuôn hay "AI-slop". |
| **2. Tương tác & Cơ chế** | Tương tác vi mô, hiệu ứng chạm/bấm, dropdown/modal, chuyển động không gây cản trở. | `emil-design-eng`<br/>*hoặc* `animate` | Công thái học tương tác tinh xảo, xử lý đủ 4 trạng thái (`Loading`, `Empty`, `Error`, `Success`). |
| **3. Kiểm chứng trực tiếp & a11y** | Kiểm tra DOM đã render, reflow responsive, tương phản màu, thứ tự phím Tab, vùng chạm. | `chrome-devtools`<br/>+ `a11y-debugging` | Ảnh chụp màn hình đã render, báo cáo kiểm tra a11y, thỏa mãn ma trận bằng chứng 4 lớp. |
| **4. Tối ưu hóa hiệu năng** | Thuộc tính composite GPU (`transform`, `opacity`), chống giật bố cục (layout thrashing), ngân sách 60fps. | `animation-performance`<br/>*hoặc* `debug-optimize-lcp` | Xác nhận không rớt khung hình (zero frame drops), đáp ứng chỉ số Core Web Vitals. |

---

## 2. Ranh giới bất biến (Hard Guardrails)

### 2.1 Không cộng dồn phong cách (No Style Stacking)
- **TUYỆT ĐỐI KHÔNG** kích hoạt đồng thời `design-taste-frontend` và `emil-design-eng`.
- Nếu cả hai skill đều phù hợp, phải chia theo giai đoạn: dùng `design-taste-frontend` để chốt định hướng và bố cục trước; kết thúc giai đoạn đó rồi mới dùng `emil-design-eng` để tinh chỉnh cơ học tương tác.

### 2.2 Thẩm quyền Token tối cao (Token Authority)
- Gu cá nhân hoặc nhận định phong cách trong prompt của skill (như palette riêng của Emil Kowalski hay theme gallery của TasteSkill) **KHÔNG ĐƯỢC** ghi đè bảng màu xanh lá KittaChat, phông chữ Inter hoặc thang bề mặt đã quy định trong root `DESIGN.md`.
- Nếu phát hiện thiếu token trong `DESIGN.md`, agent phải đề xuất bổ sung token minh bạch thay vì tự tiện bịa mã màu hex trong file component.

### 2.3 Không tự ý thêm thư viện ngoài (Zero Unapproved Dependencies)
- **TUYỆT ĐỐI KHÔNG** cài đặt thêm thư viện icon mới, font chữ bên ngoài, gói animation (như Framer Motion) hay CSS framework nếu chưa có sự phê duyệt rõ ràng từ lập trình viên trong Issue.
- Tận dụng tối đa các thư viện đã có trong `client/package.json` (`react-icons`, Tailwind CSS v4, `styled-components`).

### 2.4 Bằng chứng thực tế trước khi khẳng định (Evidence Before Assertions)
- **KHÔNG ĐƯỢC** nhận định "giao diện trông rất đẹp", "responsive chuẩn" hoặc "animation mượt mà" chỉ bằng việc đọc code.
- Trước khi báo cáo hoàn thành tác vụ UI, agent PHẢI có bằng chứng thực tế tại runtime (ảnh chụp màn hình, kiểm tra phần tử qua DevTools, hoặc test tự động giao diện).
- Nếu môi trường hiện tại không có công cụ xem trình duyệt, agent PHẢI nêu rõ những phần thị giác/runtime nào chưa thể kiểm chứng.
