# Next Session Plan: Recruiter-Facing README — Slice 5

## Bối Cảnh

- PRD nguồn: `specs/active/recruiter-facing-readme.md`.
- Slice 1–4 / Issues #8–#11 đã hoàn thành trên draft PR #13.
- README hiện có recruiter narrative, dynamic Tests/Build badges, Product Tour với bốn WebP và một realtime GIF, architecture SVG, Quick Start, demo accounts và Known Limitations.
- GitHub Actions trên commit `3151c108` đã pass Server Tests, Client Tests và Client Build.
- Manual acceptance Slice 4 ở trạng thái `PASSED`:
  `.agents/manual-tests/recruiter-facing-readme/slice-4-visual-product-tour.md`.

## Slice Mục Tiêu

**Slice 5 — Publish the Narrated Demo and Finalize the README**

GitHub Issue: `https://github.com/NhiBuaa/kitta-chat/issues/12`

## Tiền Điều Kiện Từ Developer

- Quay walkthrough sản phẩm dài khoảng 2–3 phút theo storyboard đã chốt.
- Dùng English AI narration và English captions/callouts.
- Upload video lên Google Drive và cung cấp verified public viewer URL.

## Mục Tiêu Cụ Thể

1. Tạo manual test guide Slice 5 và trình Developer duyệt trước khi sửa README.
2. Xác minh video theo đúng storyboard product-first và không chứa terminal, secret, dữ liệu cá nhân hoặc infrastructure dashboards.
3. Xác minh Google Drive permission là `Anyone with the link` ở quyền viewer và mở được trong anonymous/incognito session.
4. Cập nhật `Watch the Demo` bằng CTA thật, thời lượng, ngày quay và commit được demo.
5. Chạy recruiter 60-second audit cho Hero, Demo, Product Tour, Engineering Highlights và Architecture.
6. Chạy link, secret, test/build và GitHub rendering checks cuối cùng.
7. Cập nhật issue #12, PR #13 và roadmap khi toàn bộ acceptance criteria đạt.

## Slice Verification Checklist

Manual test guide sẽ được tạo tại:

`.agents/manual-tests/recruiter-facing-readme/slice-5-narrated-demo-and-final-readme.md`

Các nhóm hành vi bắt buộc:

- Video dài khoảng 2–3 phút và bám đúng product-first storyboard.
- English narration/captions rõ ràng, đồng bộ và nhấn mạnh engineering value.
- Google Drive URL mở được khi chưa đăng nhập và không cho phép chỉnh sửa.
- README không còn recorded-walkthrough placeholder sau khi CTA được publish.
- Commit/date/duration được ghi chính xác và không tạo claim về live deployment.
- Không commit video, raw recording, secret, credential hoặc dữ liệu cá nhân vào repository.
- Final GitHub Actions, link audit và recruiter 60-second review đều pass.

## Guardrails Bắt Buộc

- Không thêm Google Drive URL trước khi anonymous-viewer verification pass.
- Không commit file video hoặc raw capture vào Git repository.
- Không tuyên bố có live deployment khi chưa có deployment public thực tế.
- Không quay terminal, DevTools auth data, RabbitMQ UI, provider dashboards hoặc thông tin cá nhân.
- Nếu repository chưa có official i18n switch, giữ UI tiếng Việt và dùng English narration/captions; không tạo translation build tạm.
- Docker Compose tiếp tục là source of truth; video chỉ là đường xem nhanh cho recruiter.
- Giữ nguyên năm Engineering Highlights và recruiter-level architecture đã được nghiệm thu.
