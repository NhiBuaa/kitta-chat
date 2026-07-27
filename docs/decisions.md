# Technical Decisions Log

This file is an append-only log of important technical decisions in this project.

Rules:

- Append new decisions at the bottom.
- Do not rewrite or delete previous decisions.
- If a decision changes, add a new entry that supersedes the older one.
- Keep each entry short: decision, why, consequences, and references.

## 2026-07-05 — MongoDB remains the durable source of truth

**Decision**: Use MongoDB as the durable source of truth for users, messages, friendships, groups, files, calls, and migration read models.

**Why**: The existing backend and data model are already centered around Mongoose/MongoDB, and Redis/RabbitMQ are intentionally infrastructure helpers rather than durable ownership layers.

**Consequences**:

- Redis misses must be recoverable from MongoDB.
- RabbitMQ workers may process side effects but must not become the authoritative state owner.
- Migration work must preserve MongoDB-backed legacy behavior until an explicit switch is approved.

**References**: `README.md`, `PROJECT-CONTEXT.md`, `.agents/current-session.md`.

## 2026-07-05 — Socket.IO is the realtime interaction path

**Decision**: Use Socket.IO for realtime chat delivery, presence, typing indicators, friendship updates, group updates, and WebRTC signaling.

**Why**: The product is a realtime chat/calling platform, and Socket.IO provides the existing event path used by both client and server.

**Consequences**:

- Socket event names and payload shapes are client contracts.
- Changes to Socket.IO rooms or payloads require explicit migration scope.
- Redis adapter support must remain compatible with Socket.IO fan-out.

**References**: `README.md`, `docs/SOCKET_IO_SCALING.md`, `PROJECT-CONTEXT.md`.

## 2026-07-05 — Redis is cache and coordination only

**Decision**: Use Redis for cache, Socket.IO adapter support, presence/cache mirrors, recent conversation ordering, and short-lived coordination state.

**Why**: Redis improves realtime performance and cross-replica coordination, but durable state must remain recoverable from MongoDB.

**Consequences**:

- Redis keys must remain namespaced away from Socket.IO adapter internals.
- Cache miss paths need MongoDB warm-up/fallback behavior.
- Redis must not become the source of truth for sidebar, friendship, presence, or call state.

**References**: `README.md`, `PROJECT-CONTEXT.md`, `server/src/services/conversationCacheService.js`.

## 2026-07-05 — RabbitMQ is background-only

**Decision**: Use RabbitMQ as a background side-effect bus for image/avatar processing, notifications/email, and audit/statistics jobs.

**Why**: These tasks should not block user-facing request/socket paths and need retry/DLQ-style processing.

**Consequences**:

- RabbitMQ workers should preserve correlation/request identifiers where available.
- User-facing flows should not depend on RabbitMQ becoming the durable owner of business state.
- Migration work must not move chat/sidebar authority into RabbitMQ.

**References**: `README.md`, `docs/RABBITMQ_WORKER_FLOWS.md`, `PROJECT-CONTEXT.md`.

## 2026-07-05 — nginx and Docker Compose are the default full-stack runtime

**Decision**: Run the full system through Docker Compose with nginx as the reverse proxy for frontend, REST APIs, Socket.IO, and operational endpoints.

**Why**: The project has multiple services — client, backend replicas, MongoDB, Redis, RabbitMQ, and workers — and Compose gives a reproducible local/reviewer runtime.

**Consequences**:

- Local manual verification should account for container environment variables, not host shell variables.
- nginx routing and WebSocket upgrade behavior are part of runtime correctness.
- Docker Compose overrides are the safe way to test local migration flags.

**References**: `README.md`, `docker-compose.yml`, `docker-compose.dev.yml`, `docs/DEPLOYMENT_AND_SMOKE_TESTS.md`.

## 2026-07-05 — Preserve memory-only frontend auth with HttpOnly refresh-cookie recovery

**Decision**: Keep frontend auth state memory-only and rely on HttpOnly refresh-cookie session recovery.

**Why**: This reduces token exposure in browser storage while still allowing session recovery after refresh.

**Consequences**:

- Auth bootstrap and retry flows must be preserved when changing client API/socket behavior.
- Avoid storing long-lived credentials in localStorage/sessionStorage.
- Backend cookie/session behavior is part of the auth contract.

**References**: `README.md`, `PROJECT-CONTEXT.md`, `client/src/services/auth`.

