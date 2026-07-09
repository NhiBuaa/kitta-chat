# Next Session — Slice 16: Legacy Cleanup Planning

## Slice mục tiêu
Lập kế hoạch chi tiết cho việc dọn dẹp mã nguồn cũ (Legacy Cleanup) sau khi hệ thống đã chạy shadow so sánh ổn định và đã hoàn thành chuyển đổi hoàn toàn (Read-switch) sang sử dụng Conversation Read Model.

## Bối cảnh
- Slice 15 đã kích hoạt shadow compare và bộ phân tích log sai lệch dữ liệu.
- Kế hoạch dọn dẹp (Cleanup) sẽ chỉ ra các đoạn mã nguồn dư thừa cần loại bỏ khi Read Model được promotion làm nguồn dữ liệu chính thức.

## Mục tiêu cụ thể
- Xác định toàn bộ mã nguồn cũ cần xóa (ví dụ: các hàm aggregation phức tạp trên `Message`/`Group` để tính toán sidebar và unreadCount động).
- Xác định các trường dữ liệu/chỉ mục cũ trên MongoDB có thể được gỡ bỏ (hoặc lên phương án migration hạ cấp nếu cần).
- Phác thảo tài liệu roadmap chuyển giao chính thức (Promotion Checklist) từ legacy sang read model.

## Guardrails bắt buộc
- Tuyệt đối không xóa bất kỳ code runtime hoặc cơ sở dữ liệu legacy nào trong slice lập kế hoạch này. Đây là bước khảo sát và ghi nhận tài liệu (planning-only).