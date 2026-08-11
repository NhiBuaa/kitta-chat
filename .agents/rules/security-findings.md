# Security Finding Disposition Rules

## Purpose

Các rule này bảo đảm finding bảo mật được xử lý theo bằng chứng mà không che giấu rủi ro hoặc làm yếu scanner.

## Credential Findings

- Credential không chứng minh được là synthetic hoặc chỉ dùng trong môi trường local có thể hủy bỏ phải được xem là đã hoặc có thể đã bị lộ.
- Credential thật hoặc không chắc chắn phải được revoke hoặc rotate trước khi finding tương ứng được đánh dấu resolved.
- Chỉ finding synthetic đã được chứng minh là không có quyền truy cập mới đủ điều kiện cho ngoại lệ scanner.
- Ngoại lệ phải bám vào finding cụ thể bằng fingerprint hoặc tọa độ hẹp đã được ghi nhận; không được allowlist toàn bộ path, rule hoặc regex rộng.
- Không được đưa secret value vào issue, log, comment, test evidence hoặc tài liệu remediation.

## Finding Disposition

- Mỗi finding phải có một disposition dựa trên bằng chứng: remediated, false positive, duplicate hoặc human-approved risk acceptance.
- Không được bulk-dismiss finding chỉ dựa trên rule hoặc file chung.
- Không được làm yếu scanner, redaction, workflow exit status hoặc permission để tạo kết quả xanh giả.

## Issue #61 Deferred-Finding And Evidence Accounting

- Reset-token logging exposure giữ disposition: `source-confirmed credential-in-URL/log-exposure finding — remediation deferred to dedicated security follow-up; historical occurrence unverified`.
- Tách finding sang dedicated follow-up không phải remediation, không cho phép đánh dấu resolved và không loại finding khỏi Issue #61 security-baseline accounting.
- Issue #61 phải giữ finding, current risk status, lý do tách remediation, blocking follow-up-linkage requirement và trạng thái finding là completion blocker hay explicitly blocked remaining risk theo quyết định maintainer. Cho tới khi authorized creation/publication tạo stable identifier, trạng thái phải là `blocking follow-up linkage required / identifier pending` và không được mô tả placeholder như một actual cross-reference; agent không được tự tạo hoặc publish issue.
- Không được suy diễn hoặc tuyên bố historical leakage khi chưa có evidence. Historical retained logs không được inspect theo authorization hiện tại, và reset credentials không được rotate hoặc invalidate trong planning này.
- Retained compatibility evidence hiện dừng tại `B = 0`: không provenance audit #3, không xin `read:packages` riêng để tiếp tục chain, không dò hosting/logging/metrics provider theo suy đoán và không mở raw auth/recovery logs.
- Raw auth/recovery logs giữ trạng thái `restricted/quarantined for measurement use`; chúng không phải nguồn behavioral measurement được phép dùng.
- Retained-evidence strategy chỉ được mở lại khi maintainer cung cấp actual hosting/deployment/observability provider hoặc concrete secret-safe metadata source có khả năng tạo deployed-runtime/revision binding. Mọi future provider/source access cần một authorization gate mới; quyết định dừng hiện tại không tự cấp quyền truy cập sau này.
- Numeric approval gates của Issue #61 không đổi khi retained evidence dừng. Static reasoning không được thay measurement hoặc tự downgrade `measurement required` thành intentional hardening; privacy-safe measurement/instrumentation cần một slice được approve riêng trước khi thiết kế hoặc thực thi.

### Issue #61 Message Access-Control Follow-Up

