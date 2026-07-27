# Manual Test Guide: Production Docker Build Readiness

## Metadata

- **Feature:** GitHub Actions CI/CD Quality Gates
- **Slice:** Slice 3 — Production Docker Build Readiness
- **Nguồn đặc tả:** [`specs/active/github-actions-ci-cd.md`](../../../specs/active/github-actions-ci-cd.md)
- **GitHub Issue:** https://github.com/NhiBuaa/kitta-chat/issues/16
- **Trạng thái mới nhất:** PASSED
- **Phê duyệt `[KHÓA]`:** APPROVED — Developer xác nhận TC-01 đến TC-14 ngày `2026-07-27`.

---

## Tiền Điều Kiện (Prerequisites)

- **Completed dependencies:** Slice #14 và Slice #15 manual guides đều đạt `PASSED`; các contract `Server Tests`, `Client Tests`, `Client Build`, `Client Lint` và `CI Policy v1` đã tồn tại.
- **Repository state:** Đang ở branch/PR dành riêng cho Issue #16 sau khi Developer cho phép; không trộn Issue #17 Security hoặc Issue #18 lint remediation.
- **Runtime:** Canonical `.nvmrc` khai báo Node major `22`; npm dependencies ở root, server và client được cài từ lockfile khi command tương ứng yêu cầu.
- **Docker tooling:** Docker Engine/CLI có Buildx và có thể build `linux/amd64`; local acceptance không yêu cầu Docker Compose.
- **GitHub access:** Developer có quyền mở pull request, xem GitHub Actions/check logs và cho phép merge/push khi đến hosted verification.
- **Credentials:** Không yêu cầu registry credential, repository secret, local `.env` hoặc external-provider credential.
- **Services:** Không khởi động MongoDB, Redis, RabbitMQ, Docker Compose hoặc application runtime cho Slice 3.

---

## [KHÓA] Kịch bản Kiểm thử

### TC-01: Slice 1 and Slice 2 Contracts Remain Green Before Docker Extension

- **Boundary axes:** State, Lifecycle, Contract.
- **Mô tả:** Xác minh Docker readiness mở rộng seven-check contract hiện hành mà không phá hoặc làm yếu foundation từ Slice #14/#15.
- **Các bước thực hiện (Steps):**
  1. Từ repository root, chạy `npm run test:ci`.
  2. Chạy `npm run ci:validate`.
  3. Chạy server tests, client tests và client production build bằng public package commands hiện hành.
  4. Đối chiếu danh sách Required check names với manual guides Slice #14/#15.
- **Kết quả mong đợi (Expected Results):**
  - CI Contract tests và repository validation exit `0` trên trạng thái Slice #16 hoàn chỉnh.
  - Server tests, client tests và client production build vẫn xanh; bundle-size warning hiện hữu được phép và vẫn nhìn thấy.
  - `Server Tests`, `Client Tests`, `Client Build`, `Client Lint` và `CI Policy v1` không bị đổi tên, bỏ qua hoặc làm yếu.
  - Closed contract cuối Slice #16 chứa đúng bảy Required names, bổ sung `Docker Build (server)` và `Docker Build (nginx)`.

### TC-02: Docker Workflow Has the Approved Trigger, Concurrency and Permission Contract

