# UI/UX Quality Standard

Quy chuẩn này là bắt buộc (normative) đối với toàn bộ các giao diện người dùng của KittaChat (Web React Client) trừ khi có một quyết định kiến trúc (ADR) hoặc tài liệu đặc tả được phê duyệt thay thế.

## Phạm vi áp dụng

Quy chuẩn này điều chỉnh cấu trúc thị giác, mật độ thông tin, công thái học tương tác, xử lý trạng thái, nhận diện thương hiệu, hiệu năng chuyển động và tính hỗ trợ tiếp cận (accessibility) trên toàn bộ hệ thống giao diện KittaChat.

---

## 1. Nguyên tắc thiết kế theo ngữ cảnh

Mọi quyết định thiết kế giao diện PHẢI bắt nguồn từ **mục đích trọng tâm của màn hình**, không rập khuôn mẫu có sẵn.

| Loại màn hình | Mục tiêu chính | Ưu tiên thiết kế | Chuyển động & Biểu đạt |
|---|---|---|---|
| **Màn hình Chat chính** | Tương tác trò chuyện thời gian thực | Danh sách hội thoại rõ ràng, bong bóng chat dễ đọc, không giật lag | Tinh tế, chuyển động tiện ích (<150ms), tuyệt đối không cản trở nhập liệu |
| **Cuộc gọi WebRTC** | Kết nối âm thanh & hình ảnh ổn định | Video feed toàn màn hình, nút điều khiển (Mic/Cam/Kết thúc) dễ bấm | Chuyển đổi trạng thái kết nối tức thì, phản hồi âm thanh rõ nét |
| **Xác thực (Auth)** | Đăng nhập / Đăng ký tài khoản | Form nhập liệu tinh gọn, báo lỗi rõ ràng, bảo mật | Chuyển tab mượt mà, thông báo lỗi inline trực diện |
| **Quản lý & Cài đặt** | Quản lý bạn bè, thông tin cá nhân | Phân nhóm cài đặt trực quan, tìm kiếm nhanh | Hiệu ứng chuyển động tối thiểu, ưu tiên tốc độ hiển thị dữ liệu |

### 1.1 Vòng đời phát triển UI 4 giai đoạn

Mọi thay đổi hoặc bổ sung giao diện PHẢI tuân thủ 4 giai đoạn nghiêm ngặt. Các agent AI hỗ trợ lập trình PHẢI tuân thủ ma trận kích hoạt skill tương ứng được định nghĩa tại [.agents/rules/ui-skill-routing.md](../../.agents/rules/ui-skill-routing.md):

1. **Giai đoạn 1 — Bố cục & Nhận diện thị giác:** Thiết lập phân cấp bố cục, khối nội dung dễ quét mắt và tuân thủ chặt chẽ design tokens tại root [DESIGN.md](../../DESIGN.md).
2. **Giai đoạn 2 — Công thái học tương tác & Trạng thái:** Tinh chỉnh phản hồi bấm/chạm, chuyển động vi mô, xử lý đầy đủ các trạng thái (`Loading`, `Empty`, `Error`, `Success`).
3. **Giai đoạn 3 — Kiểm chứng Runtime & Khả năng tiếp cận (a11y):** Kiểm tra DOM đã render, điều hướng bàn phím (tab order), độ tương phản màu sắc (contrast ratio), kích thước vùng chạm trên trình duyệt thực tế.
4. **Giai đoạn 4 — Tối ưu hóa hiệu năng:** Xác nhận chuyển động chỉ tác động trên GPU composite (`transform`, `opacity`), không gây layout thrashing, giữ vững ngân sách 60fps.

---

## 2. Các quy tắc chuẩn tắc cốt lõi

### 2.1 Nội dung và Khả năng quét mắt ("Ít nhưng đủ")
- **PHẢI** ưu tiên thông tin giúp người dùng hiểu họ đang ở đâu, hành động tiếp theo là gì và cách khôi phục khi gặp lỗi.
- **KHÔNG ĐƯỢC** cắt bỏ nhãn hướng dẫn, thông báo lỗi hoặc yêu cầu trường bắt buộc chỉ để giảm số lượng chữ.
- **PHẢI** phân tách nội dung thành các khối trực quan rõ ràng, có tiêu đề, khoảng trắng và phân cấp typography thích hợp. Tránh các mảng văn bản dày đặc thiếu khoảng thở.