- M1 `POST /api/messages` giữ disposition: `source-confirmed message write-integrity/access-control finding — remediation assigned to dedicated security follow-up; runtime exploitability not yet reproduced`.
- M2 `GET /api/messages/:userId1/:userId2` giữ disposition: `source-confirmed horizontal-authorization/data-disclosure and resource-amplification finding — remediation assigned to dedicated security follow-up; runtime exploitability not yet reproduced`.
- M1 và M2 được tổ chức trong một combined message-access-control follow-up ở cấp planning. Cho tới khi authorized creation/publication tạo stable identifier, trạng thái là `dedicated message-access-control follow-up required / identifier pending`; không được mô tả placeholder như actual issue/cross-reference.
- Tách scope không remediate, resolve, dismiss, duplicate hoặc làm false-positive hai findings. Issue #61 phải giữ classification, source evidence, current risk, split rationale, follow-up status và final blocking/remaining-risk accounting cho từng finding. B/B scope decision không tự quyết định Issue #61 closure: cho tới khi có closure decision riêng, M1/M2 là unresolved remaining risks và block final actor/key implementation cho hai routes tương ứng.
- `message_boundary_pending` chỉ là planning label, không phải stable Redis class ID. Current network actor chỉ planning-safe; route-specific distributed application limiter implementation mặc định blocked cho tới khi follow-up giải quyết verified-principal/authz contract.
- Caller-controlled sender, receiver, `userId1`, `userId2`, conversation, group, type hoặc attachment values không bao giờ là authenticated actor identity.
- Temporary network-only application limiter không được approve bởi scope decision B/B. Mọi đề xuất sau này cần quyết định riêng về purpose, temporary actor/key semantics, migration/removal contract và cách chứng minh nó không phải final authenticated quota enforcement. Nginx edge defense vẫn là control độc lập.
- Scope gate M1/M2 đã đóng nên có thể mở một authorization gate riêng để cân nhắc measurement/instrumentation design cho các class không liên quan. Chưa có design nào được authorize; M1/M2 phải bị exclude khỏi actor-level measurement/key design cho tới khi follow-up giải quyết actor model, và current unauthenticated behavior không được dùng làm workload evidence cho final authenticated quota policy.

### Measurement Identity Purpose Separation

