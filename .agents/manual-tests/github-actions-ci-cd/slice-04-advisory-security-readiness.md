# Manual Test Guide: Advisory Security Readiness

## Metadata

- **Feature:** GitHub Actions CI/CD Quality Gates
- **Slice:** Slice 4 — Truthful Advisory Security Readiness
- **Nguồn đặc tả:** [`specs/active/github-actions-ci-cd.md`](../../../specs/active/github-actions-ci-cd.md)
- **GitHub Issue:** https://github.com/NhiBuaa/kitta-chat/issues/17
- **Trạng thái mới nhất:** PASSED
- **Phê duyệt `[KHÓA]`:** APPROVED — Developer xác nhận TC-01 đến TC-18 ngày `2026-07-27`.

---

## Tiền Điều Kiện (Prerequisites)

- **Completed dependencies:** Slice #14, #15 và #16 manual guides đều đạt `PASSED`; bảy Required check names và CI Policy contract hiện hành đã tồn tại.
- **Repository state:** Chỉ bắt đầu branch/PR dành riêng cho Issue #17 sau khi Developer cho phép; không trộn Issue #18 lint remediation hoặc Issue #20 Ruleset activation.
- **Runtime:** Node.js theo canonical `.nvmrc`; root, client và server dependencies được cài từ từng lockfile bằng public commands của repository.
- **Local tooling:** Git có thể đọc toàn bộ repository history; Node test runner chạy được; không yêu cầu MongoDB, Redis, RabbitMQ, Docker Compose hoặc application runtime.
- **GitHub access:** Developer có quyền mở pull request, xem Actions/check logs và Code Scanning/Security results; push, PR, merge hoặc Settings changes chỉ thực hiện khi có authorization riêng.
- **Credentials:** Không cung cấp local `.env`, repository secret, cloud/provider credential hoặc write token cho audit/license/secret scan jobs.
- **Secret-safety:** Không sao chép secret value, raw matched line, unsafe snippet hoặc raw/sanitized SARIF content vào chat, terminal transcript hay acceptance history.

---

## [KHÓA] Kịch bản Kiểm thử

### TC-01: Existing Required Contracts Remain Green Before Security Extension

- **Boundary axes:** State, Lifecycle, Contract.
- **Mô tả:** Xác minh Slice #17 chỉ mở rộng Advisory surface và không làm yếu nền tảng Required từ Slice #14–#16.
- **Các bước thực hiện (Steps):**
  1. Từ repository root, chạy `npm run test:ci`.
  2. Chạy `npm run ci:validate`.
  3. Chạy server tests, client tests và client production build bằng public package commands hiện hành.
  4. Đối chiếu exact Required check names với CI Contract và ba manual guides đã hoàn thành.
- **Kết quả mong đợi (Expected Results):**
  - CI Contract tests và repository validation exit `0` trên trạng thái Slice #17 hoàn chỉnh.
  - Server tests, client tests và client production build vẫn xanh; bundle-size warning đã biết vẫn được phép và hiển thị.
  - Bảy Required names giữ nguyên: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)` và `CI Policy v1`.
  - Không Advisory job nào đổi outcome contract, chiếm tên hoặc được thêm vào Required closed set.

### TC-02: Security Workflow Has the Exact Supported Event and Concurrency Lifecycle

- **Boundary axes:** Data Shape, State, Async, Lifecycle.
- **Mô tả:** Xác minh `security.yml` chạy đúng trên mọi event được phê duyệt, giữ lịch sử `main`/schedule và chỉ hủy PR run đã lỗi thời.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run ci:validate` và kiểm tra parsed triggers của `security.yml`.
  2. Xác minh `pull_request` chỉ targeting `main`, `push` chỉ branch `main` và cron là `0 3 * * 1`.
  3. Kiểm tra concurrency group và biểu thức `cancel-in-progress`.
  4. Chạy negative fixtures cho missing/wrong branch filter, missing/wrong schedule và unconditional cancellation.
- **Kết quả mong đợi (Expected Results):**
  - Workflow hỗ trợ đúng PR targeting `main`, push lên `main` và Monday `03:00 UTC` schedule.
  - Concurrency group là workflow + ref; chỉ superseded pull-request runs bị cancel.
  - `main` push và scheduled runs không bị cancel, giữ đầy đủ audit trail.
  - `pull_request_target`, special privileged trigger và schedule khác contract đều bị từ chối.

