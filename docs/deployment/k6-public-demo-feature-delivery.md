# K6 Railway Public Demo — Feature Delivery Ledger

## Workflow identity

- Workflow: `feature-delivery`
- Feature: `K6 — Railway Public Demo và bằng chứng vận hành KittaChat`
- Action: `start` from the explicitly authorized K6 plan
- Default branch: `main`
- Feature integration branch: `nhibuaa/k6-public-demo`
- Base and initial integration head: `72a9828579f34c0b88c9c8a1c51c2c4f8225c1ca`
- Canonical K6 plan: `docs/deployment/k6-public-demo-plan.md`
- Approved execution plan: `docs/deployment/k6-end-to-end-execution-plan.md`
- Approved execution plan SHA-256: `43fadb48bdf900b9bd4be2e8d50f12e3d583542ad5ed123f687db8bcd14014f3`
- Pre-D2 implementation, test, commit, push, child-PR merge, and K6-owned cleanup authority is active.
- D2 credential creation/binding, GHCR publication, Railway rollout, and live acceptance remain unauthorized.
- `main` was unchanged and clean at initialization.

## Locked scope

- Railway environment `public-demo`, explicitly distinct from production.
- nginx/frontend edge, one backend instance, MongoDB, Redis, RabbitMQ, image worker, and audit worker.
- GitHub Actions prepares and validates the immutable-image workflow pre-D2; GHCR publication and
  Railway digest selection are post-approval D2 actions.
- Direct chat, group chat, realtime sidebar, calls, self-signup, and seeded demo accounts.
- Upload only after S3-compatible storage is provisioned and tested.
- Recovery/password reset and Google login disabled by explicit capability contract.
- Issue #61 measurement, Level 2B, numeric tuning, quota creation, and production claims disabled/out of scope.
- `/ops` and `/metrics` are not public; startup migrations are not automatic.
- D2 deployment requires a separate human-approved D2 Authorization Request before any credential
  binding, GHCR publication, rollout, live provider validation, or deployed-target acceptance.

## Transition ledger

| Phase | Status | Evidence or blocker |
| --- | --- | --- |
| Phase 0 — K5 reconciliation and K6 initialization | completed | K5 merged at `72a9828`; requested branch created; session state and K6 records written; canonical plan recorded and verified; no runtime mutation |
| Phase 1 — Railway research and target binding | completed at S1 evidence boundary | Singapore region `asia-southeast1-eqsg3a`, dedicated-Atlas wildcard-allowlist decision, MongoDB Atlas S1 evidence, accepted Upstash application-client topology, complete CloudAMQP metadata/provider-managed vhost/user boundary, AWS S3 resource/security evidence, and secret-safe credential ownership boundaries are recorded; provider-internal/permission regexes remain intentionally unasserted; live compatibility remains D2 |
| Phase 2 — specification/design/authorization | completed; maintainer approved | Phase 2 consistency revision approved by maintainer; ADR-016 accepted; D2 remains separately gated |
| Phase 3 — decomposition/cadence | completed; maintainer approved and tickets published | Approved eight-ticket graph published as Issues #111–#118 with real blocking references; read-back passed; frontier is Issue #111; cadence is `high` |
| Bootstrap B0 — execution baseline | in progress | Unrelated root `mongoose` WIP preserved externally; durable execution plan and state synchronization in progress; baseline/commit/push pending |
| Phase 4 — implementation | authorized pre-D2; waiting for B0 and required reviews | Issues execute in approved dependency waves; Issue #111 is the initial frontier |
| Phase 5 — candidate artifacts/CI preparation | pending | Pre-D2 may build/test/validate images and prepare workflows/descriptors; no GHCR publication or deployment digest exists |
| Phase 6 — manual acceptance preparation | pending | Pre-D2 may lock the guide and evidence schema; deployed-target execution is forbidden before D2 rollout |
| Phase 7 — D2 Authorization Request/checkpoint | pending | Human approval is required before credential binding, GHCR publication, rollout, live provider validation, or deployed-target acceptance |
| Phase 8 — D2 execution/rollout/live verification | pending | Post-approval only: capture actual digests/hostnames, bind credentials, deploy, validate providers, run manual acceptance, and record rollback evidence |
| Phase 9 — final review/closeout | pending | Requires all prior evidence |

## S1 target-binding checkpoint

