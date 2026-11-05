---
version: alpha
name: kittachat-design-system
description: "Hệ thống thiết kế chuẩn hóa và bộ token giao diện cho KittaChat (React 19 + Tailwind CSS). Định hình nhận diện thương hiệu, hệ thống màu sắc xanh lá, cấu trúc phân tầng bề mặt và công thái học giao diện trò chuyện thời gian thực."

colors:
  primary: "#4CAF50"
  on-primary: "#ffffff"
  primary-hover: "#43A047"
  primary-focus: "#2E7D32"
  ink: "#0f172a"
  ink-muted: "#334155"
  ink-subtle: "#64748b"
  ink-tertiary: "#94a3b8"
  canvas: "#ffffff"
  surface-1: "#f8fafc"
  surface-2: "#f1f5f9"
  surface-3: "#e2e8f0"
  hairline: "#e2e8f0"
  hairline-strong: "#cbd5e1"
  hairline-focus: "#4CAF50"
  semantic-success: "#10b981"
  semantic-warning: "#f59e0b"
  semantic-danger: "#ef4444"
  semantic-info: "#3b82f6"

typography:
  display-xl:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -2.0px
  display-lg:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -1.2px
  headline:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.6px
  card-title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.30
    letterSpacing: -0.3px
  body-lg:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: -0.1px
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: -0.05px
  body-sm:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  button:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.20
    letterSpacing: 0
  eyebrow:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.30
    letterSpacing: 0.5px
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    border: "1px solid {colors.hairline}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "16px"
    border: "1px solid {colors.hairline}"
  card-featured:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "16px"
    border: "1px solid {colors.hairline-strong}"
  text-input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    border: "1px solid {colors.hairline}"
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
    border: "1px solid {colors.hairline-focus}"
  status-badge:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  sidebar-header:
    height: "64px"
    backgroundColor: "gradient(from #4CAF50 to #66BB6A)"
    textColor: "{colors.on-primary}"
    typography: "{typography.card-title}"
    border: "1px solid {colors.hairline}"
---

# KittaChat — Design System & Visual Direction

Tài liệu này là nguồn sự thật (Single Source of Truth) chuẩn hóa toàn bộ nhận diện thương hiệu, Design Tokens và công thái học giao diện của KittaChat.

Các quy chuẩn kiểm thử, hiệu năng chuyển động và quy trình nghiệm thu giao diện được quy định có tính chuẩn tắc tại [docs/04-standards/ui-quality.md](docs/04-standards/ui-quality.md).

---

## 1. Bản sắc thị giác & Nhận diện thương hiệu

- **Bản sắc cốt lõi:** Hiện đại, tinh tế, mượt mà và tập trung tối đa vào trải nghiệm trò chuyện thời gian thực.
- **Từ khóa nhận diện:** `gắn kết`, `nhanh nhạy`, `rõ ràng`, `tin cậy`.
- **Màu sắc chủ đạo (Primary Accent):** Tông xanh lá tươi sáng `{colors.primary}` (`#4CAF50` / `#66BB6A`) là nhận diện đặc trưng của KittaChat, đại diện cho trạng thái kết nối, cuộc gọi sẵn sàng và hoạt động tích cực. Màu xanh này được sử dụng tập trung cho:
  - Header thanh điều hướng / Sidebar chính;
  - Nút bấm hành động chính (Gửi tin nhắn, Kết bạn, Gọi thoại/video);
  - Trạng thái hoạt động (Online indicator, unread message indicator);
  - Điểm nhấn focus trên các ô nhập liệu.
- **Phân cấp thị giác:** Không dùng các hiệu ứng trang trí thừa thãi. Phân cấp giao diện được tạo dựng qua cấu trúc danh sách, phân đoạn hội thoại, viền hairline 1px và typography rõ ràng.

---

## 2. Các chế độ bề mặt (Surface Modes)

| Chế độ | Bề mặt áp dụng | Mục tiêu chính | Định hướng thị giác & Chuyển động |
|---|---|---|---|
| **Operate** | Màn hình Chat chính, Danh sách hội thoại, Cuộc gọi WebRTC | Tương tác tức thì, không độ trễ, tập trung vào luồng chat | Bố cục dạng cột (Sidebar ↔ ChatWindow ↔ InfoPanel), chuyển động vi mô (<150ms) |
| **Persuade** | Màn hình Đăng nhập / Đăng ký / Giới thiệu | Trải nghiệm chào đón ấm áp, dễ dàng tạo tài khoản | Typography thanh thoát, form tinh gọn, nút CTA xanh lá nổi bật |
| **Manage** | Quản lý bạn bè, Cài đặt tài khoản cá nhân, Modal tìm kiếm | Rõ ràng, dễ tìm kiếm, phản hồi thao tác dứt khoát | Thẻ danh sách bo góc nhẹ, nút thao tác trực quan |

