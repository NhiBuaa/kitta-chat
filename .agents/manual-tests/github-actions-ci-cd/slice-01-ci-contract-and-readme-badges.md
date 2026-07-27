# Manual Test Guide: Shared Node Setup and Tests/Build Readiness

## Metadata

- **Feature:** GitHub Actions CI/CD Quality Gates
- **Slice:** Slice 1 — Shared Node Setup and Tests/Build Readiness
- **Nguồn đặc tả:** [`specs/active/github-actions-ci-cd.md`](../../../specs/active/github-actions-ci-cd.md)
- **GitHub Issue:** https://github.com/NhiBuaa/kitta-chat/issues/14
- **Trạng thái mới nhất:** PASSED
- **Phê duyệt `[KHÓA]`:** APPROVED — Developer xác nhận TC-01 đến TC-11 ngày `2026-07-27`.

---

## Tiền Điều Kiện (Prerequisites)

- **Repository state:** Đang ở branch triển khai Issue #14 với toàn bộ lockfile được commit.
- **Runtime:** Node.js 22 và npm khả dụng; không dùng một Node major khác để tạo acceptance evidence.
- **Local dependencies:** Root, server và client dependencies được cài bằng `npm ci` từ lockfile tương ứng khi test yêu cầu.
- **GitHub access:** Developer có quyền mở pull request và xem Actions/check runs để thực hiện hosted verification.
- **Credentials:** Local acceptance không yêu cầu GitHub token, repository secret, local `.env` hoặc provider credential.
- **Services:** Không khởi động MongoDB, Redis, RabbitMQ hoặc Docker Compose cho Slice 1.

---

## [KHÓA] Kịch bản Kiểm thử

### TC-01: Public CI Contract Commands Pass on the Approved Slice State

- **Boundary axes:** Data Shape, Contract, State.
- **Mô tả:** Xác minh repository cung cấp hai public commands độc lập cho fixture tests và validation trên repository thật.
- **Các bước thực hiện (Steps):**
  1. Từ repository root, chạy `npm run test:ci`.
  2. Ghi lại exit code và số test pass/fail.
  3. Chạy `npm run ci:validate`.
  4. Ghi lại exit code và từng contract category được báo cáo.
- **Kết quả mong đợi (Expected Results):**
  - Cả hai commands tồn tại trong root package scripts và exit `0`.
  - `test:ci` chạy deterministic fixture-based tests; `ci:validate` kiểm tra repository thật.
  - Validation báo coverage cho shared Node setup, Tests/Build triggers, commands, permissions, concurrency, immutable Action refs, Required check names và README badges.
  - Output không in secret hoặc environment value nhạy cảm.

### TC-02: Canonical Node 22 and Shared Setup Contract Are Enforced