### TC-03: Security Jobs Are Observable but Remain Strictly Advisory

- **Boundary axes:** Data Shape, State, UI/Observability, Security.
- **Mô tả:** Xác minh từng security concern tạo quality signal độc lập nhưng không trở thành merge blocker hoặc giả mạo Required check.
- **Các bước thực hiện (Steps):**
  1. Liệt kê job IDs và job-level names trong parsed `security.yml`.
  2. So sánh mọi Security check name với bảy Required names.
  3. Kiểm tra CI Policy/CI Contract expected Required set và repository docs.
  4. Quan sát read-only Ruleset/required-check configuration nếu Developer có quyền; không thay đổi Settings.
- **Kết quả mong đợi (Expected Results):**
  - Dependency, license, CodeQL và secret scans hiển thị thành các Advisory checks có failure scope rõ ràng.
  - Không job nào dùng lại một trong bảy Required names hoặc được thêm vào Ruleset/branch protection.
  - Finding có thể làm Advisory job đỏ mà không thay đổi pass/fail contract của Required jobs.
  - Không có code, workflow hay wording tuyên bố Advisory success là bằng chứng repository không có vulnerability.

### TC-04: Root, Client and Server Dependency Audits Are Independent and Truthful

- **Boundary axes:** Data Shape, State, Async, Boundary Bounds.
- **Mô tả:** Xác minh ba lockfile/dependency tree được audit riêng với threshold `high`, không để failure của một tree che kết quả tree khác.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra ba jobs `root-audit`, `client-audit` và `server-audit` cùng setup inputs/working directories.
  2. Xác minh mỗi job cài dependency từ đúng lockfile rồi chạy `npm audit --audit-level=high` trong đúng tree.
  3. Chạy local audit cho root, client và server riêng biệt, ghi exit code và summary an toàn của từng tree.
  4. Chạy fixtures làm thiếu một tree, trỏ sai lockfile/directory, đổi threshold hoặc gộp commands theo cách che failure.
- **Kết quả mong đợi (Expected Results):**
  - Ba audit jobs chạy độc lập và luôn cho biết tree nào pass/fail.
  - Mỗi job dùng đúng lockfile, đúng working directory và exact threshold `high`.
  - Exit status thật được giữ; current baseline findings nếu có làm đúng Advisory job fail.
  - Không remediation dependency, auto-fix, `continue-on-error` hoặc status aggregation làm mất kết quả thật.

### TC-05: Root, Client and Server Full-Tree License Scans Enforce the Exact Allowlist

- **Boundary axes:** Data Shape, State, Async, Boundary Bounds.
- **Mô tả:** Xác minh cả ba installed dependency trees được kiểm tra license đầy đủ với closed allowlist đã duyệt.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra ba jobs `root-license-scan`, `client-license-scan` và `server-license-scan` cùng dependency-tree inputs.
  2. Xác minh scanner là `license-checker-rseidelsohn` và chạy full tree sau deterministic install.
  3. Đối chiếu allowlist chính xác: `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`.
  4. Chạy positive/negative fixtures cho allowed license, out-of-policy license, missing tree, extra allowlist entry và wrong working directory.
- **Kết quả mong đợi (Expected Results):**
  - Ba license jobs chạy độc lập trên root/client/server full trees, không chỉ dependency diff.
  - Allowlist khớp chính xác sáu identifier đã duyệt; không wildcard, auto-allow hoặc broad exception.
  - Out-of-policy hoặc unknown license làm đúng Advisory job fail và yêu cầu explicit review.
  - Slice không thay package/license chỉ để làm scan xanh.

### TC-06: CodeQL Uses Build-Mode None With Narrow Upload Permissions

- **Boundary axes:** Data Shape, State, Security, Boundary Bounds.
- **Mô tả:** Xác minh CodeQL phân tích JavaScript/TypeScript đúng mô hình interpreted-source và không chiếm trách nhiệm Client Build.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra `codeql-analysis` job, permissions và SHA-pinned CodeQL Actions.
  2. Xác minh init dùng language `javascript-typescript` với `build-mode: none`.
  3. Kiểm tra toàn bộ steps không có autobuild, client/server build, package execution hoặc stateful runtime startup.
  4. Quan sát hosted analyze/upload behavior trên supported events.