- `rate-limit enforcement identity and measurement-linkage identity are separate security/privacy purposes unless an explicit design review proves reuse is necessary and safe`.
- Không được mặc định reuse limiter Redis key, actor key hoặc limiter HMAC derivation cho telemetry/measurement linkage.
- Design authorization, Level 2A aggregate-only implementation, Level 2B telemetry identity/linkage design + implementation, deployment và behavioral collection/numeric review là các authorization levels riêng. Level 1 không cấp quyền cho 2A/2B/Level 3; Level 2A không cấp quyền cho Level 2B.
- Measurement design phải bắt đầu từ explicit approval questions và minimum necessary data, không từ fields sẵn có hoặc nhu cầu generic observability.
- Raw IP, email/username, user ID, JWT/refresh/reset token, reset URL/path, HMAC target digest, callee/conversation/call/file ID, filename/object key, message/search content không được đề xuất làm raw measurement data.
- Nếu aggregate evidence không đủ, design phải chứng minh linkage necessity, minimum lifetime, retention/access/deletion, re-identification risk, cross-replica need và secret/key-management consequence trước khi so sánh purpose-specific alternatives. Planning không được tạo pseudonym, hash, HMAC hoặc key material.
- Mọi observation phải ghi measurement point, upstream censoring, rejected-traffic coverage, outcome need và giới hạn câu hỏi có thể trả lời. `Count requests` tự thân không phải justification đủ.
- Raw auth/recovery logs tiếp tục `restricted/quarantined for measurement use`; measurement design không được phụ thuộc mở hoặc parse credential-bearing paths.
- Maintainer đã authorize và hoàn tất refined Level 1 bounded design tại `docs/security/issue-61-privacy-safe-measurement-slice-design.md`, rồi chọn A tại `docs/security/issue-61-level-2a-call-instrumentation-authorization-gate.md`: chỉ code/test implementation cho locked call-only Level 2A MVP. Quyết định này không authorize deployment, enablement, behavioral collection, production analysis, Level 2B telemetry identity/linkage hay numeric policy.
- Level 2A module phải bounded cho Issue #61 slice và chỉ expose typed/domain-specific operations với frozen enums cùng valid-combination manifest. Không generic event/metric name, arbitrary labels/tags, metadata map, free-form dimensions hoặc runtime registration interface.
- Mọi telemetry dimension phải có finite reviewed vocabulary, maximum cardinality và necessity được test-visible. Raw URL/path, error/provider text, identity/resource IDs, dynamic DB IDs, filename/object key, digest/HMAC, credentials/tokens và message/search content bị cấm; schema extension cần privacy/cardinality review mới.
- Recovery outcomes phải coarse và không tạo account-existence, token-validity, target-delivery hoặc target-specific vocabulary nếu chưa có explicit privacy decision riêng.
- Telemetry phải fail-inert: adapter/backend failure không đổi business/limiter result, không tạo `503`, không dùng `RATE_LIMIT_UNAVAILABLE`, không rollback work, không synchronous retry vô hạn và không recursive failure reporting. Buffer/cardinality/time/memory/drop behavior phải bounded; loss chỉ được báo bằng coarse fixed-vocabulary signal không chứa raw event.
- Admission/frequency/rejection/stage-transition observations phải unsampled tại observation point, nhưng `unsampled != guaranteed complete`. Chỉ interval vượt explicit multi-signal completeness gate mới được gọi là complete enough cho approved analysis hoặc dùng làm complete denominator; interval khác phải là `degraded/incomplete` hoặc `unknown`.
- Completeness không được suy ra chỉ từ `measurement_dropped_total`; phải xét drops, sticky health degradation, process restarts/crashes, scrape/export gaps, collection-backend availability, rollout/disable gaps, deployment/revision binding và schema/version intervals.
- Dropped-observation diagnostics phải là monotonic per-process counter với fixed finite reasons, không identifier/raw payload và không intentional saturation. Nếu loss quantity không thể biểu diễn an toàn, fixed sticky `measurement_health = degraded` được phép; counter reset/overflow dùng normal runtime handling cùng process-start provenance.
- `begin*` integration phải completion-safe: normal/early return, throw/rethrow, cancellation/disconnect, double finish và missing finish đều có bounded reviewed behavior. Unfinished handle không được hiện như success; không dựa vào GC/finalizer; anomaly diagnostics chỉ dùng fixed identifier-free vocabulary.
- Cost/latency sampling cần known probability, eligible denominator có interval vượt completeness gate, identity-independent selection và error/slow/rare-flow coverage; sampled latency không trực tiếp define quota.
- Call Level 2A chỉ có aggregate `initCall`/`callUser` counts và aggregate cost. Logical-attempt, replay, multi-socket/user hoặc actor-callee linkage thuộc Level 2B; aggregate phase totals không được gọi là logical-attempt count.
- Friendship chỉ validate instrumentation mechanics. Frequency/cost của friendship không phải numeric evidence cho group admin, profile, panel mutation, call-history mutation hoặc `state_mutation` aggregate; extension cần scope amendment hoặc slice mới.

### Level 2A Implementation Approval And Verification Evidence

