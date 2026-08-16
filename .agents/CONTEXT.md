# Current Project

KittaChat — realtime chat and calling platform.

The project provides direct messaging, group messaging, presence, friendships, file/avatar uploads, and audio/video calling with background workers for side effects.

## Architecture

Frontend: React 19, Vite, Tailwind CSS, Socket.IO Client, WebRTC APIs.

Backend: Node.js, Express 5, Socket.IO 4, Mongoose, JWT, Firebase Admin SDK.

Database: MongoDB.

Cache / Coordination: Redis for Socket.IO adapter support, presence/cache, recent conversation cache, and short-lived coordination mirrors.

Background Jobs: RabbitMQ workers for image/avatar processing, notification/email jobs, and audit/statistics jobs.

Reverse Proxy / Runtime: nginx and Docker Compose.

## Current Priorities

- Preserve MongoDB as the durable source of truth.
- Preserve legacy `Message.conversationId` as the public/socket/cache bridge.
- Continue Conversation Read Model migration in small, testable slices.
- Keep sidebar/search legacy-authoritative until shadow compare and reconciliation are trusted.
- Keep Redis as cache/coordination only.
- Keep RabbitMQ background-only.
- Avoid exposing backend-internal `Conversation._id` to clients.

## Language

**Conversation Read Model**:
A backend read model for conversations and per-user conversation state, represented by `Conversation` and `ConversationParticipant`.
_Avoid_: treating it as the current source of truth before a read-switch slice is approved.

**Legacy Conversation Id**:
The existing public identifier carried by `Message.conversationId`, Socket.IO rooms/payloads, and Redis conversation cache keys.
_Avoid_: replacing it with `Conversation._id` in client-visible contracts.

**Conversation Participant**:
A per-user row of conversation state such as unread count, last visible message, archive state, mute state, delete state, and membership timing.
_Avoid_: using it as a replacement for `Group.members` before group lifecycle integration is complete.

**Dual-Write**:
A guarded migration path that updates the Conversation Read Model after confirmed legacy message persistence.
_Avoid_: enabling it by default or using it to change client behavior directly.

**Shadow Compare**:
A read-only migration safety step that compares legacy sidebar output with read-model candidates and only logs or reports mismatches.
_Avoid_: changing API responses, switching reads, or repairing data during shadow compare.

**Backfill**:
A manual migration operation that derives or writes read-model rows from existing legacy MongoDB data.
_Avoid_: automatic startup backfills or destructive index/data migrations without explicit approval.

**Conversation Panel**:
Một bảng điều khiển hiển thị thông tin tổng quan, tùy chỉnh preference, thành viên và các tài nguyên (media, file, link) đã chia sẻ trong một cuộc trò chuyện.
_Avoid_: tích hợp business logic trực tiếp vào Panel Service; chỉ sử dụng Panel Service làm Orchestrator.

**Two-Stage Loading**:
Cơ chế tải bất đồng bộ 2 giai đoạn: Giai đoạn 1 tải nhanh Metadata (Header, preferences, permissions) để hiển thị ngay lập tức; Giai đoạn 2 tải song song các tài nguyên nặng (Resources, membership preview) để hiển thị sau.

**Link Normalization**:
Quy trình tiền xử lý URL bằng URL parser của Node.js nhằm trích xuất chính xác hostname dưới dạng viết thường (lowercase) và loại bỏ các ký tự thừa để tránh trùng lặp liên kết chia sẻ.
_Avoid_: sử dụng các thuật toán Regex phức tạp để trích xuất hostname lúc truy vấn database.

**View All Modals**:
Các giao diện modal overlay hiển thị đầy đủ danh sách phân trang (phát triển mở rộng từ Panel) cho Shared Media, Files, Links và Common Groups.

**Explorer**:
Component nghiệp vụ độc lập chịu trách nhiệm fetch dữ liệu, quản lý cursor pagination riêng, xử lý empty/error states và hiển thị UI đặc thù cho từng loại tài nguyên.

**Freshness Notification**:
Banner thông báo độ tươi mới xuất hiện khi có tài nguyên mới khả dụng qua socket. Cho phép người dùng click để tải lại trang đầu (làm mới snapshot tĩnh của Explorer).