## 2026-07-05 — Keep `Message.conversationId` as the public conversation bridge

**Decision**: Keep legacy `Message.conversationId` as the public/socket/cache bridge during the Conversation Read Model migration.

**Why**: Existing REST APIs, Socket.IO rooms/payloads, Redis conversation cache keys, direct chat ids, and group conversation ids already depend on it.

**Consequences**:

- `Conversation._id` must remain backend-internal until an explicit contract change is approved.
- Sidebar/search/client payloads must not be switched to `Conversation._id` accidentally.
- Migration services must map through `legacyConversationId`.

**References**: `.agents/current-session.md`, `server/src/models/Message.js`, `server/src/models/Conversation.js`.

## 2026-07-05 — Conversation Read Model migration proceeds by guarded slices

**Decision**: Build the Conversation Read Model through small, testable migration slices: models, service, helpers, dry-run, manual backfill, guarded dual-write, shadow compare, then eventual read switch.

**Why**: Sidebar/message behavior is user-facing and already has legacy Redis/MongoDB dependencies, so a big-bang switch would be risky.

**Consequences**:

- Runtime remains legacy-authoritative until shadow compare and reconciliation produce confidence.
- Each migration slice must have explicit non-goals.
- Dual-write and read-switch behavior must be flag-guarded and disabled by default unless explicitly approved.

**References**: `.agents/current-session.md`, `.agents/next-session.md`.

## 2026-07-05 — Backfill write is manual-only and defaults to dry-run

**Decision**: Keep Conversation Read Model backfill as an explicit manual operation, with dry-run as the default and write mode requiring `--write`.

**Why**: Backfill changes persistent read-model data and should not run accidentally during server startup or normal runtime.

**Consequences**:

- No startup hook should run backfill automatically.
- Operators can inspect dry-run summaries before writing.
- Write backfill must remain idempotent and safe to re-run.

**References**: `.agents/current-session.md`, `server/scripts/backfillConversations.js`, `server/src/services/conversationBackfillWrite.js`.

## 2026-07-05 — Dual-write starts only on confirmed socket message persistence

**Decision**: The first runtime dual-write hook updates the Conversation Read Model only after confirmed socket message persistence, behind `CONVERSATION_DUAL_WRITE_ENABLED=false` by default.

**Why**: Socket message persistence is the narrowest high-value write path to validate read-model updates without switching reads or changing client behavior.

**Consequences**:

- Duplicate/idempotent retries must not double-increment unread state.
- Read-model errors are logged/swallowed so legacy message persistence continues.
- REST message, system message, call-log, and group lifecycle paths remain outside this slice until explicitly expanded.

**References**: `.agents/current-session.md`, `server/src/utils/saveMessageInBackground.js`, `server/src/services/conversationReadModelService.js`.

## 2026-07-05 — Use partial unique indexes instead of unique sparse indexes for nullable direct/group fields

**Decision**: Use partial unique indexes for `Conversation.directKey` and `Conversation.groupId`, and omit non-applicable fields instead of storing `null`.

**Why**: MongoDB unique sparse indexes still index fields that exist with `null`, which caused duplicate-key failures for multiple direct conversations with `groupId: null`.

**Consequences**:

- Direct conversations must omit `groupId`.
- Group conversations must omit `directKey`.
- Local dev databases with old indexes may require manual index cleanup/rebuild.

**References**: `.agents/current-session.md`, `server/src/models/Conversation.js`, `server/src/services/conversationReadModelService.js`.

## 2026-07-05 — Shadow compare must be read-only before sidebar read switch

**Decision**: Add shadow compare before switching sidebar/search reads to the Conversation Read Model.

**Why**: Legacy direct and group sidebar flows derive state differently from the read model, especially for friends without messages, group membership, and unread semantics.

**Consequences**:

- Shadow compare should log/report mismatches only.
- Client responses must remain unchanged during shadow compare.
- Sidebar read switch should wait until mismatch causes are understood and reconciled.

**References**: `.agents/current-session.md`, `.agents/next-session.md`.

## 2026-07-14 — Message Shared Links Optimization (ADR-004)

**Decision**: Lưu trữ links dạng `{ url, hostname }` được tiền xử lý và chuẩn hóa hostname về chữ thường bằng Node.js `new URL()` parser khi tạo tin nhắn, kết hợp index `{ conversationId: 1, hasLink: 1, _id: -1 }`.