- Level 2A call-only aggregate instrumentation code/test implementation is approved only within `docs/security/issue-61-level-2a-call-instrumentation-authorization-gate.md`. Approval does not authorize deployment, production enablement, behavioral collection, production-data access/analysis, Level 2B identity/linkage, pseudonymous linkage, logical-attempt correlation, rate-limit implementation, numeric-policy approval, Nginx changes, M1/M2 remediation or reset-token remediation.
- The cardinality contract is exact: `MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS = 397` for eight valid phase-stage pairs, four outcomes, 32 counters, 352 histogram series and 13 reviewed diagnostic/health series. `AUTHORIZED_HARD_CEILING_PER_PROCESS = 493` is an outer authorization ceiling only; its 96-series difference is not spare schema capacity. Invalid pairs must never be registered or emitted merely to approach that ceiling.
- Existing/global metrics enablement remains independent of Issue #61 measurement enablement. In particular, `METRICS_ENABLED=true` without an explicit Issue #61 authorization/injection must leave the Issue #61 catalog, samples and state inactive.
- Historical full-suite status is: `historical full-suite failure unclassified because original failure output was not retained; no current reproduction after audited corrections`. It is neither a finding of relatedness nor of unrelated/flaky behavior. The original identifier and error output are unavailable; post-audit focused regression was `40/40`, and two full server-suite runs were `405/405`.
- For future security-sensitive verification failures, retain when tooling permits the failing test/file identifier, failure/error summary, command and timestamp/run reference before rerunning. When unavailable, record `evidence unavailable`; do not reconstruct details from memory or automatically classify relatedness. This verification rule must not be implemented through runtime logging or telemetry.
- Level 2A deployment readiness is a separate D1 target-binding gate, not deployment authorization. Before D2 can be considered, D1 must bind an exact environment, responsible owner, deployment/status mechanism, immutable source commit → build/run → artifact/image digest → deployed revision, topology, disabled configuration and rollback target. Repository Compose, a branch name or a dirty-tree hash are not production binding; repository files must not be used to guess a provider.
- D1/D2/C1/A1 are ordered capabilities: D1 planning-only target binding → D2 inert deployment → C1 explicit measurement enablement plus collection window → A1 authorized production-data analysis → later numeric-policy gate. D2 cannot enable or collect, and C1 cannot be implied by D2.
- `B = 0` persists through D1 and D2. Inert deployment, a metrics endpoint and deployment health checks do not create provenance-qualified Issue #61 evidence or authorize behavioral collection. Candidate evidence requires later explicit enablement, deployed-revision binding, known collection interval, backend provenance, completeness status, schema version, topology/configuration and analysis access.
- D1 is recorded as `B — Keep Level 2A deployment planning on hold`. The terminal state is `Level 2A implementation-approved / D1 deployment readiness HOLD / B = 0`. This stops the deployment lane without revoking Level 2A code/test approval and without authorizing provider discovery, provenance audit #3, `read:packages`, production inspection, commit/push, artifact publication, D2, C1, A1 or numeric-policy work. D1 may reopen only after a maintainer supplies the complete target-binding package defined by the Level 2A gate.
- D1 has been reopened only for a maintainer-supplied Railway `public-demo` target. Public-demo traffic is `portfolio / recruiter evaluation` evidence, not representative production workload or Issue #61 quota/runtime evidence; it does not change `B = 0`. D1 is target-ready for S1 consideration, not authorized for D2.
- S1 public-demo security readiness must classify known Internet-exposure risks independently of whether their long-term remediation belongs to a separate follow-up. M1, M2 and reset-token logging exposure are public-demo blockers pending separate authorized remediation/containment. Public-demo CORS/origin behavior and conditional `/ops` exposure also require a safe disposition before D2. Level 2A stays disabled/inert; D2/C1/A1 and every rate-limit/numeric/Level-2B decision remain separate.

## Browser Origin Policy

- Credentialed REST và Socket.IO phải dùng chung một allowlist origin đã được validate.
- Mỗi origin phải khớp chính xác scheme, host và port; không được dùng wildcard, reflection hoặc alias ngầm.
- Baseline local chỉ gồm `http://localhost:5173` cho Vite development và `http://localhost` cho Docker/nginx. `127.0.0.1` không được tự động coi là tương đương.
- Deployment phải khai báo origin thực tế một cách tường minh; cấu hình thiếu hoặc không hợp lệ phải làm startup thất bại.
- Request có `Origin` không nằm trong allowlist phải bị từ chối. Request không có `Origin` vẫn được phép cho same-origin, health check và non-browser client.
- Public app URL dùng để tạo password-reset link là một cấu hình riêng, không được dùng thay cho CORS allowlist.

## Rate-Limit Coordination