**ESC Blocker**:
Cơ chế điều phối sự kiện bàn phím phím Escape. Nếu bộ xem ảnh to (MediaLightbox) đang mở, nhấn ESC chỉ đóng Lightbox, không đóng Modal Shell.

**Resource Preview Limits**:
Quy định phân vùng số lượng hiển thị xem trước tài nguyên ở Conversation Panel: tối đa 6 cho Media, 3 cho Files, 3 cho Links, 3 cho Common Groups và 5 cho Members Preview. Nút Xem tất cả kích hoạt Modal phân trang đầy đủ.

**Required Quality Gate**:
Một deterministic GitHub check được cấu hình làm merge blocker. K2 hiện yêu cầu đúng bảy check: `Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)` và `CI Policy v1`; pull request chỉ được coi là xanh khi tất cả các gate này thành công.
_Avoid_: gọi một check là bắt buộc nếu repository ruleset/branch protection chưa yêu cầu check đó để merge.

**Advisory Check**:
Một GitHub check cung cấp quality signal cho reviewer nhưng không chặn merge trong K2, gồm dependency vulnerability, security/SAST, secret và license scans nếu được triển khai.
_Avoid_: trình bày Advisory Check như bằng chứng rằng repository không có vulnerability.

**Allowed Browser Origin**:
Một tuple scheme, host và port được cấu hình tường minh để credentialed REST và Socket.IO chấp nhận cùng một browser origin; policy đầy đủ nằm trong `.agents/rules/security-findings.md` và ADR-014.
_Avoid_: wildcard, phản chiếu origin của request, alias ngầm hoặc dùng Public App URL như một allowlist.

**Public App URL**:
Frontend base URL duy nhất dùng để tạo user-facing link như password-reset link, tách biệt với tập Allowed Browser Origin.
_Avoid_: giả định một public URL có thể đại diện cho mọi origin được phép trong development, Docker và deployment.

**Edge Rate Limit**:
Defense-in-depth tại nginx dựa trên network identity như client IP và state trong nginx shared memory; nó bảo vệ ingress trước khi request đến backend.
_Avoid_: gọi Edge Rate Limit là Redis-shared quota hoặc distributed backend enforcement.

**Distributed Application Rate Limit**:
Quota theo application identity và operation class, dùng Redis coordination để mọi backend replica nhìn thấy cùng counter và failure semantics.
_Avoid_: dùng replica-local counter, nginx shared-memory zone hoặc raw forwarded header làm bằng chứng về quota toàn cụm.

**Rate-Limit Actor Bucket**:
Bucket bắt buộc theo canonical verified actor trong phạm vi một rate-limit policy class; mọi protected operation thuộc cùng class phải tham gia bucket này.
_Avoid_: tạo actor bucket từ caller-supplied identity hoặc đưa resource/route vào key theo cách cho phép né actor-wide quota.

**Actor-Scoped Secondary Rate-Limit Bucket**:
Bucket bổ sung bind canonical actor với một route, resource, conversation hoặc callee cụ thể để giới hạn actor đó trên target; actor khác không consume cùng bucket.
_Avoid_: bỏ actor khỏi key rồi vẫn mô tả bucket là actor-scoped.

**Target-Wide Protection Bucket**:
Bucket aggregate cố ý gom traffic từ nhiều actors tới cùng account, resource hoặc target theo một threat model và fairness policy đã được duyệt.
_Avoid_: tạo target-wide bucket vô tình, hoặc dùng nó thay thế Rate-Limit Actor Bucket.

**Merge Blocker**:
Một Required Quality Gate được GitHub repository ruleset hoặc branch protection yêu cầu thành công trước khi merge.
_Avoid_: dùng thuật ngữ này cho workflow chỉ tồn tại trong repository nhưng chưa được cấu hình làm required check.

**Check Readiness**:
Trạng thái một GitHub check đã tồn tại, chạy được và có tên ổn định để chuẩn bị đưa vào Ruleset, nhưng hiện chưa chặn merge.
_Avoid_: gọi một readiness check là merge blocker trước Ruleset Activation.

