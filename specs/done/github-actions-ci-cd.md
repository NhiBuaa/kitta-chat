# PRD: GitHub Actions CI/CD Quality Gates

## Problem Statement

KittaChat đã có GitHub Actions chạy server tests, client tests và client production build, nhưng pipeline chưa cung cấp một quality gate hoàn chỉnh cho lint, Docker image build validation và dependency/security scanning. Trạng thái kiểm tra hiện bị phân tán giữa các workflow, chưa có repository-level contract giúp phát hiện cấu hình CI bị thiếu hoặc bị thay đổi ngoài ý muốn, và repository chưa ghi rõ ranh giới giữa CI bắt buộc với deployment staging tùy chọn.

Developer cần một pipeline chạy được trên pull request và `main`, không phụ thuộc secret local cho các bước kiểm tra cơ bản, phản ánh đúng trạng thái trong README, và tạo ra các check thất bại rõ ràng khi code, build hoặc Docker packaging bị lỗi.

## Solution

Mở rộng GitHub Actions hiện tại thành một bộ quality gates có trách nhiệm tách biệt:

- Giữ server tests và client tests là các check độc lập.
- Giữ client production build là check độc lập.
- Bổ sung lint check dựa trên cấu hình lint đã được commit trong repository.
- Bổ sung Docker image build validation cho các production-relevant Dockerfile mà không push image.
- Bổ sung dependency/security scan không cần secret và xác định rõ đây là check bắt buộc hay advisory.
- Tổ chức CI thành năm workflow theo trách nhiệm: `tests.yml`, `build.yml`, `quality.yml`, `docker.yml` và `security.yml`.
- Tách phần setup dùng chung thành local composite action `.github/actions/setup-node-env` để tránh Node/cache/install drift giữa các workflow. Composite action nhận `working-directory` và `cache-dependency-path`, thực hiện `setup-node@v4` và `npm ci`; `actions/checkout` vẫn do từng workflow caller thực hiện.
- Bổ sung một repository-level CI contract validator để kiểm tra workflow triggers, job coverage, command contracts và README badges bằng giao diện CLI duy nhất.
- Chuẩn hóa README badges để hiển thị trạng thái thực tế của các workflow bắt buộc trên nhánh `main`.
- Ghi nhận Optional Staging Deployment là **Deferred Capability — Pending Infrastructure Availability**. K2 không tạo placeholder workflow; deployment thật sẽ được xử lý như hạng mục mở rộng riêng khi có staging target thực tế.

### Phased Quality Strategy

K2 phân biệt rõ hai loại GitHub check theo tác động tới merge:

- **Required Quality Gates (merge blockers):** Server Tests, Client Tests, Client Production Build, Client Lint và Docker Image Build Validation. Đây là các deterministic checks, không phụ thuộc production environment và phải chạy được trên mọi pull request.
- **Advisory Checks (quality signals):** Dependency Vulnerability Scan, security/SAST scan, secret scan và license scan nếu được bổ sung. Các check này phải hiển thị kết quả cho reviewer nhưng chưa chặn merge trong K2 vì repository có thể còn baseline findings hoặc false positives.
- **Initial CD Capability:** Optional Staging Deployment chỉ có giá trị khi deploy artifact/revision thật lên staging target và xác minh runtime bằng health check hoặc smoke test sau khi CI trên `main` đã xanh. Vì hiện chưa có staging target, K2 ghi nhận capability này là **Deferred Capability — Pending Infrastructure Availability**, không phải blocker và không nằm trong Completion Criteria.

Sau K2, khi baseline findings đã được xử lý và false positives được giảm, repository có thể phê duyệt một slice riêng để chuyển các phát hiện mới ở mức `Critical`/`High` thành merge blockers.