- Counter của security-relevant rate limit phải được điều phối qua Redis và dùng chung giữa mọi backend replica.
- Rate-limit state trong Redis phải có TTL hữu hạn và chỉ là coordination state, không phải durable business source of truth.
- In-memory store chỉ được dùng làm test double; không được dùng làm runtime enforcement hoặc bằng chứng về giới hạn toàn cụm.
- Không được mô tả một quota theo từng process hoặc replica như một distributed rate limit.
- Invariant không fallback sang replica-local hoặc in-memory counter chỉ áp dụng cho rate-limit enforcement; không được dùng issue này để thay đổi fallback của Redis cache hoặc coordination path khác.

### Store-Unavailable Failure Mode

- Không được dùng blanket rule rằng mọi authenticated read-only operation đều fail open.
- Chỉ authenticated read-only operation đã được chứng minh là bounded và low-cost mới đủ điều kiện fail open khi rate-limit store unavailable.
- Authentication/recovery, file/resource, state-changing, call-initiation, expensive read, resource-amplifying read, query fan-out hoặc operation có khả năng gây exhaustion phải fail closed khi rate-limit store unavailable.
- `429` chỉ được trả khi limiter thực sự xác nhận quota exceeded; rate-limit store unavailable không được biểu diễn như quota exceeded.
- HTTP operation fail closed phải trả `503` với machine-readable code `RATE_LIMIT_UNAVAILABLE`.
- Socket.IO operation fail closed phải trả structured ACK/error phù hợp với transport và cùng machine-readable reason `RATE_LIMIT_UNAVAILABLE`; không được mô tả kết quả đó như một HTTP `503`.
- Startup Redis dependency và runtime Redis-outage semantics là hai contract riêng. Evidence rằng startup chờ Redis không được dùng để suy ra failure mode của request hoặc socket event sau khi runtime đã khởi động.

### Operational And Edge Boundaries

- Backend/container probe path không được đặt sau Redis-backed distributed application limiter; probe semantics phải độc lập với limiter state mà probe đang quan sát.
- Việc không dùng application limiter không cho phép external operational endpoint mặc nhiên public và unprotected. Edge/network protection hoặc access restriction cho external exposure phải được review như một boundary riêng.
- `/ops` không có disposition mặc định là public và không được bảo vệ; exposure hiện tại phải được đánh giá trước production use.
- `/metrics` chỉ đủ điều kiện giữ network-only exemption khi endpoint vẫn opt-in, backend port không public và nginx không proxy endpoint đó.
- Nginx edge/IP limiting và Redis-shared distributed application quota là hai control khác nhau. Nginx shared-memory counter không được mô tả như distributed backend quota.

### Identity And Key Hierarchy