**Why**: Để tránh việc quét Regex rất chậm trên trường `text` của collection `Message` khi tải panel và đảm bảo query Shared Links đạt tốc độ $O(1)$ database round-trips.

**Consequences**:
* Tốc độ truy vấn Shared Links tối ưu tối đa.
* URL không hợp lệ được bỏ qua một cách lặng lẽ và không làm gián đoạn luồng lưu tin nhắn.

**References**: `docs/adr/004-message-shared-links-optimization.md`, `specs/active/conversation-information-panel.md`.

## 2026-07-14 — Conversation Panel Two-Stage Loading & Architecture Invariants (ADR-005)

**Decision**: Triển khai Conversation Panel bằng API Two-Stage Loading bất đồng bộ (Metadata trước, Resources sau) và bảo chứng 10 quy tắc Architecture Invariants.

**Why**: Để tối ưu độ trễ cảm nhận của người dùng (perceived latency) và giữ cho hệ thống dễ bảo trì, có khả năng scale cao khi mở rộng các domain dịch vụ nghiệp vụ.

**Consequences**:
* Tải metadata cực kỳ nhanh và hỗ trợ ETag loại trừ Presence.
* Resources tải song song qua `Promise.allSettled()` với timeout 2 giây và JSON Error Contract riêng biệt cho từng loader.
* Đảm bảo tính cô lập của các loaders, không chia sẻ mutable state, và Action Domain chỉ làm Orchestrator.

**References**: `docs/adr/005-conversation-panel-two-stage-loading.md`, `specs/active/conversation-information-panel.md`.

## 2026-07-18 — View All Modals Client Architecture (ADR-006)

**Decision**: Triển khai tính năng Xem tất cả bằng kiến trúc phân tách hạ tầng, nghiệp vụ và tách biệt Realtime concern:
- **ViewAllModalShell:** Component hạ tầng dùng chung chịu trách nhiệm về Portal, Backdrop, đóng mở bằng phím `Escape`, click backdrop, focus trap, animation và scroll container. Nó cung cấp `scrollRef` của Scroll Container. Giao diện được thiết kế dạng **Centered Modal** (hộp thoại căn giữa) và hỗ trợ prop `size` (`"normal" | "wide" | "fullscreen"`) để giới hạn chiều rộng linh hoạt theo loại tài nguyên (ví dụ: Media dùng `wide`, File/Link dùng `normal`). Trên mobile, modal tự động co dãn chiếm toàn màn hình (fullscreen).
- **4 Explorer Component độc lập:** `MediaExplorer`, `FilesExplorer`, `LinksExplorer`, `CommonGroupsExplorer`. Mỗi Explorer chịu trách nhiệm fetch dữ liệu, quản lý cursor pagination riêng, xử lý empty/error states và hiển thị UI đặc thù.
- **Tách biệt MediaLightbox:** Thiết kế component `MediaLightbox` riêng biệt. `MediaExplorer` quản lý state `{ selectedMedia }` (kiểu đối tượng hỗ trợ mở rộng) và truyền xuống `MediaLightbox` để hiển thị ảnh to, overlay, backdrop, close button, và lắng nghe phím `Escape`.
- **Quy tắc phím Escape (ESC Blocker):** Khi `MediaLightbox` đang mở, bấm phím `Escape` chỉ đóng Lightbox, không đóng `ViewAllModalShell` (thực hiện bằng cách kiểm tra sự hiện diện của lớp hoạt động như `media-lightbox-active` trong DOM trước khi kích hoạt hàm đóng của Shell).
- **Cơ chế Đồng bộ & Realtime:** Sử dụng phương thức **Snapshot + Freshness Notification**. Dữ liệu trong Explorer là snapshot tĩnh. Khi có tài nguyên mới qua socket, hiển thị banner thông báo. Click banner sẽ làm mới (reset cursor, refetch và tạo snapshot mới).
- **Trừu tượng hóa Socket & So khớp:** Tách biệt hoàn toàn phần realtime ra khỏi các Explorer bằng Custom Hook `useExplorerFreshness`. Đồng thời, cô lập logic so khớp tin nhắn thành các utility function thuần khiết (pure functions):
  - `belongsToConversation(message, conversationId, currentUserId)`
  - `matchesMedia(message)`
  - `matchesFile(message)`
  - `matchesLink(message)`
