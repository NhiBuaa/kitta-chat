# Next Session Plan: Recruiter-Facing README — Slice 2

## Bối Cảnh

- PRD nguồn: `specs/active/recruiter-facing-readme.md`.
- Slice 1 / GitHub Issue `#8` đã hoàn thành và manual acceptance ở trạng thái `PASSED`.
- Demo environment hiện có Docker Compose source-of-truth, `npm run seed:demo`, `npm run demo`, 24 conversations và local demo assets.
- Validation gần nhất ngày `2026-07-24`:
  - Server tests: `321/321` passed.
  - Client tests: `232/232` passed.
  - Client production build: passed với bundle-size warning không chặn build.
- Repository hiện có combined workflow `.github/workflows/ci.yml`; Slice 2 phải thay thế cấu trúc này mà không chạy trùng checks.

## Slice Mục Tiêu

**Slice 2 — Expose Trustworthy Tests and Build Status**

GitHub Issue: `https://github.com/NhiBuaa/kitta-chat/issues/9`

## Mục Tiêu Cụ Thể

1. Soạn và trình Developer duyệt manual test guide trước khi thay đổi workflows.
2. Kiểm tra default branch, workflow hiện tại và package scripts của server/client.
3. Tạo `.github/workflows/tests.yml` chạy toàn bộ server tests và client tests trên pull request và push vào default branch.
4. Tạo `.github/workflows/build.yml` chạy client production build độc lập trên cùng triggers.
5. Retire `.github/workflows/ci.yml` để không chạy checks trùng lặp.
6. Giữ workflow names và filenames ổn định cho dynamic GitHub Actions badge URLs.
7. Cập nhật README để hiển thị đúng hai badge động: `Tests` và `Build`.
8. Xác minh YAML, local test/build commands và trạng thái GitHub Actions trước khi đóng slice.

## Slice Verification Checklist

Manual test guide dự kiến:

`.agents/manual-tests/recruiter-facing-readme/slice-2-tests-and-build-status.md`

File này phải được tạo trong Session Start theo `manual-testing.md`, mở rộng bằng `test-craft`, và được Developer duyệt trước khi thay đổi workflow.

Các nhóm hành vi cần nghiệm thu:

- Pull request trigger cho cả Tests và Build.
- Push trigger vào default branch cho cả Tests và Build.
- Tests workflow chạy đầy đủ server suite và client suite.
- Build workflow chạy client production build độc lập.
- Combined workflow cũ không còn tạo duplicate checks.
- README chỉ có hai badge `Tests` và `Build`.
- Badge URLs tham chiếu đúng workflow files và default branch.
- Không có hard-coded test count hoặc manually maintained passing badge.

## Guardrails Bắt Buộc

- Tách workflow theo trách nhiệm; không gộp Tests và Build trở lại một file.
- Không thêm lint, Docker, security hoặc release jobs vào Slice 2.
- Không làm giảm phạm vi test hiện tại của server hoặc client.
- Không chạy cùng một test/build command ở nhiều workflow nếu không có lý do được ghi nhận.
- Dùng dynamic GitHub Actions badges; không ghi cứng số lượng test hoặc trạng thái pass.
- Không commit secret, `.env`, credential hoặc token GitHub.
- Không thay đổi product behavior trong slice CI/status này.