**Ruleset Activation**:
Sự kiện bật chính sách bảo vệ `main` sau khi toàn bộ Required Quality Gate đã đạt Check Readiness; K2 đã thực hiện một lần cho đầy đủ bảy check.
_Avoid_: kích hoạt tăng dần từng check và mô tả `main` là đã được bảo vệ đầy đủ trong trạng thái trung gian.

**Quality Signal**:
Kết quả hiển thị cho reviewer để đánh giá rủi ro hoặc chất lượng nhưng không quyết định trạng thái merge trong K2.
_Avoid_: đồng nhất Quality Signal với Required Quality Gate.

**CI Contract**:
Tập hợp invariant pipeline đã được phê duyệt, được enforcement qua Required `CI Policy` và kiểm chứng bằng public repository commands.
_Avoid_: coi CI Contract tĩnh là sự thay thế cho việc workflow thực sự chạy trên GitHub Actions.

**Contributor Mode Entry**:
Điểm chuyển governance trước khi merge PR đầu tiên của người không phải sole maintainer hoặc cấp collaborator thứ hai quyền write trở lên.
_Avoid_: trì hoãn review approvals, CI authority và signing cho tới sau lần merge/cấp quyền đầu tiên.

**Closed Contract Rule**:
Một CI invariant phải khớp chính xác với chính sách đã duyệt; mọi sai lệch đều là contract regression.
_Avoid_: áp dụng cho toàn bộ implementation detail hoặc danh sách Advisory Check có thể mở rộng.

**Global Deny Rule**:
Một mẫu cấu hình bị cấm trong mọi workflow, kể cả job hoặc step được bổ sung sau này.
_Avoid_: coi deny rule là whitelist cấu trúc.

**Open Extension Surface**:
Phần CI được phép mở rộng mà không cần khai báo trước trong CI Contract, miễn không vi phạm Closed Contract Rule hoặc Global Deny Rule.
_Avoid_: dùng extension surface để đổi ngầm outcome của Required Quality Gate hoặc chiếm dụng tên required check.

**Docker Image Build Validation**:
Việc build các image production-relevant mà không push image, không deploy và không khởi động stateful runtime dependencies. Mục tiêu là phát hiện lỗi packaging trong pull request.
_Avoid_: gọi bước này là deployment hoặc full-stack smoke test.

**Staging Deployment**:
Initial CD Capability chỉ có giá trị khi deploy artifact hoặc revision thật sau khi CI trên `main` xanh và xác minh runtime bằng health check hoặc smoke test. Trong K2 hiện tại, vì chưa có staging target thực tế, nó được ghi nhận là **Deferred Capability — Pending Infrastructure Availability**.
_Avoid_: `BLOCKED_BY_*` wording, checklist-only workflow, simulated deployment, Full Continuous Delivery, production deployment, rollback automation hoặc environment promotion.

**Deferred Capability — Pending Infrastructure Availability**:
Nhãn dùng cho Optional Staging Deployment trong K2: một capability được chủ đích hoãn vì chưa có staging target thực tế, không phải blocker và không nằm trong Completion Criteria của K2.
_Avoid_: Blocked by infrastructure, missing CD, incomplete K2.

**Full Continuous Delivery**:
Năng lực release đầy đủ gồm production deployment, rollback automation, progressive delivery, environment promotion và release orchestration.
_Avoid_: đưa Full Continuous Delivery vào phạm vi K2.

**K4 Performance Evidence Run**:
Một benchmark run có dataset K4-owned sạch, workload `scenario:version` đã resolve, topology riêng và raw artifacts có inventory. Chỉ measurement phase mới tạo số liệu được publish.
_Avoid_: coi warm-up, dirty volume từ run trước hoặc một load test ad-hoc là performance evidence.

**K4 Workload Plane**:
Traffic business được đo từ containerized test runner qua nginx internal DNS đến backend; không gọi backend trực tiếp hoặc thêm Socket.IO routing/affinity chỉ cho benchmark.
_Avoid_: dùng observation access để tạo measured workload.

**K4 Observation Plane**:
Đường thu thập metrics, replica attribution và resource evidence trực tiếp từ các container K4-owned; nó không tạo workload và không cấp Docker-management privilege cho test runner.
_Avoid_: suy diễn SUT CPU từ tổng CPU host hoặc runner.