- **Boundary axes:** Data Shape, State, Async, Security.
- **Mô tả:** Xác minh `docker.yml` tuân thủ lifecycle và least-privilege contract chung của K2.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate`.
  2. Kiểm tra Docker workflow triggers cho pull requests targeting `main` và pushes tới `main`.
  3. Kiểm tra concurrency group và biểu thức cancellation.
  4. Kiểm tra workflow-level permissions và mọi external Action reference.
- **Kết quả mong đợi (Expected Results):**
  - Docker workflow chỉ chạy cho PR targeting `main` và pushes tới `main`.
  - Concurrency group là workflow + ref; chỉ superseded pull-request runs bị cancel, còn `main` push runs được giữ.
  - Workflow chỉ có `contents: read` và không có repository write permission.
  - Mọi external Action dùng full immutable commit SHA với adjacent version comment.

### TC-03: Two Independent Stable Docker Checks Are Exposed

- **Boundary axes:** Data Shape, State, Async, UI/Observability.
- **Mô tả:** Xác minh server và nginx có failure scope độc lập và check names đúng contract Ruleset tương lai.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra parsed Docker workflow qua `npm run ci:validate`.
  2. Xác định hai job IDs và job-level `name:` tương ứng.
  3. Trên pull request targeting `main`, quan sát danh sách GitHub Checks.
  4. Mở từng check để xác nhận log/build không bị gộp chung.
- **Kết quả mong đợi (Expected Results):**
  - Có đúng hai Required Docker jobs: `build-server` và `build-nginx`.
  - Exact check names là `Docker Build (server)` và `Docker Build (nginx)`.
  - Hai jobs chạy độc lập; failure của một image không bị che bởi kết quả của image còn lại.
  - Workflow filename/display name không được dùng thay job/check name trong closed contract.

### TC-04: Server Production Target Builds Through Buildx

- **Boundary axes:** Contract, State, Boundary Bounds.
- **Mô tả:** Xác minh Docker gate build đúng production target thuộc `server/Dockerfile`, không build dev target.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra `build-server` inputs trong parsed `docker.yml`.
  2. Chạy local Docker build tương đương với hosted server job cho `linux/amd64`, plain progress và target `prod`, không push/load.
  3. Ghi exit code và log stage/target được build.
  4. Kiểm tra image không được publish hoặc nạp vào local image store bởi acceptance command.
- **Kết quả mong đợi (Expected Results):**
  - Build dùng `server/Dockerfile`, đúng build context và explicit production target `prod`.
  - Build hoàn tất với exit `0` mà không khởi động container hay stateful service.
  - Dev target không phải outcome của Required check.
  - Build không push registry và không load image vào Docker daemon image store.

### TC-05: Nginx Owns and Builds the Production Frontend Image

- **Boundary axes:** Data Shape, Contract, State, Boundary Bounds.
- **Mô tả:** Xác minh nginx multi-stage Dockerfile là production frontend owner và thực sự chạy client production build.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra `build-nginx` inputs trong parsed `docker.yml`.
  2. Chạy local Docker build tương đương với hosted nginx job cho `linux/amd64` và plain progress, không push/load.
  3. Quan sát log `frontend-build`, `npm ci`, client production build và final nginx stage.
  4. Kiểm tra `client/Dockerfile` và `client/Dockerfile.dev` không được workflow tham chiếu.
- **Kết quả mong đợi (Expected Results):**
  - Build dùng repository-root context với `nginx/Dockerfile` để truy cập client sources/lockfile.
  - Client production bundle được tạo trong Node stage rồi copy vào final nginx image; build exit `0`.
  - Nginx image là production frontend owner duy nhất trong Slice #16.
  - Development-only client Dockerfiles không được build và không nằm trong Docker/Node drift scope.

### TC-06: Both Buildx Jobs Enforce Stateless No-Push Semantics

- **Boundary axes:** Data Shape, Contract, Security, Boundary Bounds.
- **Mô tả:** Xác minh mọi Docker job có cùng invariant stateless và không thể ngầm biến thành publication/deployment.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra Docker setup/build Actions và inputs của cả hai jobs.
  2. Xác minh `platforms`, `push`, `load` và progress mode của từng build.
  3. Tìm mọi registry login, image tag publication, Docker secret, cache credential và deployment step trong workflow.
  4. Chạy CI Contract negative fixtures đổi từng invariant một.
- **Kết quả mong đợi (Expected Results):**
  - Cả hai jobs dùng Buildx, `platforms: linux/amd64`, `push: false`, `load: false` và plain progress.
  - Không registry login, registry credential, Docker secret, image publication, deployment hoặc runtime startup.
  - Missing/wrong platform, `push: true`, `load: true` hoặc thiếu plain progress đều bị contract test từ chối độc lập.
  - Không dùng failure suppression để làm xanh check.

### TC-07: Docker Jobs Stay Isolated From Host Node Setup and Stateful Services

- **Boundary axes:** State, Security, Boundary Bounds.
- **Mô tả:** Xác minh dependency installation thuộc image build environment, không kéo host setup hoặc application infrastructure vào gate.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra steps của cả hai Docker jobs.
  2. Xác minh không job nào gọi `.github/actions/setup-node-env` hoặc dùng host `node_modules`.
  3. Chạy local builds khi MongoDB, Redis, RabbitMQ và Docker Compose đều không chạy.
  4. Kiểm tra workflow không tham chiếu `.env`, provider credential hoặc `${{ secrets.* }}`.
- **Kết quả mong đợi (Expected Results):**
  - Docker jobs checkout rồi setup/build bằng Docker; `npm ci` chỉ chạy bên trong Dockerfile stages.
  - Cả hai builds exit `0` không cần stateful service hoặc application container.
  - Không host-side Node setup/cache/install, local `.env`, provider credential hoặc repository secret.
  - Không có network call chủ động tới MongoDB, Redis, RabbitMQ hay external provider để chứng minh image construction.

### TC-08: Canonical Node Major Matches Every In-Scope Docker Builder

- **Boundary axes:** Data Shape, Contract, Boundary Bounds.
- **Mô tả:** Xác minh `.nvmrc` là canonical source và cả hai production-relevant Dockerfiles dùng cùng Node major.
- **Các bước thực hiện (Steps):**
  1. Đọc `.nvmrc` và ghi canonical major.
  2. Chạy `npm run ci:validate` để parse các `FROM node:X` trong `server/Dockerfile` và Node build stage của `nginx/Dockerfile`.
  3. Chạy `npm run test:ci` và kiểm tra positive fixtures cho matching major.
  4. Xác minh `client/Dockerfile` không tham gia phép so sánh.
- **Kết quả mong đợi (Expected Results):**
  - `.nvmrc` chứa major-only `22` theo contract hiện hành.
  - Mọi in-scope `FROM node:X` resolve major `22`; repository validation exit `0`.
  - Server và nginx đều được kiểm tra, không chỉ một Dockerfile.
  - Development-only client Dockerfile bị loại khỏi scope một cách có chủ đích, không phải bị bỏ sót ngẫu nhiên.

### TC-09: Node Drift and Malformed Version Inputs Fail Closed

- **Boundary axes:** Data Shape, Contract, Security, Boundary Bounds.
- **Mô tả:** Xác minh validator không silently accept version thiếu, sai kiểu, malformed hoặc drift ở một trong hai Dockerfiles.
- **Các bước thực hiện (Steps):**
  1. Chạy negative fixture với `.nvmrc` rỗng, whitespace-only hoặc không parse được major.
  2. Chạy fixture đổi server Node base sang major khác.
  3. Chạy fixture đổi nginx Node build stage sang major khác hoặc xóa Node stage.
  4. Chạy fixture chỉ thay development `client/Dockerfile` major.
- **Kết quả mong đợi (Expected Results):**
  - Invalid canonical version và drift/missing Node base trong từng in-scope Dockerfile đều fail với thông báo định vị đúng file.
  - Không fallback ngầm sang host Node version hoặc hard-coded independent default.
  - Thay đổi chỉ ở development client Dockerfile không làm drift contract fail.
  - Negative fixtures không sửa Dockerfiles hoặc `.nvmrc` thật trong working tree.

### TC-10: Every In-Scope Node Builder Logs Its Resolved Runtime

- **Boundary axes:** State, UI/Observability, Contract.
- **Mô tả:** Xác minh major-only tags vẫn tạo trace evidence về patch runtime thực tế của từng build.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra `server/Dockerfile` và `nginx/Dockerfile` cho explicit `RUN node --version` ở in-scope builder path.
  2. Chạy hai local builds với plain progress.
  3. Tìm resolved `v22.x.x` trong log của server production path và nginx frontend build stage.
  4. Chạy contract fixture thiếu logging ở từng Dockerfile.
- **Kết quả mong đợi (Expected Results):**
  - Mỗi in-scope Node builder thực thi `node --version` trước khi hoàn tất production image path.
  - Plain logs hiển thị resolved Node version của cả server và nginx builds.
  - Static major validation và runtime logging cùng tồn tại; không cơ chế nào thay thế cơ chế kia.
  - Thiếu log ở một trong hai Dockerfiles bị contract coverage bắt đúng.

### TC-11: Docker Contract Negative Matrix Rejects Ownership and Check Regressions

- **Boundary axes:** Data Shape, State, Contract, Boundary Bounds.
- **Mô tả:** Xác minh CI Contract bắt các regression cấu trúc Docker chính thay vì chỉ pass repository happy path.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run test:ci`.
  2. Kiểm tra negative fixtures cho missing/renamed Docker job hoặc check name.
  3. Kiểm tra fixtures cho swapped Dockerfile ownership, wrong context, missing server `prod` target và inclusion của client Dockerfile.
  4. Ghi lại số test pass/fail và chạy `git status --short` sau suite.