- Pre-auth HTTP phải dùng `req.ip` làm mandatory network actor dimension, và limiter không được tự đọc hoặc parse raw `X-Forwarded-For`.
- `req.ip` chỉ được coi là client network identity sau khi trusted ingress topology đã được xác minh. Single-ingress/hop assumption là một security boundary; `trust proxy = 1` tự thân không chứng minh khả năng chống spoofing cho mọi deployment topology.
- Khi ingress topology, proxy count hoặc direct backend reachability thay đổi, trust-proxy behavior và network actor key phải được re-verify trước rollout.
- `req.ip` phải được validate và canonicalize như IPv4 hoặc IPv6 trước khi trở thành network actor key; các textual representations tương đương của cùng address không được tạo bucket khác nhau.
- IPv6 aggregation/subnet policy phải được quyết định tường minh từ deployment evidence trước implementation để tránh address-rotation bypass; invariant này không tự chọn `/56`, `/60`, `/64` hoặc prefix khác.
- IPv4 aggregation cũng phải là quyết định tường minh; các IPv4 addresses không được âm thầm gộp nếu chưa có policy được duyệt.
- Authenticated HTTP actor identity chỉ được lấy từ principal do auth middleware đã verify. Socket.IO actor identity chỉ được lấy từ identity do handshake auth đã verify.
- Không được lấy authenticated actor identity từ `req.params`, `req.query`, `req.body`, sender ID, target ID, conversation ID hoặc caller-supplied identity claim khác. Route thiếu auth middleware không trở thành authenticated chỉ vì path hoặc payload chứa `userId`.
- Một canonical verified principal field hợp lệ là đủ để tạo actor identity; không bắt buộc mọi alias cùng tồn tại. Nếu nhiều verified aliases như `id` và `_id` cùng hiện diện, chúng phải canonicalize về cùng principal. Không có canonical principal hợp lệ hoặc aliases conflict phải làm authentication/key derivation fail thay vì chọn tùy ý hoặc tách bucket.
- Mỗi protected operation phải tham gia actor-wide bucket của rate-limit policy class tương ứng. Đổi route, resource, conversation hoặc target trong cùng class không được bypass actor-wide bucket.
- Actor-scoped secondary bucket phải bind canonical actor vào cùng key với route, resource, conversation hoặc callee dimension; bucket này chỉ giới hạn một actor trên target cụ thể và không được actor khác consume.
- Target-wide protection bucket có thể bỏ actor chỉ khi threat model cố ý cần aggregate protection cho cùng account, resource hoặc target từ nhiều actors. Nó cần explicit policy approval và fairness/concentration review; không được xuất hiện ngầm vì key shape thiếu actor.
- Actor-scoped secondary bucket và target-wide protection bucket đều chỉ bổ sung enforcement; chúng không được thay thế actor-wide bucket của policy class.
- Global aggregate actor bucket across policy classes là một policy/quota decision riêng và chưa được chốt bởi invariant này.
- Pre-auth IP actor bucket có thể được bổ sung bằng target-wide account bucket để chống credential/account-specific abuse từ nhiều IP. External account identifier phải theo một normalization contract xác định và được HMAC bằng versioned limiter key material trước khi vào Redis key; raw identifier không được lưu hoặc log.
- Endpoint nào cần target-wide account bucket hoặc target-wide protection khác, cùng quota, window và burst của mọi bucket, vẫn là các quyết định riêng chưa được chốt.
- Không được đưa raw email, username, JWT, refresh token hoặc credential vào Redis key hay limiter log.
- Nginx IP bucket là independent edge defense và không được tính là distributed application actor bucket.

### HMAC Derivation Version Consistency

- Rate-limit key-schema namespace và HMAC derivation/key-material version là hai version độc lập; `rl:v1` không mặc định có nghĩa HMAC key material version 1.
- Target HMAC key phải mang identifiable derivation/key-material version để mọi backend replica đang tham gia cùng distributed quota derive cùng logical target bucket.
- HMAC rotation không được làm cùng logical account target bị split thành independent counters giữa mixed-version replicas.
- Rotation phải dùng coordinated single-version cutover hoặc một explicit migration/dual-version strategy đã được duyệt trước rollout.
- Planning này không tạo, rotate, chọn storage mechanism hoặc công bố HMAC key material.

### Target-Wide Lockout And Starvation

- HMAC chỉ bảo vệ identifier trong key/log và giữ derivation consistency; HMAC không ngăn attacker biết account identifier consume target-wide quota để gây targeted lockout hoặc recovery starvation.
- Target-wide policy phải chọn rõ một enforcement type: `hard admission gate`, `side-effect/work suppression` hoặc `telemetry/detection only`.
- Login hoặc forgot-password target-wide hard admission gate không được approve nếu maintainer chưa explicit accept targeted-victim lockout tradeoff.
- Side-effect/work suppression phải giữ external response generic nhưng vẫn được xem là availability denial nếu legitimate login/recovery side effect bị suppress.
- Telemetry/detection-only target bucket không được mô tả như backend work protection hoặc admission enforcement.
- Per-network actor bucket vẫn là mandatory control; target-wide bucket không được thay thế network actor protection.
- Target-wide decision không được tạo account-existence hoặc account-activity side channel qua status, body, timing class, retry metadata hoặc logging exposure.

### Limiter Ordering