- **Boundary axes:** Data Shape, Contract.
- **Mô tả:** Xác minh host-side CI có một nguồn Node major duy nhất và shared setup không thể được gọi thiếu directory/lockfile context.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate`.
  2. Kiểm tra canonical Node source khai báo major `22`.
  3. Kiểm tra shared setup yêu cầu `working-directory` và `cache-dependency-path`.
  4. Kiểm tra setup dùng exact lockfile cho cache, chạy `npm ci` trong đúng directory và log `node --version`.
  5. Chạy `npm run test:ci` và kiểm tra negative fixtures cho input thiếu/sai.
- **Kết quả mong đợi (Expected Results):**
  - Canonical runtime major là `22`; không có host-side Node version độc lập bị drift.
  - Mỗi caller checkout repository trước khi gọi local shared setup.
  - Server và client sử dụng lockfile/cache scope riêng.
  - Negative fixtures bị validator từ chối; workflow thật không bị sửa trong quá trình test.

### TC-03: Server Tests Check Is Ready Locally and on GitHub

- **Boundary axes:** State, Async, Contract.
- **Mô tả:** Xác minh server test behavior đi xuyên từ public package command đến stable hosted check.
- **Các bước thực hiện (Steps):**
  1. Từ `server/`, chạy `npm test`.
  2. Trên pull request targeting `main`, mở GitHub Checks và tìm check `Server Tests`.
  3. Sau khi Developer cho phép merge/push tới `main`, kiểm tra một `main` push run cũng tạo `Server Tests`.
  4. Mở log setup và test của cả hai run.
- **Kết quả mong đợi (Expected Results):**
  - Local server suite exit `0`.
  - Pull request và `main` push đều tạo đúng một check tên `Server Tests`.
  - Hosted job dùng shared setup, server lockfile và `npm test`.
  - Job không kết nối MongoDB, Redis, RabbitMQ hoặc external provider chỉ để chạy tests.

### TC-04: Client Tests Check Is Ready Locally and on GitHub

- **Boundary axes:** State, Async, Contract.
- **Mô tả:** Xác minh client test behavior đi xuyên từ public package command đến stable hosted check.
- **Các bước thực hiện (Steps):**
  1. Từ `client/`, chạy `npm test`.
  2. Trên pull request targeting `main`, mở GitHub Checks và tìm check `Client Tests`.
  3. Kiểm tra một `main` push run cũng tạo `Client Tests` khi Developer đã cho phép thao tác tương ứng.
  4. Mở log setup và test của cả hai run.
- **Kết quả mong đợi (Expected Results):**
  - Local client suite exit `0`.
  - Pull request và `main` push đều tạo đúng một check tên `Client Tests`.
  - Hosted job dùng shared setup, client lockfile và public client test command.
  - Không có local `.env`, secret hoặc stateful service prerequisite.

### TC-05: Client Build Check Is Ready Locally and on GitHub

- **Boundary axes:** State, Async, Contract.
- **Mô tả:** Xác minh production client build có stable check riêng và cảnh báo bundle hiện hữu không bị che giấu hoặc biến thành pass giả.
- **Các bước thực hiện (Steps):**
  1. Từ `client/`, chạy `npm run build`.
  2. Trên pull request targeting `main`, tìm check `Client Build`.
  3. Kiểm tra một `main` push run cũng tạo `Client Build` khi được Developer cho phép.
  4. Mở log build và ghi nhận cảnh báo bundle nếu xuất hiện.
- **Kết quả mong đợi (Expected Results):**
  - Local build và hosted check exit `0`.
  - Pull request và `main` push dùng đúng check name `Client Build`.
  - Job dùng client lockfile và public build command.
  - Cảnh báo bundle lớn hơn `500 kB` vẫn hiển thị nhưng không bị diễn giải sai thành failure hoặc bị nuốt log.

### TC-06: Trigger and Concurrency Lifecycle Preserve Integration Evidence

- **Boundary axes:** State, Async, Concurrency.
- **Mô tả:** Xác minh superseded pull-request runs được hủy nhưng `main` push runs không bị hủy.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate` để xác minh branch filters và concurrency expression.
  2. Trên một pull request test, push hai revision liên tiếp khi run đầu vẫn đang chạy.
  3. Quan sát trạng thái run cũ và run mới.
  4. Kiểm tra cấu hình/hosted evidence của hai `main` push runs liên tiếp khi thao tác này được Developer cho phép.
- **Kết quả mong đợi (Expected Results):**
  - Chỉ pull-request runs bị `cancel-in-progress` khi superseded.
  - Revision mới nhất của pull request hoàn tất đầy đủ checks.
  - `main` push runs không dùng unconditional cancellation và giữ evidence cho từng integrated revision.
  - Tests/Build chỉ chạy cho pull requests targeting `main` và pushes tới `main`.

### TC-07: Permissions, Immutable References and Global Deny Rules Hold

- **Boundary axes:** Security, Contract.
- **Mô tả:** Xác minh Slice 1 không mở rộng quyền ghi và không chứa các cấu hình bị cấm toàn cục.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate`.
  2. Kiểm tra workflow permissions của Tests và Build.
  3. Kiểm tra mọi external `uses:` reference trong phạm vi Slice 1.
  4. Chạy `npm run test:ci` và kiểm tra negative coverage cho mutable refs, `pull_request_target` và `continue-on-error: true`.
- **Kết quả mong đợi (Expected Results):**
  - Workflows chỉ có `contents: read` và không có repository write permission.
  - External Actions dùng full immutable commit SHA với adjacent version comment.
  - Không có mutable tag/branch, `pull_request_target`, `write-all`, `contents: write`, hidden bypass hoặc `continue-on-error: true`.
  - Mỗi forbidden fixture bị từ chối độc lập bởi global deny coverage.

### TC-08: Negative Contract Fixtures Fail Without Mutating Real Workflows

- **Boundary axes:** Data Shape, State, Security.
- **Mô tả:** Xác minh validator thật sự bắt regression thay vì chỉ pass happy path.
- **Các bước thực hiện (Steps):**
  1. Ghi lại `git status --short` trước test.
  2. Chạy `npm run test:ci`.
  3. Kiểm tra negative cases cho missing check, missing trigger, wrong command, wrong setup input, wrong lockfile path và invalid badge.
  4. Chạy lại `git status --short` sau test.
- **Kết quả mong đợi (Expected Results):**
  - Test suite tổng thể exit `0` vì mọi expected-invalid fixture đều được bắt đúng.
  - Từng negative case trả invalid/non-zero tại seam được kiểm thử.
  - Không workflow, README hoặc source file thật nào bị sửa/xóa bởi negative tests.
  - Working tree sau test không có thay đổi mới do test tạo ra.

### TC-09: README Tests and Build Badges Are Truthful

- **Boundary axes:** UI, Contract.
- **Mô tả:** Xác minh reviewer nhìn thấy trạng thái workflow thật của nhánh `main`.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate`.
  2. Mở README rendered trên GitHub.
  3. Click Tests badge và Build badge.
  4. Đối chiếu badge source/target với workflow filenames và branch query.
