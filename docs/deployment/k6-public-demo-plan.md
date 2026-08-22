# K6 — Railway Public Demo và bằng chứng vận hành KittaChat

## Summary

K5 đã hoàn tất sau khi PR #108 được merge vào `main` tại `72a9828`.

K6 sẽ đưa KittaChat lên Railway dưới dạng `public-demo` phục vụ portfolio/recruiter. Đây không phải production deployment, không bật Issue #61 measurement, không tạo quota mới và không được dùng traffic demo làm production evidence.

K6 giữ nguyên các invariant của hệ thống hiện tại: MongoDB là durable source of truth, Redis là coordination/cache, RabbitMQ chỉ chạy background work, API/socket payload hiện có không đổi ngoài deployment seams đã được duyệt, và startup migration tự động không được bật.

## Execution authority update — 2026-08-22

The maintainer later approved the exact Phase 3 graph, publication of Issues #111–#118, and the
pre-D2 execution plan at `docs/deployment/k6-end-to-end-execution-plan.md`. That later authority is
recorded in
[Issue #110](https://github.com/NhiBuaa/kitta-chat/issues/110#issuecomment-5378196659) and supersedes
stale transition wording in earlier S1/Phase 2 sections. Bootstrap B0 is
`74d5ed917c37a12b8ee88c767447f8fa23242af1`; Issue #111 is the review-gated frontier. D2 remains
unauthorized.

The later approved health contract also supersedes the earlier required-public-route list: private
backend `/readyz` is Railway application readiness, public edge `/healthz` is liveness, a sanitized
public readiness projection is optional, and `/backend-healthz` is not a required public route.
Verbose backend health, `/ops`, and `/metrics` remain non-public.

## Quyết định đã khóa

- Target: Railway environment `public-demo`.
- Topology: Compose-like full stack:
  - public nginx/frontend edge;
  - một backend instance;
  - MongoDB;
  - Redis;
  - RabbitMQ;
  - image worker;
  - audit worker.
- Artifact: GitHub Actions prepares and validates immutable images pre-D2; publication to GHCR and
  Railway deployment by immutable digest occur only after the separate human-approved D2 checkpoint.
- Feature scope:
  - bật direct chat, group chat, realtime sidebar, call;
  - bật self-signup và seeded demo accounts;
  - bật upload nếu S3-compatible storage được provision và kiểm thử;
  - recovery/password-reset và Google login tắt rõ ràng;
  - notification worker không phải dependency K6 vì recovery bị tắt.
- D2 deployment luôn cần human approval riêng sau khi S1 hoàn tất.
- Demo dùng dữ liệu `.test`, không dùng tài khoản hoặc dữ liệu cá nhân.
- Railway public-demo không được mô tả là production, scalable production hay Issue #61 measurement environment.
- `/ops` và `/metrics` không được public.
- Không chạy startup migration tự động trên Railway.
- Nếu S3 chưa sẵn sàng, không tự động hạ scope. K6 phải dừng ở S1 hoặc cần một scope-change approval rõ ràng để chuyển thành core-only demo.

## Các phase và skill sử dụng

### Phase 0 — Reconcile K5 và khởi tạo K6

Skill:

- `feature-delivery`
- `session-continuity`

Công việc:

- Cập nhật session state để ghi nhận K5 đã merge tại `72a9828`.
- Tạo K6 workflow artifact và branch integration từ `main`.
- Khóa base commit, feature branch, current worktree và default-branch invariant.
- Ghi plan này làm artifact canonical của K6.
- Không triển khai và không thay đổi runtime ở phase này.

Branch dự kiến: `nhibuaa/k6-public-demo`.

### Phase 1 — Research Railway và target binding

Skill:

- `research`
- `deployment`
- `feature-delivery`

Công việc:

- Kiểm tra tài liệu Railway chính thức về:
  - Docker image deploy;
  - GHCR/private registry;
  - private networking;
  - WebSocket;
  - health check;
  - environment variables;
  - custom domain/TLS;
  - rollback;
  - managed MongoDB/Redis/RabbitMQ hoặc kết nối external service.
- Ghi target-binding record gồm:
  - Railway project/environment/service IDs;
  - region;
  - public domain;
  - service-to-service hostnames;
  - image registry;
  - cost budget;
  - rollback owner;
  - health endpoint;
  - expected downtime;
  - exact secret ownership.
- Kiểm tra hiện trạng repository: nginx hiện giả định upstream `backend:3000`, còn Compose local mới là topology được kiểm chứng.
- Nếu Railway service IDs, provider permissions, domain hoặc dependency providers chưa có, dừng tại S1; không suy đoán.

`deployment` skill hiện thiên về VPS, nên chỉ dùng các guardrail chung về secrets, immutable artifact, namespacing, health và rollback. Railway-specific mutation sẽ dùng Railway CLI/dashboard/API hoặc thao tác thủ công của maintainer.

### Phase 2 — K6 specification, design và authorization gate

Skill:

- `grill-with-docs`
- `codebase-design`
- `to-prd`
- `domain-modeling`
- `feature-delivery`

Tạo specification/PRD cho K6 với các quyết định sau:

- Public demo là một target riêng, không phải production.
- Một backend instance được phép; không tuyên bố cross-replica production behavior.
- Redis, MongoDB và RabbitMQ phải có binding cụ thể.
- S3 là hard prerequisite cho upload.
- Recovery và Google login bị disable bằng capability contract rõ ràng.
- Self-signup và seeded accounts đều phải dùng demo namespace.
- Issue #61 metrics/Level 2A/Level 2B/C1/A1 vẫn disabled.
- `/ops` và `/metrics` không được public.
- Không chạy startup migration tự động trên Railway.

Thiết kế các seam cần thiết:

- nginx upstream configurable thay vì hard-code `backend:3000`;
- nginx forward đúng `Origin`, không dùng header khác để giả lập origin;
- public domain được đưa vào `URL_FRONTEND` và `CORS_ALLOWED_ORIGINS`;
- capability flags rõ ràng cho upload, recovery và Google login;
- feature-disabled routes phải fail closed hoặc không public, không phụ thuộc vào lỗi thiếu secret;
- build/runtime configuration không chứa secret plaintext.

### Phase 3 — Decompose và cadence

Skill:

- `to-issues`
- `test-craft`
- `feature-delivery`

Chia K6 thành các vertical slices:

1. Target-binding và capability specification.
2. Railway-compatible nginx/backend configuration seam.
3. Public-demo feature gating và S3 upload boundary.
4. Immutable CI image publication và Railway service descriptors.
5. Demo seed/self-signup/documentation package.
6. Manual acceptance và deployment evidence.

Vì K6 liên quan security, public exposure, deployment và public API, cadence sẽ được nâng lên `high`. Trước acceptance cần:

- spec/design external review;
- ticket review;
- manual-guide review;
- human approval;
- final whole-scope `code-review`.

Không downgrade cadence chỉ vì thay đổi phần lớn là configuration/documentation.

### Phase 4 — Implementation

Skill:

- `implement`
- `tdd`
- `codebase-design`

Các thay đổi dự kiến:

- Cập nhật nginx image để nhận private backend upstream từ runtime configuration.
- Bảo đảm public edge route đúng:
  - `/api`;
  - `/socket.io`;
  - `/healthz`;
  - optional sanitized `/readyz` only if retained by Issue #112;
  - SPA frontend.
- Keep `/backend-healthz` private/internal or absent from the public route map; never proxy verbose
  backend health publicly.
- Giữ `/ops` internal và `/metrics` không public.
- Thêm capability contract cho:
  - upload;
  - recovery;
  - Google login.
- Đặt mặc định an toàn:
  - recovery disabled;
  - Google login disabled;
  - metrics disabled;
  - production cookie secure;
  - exact CORS allowlist bắt buộc.
- Không thay đổi API/socket payload ngoài phạm vi deployment seam.
- Bảo đảm upload chỉ enable khi đủ S3 configuration và vượt focused tests.
- Giữ MongoDB là durable source of truth, Redis là coordination/cache, RabbitMQ background-only.

### Phase 5 — Immutable artifact và CI

Skill:

- `implement`
- `code-review`
- `deployment`

Tạo pipeline:

- build server/worker image;
- build nginx/frontend image;
- validate builds and candidate lineage without publishing a deployment artifact;
- prepare the least-privilege publication workflow and Railway descriptors;
- publish to GHCR and capture the actual image digest only after D2 Authorization Request approval;
- bind Railway to the captured immutable digest only during post-approval D2 execution;
- Auto Deploy tắt;
- không deploy từ dirty tree;
- không build nặng trên production/runtime host.

CI phải tiếp tục kiểm tra:

- `npm run test:ci`;
- `npm run ci:validate`;
- `npm run lint:ci`;
- client production build;
- Docker build validation;
- security/license/baseline contracts.

GitHub Actions chỉ được cấp permission tối thiểu cần thiết, pinned external actions và không in secrets.

### Phase 6 — Prepare manual acceptance

Skill:

- `test-craft`
- `manual-acceptance`
- `browser:control-in-app-browser`
- `session-continuity`

Tạo locked manual guide và append-only Evaluation history.

Phase 6 prepares the guide, test data, evidence schema, and expected dispositions only. It does not
execute deployed-target manual acceptance before D2 rollout.

Các Test Case chính:

- D1 target identity và service binding chính xác.
- Commit SHA → image digest → Railway deployment revision lineage.
- Không có secret trong Git, artifact hoặc log evidence.
- Edge `/healthz` trả `200` cho liveness.
- Backend `/readyz` chỉ ready khi MongoDB và Redis connected.
- RabbitMQ failure biểu diễn đúng degraded behavior, không làm sai readiness contract.
- Exact CORS origin cho REST và Socket.IO.
- Evil-subdomain/wrong-port/wrong-scheme bị từ chối.
- WebSocket handshake và reconnect hoạt động.
- Seeded Alice/Bob login và self-signup hoạt động.
- Direct message và group message đúng authenticated principal authorization.
- Sidebar realtime hoạt động.
- Call signaling và call history hoạt động.
- Upload MIME/size/storage path hoạt động khi S3 enabled.
- Recovery và Google login không public khi disabled.
- `/ops` không thể truy cập từ public edge.
- `/metrics` không public và Issue #61 measurement vẫn inert.
- Password/token/secret không xuất hiện trong response hoặc request logs.
- Public demo flow hoàn tất trong dưới 5 phút.
- Rollback marker and previous healthy revision are specified as evidence fields; they are populated
  only after post-D2 rollout/verification.

Case nào không chạy được vì thiếu provider, domain, credential hoặc deployment permission phải là `BLOCKED`, không được đánh dấu pass.

### Phase 7 — Human D2 deployment checkpoint

Skill:

- `deployment`
- `manual-acceptance`
- `session-continuity`

### D2 Authorization Request — before human approval

The complete request interface is fields `A01`–`A15` and mutations `M01`–`M10` in
[k6-d2-authorization-execution-contract.md](k6-d2-authorization-execution-contract.md). This plan
does not define another checklist. Secret values and execution-only outputs are forbidden before
approval; a missing required field or premature output is `BLOCKED`.

Chỉ sau checkpoint này mới deploy. Không tự động suy ra quyền D2 từ K5 hoặc từ S1.

### D2 Execution Evidence Record — after human approval

After approval, append-only evidence must satisfy fields `E01`–`E12` in
[k6-d2-authorization-execution-contract.md](k6-d2-authorization-execution-contract.md). The rollout
steps below explain order only and do not redefine the evidence interface.

### Phase 8 — Rollout và live verification

Skill:

- `deployment`
- `manual-acceptance`
- `browser:control-in-app-browser`

Rollout:

1. Chọn immutable image digest từ commit đã review.
2. Validate environment keys bằng secret-safe checker.
3. Kiểm tra không có migration marker cần xử lý.
4. Deploy các Railway services theo dependency order.
5. Chờ MongoDB/Redis/RabbitMQ.
6. Start backend và workers.
7. Verify private backend `/readyz`, public edge `/healthz`, any retained sanitized public readiness
   projection, and no public verbose backend health.
8. Verify nginx public routes và WebSocket.
9. Chạy manual acceptance trên public URL.
10. Ghi deployment revision, digest, health results và rollback marker.
11. Chỉ đánh dấu stable sau khi toàn bộ required cases pass.

Nếu health fail:

- dừng;
- kiểm tra migration marker;
- nếu có migration, không tự rollback;
- nếu không có migration, chỉ rollback một lần về previous stable revision sau human-approved rollback procedure.

### Phase 9 — Final review, documentation và closeout

Skill:

- `code-review`
- `feature-delivery`
- `manual-acceptance`
- `session-continuity`

Review fixed point gồm:

- runtime/config changes;
- Docker/nginx changes;
- CI image publication;
- deployment descriptors;
- README/deployment/security docs;
- acceptance guide và evidence references.

Điều kiện pass:

- Standards review `APPROVE`;
- Spec review `APPROVE`;
- zero Critical/Major findings;
- cadence validator `ready`;
- manual Evaluation `PASSED` với human approval;
- public deployment revision healthy;
- README có public demo link, access instructions và limitations;
- deployment guide phân biệt local/public-demo/production;
- không claim production readiness hoặc Issue #61 measurement.

Sau đó cập nhật session state:

- K6 implementation merged;
- target binding complete;
- public-demo deployment healthy;
- manual acceptance passed;
- rollback evidence retained;
- K6 officially complete.

## Phân công Codex và maintainer

Codex có thể thực hiện:

- PRD/spec/design;
- source/config/CI changes;
- automated tests;
- Docker build validation;
- acceptance guide;
- code review;
- documentation;
- evidence aggregation;
- post-deployment verification khi có URL/access.

Maintainer phải thực hiện hoặc xác nhận:

- Railway project/service provisioning;
- MongoDB/Redis/RabbitMQ/S3 provider choice;
- public domain;
- cost budget;
- provider secrets;
- GHCR/Railway permissions;
- D2 deployment approval;
- human approval cho manual acceptance;
- rollback approval nếu cần rollback thật.

## K6 completion definition

K6 chỉ được đánh dấu hoàn tất khi tất cả điều kiện sau đúng:

- K6 code/docs/CI fixed point đã được review và merge vào `main`.
- Artifact lineage từ reviewed commit đến immutable image digest và Railway revision đầy đủ.
- Public URL hoạt động.
- Health/readiness/WebSocket/auth/chat/group/sidebar/call pass.
- Upload pass nếu đã chọn enable.
- Seeded accounts và self-signup pass.
- Recovery/Google login disabled đúng scope.
- `/ops` và `/metrics` không public.
- Không secret/token/password xuất hiện trong evidence.
- Manual Evaluation `PASSED` và được maintainer approve.
- Rollback target và stable revision được ghi nhận.
- README/deployment guide/demo instructions cập nhật.
- Không bật Issue #61 measurement, Level 2B, numeric tuning hoặc production claims.

Nếu provider access, S3, domain, registry permission hoặc D2 approval chưa có, workflow dừng ở checkpoint tương ứng và tạo Resume Contract; không tự suy đoán hoặc tự deploy.

## S1 decision amendments — 2026-08-20

The maintainer has bound the K6 S1 region decision to Southeast Asia Metal, Singapore,
`asia-southeast1-eqsg3a`. Runtime region read-back remains D2-bound.

The maintainer approved MongoDB Atlas Free for a dedicated public-demo project/cluster with an
explicit `0.0.0.0/0` Atlas allowlist exception. This is demo-only and cost-constrained, with TLS,
strong unique credentials, minimum database permissions, demo/seed data only, and provider/Railway
secret-manager ownership as compensating controls. It is not a production recommendation; restricted
static egress or private networking remains the production assumption. Actual Railway-to-Atlas
connectivity remains D2 live evidence.

The following runtime-only artifacts are no longer S1 blockers and must be recorded as `PENDING_D2`
until the authorized runtime exists: generated edge hostname, derived `URL_FRONTEND`, derived exact
`CORS_ALLOWED_ORIGINS`, actual GHCR digests, Railway private hostnames, live Railway healthcheck
settings, and runtime region read-back.

The S1 package names are fixed as:

- `ghcr.io/nhibuaa/kitta-chat-server` for backend, image-worker, and audit-worker;
- `ghcr.io/nhibuaa/kitta-chat-edge` for the nginx/frontend edge.

Publishing either image and obtaining an immutable digest remain D2-bound. The exact minimum
external resources and non-secret evidence needed before D2 are recorded in
`docs/deployment/k6-public-demo-s1-resource-readiness.md`.

## S1 Upstash evidence amendment — 2026-08-21

The maintainer supplied non-secret evidence for the dedicated Upstash Redis database
`kittachat-public-demo`: Free Tier, AWS Singapore `ap-southeast-1`, no additional read regions,
256 MB storage, 500000 monthly commands, 50 GB monthly bandwidth, `$0.00` current cost, native
Redis TCP `rediss` with TLS on port `6379`, and credential ownership outside Git/chat/evidence.

The provider packet explicitly marks provider-internal `standalone/non-cluster` as `NOT_ASSERTED`
because the console exposes primary/read-region topology rather than that classification. The
maintainer accepts the K6 application-client topology: one dedicated database, one native `rediss`
endpoint, one primary region, no additional read regions, and empty
`REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES`. K6 makes no claim about Upstash's provider-internal
architecture. This closes the S1 topology blocker because no repository K6 contract requires
provider-internal cluster-mode evidence.

Railway-to-Upstash connectivity, Node Redis compatibility, Socket.IO pub/sub, Lua `EVAL`/`TIME`,
readiness, reconnect behavior, and rate-limit/call acceptance remain `PENDING_D2`. The full record
is `docs/deployment/k6-public-demo-s1-upstash-evidence.md`.

## Historical S1 execution boundary — superseded

The following bullets record the historical S1 continuation checkpoint and are not current workflow
authority:

- Phase 0 and official Railway research are complete.
- Phase 1 target identity and provider-readiness contract are partially bound; remaining provider
  resources/evidence remain authoritative in `k6-railway-public-demo-target-binding.md` and
  `k6-public-demo-s1-resource-readiness.md`.
- MongoDB Atlas S1 evidence is recorded. Upstash resource/capacity/native-TLS evidence and the
  accepted single-endpoint application-client topology are recorded; provider-internal topology is
  intentionally unasserted and is not an S1 blocker.
- Runtime-only values remain `PENDING_D2` and must not be invented in S1.
- At that historical checkpoint, no Phase 2 design/authorization, runtime implementation, image
  publication, provider mutation, secret creation, deployment, commit, push, PR, merge, or Issue #61
  measurement enablement was implied.

Current authority is the Execution authority update near the top of this file: Phase 2 and the
published graph are approved, Bootstrap B0 is complete, and Issue #111 is review-gated. Actual
digests, generated hostnames, derived CORS/private-upstream values, live health read-back, revisions,
provider compatibility, and acceptance remain post-approval D2 Execution Evidence only.

## S1 CloudAMQP permission/read-back amendment — 2026-08-21

The maintainer supplied evidence for a provisioned shared CloudAMQP `Little Lemur` RabbitMQ
instance: application vhost/user identifier `bptdlerq`, RabbitMQ `4.2.7`, and same-credential
Management UI authentication for that vhost. The shared-plan Admin UI does not expose Users,
Virtual Hosts, or per-user `configure`/`write`/`read` permission regex configuration/read-back.

K6 accepts this provider-managed application credential/vhost boundary for S1 without asserting
least-privilege regex evidence. The regex fields remain `NOT_ASSERTED`; existing provider policies
must not be modified merely for K6 evidence; and no queue is manually provisioned in S1. The
repository's nine-queue contract, actual queue operations, publish/consume/ack, retry/DLQ,
reconnect, and Railway-to-CloudAMQP behavior remain D2-bound. D2 must fail safely if the credential
cannot perform the required topology operations. The follow-up S1 packet records resource
`kittachat-public-demo`, AWS `ap-southeast-1`, AMQPS endpoint metadata, quotas, and 0 open
connections/0 queues. Permission regexes remain unasserted because the shared-plan UI does not
expose them.
See `docs/deployment/k6-public-demo-s1-cloudamqp-evidence.md`.

## S1 AWS S3 resource/security evidence amendment — 2026-08-21

The maintainer supplied non-secret S3 evidence for dedicated bucket
`kittachat-public-demo-nhibuaa` in AWS `ap-southeast-1`: Block Public Access enabled, bucket-owner
enforced with ACLs disabled, SSE-S3 default encryption, approved prefixes `uploads/*` and
`avatars/*`, and a directly attached customer-managed IAM policy scoped to those prefixes. The
policy allows `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:AbortMultipartUpload`,
with no broad or outside-prefix access. The repository's `PutObject` action covers the multipart
create/part/complete command family, while abort uses the explicit abort action.

The 7-day incomplete-multipart lifecycle rule is recorded. The access key is not created in S1;
exact Railway-origin CORS, credential creation/binding, AWS SDK authentication, upload, browser
`ETag`, worker processing, and all live S3 behavior remain `PENDING_D2`. Wildcard public CORS is not
approved. See `docs/deployment/k6-public-demo-s1-s3-evidence.md`.

## S1 provider-binding closeout — 2026-08-21

The non-secret S1 resource/security evidence is complete for MongoDB Atlas, Upstash Redis,
CloudAMQP RabbitMQ, and AWS S3. Credential ownership boundaries are recorded without values:
MongoDB remains under the maintainer password manager until D2 Railway binding; Upstash and
CloudAMQP credentials remain outside Git/chat/evidence until D2 binding; and the S3 access key is
not created in S1. Runtime connectivity, exact Railway hostname/CORS, credential creation/binding,
image digests, queue operations, upload behavior, and all live provider acceptance remain D2-bound.

Phase 1 S1 provider-binding is complete. Historical next-transition wording is superseded by the
Execution authority update above: Phase 2 and the Phase 3 graph are approved, Bootstrap B0 is
complete, and Issue #111 is the review-gated frontier. This does not authorize image publication,
deployment, D2, or Issue #61 measurement.