**K4 Qualification Flag**:
Một điều kiện không độc quyền giới hạn claim của completed measured run: `TARGET_NOT_REACHED`, `TOPOLOGY_NOT_EXERCISED`, `OBSERVATION_INCOMPLETE` hoặc `LOAD_GENERATOR_LIMITED`.
_Avoid_: dùng một overall pass/fail status để che latency evidence hợp lệ hoặc claim bị cấm.

**K4 Message Persistence Evidence**:
Evidence latency cho message persistence được derive từ delta của acknowledged-Mongo success
histogram snapshots trước và sau measurement window; quantile derive từ histogram phải được gắn
nhãn `histogram-derived`.
_Avoid_: mô tả histogram-derived quantile như exact per-sample percentile hoặc dùng warm-up vào delta.

**K4 Recipient-Delivery Evidence**:
Một correlated end-to-end evidence record bắt đầu ngay trước `sendMessage` emit và kết thúc khi
recipient nhận matched `getMessage`; duration dùng hai timestamp này trên cùng runner clock.
Acknowledgement `{ success, realId }` chỉ là validity gate và không mở rộng public callback contract.
_Avoid_: dùng acknowledgement timestamp làm latency endpoint hoặc thay `Message.conversationId` bằng
internal `Conversation._id`.

**K4 Delivery Qualification**:
Sample-level delivery eligibility và cross-replica eligibility là hai kết quả riêng. Một sample
cùng replica có thể hợp lệ cho end-to-end delivery nhưng không đủ điều kiện cross-replica; run-level
`TOPOLOGY_NOT_EXERCISED` chỉ được đặt khi complete measurement observation chứng minh toàn bộ measured
activity dùng đúng một replica.
_Avoid_: gán run-level flag chỉ vì một correlation cùng replica hoặc chỉ dựa trên topology inventory.

**K4 Measurement Fault Fixture**:
Một runner-only, allowlisted, measurement-phase fault injection dùng để tạo failure evidence có
kiểm soát cho K4 acceptance. Fixture không sửa workload snapshot, không đổi public runtime contract,
và failure opportunity không trở thành latency sample.
_Avoid_: dùng ad-hoc production fault, mở arbitrary workload mutation, hoặc bật fixture trong warm-up.

**K4 Source Inventory**:
Artifact persisted on disk that lists the retained source artifacts for one run. By default,
`source_inventory_sha256` is the SHA-256 of the complete exact persisted bytes of that artifact;
the verifier does not parse, reserialize, canonicalize, or normalize those bytes. A different
representation is valid only when an authoritative schema or contract defines it.

**K4 Bundle Inventory and Completion Marker**:
The bundle inventory hashes the source inventory, report, and declared derived artifacts but does
not hash itself or the non-inventoried `COMPLETED` marker. The marker records independent
`artifact_status`, `execution_outcome`, and `qualification_flags` axes plus both inventory
digests. Marker presence alone does not make every report claim eligible.

**K4 Report Claim Guardrail**:
A report claim is bounded by the recorded hardware limits, measured workload/topology scope,
source/profile/environment provenance, and raw-result artifacts. Claims cannot extrapolate beyond
that scope, and `scalable`, `high-performance`, or `production-ready` claims are not publishable
when the required provenance is incomplete.

**K4 Resource Coverage**:
Resource observation uses the half-open measurement window `[measurement_start, measurement_end)`.
The expected slot count is `ceil(duration / interval)`, including a final partial slot; every
required container needs at least one success and `successful / expected >= 0.90`.

**K4 Comparison Contract**:
Optimization comparisons allow only the declared treatment (with equivalent non-treatment
conditions and linked bottleneck evidence). Topology comparisons allow only the declared topology
or replica-count difference. Both contracts retain source/bundle provenance and reject undeclared
condition changes.

_Normative K4 boundary_: [ADR-015](../docs/adr/015-k4-performance-evidence-boundary.md) and the
locked Issue #85 acceptance guide define the validation and evidence rules; workflow status lives
in `.agents/current-session.md` and `.agents/next-session.md`.