- **Kết quả mong đợi (Expected Results):**
  - Job thực hiện checkout → CodeQL init (`javascript-typescript`, `build-mode: none`) → analyze.
  - Chỉ job này nhận `actions: read` và `security-events: write` ngoài workflow default `contents: read`.
  - Technical init/analyze/upload failure làm job fail; detected alerts là Advisory findings và không có custom severity gate.
  - Không autobuild/application build, provider secret hoặc repository content write.

### TC-07: Gitleaks Scans Full Repository History With Complete Redaction

- **Boundary axes:** Data Shape, State, Security, Boundary Bounds.
- **Mô tả:** Xác minh secret scan bao phủ full Git history, không thực hiện verified-secret network calls và không làm lộ finding content.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra checkout/history settings và exact Gitleaks invocation trong `secret-scan`.
  2. Xác minh scan không giới hạn shallow snapshot/path và bật `--redact=100`.
  3. Chạy baseline scan an toàn; chỉ ghi nhận rule ID/path/fingerprint cần thiết, không ghi value hoặc matched line.
  4. Chạy fixtures cho shallow checkout, current-tree-only scan, thiếu redaction, verified-secret call hoặc broad path exclusion.
- **Kết quả mong đợi (Expected Results):**
  - Gitleaks scan toàn repository và Git history trên mọi supported event.
  - Output được redacted hoàn toàn; không secret value, raw matched line hoặc unsafe snippet xuất hiện trong log/report/chat.
  - Không network verification, credential, `.env` runtime hoặc privileged token.
  - Coverage/redaction regression bị CI Contract hoặc automated test từ chối.

### TC-08: Gitleaks Exceptions Are Narrow, Synthetic and Explicitly Justified

- **Boundary axes:** Data Shape, State, Security, Boundary Bounds.
- **Mô tả:** Xác minh `.gitleaks.toml` chỉ chứa ngoại lệ hẹp cho synthetic findings đã xác nhận, không tạo vùng mù theo thư mục.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra từng exception bằng identifier/fingerprint/regex an toàn và documented reason.
  2. Đối chiếu exception với baseline finding đã xác nhận synthetic mà không hiển thị secret-like value.
  3. Tìm path-level exclusions cho `.env.example`, `server/test/**`, client tests hoặc location rộng tương đương.
  4. Chạy fixture với unknown finding gần giống nhưng không khớp exact exception.
- **Kết quả mong đợi (Expected Results):**
  - Chỉ synthetic-value exceptions đã xác nhận được allow; mỗi exception có lý do hẹp và truy xuất được.
  - Không broad path exclusion, blanket rule disable hoặc auto-allow unknown finding.
  - Finding mới/biến thể ngoài exact boundary vẫn làm Gitleaks fail.
  - Acceptance evidence không chứa raw value hoặc unsafe matched text.

### TC-09: SARIF Sanitizer Pure Function Emits Only the Approved Safe Schema

- **Boundary axes:** Data Shape, Contract, Security, Boundary Bounds.
- **Mô tả:** Xác minh pure CommonJS sanitizer tạo SARIF mới từ whitelist, không chuyển tiếp raw document hoặc unsafe fields.
- **Các bước thực hiện (Steps):**
  1. Chạy `node:test` pure-function cases cho `scripts/ci/sanitizeGitleaksSarif.cjs`.
  2. Dùng fixture chứa safe rule IDs, coordinates, fingerprints cùng unsafe messages/snippets/artifact content/properties.
  3. Parse output trong test và liệt kê key paths, không in serialized SARIF.
  4. Kiểm tra module chỉ dùng Node built-ins cần thiết (`node:fs` ở CLI boundary và JSON parsing), không external dependency.
