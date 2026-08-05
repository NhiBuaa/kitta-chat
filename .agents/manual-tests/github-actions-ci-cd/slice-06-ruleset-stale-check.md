# Manual Test Guide: Ruleset Stale-Branch Verification

## Metadata

- **Feature:** GitHub Actions CI/CD Quality Gates
- **Slice:** Slice 6 — Ruleset stale-branch verification (Issue #19/#20)
- **Nguồn đặc tả:** [`specs/active/github-actions-ci-cd.md`](../../../specs/active/github-actions-ci-cd.md)
- **GitHub Issue:** https://github.com/NhiBuaa/kitta-chat/issues/19
- **Trạng thái mới nhất:** PENDING_VERIFICATION
- **Phê duyệt:** Developer authorized stale-check execution on `2026-08-05`.

---

## Tiền Điều Kiện (Prerequisites)

- `main` has the seven observed Required job names: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)` and `CI Policy v1`.
- Security findings remain Advisory and are not included in the Required set.
- Verification branch: `codex/issue-19-ruleset-verification`.
- The verification branch was created from `main` SHA `6fc434cac8e9c2635627a7ceb3600cd0991d7695` at `2026-08-05T06:44:41Z`; it is intentionally preserved.
- A readiness marker commit/PR may advance `main` after the verification branch is created. The marker must not change application behavior or workflow semantics.
- GitHub access is available to inspect Actions, pull requests and Rulesets; no application secrets or stateful services are required.

---

## [KHÓA] Kịch bản Kiểm thử

### TC-01: Required-check preflight is complete

- **Boundary axes:** Data Shape, Contract, Security.
- **Mô tả:** Xác minh preflight có đủ bảy job-level check names và kết quả Required xanh trước khi bật Ruleset.
- **Các bước thực hiện (Steps):**
  1. Đọc các run Tests, Build, Quality và Docker trên `main` tại commit hiện hành.
  2. Liệt kê job-level names và status; đối chiếu với danh sách bảy Required names.
  3. Liệt kê các Security jobs riêng biệt để xác nhận chúng không chiếm Required set.
- **Kết quả mong đợi (Expected Results):**
  - Đủ và chỉ có bảy Required names đã duyệt.
  - Mọi Required job pass trên commit `main` hiện hành.
  - Security Advisory findings có thể fail nhưng không làm thay đổi Required set.

### TC-02: Readiness marker advances `main` after the preserved branch

- **Boundary axes:** State, Lifecycle, Boundary Bounds.
- **Mô tả:** Tạo một readiness docs-only commit/PR tối thiểu sau khi verification branch đã được bảo toàn để tạo trạng thái behind có thể quan sát.
- **Các bước thực hiện (Steps):**
  1. Ghi starting SHA và timestamp của verification branch.
  2. Tạo readiness marker không đổi workflow, code runtime, Ruleset hay Settings.
  3. Chạy Required checks trên marker PR, merge PR sau khi Required checks pass.
  4. Đọc lại SHA của `main` và verification branch.
- **Kết quả mong đợi (Expected Results):**
  - `main` tiến sang merge commit mới.
  - Verification branch giữ nguyên starting SHA và trở thành behind `main`.
  - Không có force-update, rebase hoặc implementation commit trên verification branch.

### TC-03: Ruleset is active with the exact approved policy

- **Boundary axes:** Contract, Security, Boundary Bounds.
- **Mô tả:** Xác minh Ruleset `main` được bật trực tiếp ở trạng thái Active với đúng bảy Required checks và không có bypass.
- **Các bước thực hiện (Steps):**
  1. Đọc repository Rulesets trước khi tạo và sau khi tạo Ruleset.
  2. Đối chiếu target `main`, enforcement `active`, pull-request requirement và up-to-date requirement.
  3. Đối chiếu exact seven Required contexts.
  4. Kiểm tra zero required approvals, conversation resolution, Code Owner/stale/most-recent-push approval disabled.
  5. Kiểm tra bypass list rỗng, force-push/branch deletion blocked, merge-commit-only; merge queue, signed commits và auto-merge disabled.
- **Kết quả mong đợi (Expected Results):**
  - Ruleset có đúng một cấu hình Active cho `main` trong phạm vi K2.
  - Không có check Advisory, actor bypass hoặc quyền repository ngoài đặc tả.
  - Không có workflow/config/source change để làm Ruleset pass giả.

### TC-04: Behind verification PR is not merge-ready

- **Boundary axes:** State, Async, Contract, UI/Observability.
- **Mô tả:** Dùng verification branch cũ để chứng minh Ruleset yêu cầu branch phải up-to-date.
- **Các bước thực hiện (Steps):**
  1. Mở ready-for-review PR từ `codex/issue-19-ruleset-verification` vào `main`.
  2. Chờ các checks của PR chạy hoặc ghi nhận status hiện hành.
  3. Đọc mergeability và Ruleset status của PR.
- **Kết quả mong đợi (Expected Results):**
  - GitHub nhận diện PR branch behind `main`.
  - PR không merge-ready dù các checks cũ có thể xanh.
  - Lý do blocked là branch freshness/Required checks, không phải Security Advisory failure.

### TC-05: Updating the branch restores current Required evidence

- **Boundary axes:** State, Async, Concurrency, Contract.
- **Mô tả:** Xác minh sau khi cập nhật branch lên `main`, bảy Required checks chạy lại trên head mới và stale block biến mất khi tất cả pass.
- **Các bước thực hiện (Steps):**
  1. Cập nhật verification branch từ `main` theo thao tác được GitHub cho phép; không force-update ngoài quy trình.
  2. Chờ đủ bảy Required checks chạy trên head mới.
  3. Xác nhận conversation không còn unresolved và đọc lại mergeability.
- **Kết quả mong đợi (Expected Results):**
  - Checks được tính trên commit hiện hành của `main`, không reuse stale result.
  - Merge readiness chỉ xuất hiện khi cả bảy Required checks xanh và điều kiện conversation thỏa mãn.
  - Security Advisory failures không chặn readiness sau khi Required contract thỏa mãn.

### TC-06: Advisory Security remains outside enforcement

- **Boundary axes:** Contract, Security, UI/Observability.
- **Mô tả:** Bảo đảm các failure baseline của Security vẫn hiển thị nhưng không được đưa vào Ruleset Required set.
- **Các bước thực hiện (Steps):**
  1. Đọc PR checks và Ruleset required contexts sau khi stale test hoàn tất.
  2. Đối chiếu CodeQL, audit, license và Secret Scan với bảy Required names.
  3. Kiểm tra không có `continue-on-error`, hidden bypass hoặc workflow semantic change.
- **Kết quả mong đợi (Expected Results):**
  - Security failures được hiển thị như Advisory signal.
  - Ruleset chỉ yêu cầu bảy checks đã khóa.
  - Không raw secret/SARIF hoặc credential xuất hiện trong evidence.

### TC-07: Repository Settings are limited to the approved Ruleset

- **Boundary axes:** State, Security, Boundary Bounds.
- **Mô tả:** Kiểm tra stale-check không kéo theo branch-protection, deploy, secret, permission hoặc Ruleset ngoài phạm vi.
- **Các bước thực hiện (Steps):**
  1. Đọc Rulesets và branch-protection endpoint sau test.
  2. Đọc workflow diff và `git status` của workspace.
  3. Đối chiếu thay đổi với Issue #19/#20 scope.
- **Kết quả mong đợi (Expected Results):**
  - Không classic branch protection, bypass actor, repository write permission hoặc deployment được thêm ngoài quyết định đã duyệt.
  - Verification branch vẫn được bảo toàn để audit.
  - Mọi thay đổi ngoài Ruleset và readiness marker đều bị coi là failure.

---

## [CẬP NHẬT] Lịch sử Nghiệm thu

| Lần chạy | Ngày | Người test | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | TC-07 | Tổng kết | Ghi chú / Link Log |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| Chưa chạy | — | — | — | — | — | — | — | — | — | **PENDING_VERIFICATION** | `[KHÓA]` Guide được tạo trước stale-check execution; chưa chạy acceptance. |

---

## Ghi Chú & Troubleshooting

- Đây là verification slice; không thêm runtime feature, dependency remediation hoặc deployment.
- Nếu Ruleset API từ chối cấu hình, dừng trước khi thử lại và ghi nguyên nhân an toàn; không tự nới bypass/permission.
- Không đóng Issue #19 nếu checkpoint late vẫn không đạt điều kiện behind-branch.
- Không đóng Issue #20 nếu stale block hoặc current-head rerun chưa được quan sát thật trên GitHub.