- **Custom Hook Phân Trang Dùng Chung (useInfiniteScroll):** Thiết kế custom hook generic `useInfiniteScroll({ enabled, hasMore, isFetching, onLoadMore, rootRef })` để quản lý IntersectionObserver, sử dụng `rootRef.current` là scroll container của Shell, tích hợp cơ chế đồng bộ `isFetchingRef` làm khóa cứng (lock) để triệt tiêu hoàn toàn rủi ro duplicate fetch.

**Why**: Tuân thủ nguyên tắc Single Responsibility Principle (SRP), Separation of Concerns và bảo toàn tính bất biến của con trỏ (Cursor Invariant). Thiết kế Centered Modal với tham số `size` giúp tối ưu hóa không gian hiển thị cho các Explorer khác nhau (như Media cần màn ngang rộng để xếp lưới grid) đồng thời tạo ra một Shell generic có tính tái sử dụng cao.

**Consequences**:
* Giữ cho `ViewAllModalShell` thuần túy về mặt giao diện/hạ tầng, hoàn toàn độc lập với nghiệp vụ.
* Mỗi Explorer tự kiểm soát hoàn toàn state hiển thị của mình và không trực tiếp gọi socket.
* Tránh rò rỉ bộ nhớ, duplicate event listeners, duplicate key hay duplicate fetch.
* Cho phép viết test đơn vị cực kỳ dễ dàng cho các hàm utility so khớp.

**References**: `specs/active/view-all-modals.md`, `client/src/services/api/conversationPanelApi.js`.

## 2026-07-22 — Conversation Panel Resource Preview Limits & View All Trigger

**Decision**: Quy định giới hạn phân vùng số lượng hiển thị xem trước (Preview Limits) ở Conversation Panel và điều kiện kích hoạt nút Xem tất cả:
1. **Backend Panel Controller Limits (`GET /api/conversations/:id/panel/resources`):**
   - Media (Ảnh / Video): `limit = 6`
   - Files (Tài liệu): `limit = 3`
   - Links (Liên kết): `limit = 3`
   - Membership - Common Groups (Nhóm chung cho Chat 1-1): `limit = 3`
   - Membership - Members Preview (Thành viên cho Nhóm Chat): `limit = 5`
2. **Client Panel Display & Trigger:**
   - Client hiển thị đúng số lượng items trả về từ Backend API.
   - Nút "Xem tất cả" được hiển thị bất cứ khi nào phần tài nguyên có ít nhất 1 mục (`items.length > 0`), cho phép người dùng mở View All Modal Shell để xem giao diện phân trang toàn màn hình với `limit = 20`.

**Why**: Tối ưu dung lượng response của Resources API, tránh query thừa dữ liệu không cần thiết từ DB/Redis, đồng thời mang lại bố cục Panel nhỏ gọn, cân đối ở Sidebar phải trước khi người dùng cần mở Modal xem toàn bộ.

**Consequences**:
- Controller gửi `limit` chuyên biệt tương ứng từng scope tới `ResourceService`.
- Giảm tải DB I/O khi nạp tài liệu, liên kết và nhóm chung trong giai đoạn 2 (Resources Loading).
- Giao diện Panel đồng nhất và tinh gọn.

**References**: `server/src/controllers/conversationPanelController.js`, `client/src/features/chat/components/ConversationPanel.jsx`, `docs/adr/005-conversation-panel-two-stage-loading.md`.

## 2026-07-25 — Separate CI Quality Gates With a Repository-Level Contract

**Decision**: Mở rộng CI/CD bằng các GitHub Actions check tách biệt. Server Tests, Client Tests, Client Production Build, Client Lint và Docker Image Build Validation là Required Quality Gates và phải được cấu hình làm merge blockers. Dependency vulnerability, security/SAST, secret và license scans là Advisory Checks trong K2: chúng phải cung cấp quality signals cho reviewer nhưng chưa chặn merge vì có thể còn baseline findings hoặc false positives. Thêm một repository-level CI Contract validator có một public CLI interface để kiểm tra trigger, required command coverage, Docker build targets và README badge linkage. Optional Staging Deployment trong K2 được ghi nhận là **Deferred Capability — Pending Infrastructure Availability** vì hiện chưa có staging target thực tế; không tạo placeholder/readiness-only workflow, không dùng `BLOCKED_BY_*` wording, và CD thật sẽ mở lại như K2.1 hoặc hạng mục tương đương khi có target. Việc nâng các phát hiện mới mức `Critical`/`High` thành merge blockers được hoãn đến một quyết định hậu K2 sau khi baseline và policy được phê duyệt.