- Authenticated operation phải giữ ordering semantics: verified authentication → canonical actor derivation → actor-wide class limiter → cheap syntactic/boundary validation và canonical secondary dimension → secondary limiter nếu policy yêu cầu → authorization/resource lookup/business operation.
- Exact middleware composition có thể khác khi implementation, nhưng actor-wide limiter phải bảo vệ expensive downstream validation, lookup và business work.
- Resource authorization không được dùng để derive actor identity.
- Actor-scoped secondary key không được yêu cầu expensive DB, Redis hoặc business lookup nếu cheap canonical identifier tại boundary là đủ.
- Invalid hoặc malformed target input không được trở thành đường bypass làm expensive work trước actor-wide limiter.
- Với pre-auth account flow, network actor derivation và actor-wide limiter không phụ thuộc DB xác nhận account tồn tại.
- Account-target normalization và HMAC derivation phải có response, timing và logging semantics không tiết lộ account existence.

### Distributed Time And Algorithm State

- Quyết định sliding-window và token-bucket phân tán phải dùng authoritative/shared time semantics phù hợp với Redis coordination. Clock skew giữa replicas không được làm tách window, refill khác nhau hoặc reset state không nhất quán.
- Giá trị `Date.now()` độc lập tại từng replica không phải distributed security assumption hợp lệ. Exact shared-time mechanism vẫn là implementation decision.
- Sliding-window state không được expire trước khi mọi event đã ghi hết khả năng ảnh hưởng trong policy window.
- Token-bucket state không được expire rồi reinitialize về capacity trước thời điểm natural refill có thể khôi phục capacity đó.
- Idle cleanup phải bounded nhưng không được tăng effective refill hoặc cấp early free burst.
- Implementation phải derive algorithm-state TTL từ approved window hoặc từ token refill rate, current deficit và capacity. Invariant planning này không chọn concrete TTL value.

### Atomic Multi-Bucket Admission

- Sau khi cheap bounded parsing derive được complete applicable bucket set cho một admission stage, mọi mandatory bucket thuộc tất cả policy-class memberships của request hoặc event phải được check và consume atomically theo một all-or-none decision.
- Multipart profile update không được consume `state_mutation` hoặc profile-domain capacity rồi mới fail vì same-stage `file_resource` hoặc upload-domain bucket reject.
- Nếu bất kỳ same-stage mandatory bucket nào reject, không bucket nào trong stage đó được consume capacity.
- Cheap malformed input làm complete bucket derivation bất khả thi phải bị reject trước expensive work. Transport/parser flood không bao giờ tới application admission cần independent bounded parser hoặc edge protection.
- Refresh Stage A và Stage B vẫn là hai admission tách biệt có chủ đích để bảo vệ hai loại work khác nhau. Stage A consumption không rollback khi Stage B reject hoặc downstream work fail.

### Admission And Raw-Request Protection Planes

- Business admission quota bounds expensive downstream work đã được admit; nó không mặc định là raw-request, network-flood hoặc Redis decision-plane protection.
- Với all-or-none admission, request bị narrow bucket block có thể tiếp tục tới evaluator mà không consume unrelated actor aggregate. Repeated rejected evaluation load phải được đo và review riêng.
- Nginx/edge có thể bảo vệ network-level HTTP flood nhưng không được tính là Redis-shared application admission quota.
- Authenticated distributed hoặc multi-IP decision-plane abuse cần measurement và explicit review trước khi thêm raw-attempt bucket.
- Lightweight raw-attempt bucket chỉ được thêm khi threat/evidence chứng minh cần thiết; raw bucket không được thay thế business admission aggregate hoặc domain/target bucket.
- Principle này áp dụng chung cho HTTP và Socket.IO. Planning hiện không chọn numeric raw HTTP bucket.

### Redis Atomicity Topology Prerequisite