### 2.2 Nhận diện thương hiệu & Tính nhất quán
Để chống giao diện nhạt nhòa, rập khuôn hoặc "AI-slop":
- **PHẢI** tuân thủ tuyệt đối bộ token định nghĩa trong [DESIGN.md](../../DESIGN.md):
  - **Màu sắc:** Sử dụng màu thương hiệu `{colors.primary}` (`#4CAF50` / `#66BB6A`) cho các hành động trọng tâm; tuân thủ thang bậc màu bề mặt `{colors.surface-1}`, `{colors.surface-2}`.
  - **Typography:** Sử dụng phông `Inter` cho cả tiêu đề và văn bản giao diện, hiển thị chuẩn xác tiếng Việt có dấu.
  - **Hình học:** Đồng nhất thang bo góc (button/input dùng `{rounded.pill}`, card dùng `{rounded.lg}`).
- **PHẢI** sử dụng họ icon thống nhất từ `react-icons` (Lucide / Heroicons), nét stroke 1.5px - 2.0px.
- **KHÔNG ĐƯỢC** sử dụng emoji tự do thay cho icon chức năng hoặc nút điều khiển.

### 2.3 Công thái học tương tác & Trạng thái hoàn chỉnh
- **PHẢI** tối thiểu hóa chi phí tương tác: giảm thiểu số lần gõ phím, hạn chế hộp thoại xác nhận phiền hà cho các tác vụ thường nhật.
- **PHẢI** triển khai đầy đủ các trạng thái cho mọi thành phần động hoặc bất đồng bộ:
  - `Loading`: Skeleton giữ nguyên kích thước bố cục, tránh giật layout shift khi dữ liệu tải xong.
  - `Empty`: Thông điệp thân thiện kèm nút hành động tiếp theo (ví dụ: "Chưa có tin nhắn nào. Hãy gửi lời chào!").
  - `Error`: Diễn giải lỗi dễ hiểu kèm nút Thử lại (Retry) hoặc hướng dẫn xử lý.
  - `Success`: Phản hồi trạng thái rõ ràng sau khi hoàn thành thao tác.

### 2.4 Tiêu chuẩn Tiếp cận (Accessibility - a11y)
- **PHẢI** đạt chuẩn tối thiểu WCAG 2.1 AA đối với độ tương phản màu sắc (tối thiểu 4.5:1 cho văn bản thường, 3:1 cho văn bản lớn và thành phần điều khiển).
- **PHẢI** hỗ trợ đầy đủ điều hướng bằng bàn phím: focus ring hiển thị rõ ràng trên mọi nút bấm và ô nhập (`focus-visible`).
- **PHẢI** cung cấp nhãn `aria-label` cho tất cả các nút bấm chỉ có biểu tượng (icon-only buttons).

### 2.5 Ngân sách chuyển động (Motion Performance)
- Thời lượng hoạt ảnh vi mô (hover, active, dropdown) **PHẢI** nằm trong khoảng 100ms – 200ms.
- Chuyển động hoạt họa **CHỈ ĐƯỢC PHÉP** can thiệp vào các thuộc tính composite GPU: `transform` và `opacity`. Tuyệt đối không animate các thuộc tính gây reflow/repaint như `width`, `height`, `top`, `left`, `margin`.

---

## 3. Ma trận kiểm chứng bắt buộc trước khi hoàn thành UI

Trước khi tuyên bố hoàn tất một tính năng UI, người thực hiện hoặc Agent PHẢI có bằng chứng thực tế cho 4 lớp nghiệm thu:

1. **Lớp 1: Bằng chứng trực quan (Visual Rendering):** Ảnh chụp màn hình trình duyệt thực tế hoặc kiểm tra hiển thị qua DevTools.
2. **Lớp 2: Kiểm thử tương tác (Interactive Testing):** Xác nhận các trạng thái Empty, Loading, Error, Success hoạt động đúng qua test tự động hoặc thao tác thực tế.
3. **Lớp 3: Tiếp cận (a11y Audit):** Xác nhận không có lỗi vi phạm tương phản hoặc thiếu nhãn ARIA.
4. **Lớp 4: Kiểm chứng mã nguồn (Lint & Tokens):** Không có giá trị hex color tùy tiện hoặc class styling trái với `DESIGN.md`.