**Why**: Các workflow tests/build hiện có đã cung cấp bằng chứng tốt nhưng chưa bảo vệ lint hoặc Docker packaging. Một CI Contract nhỏ ở seam cấp repository tạo locality cho các invariant pipeline và cho phép test RED → GREEN mà không rải assertions theo từng workflow. Tách check theo trách nhiệm giúp lỗi dễ định vị, trong khi giữ security scan advisory tránh làm toàn bộ pipeline đỏ vì pre-existing dependency findings chưa được triage.

**Alternatives Considered**:

- Gộp mọi bước vào một workflow/job duy nhất: bị loại vì làm giảm khả năng định vị lỗi và tạo badge/check quá thô.
- Chỉ dựa vào workflow execution, không có CI Contract test: bị loại vì việc vô tình xóa trigger/job/badge contract khó được phát hiện cục bộ trước khi push.
- Cho dependency audit chặn merge ngay: bị hoãn cho đến khi có baseline severity và remediation policy.
- Build/push image trong pull request: bị loại vì yêu cầu registry credentials và mở rộng quyền không cần thiết.
- Loại staging khỏi K2: bị loại vì milestone là CI/CD, nên K2 cần có Initial CD Capability tối thiểu.
- Biến staging thành Full CD: bị loại vì production deployment, rollback automation, progressive delivery, environment promotion và release orchestration thuộc milestone sau.
- Dùng nhãn `BLOCKED_BY_INFRASTRUCTURE` cho staging: bị loại vì tạo cảm giác K2 chưa hoàn thành dù Optional Staging Deployment không nằm trong Completion Criteria.
- Tạo staging readiness/checklist workflow khi chưa có target: bị loại vì không deploy artifact, không kiểm chứng runtime và không tạo confidence mới.

**Consequences**:

- Pull request nhận các check có tên ổn định và trách nhiệm rõ ràng.
- Basic CI không cần `.env` local, MongoDB, Redis, RabbitMQ hoặc external-provider secrets.
- Docker validation chỉ chứng minh image construction, không chứng minh runtime integration.
- CI Contract validation không thay thế GitHub Actions execution hoặc repository branch protection/ruleset.
- README chỉ được hiển thị badge phản ánh workflow thực và không được claim staging/security guarantees vượt quá evidence.
- Required check names phải được cấu hình trong GitHub repository ruleset trước khi completion criterion “không merge khi check fail” được coi là đạt đầy đủ.
- Advisory Checks vẫn phải xuất hiện rõ ràng trong GitHub Actions, nhưng kết quả của chúng không được làm pull request mất trạng thái green trong K2.
- Một slice hậu K2 có thể chuyển các phát hiện mới mức `Critical`/`High` thành merge blockers sau khi baseline findings và false positives đã được xử lý.
- Optional Staging Deployment được ghi nhận là **Deferred Capability — Pending Infrastructure Availability**, không phải blocker và không nằm trong Completion Criteria của K2.
- K2 hoàn thành khi toàn bộ Required Quality Gates pass và Advisory Checks chạy/hiển thị trong GitHub Actions.
- Khi có staging target thực tế, deployment sẽ được xử lý như K2.1 hoặc hạng mục mở rộng tương đương, không phải “hoàn tất phần còn thiếu” của K2.

### Multi-Workflow Structure

