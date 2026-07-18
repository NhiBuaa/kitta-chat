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