- Trước implementation phải verify actual Redis deployment topology và atomicity domain dùng cho mọi same-stage mandatory key.
- Repository Compose hiện có một Redis service và Node clients dùng `createClient` với một Redis URL; đây là evidence cho repository single-instance/non-cluster topology hiện tại, không phải guarantee cho mọi deployment.
- Nếu deployment dùng Redis Cluster hoặc multi-slot topology, multi-key atomic admission phải có deliberate same-slot/co-location design hoặc một explicit atomic alternative.
- Không được silently degrade all-or-none admission thành sequential check/consume có partial consumption.
- Key-slot/co-location strategy không được đưa raw PII, email, username, credential, JWT, refresh token hoặc account HMAC digest ra response/log hay làm key hygiene yếu đi.
- Mandatory actor-wide và actor-scoped bucket thường có cùng canonical actor affinity, nên future co-location design có thể exploit common dimension này.
- Target-wide bucket cố ý bỏ actor khỏi sharing dimension: nó phải aggregate một target xuyên nhiều actors trong khi actor bucket aggregate một actor xuyên nhiều targets.
- Không được mặc định simple same-slot/hash-tag format preserve được cả hai sharing semantics. Nếu target-wide bucket được promote thành mandatory hard admission, implementation cần explicit cross-partition atomicity/data-model proof hoặc approved atomic alternative.
- Không được weaken actor-wide hoặc target-wide sharing chỉ để ép key vào cùng slot, và không được duplicate actor-target composite counter rồi gọi đó là target-wide enforcement.
- Login/forgot target-wide candidates hiện là telemetry-only, nên cross-partition hard-gate prerequisite chưa block quota topology hiện tại. Nó trở thành blocker nếu sau này đề xuất hard hoặc side-effect enforcement.
- Planning này chưa chọn Lua, transaction, hash tag, function hoặc atomic implementation mechanism cụ thể.

### Charge And Replay Semantics

- Default charge unit là một admitted attempt trước expensive work mà bucket bảo vệ. Invalid credential, post-admission validation failure, authorization rejection và downstream provider, DB, queue hoặc business failure không được refund.
- Success không được skip hoặc refund admission accounting. Retry là một charged attempt mới trừ khi server-validated idempotency suppress request trước expensive work theo một rule đã được approve rõ ràng.
- Caller-supplied idempotency, resource hoặc correlation identifier tự thân không được tạo free replay path.
- `initCall` đã được server validate cùng expected correlated `callUser` có thể consume một logical call-attempt unit thay vì hai protocol-event unit.
- Repeated hoặc replayed correlated call event phải bị reject hoặc idempotently suppress trước expensive work, hoặc phải chịu independent lightweight raw-event flood control.
- Call correlation phải bind canonical caller, canonical callee và một logical attempt; state phải single-use hoặc phase-bounded, có finite TTL/cardinality và không được reuse vô hạn.
- Unmatched `callUser` consume một logical-attempt unit mới. Attacker không được chọn call identifier đã charge để bypass accounting.

### Policy-Class Taxonomy Semantics

- Unique operation inventory và enforcement bucket membership là hai views độc lập. Inventory đếm mỗi HTTP route hoặc Socket.IO event đúng một lần để chứng minh completeness.
- Enforcement membership là many-to-many: một operation có thể tham gia nhiều actor-wide, actor-scoped secondary hoặc explicitly approved target-wide/aggregate buckets.
- Tổng enforcement memberships không cần và không được ép bằng tổng unique operations.
- Coarse class như `auth_entry`, `state_mutation` hoặc `read_expensive` là aggregate anti-route-rotation protection; class membership không mặc định buộc mọi operation dùng cùng quota, window hoặc burst.
- Actor-scoped operation/domain secondary bucket có thể giữ cost hoặc fairness differentiation mà không loại bỏ aggregate class protection.
- Stable Redis class ID không được encode một vulnerability-state tạm thời. Operation đang bị access-control blocker phải dùng planning-only label cho tới khi actor model được giải quyết.
- Numeric quota, window và burst không được suy ra từ taxonomy membership.