K2 được coi là hoàn thành khi toàn bộ Required Quality Gates pass và Advisory Checks đã chạy/hiển thị trong GitHub Actions. Optional Staging Deployment không phải phần còn thiếu của K2; khi có staging target thực tế, CD sẽ được mở lại như một hạng mục mở rộng riêng, ví dụ K2.1.

## User Stories

1. As a developer, I want every pull request to run server tests, so that backend regressions are detected before merge.
2. As a developer, I want every pull request to run client tests, so that frontend regressions are detected before merge.
3. As a developer, I want every pull request to build the production client bundle, so that Vite production-only failures are detected before merge.
4. As a developer, I want every pull request to run lint, so that committed code must satisfy the repository's static quality rules.
5. As a developer, I want every pull request to validate production-relevant Docker image builds, so that packaging failures are detected before deployment work begins.
6. As a maintainer, I want failed tests, lint, builds or Docker validation to produce failed GitHub checks, so that a pull request cannot be considered green while a required quality gate is failing.
7. As a maintainer, I want CI checks to run again on pushes to `main`, so that the protected branch has current verification evidence.
8. As a contributor, I want basic CI to use committed examples and safe defaults, so that I do not need local `.env` files or production secrets to validate a pull request.
9. As a contributor, I want dependency installation to use lockfiles, so that CI executes reproducible dependency graphs.
10. As a contributor, I want Node.js versions to be explicit and consistent across jobs, so that local and CI behavior do not drift silently.
11. As a maintainer, I want workflow permissions to follow least privilege, so that validation jobs cannot write repository content.
12. As a maintainer, I want dependency/security scanning to report actionable findings, so that known vulnerable dependencies are visible before release.
13. As a maintainer, I want optional security checks to be clearly marked as advisory when they are not merge-blocking, so that warning semantics are honest.
14. As a maintainer, I want Docker validation to build images without pushing them, so that pull request checks do not require registry credentials.
15. As a maintainer, I want Docker validation to avoid starting stateful services, so that CI does not require MongoDB, Redis, RabbitMQ or external provider credentials merely to validate image construction.
16. As a reviewer, I want README badges to link to the real GitHub Actions workflows, so that repository status can be verified directly.
17. As a reviewer, I want README badges to target `main`, so that displayed status represents the integration branch rather than an arbitrary feature branch.
18. As a maintainer, I want a repository-level CI contract command, so that workflow coverage and badge contracts can be tested locally and in CI.
19. As a maintainer, I want CI contract tests to fail when required jobs, triggers or commands disappear, so that pipeline regressions are reviewable like application regressions.
20. As a maintainer, I want workflow responsibilities to remain separate, so that failures identify whether tests, build, quality, Docker or security caused the gate to fail.
21. As a maintainer, I want concurrent superseded workflow runs to be cancellable, so that new commits do not waste runner time on obsolete revisions.
22. As a maintainer, I want dependency caches keyed by committed lockfiles, so that CI remains fast without sacrificing reproducibility.
23. As a maintainer, I want optional staging deployment to deploy a real revision only after successful `main` CI, so that K2 introduces a verifiable delivery capability without weakening PR quality gates.
24. As a maintainer, I want staging deployment to remain non-merge-blocking, so that delivery experiments do not prevent PRs from merging after required CI passes.
25. As a maintainer, I want branch protection requirements documented separately from workflow implementation, so that repository settings and committed CI contracts are not conflated.

## Implementation Decisions

