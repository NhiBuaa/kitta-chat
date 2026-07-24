# Next Session Plan: Recruiter-Facing README — Slice 1

## Bối Cảnh

- PRD Recruiter-Facing README đã được thống nhất tại `specs/active/recruiter-facing-readme.md`.
- Kế hoạch triển khai đã được chia thành GitHub Issues `#8` đến `#12`.
- Issue `#8` không có blocker và đã được gắn nhãn `ready-for-agent`.
- Issue `#9` cũng có thể triển khai độc lập, nhưng Slice 1 ưu tiên xây dựng demo environment vì đây là blocker của cả Product Tour và recruiter engineering narrative.
- Phiên hiện tại chỉ hoàn thành planning, repository agent setup và issue publication; chưa triển khai code cho K1.
- Validation gần nhất ngày `2026-07-24`:
  - Server tests: `308/308` passed.
  - Client tests: `230/230` passed.
  - Client production build: passed.

## Slice Mục Tiêu

**Slice 1 — Create a Reproducible Seeded Demo Environment**

GitHub Issue: `https://github.com/NhiBuaa/kitta-chat/issues/8`

## Mục Tiêu Cụ Thể

1. Soạn và trình Developer duyệt manual test guide trước khi thay đổi implementation.
2. Kiểm tra Docker Compose, environment templates và các seed utilities hiện có.
3. Xây dựng dataset demo deterministic với Alice, Bob, Backend Team và ít nhất 20 conversations; mặc định tạo 24.
4. Bổ sung các conversation edge case: empty, media-only, files-only, links-only và long-history.
5. Bảo đảm seed idempotent, không tạo duplicate conversation/message và không xóa dữ liệu ngoài namespace demo.
6. Bổ sung `npm run seed:demo` trên flow Docker Compose chuẩn.
7. Bổ sung `npm run demo` như convenience wrapper, không thay thế các lệnh chuẩn.
8. Thêm automated tests cho idempotency, duplicate prevention, namespace safety và database-target protection.
9. Thực hiện fresh-clone verification cho hai tài khoản demo và các product flows cần quay.

## Slice Verification Checklist

Manual test guide dự kiến:

`.agents/manual-tests/recruiter-facing-readme/slice-1-reproducible-seeded-demo-environment.md`

File này phải được tạo trong Session Start theo `manual-testing.md`, mở rộng bằng skill `test-craft`, và được Developer duyệt trước khi viết implementation code.

Các nhóm hành vi cần nghiệm thu:

- Fresh Docker Compose startup.
- Alice và Bob đăng nhập thành công.
- Dataset có ít nhất 20 conversations và mặc định tạo 24.
- Conversation Information Panel có đủ local media, files và links.
- Infinite Scroll hoạt động với seeded data.
- Seed chạy lại không tạo duplicate.
- Dữ liệu ngoài namespace demo không bị thay đổi.
- Seed từ chối database target không được cho phép.
- `npm run demo` không ghi đè `.env` hiện có và không in secret.
- Demo không phụ thuộc S3, CloudFront, SMTP hoặc Firebase.

## Guardrails Bắt Buộc

- Docker Compose flow là source of truth: chuẩn bị `.env`, chạy `docker compose up -d --build`, sau đó chạy `npm run seed:demo`.
- `npm run demo` chỉ bao bọc flow chuẩn và phải giữ khả năng chạy từng bước thủ công.
- Không ghi đè `.env` đã tồn tại.
- Không in generated secret hoặc nội dung `.env` ra terminal/log.
- Chỉ sử dụng identity giả thuộc namespace `.test`.
- Mật khẩu `KittaChatDemo!2026` chỉ dành cho local demo và không được tái sử dụng làm credential thật.
- Không xóa hoặc sửa dữ liệu ngoài namespace demo.
- Không kết nối database ngoài local/Compose nếu chưa có explicit opt-in.
- Không yêu cầu credential của optional external providers.
- Không bắt đầu Issue `#10`, `#11` hoặc `#12` trước khi blocker tương ứng được hoàn thành.
