# Recruiter-Facing README — Current Session Roadmap

## Mục Tiêu Tổng Thể

Xây dựng README hướng recruiter giúp người đọc hiểu sản phẩm và năm điểm kỹ thuật chính trong khoảng 60 giây, có đường dẫn demo rõ ràng, quy trình chạy local tái lập được và không chứa secret hoặc credential thật.

Nguồn đặc tả: `specs/active/recruiter-facing-readme.md`.

## Engineering Narrative Đã Chốt

README kể câu chuyện theo flow:

`Product → Demo → Engineering Decisions → Architecture → Setup`

Năm Engineering Highlights:

1. Cross-Replica Realtime Delivery.
2. Retry-Safe Message Persistence.
3. MongoDB-Gated Call Finalization.
4. Scalable Conversation Sidebar.
5. Resilient Background Job Processing.

## Slice Roadmap

| Slice | GitHub Issue | Tên | Trạng thái | Ghi chú |
|---|---:|---|---|---|
| 0 | — | PRD, repository agent setup và issue slicing | **DONE** | PRD đã chốt; root `AGENTS.md`, `docs/agents/` và GitHub labels/issues đã được tạo. |
| 1 | #8 | Reproducible Seeded Demo Environment | **DONE** | Dataset demo, safe/idempotent seed, Docker Compose flow, one-command wrapper và manual acceptance đã hoàn thành. |
| 2 | #9 | Tests and Build Status | **DONE** | Tests/Build workflows và hai badge động đã được kiểm chứng trên GitHub Actions qua PR #13. |
| 3 | #10 | Recruiter Engineering Narrative | **DONE** | README recruiter narrative, năm evidence-backed highlights và architecture SVG đã hoàn thành, kiểm thử và push. |
| 4 | #11 | Visual Product Tour | **DONE** | Bốn WebP và realtime GIF đã publish, kiểm tra privacy/metadata, render GitHub desktop/mobile và pass GitHub Actions. |
| 5 | #12 | Narrated Demo and Final README | **TODO-NEXT** | Cần Developer quay, narrate và publish video Google Drive trước khi gắn CTA cuối cùng. |

## Trạng Thái Kiểm Thử Gần Nhất

- Ngày kiểm tra: `2026-07-24`.
- Server tests: `321/321` passed.
- Client tests: `232/232` passed.
- Client production build: passed.
- Build có cảnh báo bundle JavaScript lớn hơn `500 kB`; không chặn build.
- Docker Compose config và JavaScript syntax checks: passed.
- Manual acceptance Slice 1 và Slice 4: `PASSED`; Slice 4 đã xác minh realtime reorder và connected camera-off WebRTC call bằng hai demo identities độc lập.
- GitHub Actions trên commit `3151c108`: Server Tests, Client Tests và Client Build đều `success`.
- Targeted ESLint ghi nhận năm lỗi và hai warning đã tồn tại sẵn trong các file legacy được chạm tới; không phát sinh từ các hunk Slice 1 và không chặn test/build.

## Guardrails Bắt Buộc

1. Không tuyên bố exactly-once message delivery.
2. Không tuyên bố sidebar luôn dùng chính xác hai database queries.
3. Không tuyên bố multi-region deployment.
4. Không tuyên bố mọi emergency call fallback đều sử dụng shared MongoDB finalization gate.
5. Docker Compose là source of truth; `npm run demo` chỉ là convenience wrapper.
6. Không commit secret, credential thật, `.env`, Firebase service account hoặc dữ liệu cá nhân.
7. Demo data chỉ sử dụng identity giả thuộc namespace `.test` và không được xóa dữ liệu ngoài namespace demo.
8. Architecture diagram chỉ thể hiện các thành phần core đã được chốt trong PRD.