- K2 uses five responsibility-aligned workflows: `tests.yml`, `build.yml`, `quality.yml`, `docker.yml` and `security.yml`.
- Tests, Build, Quality and Docker contain Required Quality Gates; Security contains Advisory Checks and is excluded from required branch-protection checks.
- Shared Node + npm setup is centralized in the local composite action `.github/actions/setup-node-env` with required inputs `working-directory` and `cache-dependency-path`.
- The composite action owns `setup-node@v4` and `npm ci`, applies the working directory consistently, and uses the exact server/client lockfile path for cache separation.
- Each workflow caller repeats `actions/checkout` before invoking the composite action.
- A repository-local composite action cannot replace the caller's initial checkout step because its `action.yml` is unavailable until the repository has been checked out.
- No reusable workflow is created for environment setup; it would not share the caller job's filesystem state for a setup-then-run sequence.
- `docker.yml` is an explicit exception and does not call `.github/actions/setup-node-env`; it checks out the repository and builds Docker images directly because the image build owns its isolated `npm ci` environment.
- Docker validation uses `docker/build-push-action` with two independent Required jobs, `build-server` and `build-nginx`, targeting `linux/amd64`. Both set `push: false`, `load: false` and plain progress output; no registry login or Docker secret is used.
- Branch protection requires both Docker check names, `Docker Build (server)` and `Docker Build (nginx)`.
- `main` uses a GitHub Ruleset rather than classic branch protection. It requires pull requests and exactly six job-level checks: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)` and `Docker Build (nginx)`.
- Advisory job names are explicitly excluded. Ruleset configuration references check run/job names, not workflow filenames, to avoid accidentally making `ci-contract` or `security.yml` jobs merge blockers.
- All external GitHub Actions are pinned to full immutable commit SHAs with adjacent version comments. Mutable tags/branches are rejected by the CI Contract.
- Dependabot monitors the `github-actions` ecosystem weekly and proposes SHA updates through normal pull requests; Dependabot changes receive no bypass from Required or Advisory checks.
- README exposes this as a deliberate supply-chain decision and links to a dedicated CI/CD ADR created after the design is fully approved.
- The CI/CD design is captured in five ADRs that can be superseded independently: `ADR-007` for workflow decomposition/Required-Advisory boundary/atomic Ruleset activation; `ADR-008` for the CI Contract rule model; `ADR-009` for security scanning strategy; `ADR-010` for supply-chain and permissions; and `ADR-011` for the K2/K2.1 staging-CD boundary.
- README points to a stable ADR index, not directly to one physical CI/CD ADR. A future decision outside those boundaries receives a new ADR rather than being folded into an unrelated existing record.
- All five workflows group concurrency by workflow and ref. `cancel-in-progress` is true only for pull-request events; `main` push runs are retained to preserve a complete integration audit trail and avoid creating a dangerous cancellation default for future deployment work.
- All five workflows limit `pull_request` and `push` triggers to `main`; Security alone adds the weekly schedule. `pull_request_target` and special draft-PR event handling are excluded from K2.
- Client lint baseline on `2026-07-27` found `1662` findings with generated `.vite-cache` included and `17` real errors after excluding that cache. K2 must explicitly decide remediation scope before Client Lint can become a Required Quality Gate.
- K2 separates workflow readiness from enforcement. Readiness PRs first introduce shared setup/tests/build, Quality, Docker and Security workflows without changing the Ruleset; Security remains advisory and may be sequenced flexibly among those workflow PRs.
- The dedicated lint remediation PR runs only after the real `Client Lint` job exists: ignore only generated `.vite-cache/**`, fix all 17 real errors without rule suppression, and use TDD regression tests for the two React hook correctness bugs. The GitHub check, not manual-only verification, must confirm the remediation.
- Ruleset activation occurs exactly once after all six Required check names have run and been observed. That atomic activation requires all six together rather than gradually creating a partially protected `main` branch.
- Client Lint starts with `--max-warnings=13`: zero errors are required and warning count cannot increase. The budget is owned only by `client/package.json`; optional root scripts delegate through `npm --prefix client` and do not repeat the number. The baseline is documented rather than hidden, and a separate follow-up reduces it toward zero with behavior-aware regression testing.
- This corrects the earlier proposal to define the budget in root `package.json`, which does not own ESLint configuration or dependencies.
- The CI Contract separates host-side setup coverage from Docker build isolation and verifies that Dockerfile Node base versions stay synchronized with the host runtime.
- Node version has one canonical source, preferably `.nvmrc`; the composite action/workflows read it and Dockerfile base-image versions are validated against it.
- `.nvmrc` is `22` major-only rather than full semver. This matches the current `node:22-alpine` convention, accepts patch/minor security updates, and avoids pretending host and Alpine image patch resolution are identical. Resolved Node versions are logged with `node --version` for traceability.
- Confirmed scope: `server/Dockerfile` and the Node build stage in `nginx/Dockerfile` are included in Node major-version drift validation. `client/Dockerfile` exists but is development-only and is outside K2 production Docker validation, so it is excluded from this contract.
- Drift validation reads `.nvmrc`, parses `FROM node:X` using shell tooling, compares major versions and fails on mismatch; it does not call host-side `setup-node-env`.
- CI Contract uses the root `yaml` npm package for workflow parsing; README badge validation is a separate Markdown-based mechanism. Because the root repository has its own `package-lock.json`, a CI Contract job must install root dependencies rather than relying on client/server dependency trees.
- `quality.yml` contains `client-lint` as a Required Quality Gate and `ci-contract` as an independent Advisory Check. `ci-contract` uses the root dependency tree and `client-lint` uses the client dependency tree; their check names remain separate.
- `ci-contract` is excluded from K2 branch-protection required checks and may be promoted only after stability evidence is collected.
- Root CI tooling exposes two commands rather than one wrapper: `test:ci` for fixture-based `node:test` coverage and `ci:validate` for real repository validation. `quality.yml` runs them sequentially in the advisory `ci-contract` job.
- CI Contract uses three distinct rule classes. Closed contract rules compare approved triggers, permissions, concurrency, command/setup contracts, immutable action SHAs and the six Required check names exactly. Global deny rules independently reject `continue-on-error: true`, `pull_request_target` and mutable action references everywhere. The extension surface remains open for safe steps and new advisory security jobs that do not violate either rule class, reuse a Required check name or alter a Required check's outcome contract.
- Advisory job names are not a closed list. This keeps the validator focused on stable interfaces rather than internal step inventories and allows security coverage to expand without adding a validator exception for every new advisory job.
- Advisory jobs do not use `continue-on-error: true`. They are allowed to fail visibly; branch protection alone determines merge blocking by requiring only Server Tests, Client Tests, Client Build, Client Lint and Docker Build Validation.
- Workflow permissions follow least privilege: ordinary workflows and security jobs default to `contents: read`; only CodeQL and Gitleaks SARIF upload jobs receive `security-events: write`, with CodeQL also receiving `actions: read`. No workflow uses `write-all`, `contents: write` or `pull_request_target`.
- The earlier assumption that Gitleaks SARIF was safe to upload directly was rejected. `secret-scan` uses `--redact=100` and then a repository-owned whitelist sanitizer that creates a new SARIF document containing only rule IDs, safe location coordinates and fingerprints.
- Raw/sanitized SARIF content is never printed. Sanitization and upload use `if: always()` so findings can reach Code Scanning after Gitleaks exits `1`, while the job still fails truthfully for a finding or sanitizer error and never uses `continue-on-error`.
- Scan and sanitize always run, but Gitleaks SARIF upload is conditional: push, schedule and same-repository pull requests upload; fork pull requests skip only the upload because their token is read-only. Findings still fail the job, and no write-token escalation or `pull_request_target` is used.
- A future K2.x external-contributor enhancement may use a `workflow_run` artifact handoff if fork PR Security-tab uploads become valuable.
- The sanitizer is a dependency-free CommonJS module at `scripts/ci/sanitizeGitleaksSarif.cjs`, with pure-function `node:test` coverage and a CLI wrapper.
- `secret-scan` calls SHA-pinned `actions/setup-node` directly with `.nvmrc` and skips `npm ci`; this is an explicit locality exception because the sanitizer uses only Node built-ins. Docker remains the other workflow that intentionally skips `setup-node-env`.
- This keeps CI outcome truthful and separates failure reporting from merge policy; README or contributor documentation must explain the distinction so a visible Advisory failure is not mistaken for a merge blocker.
- Dependency scanning starts with `npm audit --audit-level=high` for root, client and server lockfile trees. The threshold is intentionally an initial K2 policy and may be lowered after real CI noise is evaluated; OSV-Scanner/Dependabot expansion is deferred.
- The dependency scan uses three parallel jobs — `root-audit`, `client-audit` and `server-audit` — rather than one sequential job. This preserves independent observability and truthful failure for every dependency tree without `continue-on-error`; all three remain outside required checks.
- License scanning uses `license-checker-rseidelsohn` in three parallel jobs — `root-license-scan`, `client-license-scan` and `server-license-scan` — for full root/client/server baselines. The initial allowlist is `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC` and `0BSD`; out-of-policy licenses fail visibly and require explicit review. GitHub dependency review is not the primary mechanism because it focuses on PR dependency changes rather than the complete baseline.
- CodeQL is the K2 SAST tool for `javascript-typescript`, with pull request, `main` push and weekly schedule triggers. It uploads findings to GitHub code scanning and remains outside required checks.
- `security.yml` schedule is `0 3 * * 1` (Monday 03:00 UTC / 10:00 Vietnam time); scheduled runs retain their full audit history.
- `codeql-analysis` fails only when init/build/analyze has a technical failure. Detected security alerts remain Advisory findings and do not fail the job in K2; no custom SARIF parser or severity threshold is added.
- CodeQL uses `build-mode: none` for `javascript-typescript`, with no autobuild or client/server build step. This keeps the SAST signal focused on source analysis; application build correctness remains covered by the separate Required Quality Gate.
- A future milestone may promote new Critical/High CodeQL alerts into a failure gate after false-positive behavior and severity mapping have been observed on this repository.
- Gitleaks is the K2 secret scanner because it provides static repository/history scanning without verified-secret network calls. `secret-scan` remains advisory, fails truthfully and is excluded from required checks; TruffleHog verified mode is deferred.
- The repository currently has `client/.env.example` and `server/.env.example`, no tracked Google/AWS/private-key-shaped values in the preliminary scan, and several synthetic MongoDB URI shapes in committed config/scripts/tests.
- Before `.gitleaks.toml` is finalized, Gitleaks scans the full repository and Git history. Exceptions are limited to exact regex/fingerprint matches for confirmed synthetic findings, each with a documented reason. Path-level exclusions for `.env.example`, `server/test/**`, `client/**/test/**` or equivalent broad locations are forbidden.
- New baseline findings require explicit false-positive verification before an exception is added; the implementation never auto-allows an unknown finding.
- Each in-scope Node builder stage also runs `RUN node --version` before the final runtime stage. Static `FROM node:X` validation checks the declared major; the runtime log records the resolved version for that build, so the two mechanisms are complementary.
- README can expose workflow-specific badges, while branch protection must reference stable required check/job names rather than assuming workflow filenames are the status-check identifiers.
- README displays five badges — Tests, Build, Quality, Docker and Security — and does not hide the Security badge when Advisory jobs fail. Security badge copy explains the non-blocking policy and links to workflow/security details; `ci-contract` has no separate badge because it is included in `quality.yml`.
- `docs/adr/README.md` is the stable ADR lifecycle index linked from the project README. It initially lists `ADR-007` through `ADR-011` as `Planned`; after grilling, each row becomes a link to its accepted physical ADR. `docs/decisions.md` remains a chronological evidence log rather than a mutable status table.
- The `main` Ruleset requires pull requests with zero required approvals, conversation resolution enabled, and Code Owner review, stale-approval dismissal and most-recent-push approval disabled. Zero approvals avoids an unusable self-approval requirement in a solo repository while PR history and six required checks remain enforceable.
- The Ruleset bypass list is empty for every actor, including administrators. An emergency relaxation must be an explicit, auditable Ruleset change rather than a silent bypass path.
- The `main` Ruleset requires pull-request branches to be up to date before merge for all six Required status checks. This prevents stale independently-green PR states from merging without validation against current `main`; advisory checks are intentionally excluded from the requirement.

## 2026-07-27 — Final K2 CI/CD Governance Consensus

- Architecture stress-review completed with `GOVERNANCE_CONSENSUS_COMPLETE`.
- Required checks are seven, adding versioned `CI Policy v1` to the six product/build checks. Security remains Advisory.
- CI Policy uses a fixed-SHA reusable baseline, dual candidate/policy validation and versioned policy migration; same-repo caller mutability is an explicit solo-repository residual risk.
- Ruleset activation, behavior verification, bounded rollback, merge policy and `Contributor Mode Entry` follow ADR-007 and ADR-008.
- Security, supply-chain/permissions and staging boundaries follow ADR-009 through ADR-011.
- `main` is protected with a GitHub Ruleset, not classic branch protection. The ruleset requires pull requests and exactly six job-level checks: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)` and `Docker Build (nginx)`.
- Advisory jobs are deliberately omitted. Ruleset configuration occurs only after GitHub has observed the exact check run names, preventing workflow-level naming from accidentally making `ci-contract` or `security.yml` jobs required.
- Full Continuous Delivery được ghi rõ là ngoài phạm vi K2.

**References**: `specs/active/github-actions-ci-cd.md`, `.github/workflows/tests.yml`, `.github/workflows/build.yml`, `README.md`.