- **Kết quả mong đợi (Expected Results):**
  - Exported pure function deterministic, không đọc/ghi filesystem và không mutate input.
  - Output chỉ giữ SARIF envelope tối thiểu, rule IDs, safe location coordinates và fingerprints được duyệt.
  - Messages, matched text, snippets, artifact contents, raw properties, environment data và unknown fields bị loại.
  - Không raw SARIF object/string được tái sử dụng làm sanitized output.

### TC-10: SARIF Sanitizer Rejects Malformed and Unsafe Boundary Inputs

- **Boundary axes:** Data Shape, State, Security, Boundary Bounds.
- **Mô tả:** Xác minh sanitizer fail closed trước input sai kiểu, thiếu cấu trúc hoặc coordinate/fingerprint không an toàn.
- **Các bước thực hiện (Steps):**
  1. Chạy fixtures cho invalid JSON, `null`, array/object sai shape, missing runs/results và unexpected scalar types.
  2. Chạy fixtures cho negative/non-integer/oversized coordinates, unsafe URI/path, malformed rule ID và invalid fingerprint map.
  3. Chạy fixture chứa prototype-pollution-shaped keys hoặc unknown nested content.
  4. Xác minh failure message chỉ mô tả structural reason, không echo raw input.
- **Kết quả mong đợi (Expected Results):**
  - Invalid/malformed input làm sanitizer fail non-zero hoặc throw typed/clear error theo seam, không sinh partial output được coi là hợp lệ.
  - Coordinates, identifiers và fingerprints ngoài safe bounds bị loại hoặc reject đúng contract đã khóa.
  - Không raw content, secret-like value hay unsafe snippet bị echo trong error/log.
  - Tests deterministic và bao phủ empty results hợp lệ tách biệt với malformed results.

### TC-11: Sanitizer CLI Writes Safely Without Printing Raw or Sanitized SARIF

- **Boundary axes:** State, Async, UI/Observability, Security.
- **Mô tả:** Xác minh CLI wrapper giữ filesystem I/O tách khỏi pure function, có exit semantics rõ và không rò nội dung SARIF.
- **Các bước thực hiện (Steps):**
  1. Chạy CLI tests với temporary input/output paths cho valid fixture.
  2. Capture stdout/stderr và xác minh output file parse được nhưng console không chứa SARIF content.
  3. Chạy CLI với missing args, missing input, invalid JSON, unwritable/invalid output path và sanitizer rejection.
  4. Xác minh tests cleanup temporary artifacts mà không sửa repository fixtures/workflows.
- **Kết quả mong đợi (Expected Results):**
  - Valid invocation exit `0`, tạo đúng sanitized output file và không in raw/sanitized document.
  - Mọi error case exit non-zero, không báo success và không để unsafe/partial output được upload.
  - stderr chỉ chứa thông báo an toàn đủ định vị lỗi, không chứa input payload hoặc secret-like content.
  - CLI dùng `node:fs`/JSON parsing, không external package hoặc shell text transformation.

### TC-12: Gitleaks and Sanitizer Preserve Both Real Exit Statuses

- **Boundary axes:** State, Async, Lifecycle, Security.
- **Mô tả:** Xác minh cleanup/sanitization vẫn chạy sau finding nhưng Gitleaks hoặc sanitizer failure không bị `if: always()` che thành success.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra secret-scan step ordering, step IDs, conditions và final status propagation.
  2. Chạy fixture matrix: no finding + sanitizer pass; finding + sanitizer pass; no finding + sanitizer fail; finding + sanitizer fail.
  3. Xác minh sanitize/upload sequencing dùng `if: always()` chỉ để thu thập evidence, không thay đổi outcome thật.
  4. Tìm `continue-on-error`, unconditional success, `|| true`, ignored exit code hoặc equivalent suppression.
- **Kết quả mong đợi (Expected Results):**
  - No finding + valid sanitization có thể pass; mọi matrix case chứa Gitleaks finding hoặc sanitizer error làm job fail.
  - Sanitizer vẫn được thử sau Gitleaks exit `1` để chuẩn bị safe evidence khi có thể.
  - Không cleanup/upload condition nào ghi đè failure thành success.
  - Không cơ chế nuốt exit status ở step, shell command, wrapper hoặc workflow level.

### TC-13: Fork Pull Requests Skip Only Permission-Dependent SARIF Upload