- **Kết quả mong đợi (Expected Results):**
  - Test suite tổng thể exit `0` vì mọi expected-invalid fixture bị từ chối đúng lý do.
  - Missing/renamed check, wrong Dockerfile/context/target và client Dockerfile inclusion đều fail tại contract seam.
  - Positive fixture cho approved server/nginx ownership vẫn pass.
  - Test không tạo thay đổi mới trong working tree.

### TC-12: Global Deny and Supply-Chain Rules Still Cover Docker Extensions

- **Boundary axes:** Security, Contract.
- **Mô tả:** Xác minh Docker workflow không tạo vùng mù cho các deny rules hoặc supply-chain policy từ Slice #15.
- **Các bước thực hiện (Steps):**
  1. Chạy global-deny fixtures đặt `continue-on-error: true` trong Docker step/job.
  2. Chạy fixture đổi Docker Action sang mutable tag/branch.
  3. Chạy fixture thêm `pull_request_target`, `contents: write`, `write-all` hoặc registry login/secret consumption.
  4. Chạy `npm run ci:validate` trên repository thật.
- **Kết quả mong đợi (Expected Results):**
  - Mỗi forbidden fixture bị từ chối độc lập và validator định vị đúng rule vi phạm.
  - Repository thật không có failure suppression, mutable Action ref, elevated write permission hoặc privileged trigger.
  - Docker extension không thay đổi pass/fail contract của các Required jobs khác.
  - Không có hidden bypass cho packaging failure.