---

## 3. Thang bậc bề mặt & Độ sâu (Surface Ladder)

Độ sâu giao diện trong KittaChat được kiến tạo thông qua thang bậc bề mặt và đường viền mảnh (Hairline 1px) tinh gọn, hạn chế bóng đổ nặng nề:

| Mức độ | Token bề mặt | Xử lý đường viền | Ứng dụng thực tế |
|---|---|---|---|
| **0 (Canvas)** | `{colors.canvas}` (`#ffffff`) | Không viền | Nền tổng thể khung chat, nền trang |
| **1 (Surface 1)** | `{colors.surface-1}` (`#f8fafc`) | 1px solid `{colors.hairline}` | Khung tìm kiếm, bong bóng tin nhắn đối phương, nền sidebar |
| **2 (Surface 2)** | `{colors.surface-2}` (`#f1f5f9`) | 1px solid `{colors.hairline-strong}` | Bề mặt hover danh sách hội thoại, dropdown menu |
| **3 (Surface 3)** | `{colors.surface-3}` (`#e2e8f0`) | 1px solid `{colors.hairline-strong}` | Modal hội thoại, panel mở rộng thông tin, popover |
| **Focus Lift** | Active Surface | 1px solid `{colors.hairline-focus}` | Ô nhập tin nhắn đang focus, nút hành động kích hoạt |

---

## 4. Hệ thống Typography

- **Phông chữ chủ đạo:** `Inter, system-ui, -apple-system, sans-serif` hỗ trợ hoàn hảo tiếng Việt có dấu.
- **Kích thước & Phân cấp:**
  - Tiêu đề màn hình: `headline` (28px / 600)
  - Tên hội thoại / Danh mục: `card-title` (20px / 500)
  - Nội dung tin nhắn: `body` (16px / 400) hoặc `body-sm` (14px / 400)
  - Nhãn nút bấm: `button` (14px / 500)
  - Dấu thời gian, trạng thái đã xem: `caption` (12px / 400)

---

## 5. Quy chuẩn Icon & Đa phương tiện

- **Họ Icon thống nhất:** KittaChat chuẩn hóa sử dụng `react-icons` (Lucide / Heroicons) với nét vẽ stroke 1.5px - 2.0px đồng nhất.
- **Nguyên tắc icon:**
  - Không trộn lẫn icon nét đặc (solid) với icon nét mảnh (outline) trong cùng một cụm điều khiển;
  - Không dùng emoji trần làm nút điều khiển chức năng hoặc nhãn trạng thái chính;
  - Các nút hành động biểu tượng (Gửi file, Đính kèm ảnh, Gọi điện) luôn đi kèm `aria-label` hoặc tooltip hỗ trợ tiếp cận (a11y).

---

## 6. Điều Nên làm và Không nên làm (Guardrails cho Agent)

### NÊN LÀM:
- **NÊN** dùng thang bậc màu `{colors.primary}`, `{colors.surface-1}` và đường viền hairline 1px thay vì tự gán mã màu hex tùy ý.
- **NÊN** bo tròn đầy đủ cho các trường nhập liệu (`{rounded.pill}`) và nút hành động theo đúng phong cách chat hiện hữu.
- **NÊN** triển khai đủ 4 trạng thái giao diện: Đang tải (Skeleton), Trống (Empty state với nút bắt đầu trò chuyện), Lỗi (kèm nút Thử lại), và Thành công.
- **NÊN** đảm bảo kích thước vùng chạm trên mobile tối thiểu 44×44px.

### TUYỆT ĐỐI KHÔNG:
- **KHÔNG** tự ý thêm các thư viện giao diện nặng, thư viện icon mới hoặc thư viện animation ngoài các gói đã có trong `client/package.json`.
- **KHÔNG** dùng gradient trang trí lung linh hoặc hiệu ứng phát sáng neon làm biến dạng giao diện trò chuyện.
- **KHÔNG** sử dụng bóng đổ quá đậm (`box-shadow: 0 20px 40px rgba(0,0,0,0.4)`).
- **KHÔNG** ẩn thông báo lỗi hoặc nhãn bắt buộc vào các góc khó thấy chỉ để giao diện trông "tối giản giả tạo".