The maintainer supplied a scoped S1 packet with Railway project/environment IDs, application service
IDs, Railway-generated-domain policy, GHCR public namespace, health/readiness semantics, rollback
owner/objective, and candidate stateful providers. The maintainer later bound the Railway region to
Singapore `asia-southeast1-eqsg3a`, approved a dedicated MongoDB Atlas Free public-demo project
with an explicit `0.0.0.0/0` demo-only allowlist exception plus compensating controls, and supplied
non-secret Atlas resource/security evidence for `kitta-chat` / `Cluster0` in Hong Kong. The packet
reports no current `serviceInstances`, so it does not authorize runtime deployment. UUID
shape/uniqueness and no-connect protocol checks passed locally; the full disposition is in
`k6-railway-public-demo-target-binding.md`.

The maintainer subsequently supplied CloudAMQP S1 permission/read-back evidence: a shared `Little
Lemur` RabbitMQ instance at version `4.2.7`, application vhost/user identifier `bptdlerq`, and
same-credential Management UI authentication. The provider-managed boundary is accepted, but the
shared-plan UI does not expose `configure`/`write`/`read` permission regexes; they remain
`NOT_ASSERTED`. This is not least-privilege evidence and no provider policy was changed. The full
record is `k6-public-demo-s1-cloudamqp-evidence.md`.

Remaining S1 gaps are none at the resource/security evidence boundary. CloudAMQP permission regexes
remain intentionally unasserted under the accepted provider-managed shared-plan boundary; AWS S3
live compatibility, exact CORS, credential creation/binding, and all provider runtime behavior
remain D2-bound.

The provider-readiness research and exact minimum resource/evidence contract are recorded in
`k6-public-demo-s1-provider-readiness-research.md` and
`k6-public-demo-s1-resource-readiness.md`.

The following are explicitly `PENDING_D2`, not S1 blockers: generated edge hostname, derived
`URL_FRONTEND` and `CORS_ALLOWED_ORIGINS`, actual GHCR digests, Railway private hostnames, live
healthcheck settings, runtime region read-back, and live Railway-to-provider connectivity.

The full target record is [k6-railway-public-demo-target-binding.md](k6-railway-public-demo-target-binding.md).
The exact resource/evidence contract is [k6-public-demo-s1-resource-readiness.md](k6-public-demo-s1-resource-readiness.md).
The MongoDB Atlas S1 evidence is [k6-public-demo-s1-mongodb-atlas-evidence.md](k6-public-demo-s1-mongodb-atlas-evidence.md).
The Upstash Redis S1 evidence is [k6-public-demo-s1-upstash-evidence.md](k6-public-demo-s1-upstash-evidence.md).
The CloudAMQP S1 evidence is [k6-public-demo-s1-cloudamqp-evidence.md](k6-public-demo-s1-cloudamqp-evidence.md).
The AWS S3 S1 evidence is [k6-public-demo-s1-s3-evidence.md](k6-public-demo-s1-s3-evidence.md).

## Phase 2 approved specification and design checkpoint

The S1 provider-binding evidence is complete. The first Phase 2 design review requested changes, the
consistency revision was published, and the maintainer has now approved the Phase 2 design. The
approved checkpoint has the following artifacts:

- Specification: [GitHub Issue #110](https://github.com/NhiBuaa/kitta-chat/issues/110), labelled
  `ready-for-agent`; the consistency revision is published as [Issue #110 comment](https://github.com/NhiBuaa/kitta-chat/issues/110#issuecomment-5377646379).
- Design: [k6-public-demo-phase2-design.md](k6-public-demo-phase2-design.md).
- Architectural decision: [ADR-016](../../docs/adr/016-k6-public-demo-target-configuration-seam.md),
  now `accepted` for Phase 3 decomposition; D2 remains separate.
- Current World Model additions: `Public Demo Environment`, `Provider Binding`, `Capability
  Contract`, `Runtime Capability Document`, `Railway Readiness Authority`, and `D2 Deployment
  Checkpoint`.

The revised seam set is: target runtime configuration, public edge route contract, runtime capability
document, capability contract, Railway readiness authority, health/public response projection, S3
object-storage activation boundary, WebRTC ICE configuration, and the server-enforced synthetic
signup boundary. The consistency revision also separates the pre-approval D2 Authorization Request
from the post-approval D2 Execution Evidence Record and reconciles Phase 5/6 candidate preparation
with the Phase 7/8 D2 transition. The design fixes backend `/readyz` as Railway readiness, edge
`/healthz` as public liveness, records the complete topology and service binding matrix, and preserves
the no-payload/domain-ownership-change boundary. Image-worker `REDIS_URL` is retained with a traced
dependency reason through cache Redis and the Socket.IO Redis emitter.

## Phase 3 ticket graph — approved and published

The maintainer approved the exact eight-ticket graph and authorized publication only. `to-tickets`
published Issues #111–#118 in dependency order with parent #110 and `ready-for-agent`; read-back
verified every title, label, parent, and blocker reference. Publication does not authorize
implementation or any D2 action.

### [K6-01 — Target configuration, runtime capability document và Vite same-origin contract](https://github.com/NhiBuaa/kitta-chat/issues/111)

- **Blocked by:** None — initial frontier.
- **Scope:** validated target configuration seam; non-secret runtime capability document; same-origin
  frontend build/runtime contract; fail-closed runtime-config loading.

### [K6-02 — Railway edge upstream, public routes và sanitized health projection](https://github.com/NhiBuaa/kitta-chat/issues/112)

- **Blocked by:** [Issue #111](https://github.com/NhiBuaa/kitta-chat/issues/111).
- **Scope:** configurable `BACKEND_UPSTREAM`; `/api` and `/socket.io` proxy contract; edge `/healthz`;
  sanitized public readiness projection if retained; no public `/ops`, `/metrics`, or verbose backend
  health leakage.

### [K6-03 — Backend capability gates, synthetic signup và environment validation](https://github.com/NhiBuaa/kitta-chat/issues/113)

- **Blocked by:** [Issue #111](https://github.com/NhiBuaa/kitta-chat/issues/111).
- **Scope:** fail-closed capability gates; recovery/password reset disabled; Google login disabled;
  upload initially false; call capability binding; server-enforced `K6_SYNTHETIC_SIGNUP_ONLY`;
  least-privilege target-environment validation; existing public request/response payload shapes
  preserved.

### [K6-04 — S3 upload boundary, prefix/private-object policy và image-worker storage path](https://github.com/NhiBuaa/kitta-chat/issues/114)

- **Blocked by:** [Issue #113](https://github.com/NhiBuaa/kitta-chat/issues/113).
- **Scope:** resolve `queue-sources/*` versus approved `uploads/*`/`avatars/*`; preserve prefix-scoped
  IAM; define private-object download/delivery semantics; bound presigned upload/multipart behavior;
  define the image-worker S3 path; keep upload fail-closed until D2 activation.

### [K6-05 — WebRTC ICE configuration và call readiness fixture](https://github.com/NhiBuaa/kitta-chat/issues/115)

- **Blocked by:** [Issue #111](https://github.com/NhiBuaa/kitta-chat/issues/111) and
  [Issue #112](https://github.com/NhiBuaa/kitta-chat/issues/112).
- **Scope:** target-configurable ICE; no long-lived TURN credential in frontend artifacts; media-path
  acceptance fixture; signaling-only success cannot count as call readiness; retain the TURN gap as
  an explicit D2 risk.

### [K6-06 — Demo seed/reset operating boundary](https://github.com/NhiBuaa/kitta-chat/issues/116)

- **Blocked by:** [Issue #113](https://github.com/NhiBuaa/kitta-chat/issues/113).
- **Scope:** deterministic/idempotent `.test` seed; guarded remote seed; namespace-bounded reset and
  cleanup; dry-run-safe cleanup; no startup seed/reset; no personal, sensitive, or production data.

### [K6-07 — Candidate image build, CI validation và Railway descriptors](https://github.com/NhiBuaa/kitta-chat/issues/117)

- **Blocked by:** [Issue #112](https://github.com/NhiBuaa/kitta-chat/issues/112),
  [Issue #113](https://github.com/NhiBuaa/kitta-chat/issues/113),
  [Issue #114](https://github.com/NhiBuaa/kitta-chat/issues/114),
  [Issue #115](https://github.com/NhiBuaa/kitta-chat/issues/115), and
  [Issue #116](https://github.com/NhiBuaa/kitta-chat/issues/116).
- **Scope:** pre-D2 candidate image build only; CI/build validation; edge/server-worker packaging;
  Railway service descriptors; immutable-artifact workflow preparation; no GHCR publication and no
  Railway deployment.

### [K6-08 — Locked D2 manual acceptance guide và evidence package](https://github.com/NhiBuaa/kitta-chat/issues/118)

- **Blocked by:** [Issue #117](https://github.com/NhiBuaa/kitta-chat/issues/117).
- **Scope:** prepare and lock the deployed-target acceptance contract; provider/live connectivity;
  auth/direct/group/sidebar/call/upload cases; disabled capability cases; secret-safe logging;
  health/readiness; digest/revision/rollback evidence schema; preparation only, with no deployed-
  target execution before D2.

### Graph validation and frontier

The graph is acyclic: every edge points to an earlier prerequisite, and no ticket depends on itself
or on a downstream ticket. The dependency levels are:

1. Initial frontier: `K6-01` / Issue #111.
2. After Issue #111: Issues #112 and #113 may proceed in parallel.
3. After Issue #113: Issues #114 and #116 unlock; after Issue #112, Issue #115 unlocks.
4. Issue #117 waits for Issues #112 through #116 according to its declared edges.
5. Issue #118 waits for Issue #117.

The published graph intentionally preserves the implementation/D2 risks: STUN-only/TURN gap, the S3
`queue-sources/*` prefix mismatch, private-object URL behavior, live Atlas/Upstash/CloudAMQP/S3
compatibility, public health sanitization, and first-deployment rollback evidence. These are not
silently marked Pass by decomposition.

### Cadence classification

The effective review cadence is **`high`**. The classification is driven by security,
authorization, privacy/synthetic identity, public API/auth behavior, public Internet exposure,
S3 private-object boundaries, WebRTC/concurrency behavior, and deployment/rollback evidence.
The planned gates are spec/design external review, external review for every ticket, external review
for every manual guide, human acceptance, and one final whole-scope `code-review`. The deterministic
plan is stored at `k6-public-demo-review-cadence-plan.json`, with its input at
`k6-public-demo-review-cadence-input.json`. The plan artifact SHA-256 is
`f90725533a77d6b6c3ada162f8efb84e115e8d893c3b310b0b87acbd505e9058`.

`to-tickets` publication is complete and read back. The authoritative implementation frontier is
Issue #111, but implementation remains unauthorized at this checkpoint.

## Canonical plan checkpoint

The complete approved K6 plan is recorded at
[k6-public-demo-plan.md](k6-public-demo-plan.md). The file was amended for the CloudAMQP S1
disposition and read back on 2026-08-21; it has SHA-256
`931f5d4592bc30034139aafc9dc32fdfd9fc0e11b85d3b8e68e79e6ec725abe6`.

This checkpoint only makes the plan durable and resumable. It does not authorize D2, create secrets,
publish images, mutate providers, deploy, commit, push, open/merge a PR, or enable Issue #61
measurement. Phase 3 decomposition/publication is complete; implementation and all D2 actions remain
separately gated.

## Next valid transition

The maintainer approved the end-to-end plan and pre-D2 execution. Bootstrap B0 is active. After B0
is committed and pushed, create the dedicated integration worktree and obtain a fresh external
spec/design review. Issue #111 remains the initial implementation frontier, but its ticket review,
locked-guide review, and maintainer guide approval must complete before implementation. GHCR
publication, credential binding, Railway rollout, live provider validation, and deployed-target
manual acceptance remain prohibited until the later D2 Authorization Request is human-approved.
Upstash's application-client topology is accepted;
provider-internal mode is intentionally unasserted. CloudAMQP permission regexes remain
`NOT_ASSERTED`. The current S3 `queue-sources/*` mismatch, STUN-only WebRTC, private-object URL
behavior, live provider compatibility, health sanitization, and first-deployment rollback remain
explicit risks.

## Non-actions

The approved pre-D2 workflow has started at Bootstrap B0. No provider mutation, registry login,
secret creation, source/runtime/CI behavior change, Issue #61 measurement enablement, deployment,
commit, push, PR, or merge has occurred at this checkpoint.

## Workflow tooling note

The repository does not contain the feature-delivery helper scripts referenced by the global skill.
The global deterministic cadence planner was used successfully for this graph. The global
observability emitter cannot represent the Phase 3 decomposition/publication transition because its
supported-transition schema has no decomposition or ticket-publication value; no semantically false
event was emitted. This workflow-tooling mismatch does not authorize bypassing any acceptance,
implementation, S1, or D2 gate.