- Existing tests and build workflows remain the starting point rather than being replaced without evidence.
- K2 uses five responsibility-aligned workflows: `tests.yml`, `build.yml`, `quality.yml`, `docker.yml` and `security.yml`.
- All five workflows run only for pull requests targeting `main` and pushes to `main`. `security.yml` additionally runs on its approved weekly schedule.
- No workflow uses `pull_request_target` or adds special draft-PR event handling in K2.
- All five workflows use `concurrency.group: ${{ github.workflow }}-${{ github.ref }}` and cancel only superseded pull-request runs. Push runs on `main` are never canceled so every integrated commit retains a complete CI record.
- Shared Node/cache/dependency setup is centralized in `.github/actions/setup-node-env/action.yml`; no reusable workflow is created for this purpose.
- The composite action has required inputs `working-directory` and `cache-dependency-path`, applies the directory consistently to `npm ci`, and passes the exact lockfile path to `setup-node@v4` cache configuration.
- Each workflow caller performs `actions/checkout` before invoking the composite action because the local action must be available from the checked-out repository.
- Server and client jobs pass their own directory and lockfile path so dependency caches remain isolated.
- `docker.yml` is the deliberate exception: it performs checkout and Docker build directly, without host-side Node setup, because dependencies are installed inside the isolated image build environment.
- `secret-scan` is a second deliberate setup exception: it calls the SHA-pinned `actions/setup-node` directly with `.nvmrc` and does not run `npm ci`, because the SARIF sanitizer uses only Node built-ins.
- Docker Image Build Validation uses two independent Required jobs: `build-server` for `server/Dockerfile` and `build-nginx` for `nginx/Dockerfile`.
- Both Docker jobs use `docker/build-push-action` with Buildx, `push: false`, `load: false`, `platforms: linux/amd64` and plain progress output. They do not authenticate to a registry or consume Docker secrets.
- The CI Contract distinguishes host Node setup coverage from Docker build isolation and checks that Dockerfile Node base versions remain synchronized with the composite action/workflow runtime.
- `.nvmrc` contains major-only `22`, matching the current `node:22-alpine` Docker base convention. Full semver pinning is intentionally out of scope; resolved patch versions must be logged for traceability.
- Node version has one canonical source: `.nvmrc`, referenced by host setup and validated against Dockerfile base images; independent Node version updates are not allowed.
- Confirmed Docker drift scope: `server/Dockerfile` contains the production-relevant Node base image; `nginx/Dockerfile` is a multi-stage build with a Node stage and is included. `client/Dockerfile` exists but is a development image and is not included in K2 production Docker validation or Node drift checks.
- Docker drift validation reads the canonical `.nvmrc`, parses `FROM node:X` in the in-scope Dockerfiles, compares major versions and fails on mismatch. The validation uses shell tooling and does not call the host Node setup composite action.
- CI Contract uses the root `yaml` npm package to parse workflow YAML into objects; README badge validation is a separate Markdown-based check and does not reuse the YAML parser.
- The root repository has its own `package-lock.json`; any CI Contract job that imports root `yaml` must install root dependencies rather than assuming the client/server dependency trees provide it.
- `quality.yml` contains `client-lint` and a caller for the required, versioned `CI Policy v1` check. They use separate check names and dependency-tree inputs.
- `ci-contract` runs with root `working-directory: .` and `package-lock.json`; `client-lint` runs with `working-directory: client` and `client/package-lock.json`.
- `CI Policy v1` is the seventh Required check. Security jobs remain Advisory, fail truthfully, and are non-blocking only because Ruleset excludes them.
- `security.yml` dependency scanning uses `npm audit --audit-level=high` independently against root, client and server lockfile trees. The threshold is an initial K2 policy and may be revisited after observing real CI noise.
- Dependency scanning is split into three parallel advisory jobs: `root-audit`, `client-audit` and `server-audit`, each with its own check name, setup inputs and failure scope.
- License scanning is split into three parallel advisory jobs: `root-license-scan`, `client-license-scan` and `server-license-scan`, using `license-checker-rseidelsohn` against each installed dependency tree.
- The initial license allowlist is `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC` and `0BSD`. A finding outside the allowlist fails its advisory job and requires explicit review; it is never auto-allowed.
- OSV-Scanner and Dependabot-based expansion are recorded as future options, not K2 implementation requirements.
- `security.yml` adds an advisory `codeql-analysis` job for `javascript-typescript`, triggered on pull requests, pushes to `main` and a weekly schedule. It uploads findings to GitHub code scanning.
- The weekly Security schedule is `0 3 * * 1` (Monday 03:00 UTC / 10:00 Vietnam time). Schedule runs are retained because concurrency cancellation applies only to pull requests.
- `codeql-analysis` fails only when init/build/analyze has a technical failure. Security alerts remain Advisory findings and do not create a custom fail-on-alert gate in K2.
- `codeql-analysis` uses `build-mode: none`: checkout → CodeQL init for `javascript-typescript` → analyze. It does not call autobuild or run client/server build commands.
- A future milestone may add a Critical/High alert threshold gate after the repository has enough data to evaluate CodeQL false positives and severity mapping.
- `security.yml` uses Gitleaks for the advisory `secret-scan` job, scanning the repository and Git history without verified-secret network calls. TruffleHog verified mode is deferred.
- Confirmed example/config paths are `client/.env.example` and `server/.env.example`. Current tracked scans found no Google API key, AWS access key or private-key-header shapes; synthetic MongoDB URI shapes exist across committed config/scripts/tests and require a narrow baseline review rather than a blanket test-directory allowlist.
- `.gitleaks.toml` must use narrowly scoped regex/fingerprint exceptions for findings confirmed false positive by a full repository/history baseline scan. Path-level exclusions for `.env.example` or test directories are forbidden.
- Every Gitleaks exception records a reason tied to the confirmed synthetic value. New findings are never auto-allowlisted; they require explicit false-positive verification first.
- `server/Dockerfile` and the Node build stage in `nginx/Dockerfile` log the resolved runtime with `RUN node --version` before the final runtime stage; this complements, rather than replaces, static `FROM node:X` drift validation.
- Required validation responsibilities are separated into clearly named GitHub checks for server tests, client tests, client build, lint and Docker image build validation.
- The pipeline runs for pull requests and pushes to `main`.
- Basic checks use `npm ci` and committed lockfiles.
- Node.js 22 remains the CI runtime because it matches the current Docker runtime and existing workflows.
- Workflow permissions remain read-only unless a future deployment workflow requires a separately approved permission set.
- `tests.yml`, `build.yml`, `quality.yml` and `docker.yml` use workflow-level `contents: read` only.
- `security.yml` defaults to workflow-level `contents: read`. `codeql-analysis` adds job-level `actions: read` and `security-events: write`; `secret-scan` adds job-level `security-events: write` only for SARIF upload.
- Audit and license jobs inherit `contents: read`. No workflow uses `write-all`, `contents: write` or `pull_request_target`.
- Gitleaks SARIF is never uploaded directly. `secret-scan` runs Gitleaks with `--redact=100`, then a repository-owned sanitizer constructs a new SARIF document from a whitelist of safe fields before upload.
- Every external GitHub Action used by the five workflows or the local composite action is pinned to an immutable full commit SHA with an adjacent version/tag comment. Mutable tags and branches are forbidden.
- `.github/dependabot.yml` monitors the `github-actions` ecosystem weekly so action SHA upgrades arrive as reviewable pull requests that pass the same Required and Advisory checks as other changes.
- Docker validation builds the server production target and the nginx production image, which includes the production client build. It does not push images or start the full Compose stack.
- The development-only client Dockerfile is not treated as the deployable client image; nginx remains the production frontend image owner.
- Client lint uses the existing ESLint public command. Server lint is not invented in this slice because the server currently has no committed lint configuration; adding server lint requires a separate behavior/configuration decision.
- Client Lint readiness is introduced before remediation so the real GitHub check can verify the baseline cleanup. While it remains outside the Ruleset, its expected baseline failure is visible but non-blocking.
- A later dedicated remediation PR excludes generated `.vite-cache/**`, fixes all 17 confirmed source/test errors without disabling or weakening rules, and preserves full source/test lint scope.
- The two React hook correctness errors require TDD regression coverage: a failing behavior test first, then the minimal behavioral fix, then green regression and lint results.
- The remediation PR must be verified by the already-existing `Client Lint` GitHub check; manual-only confirmation is insufficient.
- Client Lint initially enforces zero errors with a fixed warning budget of `13`, defined only by `client/package.json` script `lint:ci`. New warnings above that baseline fail the Required Quality Gate; the budget is documented and reduced through a separate follow-up remediation plan.
- Root `lint`/`lint:ci` scripts are convenience delegates (`npm --prefix client run ...`) and never repeat the numeric warning budget.
- Warning remediation prioritizes the unused disable directive, then evaluates each hook-dependency warning with regression coverage, and treats the React Compiler incompatible-library warning as a separate architectural decision.
- Dependency/security scanning uses commands that do not require repository secrets. Its merge-blocking status must be explicit in workflow naming and documentation.
- Server Tests, Client Tests, Client Production Build, Client Lint và Docker Image Build Validation là Required Quality Gates và phải được cấu hình làm merge blockers.
- Dependency vulnerability, SAST/security, secret và license scans là Advisory Checks trong K2; chúng cung cấp quality signals nhưng không được làm Required Quality Gates thất bại vì baseline findings hoặc false positives.
- Việc nâng security findings mới ở mức `Critical`/`High` thành merge blockers là một quyết định hậu K2, chỉ thực hiện sau khi có baseline và policy được phê duyệt.
- A repository-level CI contract validator provides one public CLI interface for validating workflow coverage, required triggers, package command availability and README badge linkage.
- Root package scripts remain intentionally separate: `test:ci` runs `node --test scripts/ci/*.test.cjs`, while `ci:validate` runs the validator against the real repository.
- Required `CI Policy v1` runs trusted baseline validation against the candidate, then candidate `npm run test:ci` and `npm run ci:validate`; none uses failure suppression.
- README badges represent required workflow status on `main`; badges must not imply staging deployment or security guarantees that the pipeline does not provide.
- README may expose separate workflow badges for Tests, Build, Quality, Docker and Security because badge status is workflow-scoped.
- README displays all five workflow badges in the order Tests, Build, Quality, Docker and Security. The Security badge is not hidden when advisory findings fail; nearby copy states that the workflow is advisory and links reviewers to Actions/Security details.
- `ci-contract` does not receive a separate badge because it is represented by the overall `quality.yml` workflow badge alongside client lint.
- Stable required check/job names must be documented for branch protection; workflow filenames/badges and required status-check names are related but not treated as the same contract.
- `main` uses a GitHub Ruleset rather than classic branch protection. It requires a pull request and exactly seven job-level status checks: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)` and `CI Policy v1`.
- The Ruleset is configured only after workflow execution has produced the exact check names on GitHub. Workflow-level names/files are never substituted for job-level check names.
- Dependency audits, CodeQL, Gitleaks and license scans remain outside required checks.
- Optional Staging Deployment is recorded as **Deferred Capability — Pending Infrastructure Availability** because no real staging target is currently available. It is not a K2 blocker and not part of K2 Completion Criteria.
- Future staging work must deploy a real artifact/revision and verify the staging runtime with health checks or smoke tests. It may be delivered as K2.1 or an equivalent follow-up item after a target exists.
- Full Continuous Delivery, including production deployment, rollback automation, progressive delivery, environment promotion and release orchestration, is explicitly out of K2 scope.
- GitHub branch protection or ruleset configuration is an external repository setting. The implementation will document the exact required check names, but changing repository settings is performed only with explicit authorization and sufficient GitHub permissions.
- Developer has selected GitHub Ruleset for `main`; implementation must verify repository permissions and the observed check names before activating the rule.
- Workflow job `name:` values are part of the branch-policy contract; required-check mapping never uses workflow filenames as substitutes for check run names.
- The pull-request rule uses zero required approvals, requires conversation resolution, and disables Code Owner review, stale-approval dismissal and most-recent-push approval. This preserves a usable solo-maintainer flow while requiring all review conversations to be resolved.
- The Ruleset bypass list is empty, including for repository administrators. Emergency policy changes must be explicit Ruleset changes with an audit trail rather than actor-specific bypasses.
- The Ruleset requires branches to be up to date before merging for all seven Required checks. Advisory checks remain outside this requirement.
- K2 delivery uses readiness PRs before enforcement: shared setup/tests/build, Quality, Docker and Security workflows are committed and observed first; lint remediation follows after the real `Client Lint` check exists.
- Ruleset activation is one atomic repository-setting event after all seven Required check names have appeared and are green. It is created directly Active, then verified with the approved ready-for-review behind-branch sequence.

## Testing Decisions

- Tests verify external repository behavior and committed CI contracts rather than internal helper implementation.
- The highest test seam is a repository-level command that validates the checked-in GitHub Actions workflows, Docker build ownership and README badge contracts.
- The CI contract validator is exercised through Node's public test runner and through its CLI exit code.
- `test:ci` covers pure logic with fixtures; `ci:validate` checks the current workflows, Dockerfiles, `.nvmrc` and README badge contract. They remain independently runnable for local debugging.
- CI Contract YAML assertions use the parsed object model from the root `yaml` package; Markdown badge assertions remain separate and do not parse README as YAML.
- CI Contract reports its advisory status explicitly so a failure is visible to reviewers without being mistaken for a Required Quality Gate failure.
- README or contributor documentation explains that Advisory Check failures may appear on a pull request without preventing merge, while Required Quality Gate failures remain merge blockers.
- README Security badge copy identifies dependency audit, CodeQL, secret scan and license scan as advisory findings that are tracked/reviewed rather than merge blockers.
- README documents immutable action SHA pinning as a deliberate supply-chain control and links to the dedicated CI/CD ADR.
- CI/CD architecture is recorded as five independently supersedable ADRs: `ADR-007` for workflow decomposition and atomic Ruleset activation; `ADR-008` for the three-tier CI Contract model; `ADR-009` for security scanning; `ADR-010` for supply-chain and permissions; and `ADR-011` for the K2/K2.1 staging-CD boundary.
- README links to the stable `docs/adr/README.md` index rather than directly to one CI/CD ADR file. The index starts with the five K2 records marked `Planned`; their rows become links and move to `Accepted` after the physical ADRs are written. Future decisions outside these five boundaries receive a new ADR instead of being appended to an unrelated record.
- CI Contract validates that external `uses:` references are full commit SHAs and that pinned lines retain human-readable version comments.
- CI Contract validates `client/package.json` as the single warning-budget owner, verifies `quality.yml` runs `npm run lint:ci` from the client dependency tree, and rejects a root wrapper that redefines `--max-warnings`.
- CI Contract separates three rule classes. Closed rules require exact triggers, permissions, concurrency, command/setup contracts, immutable action SHAs and seven Required check names.
- Global deny rules scan every workflow independently for `continue-on-error: true`, `pull_request_target` and mutable external action references. Their tests and validation logic remain separate from closed contract comparison.
- The extension surface remains open: safe observability steps may be added inside existing jobs, and new advisory jobs may be added to `security.yml`, without enumerating them in the validator. Extensions must still satisfy global deny rules, must not reuse a Required check name and must not change the pass/fail contract of a Required check.
- Dependency audit results must identify the dependency tree that failed; implementation should prefer independent root/client/server job results over one opaque combined step result.
- Each dependency audit job fails truthfully without `continue-on-error` and is omitted from required branch-protection checks.
- Each license scan job fails truthfully without `continue-on-error` and is omitted from required branch-protection checks.
- CodeQL configuration must avoid `autobuild` assumptions for this interpreted JavaScript/TypeScript monorepo unless execution proves they are valid; use the simplest supported build mode that produces trustworthy analysis.
- CodeQL's K2 job intentionally does not run application builds; application build failures remain the responsibility of the Client Production Build Required Quality Gate.
- K2 does not parse SARIF or add a custom severity threshold. CodeQL analysis failure and CodeQL security findings remain separate concepts.
- Gitleaks baseline acceptance records only file paths/rule identifiers/fingerprints needed for safe configuration, never secret values in chat or reports. The secret-scan job fails truthfully for findings outside the approved narrow allowlist and remains outside required checks.
- `secret-scan` preserves Gitleaks' real exit status while `if: always()` allows sanitize/upload cleanup steps to run. The sanitizer keeps only rule identifiers, safe location coordinates and fingerprints, rejects unsafe output, and never prints either raw or sanitized SARIF content.
- Gitleaks scan and sanitization run for every supported event. SARIF upload alone is skipped for fork pull requests whose head repository differs from the base repository; push, schedule and same-repository PR uploads remain enabled.
- Fork PRs receive no write-token escalation or secrets. A finding/sanitizer error still fails `secret-scan`; only the permission-dependent upload step is skipped.
- The sanitizer lives at `scripts/ci/sanitizeGitleaksSarif.cjs`, exports a pure CommonJS function plus CLI wrapper, and uses only `node:fs`/JSON parsing. Its `node:test` coverage is part of the quality/CI Contract test surface.
- Only `gitleaks-results-sanitized.sarif` is passed to the SHA-pinned CodeQL `upload-sarif` action. A Gitleaks finding or sanitizer failure leaves the job failed; no step uses `continue-on-error`.
- A future external-contributor milestone may introduce a `workflow_run` artifact handoff for fork SARIF uploads; K2 deliberately avoids that additional privileged workflow.
- Tracer-bullet behavior 1: validation fails when a required quality-gate contract is absent and passes when the workflow supplies it.
- Tracer-bullet behavior 2: validation confirms pull request and `main` push triggers for required workflows.
- Tracer-bullet behavior 3: validation confirms server tests, client tests, client production build and client lint invoke committed package scripts.
- Tracer-bullet behavior 4: validation confirms Docker jobs build the server production target and nginx production image without pushing.
- Tracer-bullet behavior 5: validation confirms README badges reference real workflow filenames and the `main` branch.
- Composite action behavior is verified through committed metadata and workflow execution; tests catch missing required inputs, wrong working directories and wrong lockfile cache paths.
- The composite action logs the resolved runtime with `node --version` immediately after Node setup; CI jobs retain this output for debugging patch-level drift.
- Docker contract tests verify that `docker.yml` does not depend on host `node_modules` and that Dockerfile Node base versions do not drift from the canonical Node version.
- Docker build logs must expose `node --version` from each in-scope Node builder stage so mutable major-only tags remain traceable per build.
- Branch protection must require both stable Docker checks (`Docker Build (server)` and `Docker Build (nginx)`) as part of the Docker Required Quality Gate.
- Workflow YAML syntax and GitHub-specific semantics are additionally validated by executing the workflows on the feature branch/pull request; static tests do not pretend to replace GitHub Actions execution.
- CI Contract validates the shared concurrency expression across all five workflows and rejects unconditional cancellation on `main` pushes.
- CI Contract validates consistent `main` branch filters for `pull_request` and `push` across all five workflows, plus the Security-only schedule exception.
- CI Contract treats only the seven approved Required check names as closed. Advisory job names remain open-world.
- `CI Policy v1` uses a SHA-pinned reusable support workflow with no caller-provided root/ref inputs. It validates the candidate with a fixed policy baseline, then tests candidate policy code. Policy upgrades use versioned expand/migrate/contract and explicit Ruleset transitions.
- A same-repository caller remains candidate-modifiable; K2 records this as a personal-repository residual risk. Control-plane-changing PRs require focused manual review, and no claim is made against a malicious maintainer or simultaneous caller/policy weakening.
- `Contributor Mode Entry` occurs before merging the first non-maintainer-authored PR or granting a second collaborator write-or-higher access. It triggers approvals >= 1 and independent re-review of CI authority and signed-commit readiness; an Advisory author-identity reminder makes the trigger visible.
- Activation rollback permits one timestamped, predeclared root-cause finding and field list, one correction, and a suffix rerun through verification completion. A second finding or any rerun failure disables the Ruleset with bypass still empty and requires full reviewed reactivation.
- Local acceptance runs the same underlying commands used by CI: server tests, client tests, client build, client lint and Docker builds.
- Security tests verify that basic jobs do not require secret interpolation or local `.env` files.
- Existing server and client test suites are prior art for command-level behavior; existing tests/build workflows are prior art for trigger, permissions, Node setup and lockfile caching.

## Proposed Test Seams

1. **Primary seam — repository CI contract CLI:** one command returns exit code `0` only when required workflows, triggers, commands, Docker build targets and README badges satisfy the approved contract.
2. **Execution seam — package scripts:** run the same public commands used by contributors and GitHub Actions: server tests, client tests, client build and client lint.
3. **Packaging seam — Docker CLI:** build production-relevant images locally/within Actions without pushing or starting external services.
4. **Hosted seam — GitHub Checks:** confirm each workflow job completes successfully on the pull request and that failed required jobs are represented as failed checks.

## Out of Scope

- Publishing Docker images to a registry.
- Production deployment, rollback automation or release promotion.
- Creating Kubernetes manifests or adopting a new orchestration platform.
- Adding application browser E2E tests.
- Inventing a server lint standard without a separately approved lint configuration.
- Claiming that committed workflow files alone enforce merge blocking without the corresponding GitHub branch protection/ruleset.
- Automatically changing GitHub repository settings without explicit authorization.
- Treating Optional Staging Deployment as a merge blocker or production release mechanism.
- Creating a staging workflow that only prints a readiness checklist, simulates deployment or produces no runtime-verifiable outcome.
- Describing Optional Staging Deployment with any `BLOCKED_BY_*` wording in K2 docs, reports, README copy or changelog.

## Further Notes

- Existing `Tests` and `Build` badges already point to real workflows on `main`; the implementation should preserve truthful links while expanding visible quality coverage only where useful to reviewers.
- Client production build currently passes with a known bundle-size warning above 500 kB. This warning is not a build failure in the current scope.
- Docker Compose remains the source of truth for the complete local runtime, while Docker image build validation is intentionally narrower and stateless.
- Optional dependency/security scanning should start conservative to avoid making CI permanently red because of pre-existing findings; any blocking threshold must be evidence-based and approved.
- The initial client lint baseline on `2026-07-27` contained `1662` findings with generated `.vite-cache` included. Excluding `.vite-cache` left `17` real source/test errors across eight files, including two React hook correctness rules; Issue #18 remediated that baseline before Ruleset activation.
- The initial baseline contained `13` warnings. K2 transparently locks this count as the current warning budget; future work may reduce it toward zero through a separate behavior-aware slice.

## Completion Record

- K2 implementation and hosted verification completed on `2026-08-05`.
- Issues #17, #18, #19 and #20 are closed/completed.
- The Phase 4 hosted baseline main SHA is `522e984fc3a48a6ae2e8c763706724f1c1051e3b`; Phase 5 quality-gate repair is recorded by subsequent repository history.
- Ruleset `20437452` is Active for `refs/heads/main` with exactly seven Required contexts: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)` and `CI Policy v1`.
- Local acceptance after the Phase 5 repair slice passed CI Contract `85/85`, `ci:validate`, server/client tests, client lint and client production build. Security baseline findings remain Advisory, and staging/deployment remains deferred under ADR-011.
