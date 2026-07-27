# Next Session — Prepare K2 Slice 4 Advisory Security Readiness

## Completed Slice

Issue #16 — [Establish production Docker build readiness](https://github.com/NhiBuaa/kitta-chat/issues/16).

Status: `DONE`; manual guide Run #2 là `PASSED`.

Implementation và acceptance được bàn giao qua:

- PR #27: production Docker readiness implementation.
- Implementation merge: `0da821e7d5c02a554d27c4c1b49255263922f793`.
- PR #28: manual acceptance evidence.
- Final documentation merge: `130931d4fc9d8baabec0d40f1434d5e26e8a8b8e`.

Final hosted `main` evidence:

- Docker run `30280248995`: `success`.
- `Docker Build (server)` job `90024511655`: `success`.
- `Docker Build (nginx)` job `90024511705`: `success`.
- Tests run `30280246834`: `success`.
- Build run `30280249363`: `success`.
- `Trusted CI Policy v1` và `CI Policy v1`: `success`.
- `Client Lint` tiếp tục thất bại đúng baseline Issue #18.
- Repository Ruleset và Settings không bị thay đổi.

Session End regression:

- Server tests: `321/321`.
- Client tests: `232/232`.
- CI Contract: `59/59`.
- `npm run ci:validate`: exit `0`.
- Client production build: exit `0`, với bundle-size warning đã biết.

## Target Slice

Issue #17 — [Add truthful Advisory Security workflow](https://github.com/NhiBuaa/kitta-chat/issues/17).

Status: `TODO-NEXT`.

Slice 4 manual guide phải được tạo, mở rộng qua `/test-craft` và được Developer duyệt trước khi bắt đầu implementation.

## Slice 4 Context

Slice #14 đã thiết lập shared Node setup cùng Tests/Build readiness. Slice #15 đã thiết lập Client Lint readiness và fixed-SHA `CI Policy v1`. Slice #16 đã bổ sung production Docker build readiness cho server và nginx.

Slice #17 bổ sung workflow `security.yml` để cung cấp bằng chứng bảo mật trung thực nhưng chỉ ở mức Advisory. Các scan được phép thất bại theo findings thực tế, nhưng không được thêm vào bảy Required check names hoặc Ruleset.

Các dependency, license, CodeQL và secret-scan findings hiện tại có thể chứa baseline issues. Slice này chỉ làm findings hiển thị rõ và an toàn; không mở rộng sang remediation hoặc biến chúng thành merge blockers.

## Slice 4 Objectives

1. Tạo và xin duyệt locked manual test guide của Slice 4 trước khi implementation.
2. Thêm `security.yml` chạy trên pull request targeting `main`, push lên `main` và lịch thứ Hai lúc `03:00 UTC`.
3. Chạy root, client và server dependency audits thành các Advisory jobs độc lập bằng `npm audit --audit-level=high`.
4. Chạy root, client và server full-tree license scans độc lập với allowlist:
   - MIT
   - Apache-2.0
   - BSD-2-Clause
   - BSD-3-Clause
   - ISC
   - 0BSD
5. Cấu hình CodeQL cho `javascript-typescript` với `build-mode: none`, không autobuild application.
6. Chạy Gitleaks trên full repository history với redaction đầy đủ và chỉ cho phép các ngoại lệ synthetic-value hẹp đã được xác nhận.
7. Thêm repository-owned SARIF sanitizer không có dependency ngoài:
   - pure CommonJS function;
   - CLI wrapper;
   - dùng `node:fs` và JSON parsing;
   - chỉ giữ rule IDs, safe coordinates và fingerprints;
   - không in hoặc upload raw SARIF;
   - có pure-function và CLI tests.