- **Boundary axes:** State, Async, Lifecycle, Security, Boundary Bounds.
- **Mô tả:** Xác minh event matrix không hy sinh scan/sanitize coverage ở fork PR và không nâng quyền token.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra upload condition dựa trên event và head/base repository identity.
  2. Chạy/evaluate fixtures cho same-repository PR, fork PR, push `main` và schedule.
  3. Xác minh Gitleaks scan và sanitizer conditions trên cả bốn event kinds.
  4. Xác minh chỉ sanitized artifact path được truyền vào SHA-pinned `upload-sarif` action.
- **Kết quả mong đợi (Expected Results):**
  - Scan và sanitize chạy trên same-repo PR, fork PR, push và schedule.
  - Upload chạy cho same-repo PR, push và schedule; fork PR chỉ skip upload do read-only token.
  - Fork PR vẫn fail nếu có finding/sanitizer error và không nhận secrets/write-token escalation.
  - Không `pull_request_target`, privileged `workflow_run` handoff hoặc raw SARIF upload.

### TC-14: Least Privilege and Secret-Free Execution Hold for Every Security Job

- **Boundary axes:** Data Shape, State, Security.
- **Mô tả:** Xác minh permissions được cấp ở scope hẹp nhất và ordinary scans không cần secret/provider credential.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra workflow-level permissions và job-level overrides của từng job.
  2. Tìm `${{ secrets.* }}`, `.env` loading, cloud credential, registry credential và repository write operation.
  3. Chạy local seams khi không có application `.env` và stateful services.
  4. Chạy negative fixtures thêm `contents: write`, `write-all`, write permission cho audit/license hoặc permission rộng hơn cần thiết.
- **Kết quả mong đợi (Expected Results):**
  - Workflow default là `contents: read`; audit/license jobs chỉ kế thừa read-only.
  - CodeQL chỉ thêm `actions: read` + `security-events: write`; secret scan chỉ thêm `security-events: write` cho conditional sanitized upload.
  - Không repository content write, provider secret, local `.env`, MongoDB, Redis, RabbitMQ hoặc Docker runtime dependency.
  - Permission expansion không được duyệt bị contract tests từ chối.

### TC-15: Every External Action Is Immutable and the Setup Exceptions Stay Local

- **Boundary axes:** Data Shape, Contract, Security.
- **Mô tả:** Xác minh supply-chain policy áp dụng cho toàn bộ Security workflow và hai setup exceptions không lan rộng.
- **Các bước thực hiện (Steps):**
  1. Liệt kê mọi external `uses:` trong `security.yml`.
  2. Xác minh mỗi reference là immutable full commit SHA có adjacent human-readable version comment.
  3. Kiểm tra audit/license jobs dùng approved root/client/server setup; secret scan dùng direct SHA-pinned `actions/setup-node` với `.nvmrc` và không `npm ci`.
  4. Chạy fixtures đổi SHA thành tag/branch, bỏ version comment hoặc dùng setup exception ở job không được phép.
- **Kết quả mong đợi (Expected Results):**
  - Checkout, setup-node, CodeQL, Gitleaks/SARIF upload và mọi external Action đều pin full SHA kèm version comment.
  - Mutable tag/branch hoặc missing comment bị validator từ chối.
  - Secret scan chỉ cài Node để chạy dependency-free sanitizer; không kéo root/client/server dependency install không cần thiết.
  - Docker và secret-scan exceptions không làm yếu setup contract của audit/license/Required jobs.

### TC-16: CI Contract Negative Matrix Covers Security Without Closing the Advisory Extension Surface

- **Boundary axes:** Data Shape, State, Contract, Security, Boundary Bounds.
- **Mô tả:** Xác minh validator bắt các invariant Security đã duyệt nhưng vẫn cho phép bổ sung Advisory job an toàn không chiếm Required contract.
- **Các bước thực hiện (Steps):**
  1. Chạy `npm run test:ci` và ghi số test thực tế.
  2. Kiểm tra negative fixtures cho triggers/schedule, permissions, action pins, Required-name collision, audit/license commands, CodeQL mode, Gitleaks redaction/history và upload conditions.
  3. Chạy global-deny fixtures đặt `continue-on-error: true`, `pull_request_target` hoặc mutable Action trong newly added Security job/step.
  4. Chạy positive fixture thêm một harmless uniquely named Advisory observability job rồi chạy `git status --short`.