- **Kết quả mong đợi (Expected Results):**
  - Cả hai badges là dynamic GitHub Actions badges trỏ tới workflow thực.
  - Badge query dùng `branch=main` và link mở đúng Actions workflow.
  - Không badge nào chứa hard-coded `passing`, test count hoặc claim về Lint, Docker, Security, Ruleset hay staging chưa được triển khai.

### TC-10: Slice 1 Requires No Secrets, Environment Files or Stateful Services

- **Boundary axes:** Security, State, Boundary Bounds.
- **Mô tả:** Xác minh toàn bộ local acceptance của Slice 1 chạy trong môi trường tối thiểu an toàn.
- **Các bước thực hiện (Steps):**
  1. Không source, tạo hoặc chỉnh sửa bất kỳ `.env` file nào.
  2. Không khởi động Docker Compose, MongoDB, Redis hoặc RabbitMQ.
  3. Chạy `npm run test:ci` và `npm run ci:validate`.
  4. Chạy server tests, client tests và client build bằng public package commands.
  5. Kiểm tra workflow/contract phạm vi Slice 1 không tham chiếu `${{ secrets.* }}`.
- **Kết quả mong đợi (Expected Results):**
  - Tất cả local commands exit `0` trong điều kiện tối thiểu nêu trên.
  - Không có network connection attempt tới stateful application service hoặc external provider.
  - Không có secret/environment value bị in ra output.
  - Không có registry login, image push, deployment hoặc repository Settings operation.

### TC-11: Slice Boundaries Exclude Later K2 Checks and Enforcement

- **Boundary axes:** Contract, State, Security.
- **Mô tả:** Xác minh Slice 1 không triển khai sớm các capability thuộc issues sau.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate` và xem contract categories của Slice 1.
  2. Kiểm tra GitHub Checks của pull request triển khai Slice 1.
  3. Kiểm tra repository Settings chỉ bằng read-only observation nếu Developer có quyền.
- **Kết quả mong đợi (Expected Results):**
  - Slice 1 chỉ yêu cầu `Server Tests`, `Client Tests` và `Client Build` readiness.
  - Không claim `Client Lint`, Docker checks, Security workflow hoặc `CI Policy v1` đã sẵn sàng trong Slice 1.
  - Không Ruleset/branch-protection setting nào được tạo hoặc thay đổi.
  - Không staging/deployment workflow hoặc Full Continuous Delivery claim nào xuất hiện.

---

## [CẬP NHẬT] Lịch sử Nghiệm thu

| Lần chạy | Ngày | Người test | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | TC-07 | TC-08 | TC-09 | TC-10 | TC-11 | Tổng kết | Ghi chú / Link Log |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Run #1 | 2026-07-27 | Agent / Developer | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASSED** | Local Node 22 contract `21/21`; server `321/321`; client `232/232`; build pass. PR: https://github.com/NhiBuaa/kitta-chat/pull/21. PR checks: Tests `30255523687`, Build `30255523667`. Superseded runs cancelled: `30255505428`, `30255505396`. Main push checks: Tests `30255771237`, Build `30255771121`. |

---

## Ghi Chú & Troubleshooting

- Hosted test cases chỉ được thực thi sau khi Developer cho phép push/PR; Pha 3 không tự tạo branch, push, merge hoặc thay đổi Ruleset.
- Nếu GitHub chưa từng quan sát stable check name, ghi test case tương ứng là chưa thực thi; không suy luận readiness chỉ từ workflow YAML.
- Negative contract tests phải dùng fixtures hoặc temporary test directories và không sửa workflow/README thật.
- Không dùng `continue-on-error`, `|| true` hoặc cơ chế che exit code để tạo evidence xanh giả.
- Cảnh báo bundle hiện hữu được phép trong Slice 1 nhưng phải còn nhìn thấy trong log.