### TC-13: Pull Request and Main Produce Truthful Hosted Docker Evidence

- **Boundary axes:** State, Lifecycle, Async, UI/Observability.
- **Mô tả:** Xác minh static/local checks được bổ sung bằng execution evidence thật trên GitHub-hosted runners.
- **Các bước thực hiện (Steps):**
  1. Sau khi Developer cho phép push và mở PR targeting `main`, chờ cả hai Docker checks hoàn tất.
  2. Ghi run URL/ID, exact check names, status và resolved Node version log của từng job.
  3. Xác minh logs thể hiện `linux/amd64`, plain progress, server `prod` path và nginx frontend build path.
  4. Sau merge/push được Developer cho phép, lặp lại quan sát trên `main` revision.
- **Kết quả mong đợi (Expected Results):**
  - PR và `main` đều tạo `Docker Build (server)` và `Docker Build (nginx)` với kết quả thành công.
  - Mỗi check có log Buildx/build riêng, Node runtime trace riêng và không có push/load/login/deploy output.
  - Hosted execution chứng minh GitHub Actions semantics; local static validation không được trình bày như bằng chứng thay thế.
  - Existing Tests/Build/Quality checks vẫn xuất hiện theo contract của các slice trước.

### TC-14: Slice Boundaries Exclude Security, Lint Remediation, Runtime and Enforcement

- **Boundary axes:** State, Security, Boundary Bounds.
- **Mô tả:** Xác minh Slice #16 chỉ tạo Docker build readiness, không triển khai sớm issues hoặc capability ngoài phạm vi.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra source diff của Slice #16 và danh sách workflow/job thay đổi.
  2. Kiểm tra client lint config/source và Security workflow scope.
  3. Kiểm tra repository Settings/Ruleset chỉ bằng read-only observation nếu Developer có quyền.
  4. Kiểm tra không có Compose/runtime/deployment/publication artifact hoặc command được thêm.
- **Kết quả mong đợi (Expected Results):**
  - Không sửa Client Lint errors/warnings, không thêm Security workflow và không thay đổi Slice #14/#15 locked history.
  - Không tạo/chỉnh Ruleset, branch protection, bypass, verification branch hoặc repository Settings.
  - Không build `client/Dockerfile`, không chạy Docker Compose/stateful services, không push/load image và không deploy staging/production.
  - Không tạo branch, commit, push hoặc merge nếu chưa có explicit Developer authorization riêng cho hành động đó.

---

## [CẬP NHẬT] Lịch sử Nghiệm thu

| Lần chạy | Ngày | Người test | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | TC-07 | TC-08 | TC-09 | TC-10 | TC-11 | TC-12 | TC-13 | TC-14 | Tổng kết | Ghi chú / Link Log |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Chưa chạy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | **PENDING_VERIFICATION** | `[KHÓA]` TC-01 đến TC-14 đã được Developer duyệt; chưa chạy acceptance. |
| Run #1 | 2026-07-27 | Agent | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASSED** | Local: CI Contract `59/59`, `ci:validate` exit `0`, server `321/321`, client `232/232`, client build exit `0`, server/nginx Buildx exit `0` với Node `v22.23.1`. PR Docker run `30276105663` và main Docker run `30277118128` đều thành công; main jobs: server `90013879480`, nginx `90013879586`. Quality main chỉ fail `Client Lint` baseline Issue #18; `CI Policy v1` và trusted baseline thành công. Không push/load/login/deploy/Ruleset/Settings. |

---

## Ghi Chú & Troubleshooting

- `[KHÓA]` TC-01 đến TC-14 đã được Developer duyệt ngày `2026-07-27`; mọi thay đổi sau này cần thống nhất lại với Developer.
- Local Docker commands phải dùng plain progress và giữ exit code thật; không dùng `continue-on-error`, `|| true` hoặc cơ chế nuốt lỗi.
- Negative tests phải dùng fixtures/temporary directories, không sửa workflow, Dockerfiles hoặc `.nvmrc` thật.
- Nếu local runner không hỗ trợ `linux/amd64`/Buildx, ghi rõ test case chưa thực thi; không tự đổi platform contract.
- Hosted test cases chỉ chạy sau explicit authorization cho branch/push/PR/merge; không tự thay đổi repository Ruleset/Settings.
- Docker build readiness chỉ chứng minh image construction; không được diễn giải thành Docker Compose integration, deployment hoặc runtime health evidence.