8. Đảm bảo scan và sanitization chạy trên mọi supported event; chỉ SARIF upload được bỏ qua cho fork pull requests.
9. Giữ nguyên exit status thật của Gitleaks/sanitizer; không dùng `continue-on-error`.
10. Pin toàn bộ external Actions bằng immutable full SHA kèm version comment.
11. Giữ ordinary jobs ở `contents: read`; chỉ CodeQL/SARIF upload nhận permission hẹp cần thiết.
12. Cập nhật CI Contract để kiểm tra Security workflow triggers, schedule, permissions, Action pins và Advisory/Required boundaries.
13. Cập nhật README/contributor wording để mô tả kết quả dependency, CodeQL, secret và license là Advisory findings, không phải bằng chứng repository không có lỗ hổng.
14. Lấy hosted pull-request và `main` evidence cho toàn bộ Advisory jobs.

## Slice Verification Checklist

Expected manual guide path:

[`.agents/manual-tests/github-actions-ci-cd/slice-04-advisory-security-readiness.md`](manual-tests/github-actions-ci-cd/slice-04-advisory-security-readiness.md)

File phải được tạo tại Session Start bằng Phase 1 của `playbooks/manual-testing.md`, mở rộng qua `/test-craft`, và được Developer duyệt trước khi viết Security workflow hoặc sanitizer.

## Slice 4 Entry Checklist

- [x] Slice #16 manual guide đạt `PASSED`.
- [x] Docker server/nginx checks thành công trên pull request và `main`.
- [x] Tests, Build và policy checks được giữ nguyên.
- [x] Client Lint baseline vẫn hiển thị và thuộc Issue #18.
- [ ] Tạo Slice 4 manual guide trong Session Start.
- [ ] Mở rộng test cases qua Data Shape, State, Async, UI/Observability và Security axes.
- [ ] Khóa các test cases cho dependency, license, CodeQL, Gitleaks và SARIF sanitization.
- [ ] Developer duyệt toàn bộ locked test cases.
- [ ] Chỉ sau khi duyệt, bắt đầu TDD RED → GREEN → REFACTOR cho Issue #17.

## Slice 4 Guardrails

- Không viết Slice #17 implementation trước khi locked manual tests được duyệt.
- Giữ Security jobs ở mức Advisory; không thêm chúng vào bảy Required checks hoặc Ruleset.
- Không thay đổi repository Ruleset hoặc Settings.
- Không sửa Client Lint baseline; Issue #18 sở hữu remediation.
- Không sửa dependency, license, CodeQL hoặc secret findings chỉ để làm workflow xanh.
- Không dùng `continue-on-error` hoặc cơ chế nuốt exit status.
- Không dùng `pull_request_target`.
- Không cung cấp secrets hoặc provider credentials cho scan jobs.
- Không upload hoặc in raw Gitleaks SARIF.
- Không in secret values, raw matched lines hoặc unsafe snippets vào chat, logs hay reports.
- Chỉ cho phép Gitleaks exceptions hẹp cho synthetic values đã được xác nhận; cấm broad path exclusions.
- Không bỏ qua scan hoặc sanitizer trên fork pull requests; chỉ permission-dependent SARIF upload được skip.
- Không dùng mutable external Action refs.
- Không dùng CodeQL autobuild hoặc chạy application build bên trong CodeQL job.
- Không tái sử dụng tên của bất kỳ Required check nào.
- Không thay đổi Tests, Build, Quality hoặc Docker pass/fail contracts.
- Không triển khai dependency/security remediation trong Slice #17.
- Không tạo branch, commit, push hoặc merge nếu chưa có Developer authorization rõ ràng.

## Slice 4 Non-Goals

- Dependency vulnerability remediation.
- License replacement hoặc dependency migration.
- Client lint remediation.
- Chuyển Security findings thành Required merge blockers.
- Repository Ruleset hoặc branch-protection changes.
- Docker publication, deployment hoặc runtime smoke testing.
- Application build bên trong CodeQL.
- Upload raw Gitleaks output.
- Privileged `workflow_run` artifact handoff cho fork pull requests.
- Staging hoặc production deployment.