- **Kết quả mong đợi (Expected Results):**
  - Expected-invalid fixtures bị reject đúng rule; suite tổng thể exit `0` khi validator hành xử đúng.
  - Global deny rules quét mọi workflow/job/step, kể cả extension mới.
  - Harmless Advisory extension pass nếu không vi phạm invariant hoặc dùng Required name.
  - Fixture tests không sửa workflow hay source thật và không tạo working-tree changes mới.

### TC-17: README and Contributor Wording Describe Security Evidence Truthfully

- **Boundary axes:** Data Shape, UI/Observability, Security, Contract.
- **Mô tả:** Xác minh người review hiểu đúng Security badge/check semantics và không suy diễn quá mức từ kết quả scan.
- **Các bước thực hiện (Steps):**
  1. Kiểm tra README badge order và Security badge link/branch target.
  2. Đọc nearby README/contributor wording về dependency audit, CodeQL, secret và license findings.
  3. Chạy `npm run ci:validate` cùng negative fixtures cho missing/wrong Security badge, wrong branch/workflow link và Required-style claims.
  4. So sánh wording với ADR-009/010 và seven-check Required list.
- **Kết quả mong đợi (Expected Results):**
  - README hiển thị badge theo thứ tự Tests, Build, Quality, Docker, Security; Security trỏ đúng `security.yml` trên `main`.
  - Copy nói rõ bốn nhóm kết quả là Advisory findings, có thể fail mà không là merge blocker.
  - Không claim “repository secure”, “no vulnerabilities”, Required gate hoặc guarantee vượt evidence.
  - CI/CD ADR index/link và immutable-action/least-privilege rationale vẫn truthful.

### TC-18: Hosted PR/Main Evidence Is Complete and Slice Boundaries Remain Intact

- **Boundary axes:** State, Lifecycle, Async, UI/Observability, Security, Boundary Bounds.
- **Mô tả:** Xác minh workflow semantics bằng hosted execution thật và đảm bảo Slice #17 không mở rộng sang remediation/enforcement.
- **Các bước thực hiện (Steps):**
  1. Sau explicit authorization, push branch và mở PR targeting `main`; ghi run URL/ID, exact job names và status của toàn bộ audit/license/CodeQL/secret jobs.
  2. Với mỗi failure, ghi summary an toàn theo job/rule category; không sao chép raw finding, secret-like value hoặc SARIF content.
  3. Xác minh same-repo PR upload behavior; nếu có fork test được Developer cho phép, xác minh chỉ upload bị skip còn scan/sanitize vẫn chạy.
  4. Sau merge/push được cho phép, ghi `main` run evidence; xác minh schedule configuration và quan sát scheduled run khi thời điểm thực tế khả dụng, không giả lập nó thành hosted evidence.
  5. Kiểm tra final diff và read-only repository Settings/Ruleset state.
- **Kết quả mong đợi (Expected Results):**
  - PR và `main` đều tạo toàn bộ Advisory jobs; mỗi job phản ánh status thật, kể cả baseline failure.
  - CodeQL và sanitized SARIF upload đúng event/permission contract; raw SARIF không được in/upload.
  - Bảy Required checks không đổi và Ruleset/Settings không bị sửa; Security vẫn Advisory.
  - Không dependency/license/security remediation, Client Lint remediation, broad Gitleaks allowlist, deployment, branch/commit/push/merge ngoài authorization.
  - Nếu scheduled run chưa đến thời điểm quan sát, case ghi rõ phần evidence đó là pending thay vì tự đánh PASS.

---

## [CẬP NHẬT] Lịch sử Nghiệm thu

| Lần chạy | Ngày | Người test | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 | TC-07 | TC-08 | TC-09 | TC-10 | TC-11 | TC-12 | TC-13 | TC-14 | TC-15 | TC-16 | TC-17 | TC-18 | Tổng kết | Ghi chú / Link Log |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| Chưa chạy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | **PENDING_VERIFICATION** | `[KHÓA]` TC-01 đến TC-18 đã được Developer duyệt ngày `2026-07-27`; chưa bắt đầu implementation hoặc acceptance. |
| Run #1 (local/static) | 2026-07-27 | Agent | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PENDING | **PENDING_VERIFICATION** | CI Contract `74/74`, `ci:validate` exit `0`, server `321/321`, client `232/232`, client build exit `0`; root/client/server audit và license findings ghi nhận Advisory; Gitleaks full-history exit `1` với 5 historical findings và sanitized SARIF `5` results. TC-18 chờ explicit authorization cho hosted PR/`main`/fork/schedule evidence. |
| Run #2 (hosted PR) | 2026-07-28 | Agent | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PENDING | **PENDING_VERIFICATION** | PR #29 HEAD `6c7965a6`; Security run `30325303758`: CodeQL job `90169356220` và sanitized upload `90169396094` success; ba audit, ba license và Secret Scan phản ánh baseline failures đúng Advisory contract. Tests run `30325303772`, Build `30325303761`, Docker `30325303785`, `CI Policy v1` job `90169423467` success; Client Lint fail đúng Issue #18. TC-18 còn thiếu hosted `main`, fork (nếu được cho phép) và scheduled-run evidence; không merge hoặc đổi Ruleset/Settings. |
| Run #3 (hosted main) | 2026-07-28 | Agent | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PENDING | **PENDING_VERIFICATION** | PR #29 merge SHA `539c1270`; Security run `30325871127`: CodeQL job `90171079835` success; ba audit, ba license và Secret Scan phản ánh baseline failures đúng Advisory contract. Tests run `30325871148`, Build `30325871139`, Docker `30325871143`, Quality run `30325871229` và `CI Policy v1` job `90171150858` success; Client Lint fail đúng Issue #18. TC-18 còn chờ scheduled run Monday `03:00 UTC`; fork evidence chỉ thực hiện nếu được cho phép. Ruleset/Settings không thay đổi. |
| Run #4 (session-end checkpoint) | 2026-07-28 | Agent | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PENDING | **PENDING_VERIFICATION** | Final main SHA `5a3b9dc0`; local CI Contract `79/79`, `ci:validate` exit `0`, server `321/321`, client `232/232`, client build exit `0`; hosted main evidence remains valid with Advisory baseline failures and Required/technical checks as documented in Run #3. TC-18 intentionally remains pending until the real scheduled Security run at Monday `03:00 UTC`; no Ruleset/Settings change. |
| Run #5 (hosted scheduled Security) | 2026-08-03 | Agent / hosted scheduled verification | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | **PASSED** | Scheduled run [`30790453532`](https://github.com/NhiBuaa/kitta-chat/actions/runs/30790453532), event `schedule`, main SHA `bc3d8ad6`; all eight Advisory jobs completed. CodeQL `91612660497` and sanitizer/upload steps succeeded; audit/license jobs and Secret Scan preserved real baseline finding failures at their scan steps (technical setup/sanitize/upload succeeded). Cron remains `0 3 * * 1`; no Required-name, Ruleset, Settings or workflow semantic changes. |

---

## Ghi Chú & Troubleshooting

- `[KHÓA]` TC-01 đến TC-18 đã được Developer duyệt ngày `2026-07-27`; mọi thay đổi sau này cần thống nhất lại với Developer.
- Security jobs là Advisory nhưng phải giữ exit status thật. Không dùng `continue-on-error`, `|| true`, ignored exit code hoặc cơ chế tương đương.
- Negative tests phải dùng fixtures/temporary directories; không sửa workflow/config/source thật trong lúc chứng minh failure mode.
- Không in raw/sanitized SARIF. Khi cần kiểm tra output, test parse JSON và assert key paths/values an toàn bên trong process.
- Gitleaks evidence chỉ ghi rule ID, safe path/coordinate và fingerprint khi thực sự cần; không ghi secret value, matched line hoặc unsafe snippet.
- Hosted test cases chỉ chạy sau explicit authorization cho branch/push/PR/merge; quan sát Settings/Ruleset là read-only trừ khi có authorization riêng.
- Advisory failure do baseline finding không tự động là implementation failure; phải phân biệt scanner technical failure, finding signal và merge policy trong báo cáo.
