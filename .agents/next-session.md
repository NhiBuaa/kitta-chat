# Next Session — K6 Bootstrap B0 and Issue #111 Frontier

The maintainer approved `docs/deployment/k6-end-to-end-execution-plan.md` and activated pre-D2
execution. Bootstrap B0 is the current transition. Complete the B0 baseline, commit only K6
planning/governance artifacts as `docs(k6): lock public-demo execution baseline`, push
`nhibuaa/k6-public-demo`, record exact `B0`, return the canonical checkout to clean `main`, and
create `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-integration`.
The approved plan SHA-256 is `43fadb48bdf900b9bd4be2e8d50f12e3d583542ad5ed123f687db8bcd14014f3`.

The unrelated root `mongoose` WIP is intentionally excluded at
`C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k6-preexisting-root-mongoose.patch`; SHA-256 is
`5B200E0BE700AB2A87F9F0E453711A7879B5B7BE15F337FE8CD30606EB60DAD2`. Do not add this patch or
the package diff to K6.

After B0, obtain a fresh external spec/design review. Then prepare Issue #111 through external
ticket review, `test-craft`, locked manual guide, external guide review, and maintainer guide
approval. Do not implement #111 before those gates. D2 remains unauthorized.

K5 is complete and merged into `main` at `72a9828579f34c0b88c9c8a1c51c2c4f8225c1ca`. K6 has been
authorized as a separate Railway `public-demo` workflow on branch `nhibuaa/k6-public-demo`, based
on that commit. Phase 0 and official Railway research are complete. The maintainer supplied the S1
target packet; an authenticated explicit Railway CLI read-back confirmed the supplied
project/environment/service IDs and empty `serviceInstances`/`volumeInstances` sets. The maintainer
has bound Singapore `asia-southeast1-eqsg3a`, approved the dedicated MongoDB Atlas Free demo
exception, and fixed the two GHCR package names. The maintainer accepted the Upstash
single-endpoint application-client topology without asserting provider-internal mode and accepted
the CloudAMQP provider-managed vhost/user boundary without asserting permission regexes. Phase 1
provider-binding evidence is complete. Phase 2 consistency revision was approved by the maintainer;
the Phase 3 graph was approved and published as Issues #111–#118, while implementation remains
unauthorized;
hostname/CORS, digests, private
hostnames, healthcheck settings, runtime region and live provider connectivity are `PENDING_D2`.

Resume from these authoritative records:

- `docs/deployment/k6-public-demo-plan.md` (canonical K6 plan; SHA-256
  `931f5d4592bc30034139aafc9dc32fdfd9fc0e11b85d3b8e68e79e6ec725abe6`)
- `docs/deployment/k6-public-demo-feature-delivery.md`
- `docs/deployment/k6-railway-public-demo-research.md`
- `docs/deployment/k6-public-demo-s1-resource-readiness.md`
- `docs/deployment/k6-public-demo-s1-provider-readiness-research.md`
- `docs/deployment/k6-public-demo-s1-upstash-evidence.md`
- `docs/deployment/k6-public-demo-s1-cloudamqp-evidence.md`
- `docs/deployment/k6-public-demo-s1-s3-evidence.md`
- `docs/deployment/k6-public-demo-phase2-design.md`
- `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- `.agents/CONTEXT.md`
- Specification: [GitHub Issue #110](https://github.com/NhiBuaa/kitta-chat/issues/110)
- `docs/deployment/k6-railway-public-demo-target-binding.md`
- `.agents/current-session.md`
- Resume Contract: `C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k6-railway-public-demo-s1-provider-validation.json`

The current checkpoint is `PHASE_3_PUBLISHED_IMPLEMENTATION_NOT_AUTHORIZED`. `to-tickets` published
and read back Issues #111–#118 with real blocking edges. The current frontier is Issue #111, but the
maintainer explicitly withheld implementation authority.
The D2 boundary is now split: a pre-approval D2 Authorization Request contains plans, known
identities, and exact requested actions, while actual digests, hostnames, derived URLs, live checks,
revisions, manual acceptance, and rollback results belong only to the post-approval D2 Execution
Evidence Record.
AWS S3
resource/security evidence is recorded in `k6-public-demo-s1-s3-evidence.md`. Credential ownership
boundaries are recorded without secret values. Upstash resource evidence and accepted application-client
topology are recorded in
`k6-public-demo-s1-upstash-evidence.md`; MongoDB Atlas S1 evidence is recorded in
`k6-public-demo-s1-mongodb-atlas-evidence.md`; live provider connectivity remains D2-bound. Do not
send secret values in chat. Runtime-only D2 evidence must remain pending until the D2 checkpoint.

CloudAMQP S1 permission evidence is deliberately bounded: the shared-plan UI does not expose
`configure`/`write`/`read` regexes, so they remain `NOT_ASSERTED`; no least-privilege claim, policy
change, or manual queue provisioning is permitted. Live queue operations and worker behavior remain
`PENDING_D2`.

No runtime change, image publication, deployment, commit, push, PR, merge, or measurement enablement
is authorized by this checkpoint. The approved revision explicitly records backend `/readyz` as
Railway readiness, edge `/healthz` as public liveness, the complete service binding matrix, runtime
capability document, fail-closed upload sequence, STUN-only WebRTC risk, server-enforced synthetic
signup, image-worker Redis usage, and the split D2 contracts. Pre-D2 work may only build/test/prepare candidates; GHCR publication, credential
binding, Railway rollout, live provider validation, and deployed-target manual acceptance require
the later human-approved D2 Authorization Request.

## Phase 3 published graph — do not implement without new approval

The exact published graph is:

1. [Issue #111](https://github.com/NhiBuaa/kitta-chat/issues/111), `K6-01 — Target configuration, runtime capability document và Vite same-origin contract` —
   blocked by none.
2. [Issue #112](https://github.com/NhiBuaa/kitta-chat/issues/112), `K6-02 — Railway edge upstream, public routes và sanitized health projection` — blocked by #111.
3. [Issue #113](https://github.com/NhiBuaa/kitta-chat/issues/113), `K6-03 — Backend capability gates, synthetic signup và environment validation` — blocked by #111.
4. [Issue #114](https://github.com/NhiBuaa/kitta-chat/issues/114), `K6-04 — S3 upload boundary, prefix/private-object policy và image-worker storage path` — blocked by #113.
5. [Issue #115](https://github.com/NhiBuaa/kitta-chat/issues/115), `K6-05 — WebRTC ICE configuration và call readiness fixture` — blocked by #111 and #112.
6. [Issue #116](https://github.com/NhiBuaa/kitta-chat/issues/116), `K6-06 — Demo seed/reset operating boundary` — blocked by #113.
7. [Issue #117](https://github.com/NhiBuaa/kitta-chat/issues/117), `K6-07 — Candidate image build, CI validation và Railway descriptors` — blocked by #112, #113, #114, #115, and #116.
8. [Issue #118](https://github.com/NhiBuaa/kitta-chat/issues/118), `K6-08 — Locked D2 manual acceptance guide và evidence package` — blocked by #117.

Frontier: Issue #111 only. After #111, #112 and #113 are parallel. Then #114 and #116 follow #113,
#115 follows #112, #117 waits for #112 through #116 according to its declared edges, and #118
follows #117. The graph is acyclic and preserves the explicit STUN/TURN,
S3-prefix, private-object, live-provider, health-sanitization, and first-rollback risks.

Cadence is `high`; the deterministic plan is recorded in
`docs/deployment/k6-public-demo-review-cadence-plan.json` with SHA-256
`f90725533a77d6b6c3ada162f8efb84e115e8d893c3b310b0b87acbd505e9058`. The required gates are spec/design
external review, every-ticket external review, every-guide external review, human acceptance, and
final whole-scope `code-review`. Publication is complete, but no acceptance guide, worktree, or
implementation may begin until the maintainer explicitly authorizes bounded Issue #111 delivery.

## K5 Post-Acceptance Checkpoint

## K5 package has human approval

The docs-only K5 security-readiness package is committed at `9e0fcad` on branch
`feature/security-readiness-package` from base `4388ed842498fa85d90a95d06944e7c9db936e25` and is
open for review in [PR #108](https://github.com/NhiBuaa/kitta-chat/pull/108). The PR artifacts are:

- `docs/security/k5-security-readiness-package.md`
- `docs/security/k5-security-readiness-research.md`

Focused source/test verification passed server `16/16` and client `2/2`. User approval was
recorded on 2026-08-19 before the final feature review sequence. The post-acceptance whole-scope
Standards/Spec review is `APPROVE` with zero findings, and cadence validation is `ready` with
evidence digest `sha256:760eaccd1128b86687994db217dd4ef430feb42d8152857f72d41c56be578ccf`.

The approval covers the package as an evidence record and preserves the stale-document question,
the 29-current-policy-ID versus historical-27-point scope difference, and the CastError observation
as open evidence questions. This K5 checkpoint is complete for the stated docs-only scope. Do not
implement remediation, change policy values, rerun deployment/Redis evidence, commit, merge, or
deploy; deployment, measurement, and K6 remain separately unauthorized.

## Historical Next Session — K4 Leader Closeout

## No next K4 slice is active

K4 is complete under locked Issue #80 and ADR-015. The final Issue #89 remediation was published
by [PR #106](https://github.com/NhiBuaa/kitta-chat/pull/106) and merged into `main` at
`ef42b99cee93c0dfd5d6c770e5f3698f38c55599`; Issues #80–#89 are `CLOSED`. That commit is the K4
implementation fixed point; the docs-only publication is a separate change.

The final11g fixed-point descriptor is
`C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-remediation-fixed-point-descriptor-20260818-final11g.json`
with exact diff SHA-256
`sha256:8e441c6d64147a675aca8dbe77c0c540fcc362ded7acf524d131aa7042e26903`. Independent
Standards/Spec review and the aggregate final feature review are `APPROVE` with zero
Critical/Major/Minor findings; cadence validation is `ready`. The final11g acceptance is
`PASSED` with explicit `human_approval=approved`.

Retained evidence is a valid six-cell baseline/report, a `READY_FOR_HUMAN_GATE` bottleneck dossier,
an `ACCEPTED` optimization comparison, and seven `COMPLETED + MEASURED/PUBLISHABLE` runs. The
single approved treatment is the sidebar query-plan optimization. Qualification flags remain
claim-specific (`TOPOLOGY_NOT_EXERCISED` for sidebar single-replica and `OBSERVATION_INCOMPLETE`
for the declared cells); no new benchmark claim or scope is implied.

Verification is focused lifecycle/cleanup `30/30`, full K4 `252/252`, repository CI `132/132`,
`npm run ci:validate` exit `0`, and `git diff --check` exit `0`. No implementation, review,
acceptance, or publication transition remains. Any future K4 work requires a new approved Issue
#80/ADR-015 authority change; do not infer a next slice from the historical checkpoints below.

## Historical checkpoints (superseded)

## Current fixed point — 2026-08-18 final11g

The final bounded Issue #89 cleanup remediation is implemented but uncommitted on
`nhibuaa/k4-remediation-final`. Ownership is registered before setup/resource creation after fresh
admission; teardown reports exact no-resource/released/unsafe outcomes from the owned target set.
Verification is lifecycle/cleanup `30/30`, full K4 `252/252`, repository CI `132/132`,
`npm run ci:validate` exit `0`, `git diff --check` exit `0`, with retained final11 evidence
revalidated. No benchmark rerun is required. Pin the new exact descriptor, rerun final Standards
and feature review, then fresh acceptance/cadence; only after those gates commit/PR/merge/sync.

## Current fixed point — 2026-08-18 final11f

The last approved Issue #89 evidence-integrity hardening is implemented but uncommitted on
`nhibuaa/k4-remediation-final`. `verifyBundle` now enforces exact source-inventory/report/declared
derived-artifact membership and rejects extra, missing, duplicate, or path-alias entries. No K4
benchmark semantics or retained measurement inputs changed. Verification is focused `72/72`, full
K4 `248/248`, repository CI `132/132`, `npm run ci:validate` exit `0`, and `git diff --check`
exit `0`.

Next valid transition: pin the refreshed descriptor, rerun final exact-diff reviews, record fresh
acceptance/cadence evidence, then commit/PR/merge and synchronize `main`. Stop on any new
Critical/Major finding or benchmark-semantic ambiguity.

## Current fixed point — 2026-08-18 final11d

Issue #89’s approved bounded remediation is present but intentionally uncommitted on
`nhibuaa/k4-remediation-final` at
`D:\Developer\Projects\shotter\shot-chat-worktrees\k4-remediation-final`, based on
`4609fcf8a0cb445855d625f5998130721f30a70d`. Exact fixed-point descriptor:
`C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-remediation-fixed-point-descriptor-20260818-final11d.json`;
binary diff SHA-256 is
`sha256:a8573abee62e94a4640648fe977fd55ed551420dc6e059fbff6697de6978ce4a`.

The hardening is limited to fail-closed bundle source membership, exact sidebar measured-request
attribution coverage, and required comparison metadata validation. No scenario, topology,
workload, measurement, treatment, Issue #80/ADR-015, guide, prior Evaluation, or raw artifact
was changed. Fresh final11 retained evidence remains valid: six baseline cells plus the approved
sidebar treatment are `COMPLETED + MEASURED`; matrix/report/dossier/comparison revalidation passes.

Verification is focused `71/71`, full K4 `247/247`, repository CI `132/132`,
`npm run ci:validate` exit `0`, and `git diff --check` exit `0`. The next valid transition is
fresh exact-fixed-point acceptance and cadence evidence after independent spec, ticket, and manual
guide reviews, followed only then by commit/PR/merge and local `main` synchronization. Stop on any
Critical/Major finding or benchmark-semantic ambiguity.

## Current fixed point — 2026-08-18

The approved bounded Issue #89 remediation is implemented but remains uncommitted on
`nhibuaa/k4-remediation-final` at
`D:\Developer\Projects\shotter\shot-chat-worktrees\k4-remediation-final`. Fresh final5
retained artifacts satisfy the six-cell baseline and one approved sidebar treatment pair.
Derived dossier `.k4-results/k4r5-20260818-final5-bottleneck-dossier-v3.json` is
`READY_FOR_HUMAN_GATE`; derived comparison
`.k4-results/k4r5-20260818-final5-optimization-comparison.json` is `ACCEPTED` with no validator
diagnostics. The treatment remains exactly
`profile-and-optimize-sidebar-query-plan`, implementation digest
`sha256:4d090905bac048576ac311572f90c85ebdd52997d1b273a52a27cf9992258ff1`.

Verification: changed-surface K4 `150/150`, full K4 `242/242`, repository CI `132/132`,
`npm run ci:validate` exit `0`, and `git diff --check` exit `0`.

Next valid transition: create the fresh exact-diff descriptor, then coordinate three independent
reviews (spec/design, ticket/decomposition, manual guide/acceptance). Any Critical/Major finding
or benchmark-semantic ambiguity stops the workflow and returns to the user. If all three reviews
approve, run the cadence evidence gate and request/record the required human acceptance; only
then may the user authorize commit/merge/publish. Do not mutate Issue #80/ADR-015, locked guides,
append-only Evaluations, raw source artifacts, or add optimization scope.

## Current checkpoint — r5 selective rerun blocked at bottleneck eligibility

The user approved selective invalidation of the accepted r3/r4 measured inputs and a fresh rerun.
Current code fixes are uncommitted and verified by focused `103/103`, full K4 `236/236`,
repository CI `132/132`, `ci:validate` exit `0`, and `git diff --check` exit `0`. Historical
artifacts and locked guides/Evaluations remain immutable. Locked guide:
`.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r5.md`.
The append-only r5 Evaluation records a `BLOCKED` result at TC-89-R5-03: the fresh six-cell matrix
is `VALID`, but canonical sidebar resource coverage is not bound to the declared half-open window
(expected 31 versus cadence-derived 30), so the bottleneck claim is ineligible. The fresh treatment
pair remains preserved, and no optimization comparison/dossier is publishable. No commit, merge,
publish, guide mutation, or Evaluation rewrite is allowed.

## Approved bounded remediation — 2026-08-17 canonical outcomes/effective provenance

The user approved only the two final spec findings `K4-SD-FINAL-V4-001` and
`K4-SD-FINAL-V4-002`. The current uncommitted worktree includes outcome-aware canonical loading
for persisted `FAILED_SETUP`/`NOT_RUN` artifacts and effective runtime provenance bound to actual
Compose/container inspection, runner isolation diagnostics, and observer-helper handshake evidence.
Missing proof is retained and qualifies measured evidence with `OBSERVATION_INCOMPLETE`; plan-only
values cannot produce `ATTESTED` provenance. Verification is focused `103/103`, full K4 `236/236`,
repository CI `132/132`, `ci:validate` exit `0`, and `git diff --check` exit `0`.

Fixed-point descriptor: `C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-remediation-fixed-point-descriptor-20260817-final-v8.json`;
it is the sole authority for the exact fixed-point diff. Manual acceptance is currently BLOCKED at
the bottleneck prerequisite; the next valid transition requires a new explicit approval for the
resource-window remediation. Do not start independent reviews, commit, merge, publish, mutate
guides, or rewrite append-only Evaluations while this blocker remains.

## Approved bounded remediation — 2026-08-17 resource/provenance

The user approved the two bounded Major fixes: recompute resource cadence expected-count from
the retained measurement window and interval, and wire complete non-secret provenance metadata
from production composition into measured manifests. Verification is changed-surface `76/76`,
full K4 `227/227`, repository CI `132/132`, `npm run ci:validate` exit `0`, and `git diff --check`
exit `0`. Refresh the fixed-point descriptor and rerun exactly three independent reviews; stop
on any Critical/Major finding. No commit, merge, publish, guide/Evaluation mutation, or authority
change is allowed.

## Approved bounded remediation — 2026-08-17 pre-window completeness

The user approved the final bounded remediation for the remaining Major finding in the K4 Issue
#89 remediation fixed point. The change is limited to preserving pre-window socket
`truncated`/`rotationGap` flags in raw and aggregate attribution evidence plus its regression.
Verification is changed-surface `74/74`, full K4 `225/225`, repository CI `132/132`,
`npm run ci:validate` exit `0`, and `git diff --check` exit `0`. Refresh the fixed-point
descriptor and rerun exactly three independent reviews; stop on any Critical/Major finding.
No commit, merge, publish, guide/Evaluation mutation, or authority change is allowed.

## Remediation handoff checkpoint — 2026-08-16

The K4 remediation implementation plus bounded external-review fixes is present but intentionally uncommitted on branch
`nhibuaa/k4-remediation-final` at
`D:\Developer\Projects\shotter\shot-chat-worktrees\k4-remediation-final`. Current verification
is K4 `224/224`, repository CI `132/132`, `npm run ci:validate` exit `0`, and `git diff --check`
exit `0`. The independent reviews of the previous descriptor returned `REQUEST_CHANGES` and are
retained as remediation inputs; they do not approve the refreshed diff. Do not commit, merge,
publish, or mutate locked guides/Evaluations until refreshed independent reviews are complete and
the cadence validator returns `ready`.

## Current Frontier Override

Issues #81–#89 are complete, closed, and integrated into `main`. Issue #89 was published by PR
#103, merged at `8871adeb6ad2913f435dc7d2272a6b650b61677d`; the integration branch head before
merge was `4609fcf`. The only remaining K4 transition at this historical checkpoint was the final
feature review; final11g completed it as `APPROVE`.

## Issue #89 Acceptance Checkpoint

Manual guide revisions `k4-issue-89-r1` and `k4-issue-89-r2` remain immutable and unapproved.
Revision `k4-issue-89-r3` is locked and human-approved at
`.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r3.md`
(`2026-08-16T11:52:30+07:00`, approved by `user`). Issue #89 implementation and manual acceptance
execution are complete for r3. Revision `k4-issue-89-r4` is locked and human-approved at
`.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.md`
(`2026-08-16T13:30:07+07:00`, approved by `user`); r4 execution is now complete but its Evaluation
is now `PASSED` with explicit human approval in append-only record
`tc89-r4-treatment-comparison-20260816-approved`.

The r3 baseline remains accepted with focused Issue #89 tests 13/13, full K4 plus server
attribution 193/193, `npm run test:ci` 132/132, and `npm run ci:validate` passing. The r3
append-only Evaluation
`.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r3.evaluations.jsonl`
contains the original `tc89-r3-baseline-20260816` with `verdict=BLOCKED` and
`human_approval=pending`, followed by append-only `tc89-r3-baseline-20260816-approved` with
`verdict=PASSED` and `human_approval=approved`. The r4 append-only Evaluation
`.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.evaluations.jsonl`
ends with `tc89-r4-treatment-comparison-20260816-approved` (`verdict=PASSED`,
`human_approval=approved`) after the prior BLOCKED/pending observation. The valid comparison
artifact is `.k4-results/k4issue89r4-20260816-optimization-comparison.json`.
Integration verification is complete on `e38cfff`; selective invalidation found no changed
acceptance input, authoritative guide/Evaluation, environment, or approved behavior, so r3/r4
Evaluations remain valid without rerun. Preserve all prior runs and guide revisions; [PR #103](https://github.com/NhiBuaa/kitta-chat/pull/103)
is `MERGED` into `main`, and GitHub Issue #89 is `CLOSED`. Final review was deferred at this
historical checkpoint and was completed as `APPROVE` in final11g above.

## Current Parallel Frontier Override

Issues #81–#89 are complete and integrated; no implementation frontier remains. Final K4 review was
deferred at this historical checkpoint and was completed as `APPROVE` in final11g above.

## Issue #86 Completion Checkpoint

Manual guide revision `k4-issue-86-r2` is locked and human-approved at
`.agents/manual-tests/k4-performance-evidence/issue-86-sidebar-scenario-r2.md`; r1 remains
immutable and unapproved. Implementation and automated verification are complete. Fresh execution
`issue86-r2-attribution-20260816` observed TC-86-01 through TC-86-04 PASS; its pending record was
followed by approved append-only Evaluation `issue86-r2-attribution-20260816-approved`. The
explicit TC-86-02 matrix proves identical commit SHA, hardware, dataset, workload,
runner/configuration, and only topology/replica-count differences. Issue #86 was published by PR
#102 and is closed; final K4 review was deferred at this historical checkpoint and was completed as
`APPROVE` in final11g above.

## Issue #88 Completion Checkpoint

Issue #88 implementation and manual acceptance are complete and integrated by PR #101. Guide
`k4-issue-88-r3` remains immutable; Evaluation
`tc88r3-acceptance-20260816-approved` is `PASSED` with explicit human approval. Final K4 feature
review was deferred at this historical checkpoint and was completed as `APPROVE` in final11g above.

## Issue #87 Closeout Checkpoint

Issue #87 implementation and TC-87-03 remediation were completed on `codex/k4-issue87`, then
published by PR #99 and merged into `main` at `cfd1bf90c490dfcfe3349107f841269d1b6aa720`.
The locked `k4-issue-87-r2` guide and append-only Evaluation history are retained: TC-87-01 through
TC-87-05 all pass, and `tc87-r2-acceptance-20260814` is `PASSED` with explicit human approval.
GitHub Issue #87 is closed; do not reopen or extend this slice from this worktree.

## Issue #85 Completion Checkpoint

Manual guide revision `k4-issue-85-r3` is locked and human-approved at
`.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.md`; r1
and r2 remain immutable. It covers whole-file exact retained source-inventory bytes, source/bundle provenance,
report hardware/measured-scope guardrails, exact resource-coverage boundaries, report immutability,
run collision and incomplete state, independent/combined qualification axes, attribution/`NOT_RUN`,
and separate optimization versus topology comparison contracts. Review cadence is `high` at
`.agents/manual-tests/k4-performance-evidence/issue-85-review-cadence.json`.

The current cadence evidence envelope is
`.agents/manual-tests/k4-performance-evidence/issue-85-review-cadence-evidence-r3.json`. The
required high-cadence spec/design, ticket, and manual-guide external reviews are complete with
`APPROVE` and zero Critical/Major/Minor findings. Human acceptance is complete; the final
feature review is intentionally deferred until the complete K4 feature reaches its fixed point.

The delegated implementation is complete in the dedicated `codex/k4-issue85` worktree. Focused
K4 tests pass 12/12 and `npm run test:ci` passes 132/132. The append-only manual Evaluation
`issue-85-provenance-report-validator-r3.evaluations.jsonl` records all required TC-85-01 through
TC-85-08 observations as PASS; explicit human approval is recorded by
`tc85r3-human-approved-20260814`.

Issue #85 implementation and acceptance are complete. Its implementation and evidence remain
preserved here as historical K4 evidence; it has no additional implementation scope and is not a
parallel frontier.

## Current State

The accepted Issue #89 worktree was integrated into `codex/k4-integration` at `4609fcf` and merged
into `main` by [PR #103](https://github.com/NhiBuaa/kitta-chat/pull/103) at
`8871adeb6ad2913f435dc7d2272a6b650b61677d`. GitHub Issue #89 is `CLOSED`; the single final K4
feature review was deferred at this historical checkpoint and was completed as `APPROVE` in
final11g above. Preserve all prior guide revisions, Evaluation records, and treated comparison
artifacts.

K4 Reproducible Performance Evidence was active at this historical checkpoint under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89; implementation, acceptance, integration, publication, and closure are complete.
Final K4 review was governed by the approved dependency graph and complete-feature fixed point and is
now recorded as `APPROVE` in final11g above.

The K4 session is leader-only. The leader coordinates `feature-delivery`, acceptance gates,
delegation, evidence, and issue state; it does not implement an issue itself. No implementation
frontier remains after Issue #89 publication.

Manual-acceptance guide revision `k4-issue-81-r4` is locked at
`.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.md`; r1 through r3
remain immutable. Issue #81 implementation and mandatory TC-81-01 through TC-81-04 passed and
were recorded in `.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.evaluations.jsonl`.
TC-81-05 remains conditional/non-blocking and was not executed. Issue #82 manual-acceptance
guide `k4-issue-82-r4` is locked and explicitly human-approved; r1 through r3 remain immutable.
Its timestamp and credential remediations are verified by fresh disposable setup/preflight: the
observed canonical Mongo fingerprint equals the declared deterministic fingerprint, warm-up is
admitted, nginx-mediated login and Socket.IO auth pass, and the retained-evidence scan is clear.
TC-82-03 and TC-82-05 are complete under r4. The append-only Evaluation
`issue-82-dataset-actors-preflight-r4.evaluations.jsonl` contains PASSED run
`tc82r4-acceptance-20260812` with explicit human approval; all completed disposable runs were
cleaned to empty K4 target inventories. Issue #82 was delivered by PR #92, merge commit
`af9daaacd1ec6c347f0c7fef74603c908e652608`, and is closed after final review APPROVE.

Issue #83 guide `k4-issue-83-r3` is locked and its Evaluation history is append-only. The merged
implementation resolves only approved `scenario:version` workload profiles, retains their exact-byte
SHA-256 evidence, prevents raw workload mutation in operational CLI paths, and executes K4 phases
through an injectable orchestration seam with ownership-safe teardown and independent status axes.
Its final closure review found zero Critical and zero Major findings. Targeted tests passed 14/14;
`npm run test:ci` passed 122/122. Issue #83 was delivered by PR #95, merge commit
`ce1adcd091fb00814e03c0021ab801a67621c168`, and is closed.

## Session Stop State

1. Preserve all accepted Issue #81–#89 implementations, immutable guide revisions, and append-only
   Evaluation histories; no ticket has additional implementation scope.
2. Issue #89 was historically integrated and published by PR #103 at merge commit
   `8871adeb6ad2913f435dc7d2272a6b650b61677d`; GitHub Issues #81–#89 are closed.
3. The final feature review was the remaining transition at this historical checkpoint; final11g
   completed it as `APPROVE`, and PR #106 subsequently synchronized `main` at `ef42b99`.

## Issue #87 Fixed Point

- Locked guide `k4-issue-87-r2` is approved and immutable.
- Evaluation `tc87-r2-acceptance-20260814` is `PASSED` with explicit human approval.
- `docs/k4-performance-evidence.md` is the repository delivery summary.
- Issue #87 focused K4 136/136; combined post-reconcile K4 143/143, repository CI 132/132, and
  server 476 passed/5 skipped/0 failed remain the recorded verification results.
- Fixed-point review is `APPROVE` with zero Critical/Major findings on both Standards and Spec axes.
- PR #99 is `MERGED` at `cfd1bf90c490dfcfe3349107f841269d1b6aa720`, and Issue #87 is `CLOSED`.

## Issue #84 historical implementation checkpoint (superseded)

- The observer-owned collector lifecycle, deterministic cadence, topology-complete histogram evidence,
  attribution derivation/raw-source parsing, typed observer-helper boundary, claim qualification, artifact
  persistence, and CLI-to-runner composition seams are implemented with automated coverage.
- Manual acceptance remains blocked. The approved Issue #83 profile snapshots do not define the production
  execution window and actor allocation needed by the production entry: fixed-rate duration and warm-up
  semantics are absent, while socket-concurrency has no actor allocation or ramp timeout. The production
  composition fails closed before setup when these fields are absent.
- Next valid transition: obtain a minimal upstream Issue #83/K4 authority amendment that locks those execution
  semantics and updates the approved immutable profile version(s). Then implement the concrete runner executable,
  rerun automated verification, and only afterward execute locked Issue #84 guide r4. Do not choose local defaults
  or run manual acceptance before that authority is approved.

## Issue #84 post-amendment historical checkpoint (superseded)

- The executable profile amendment is locked at Issue #80 comment
  `https://github.com/NhiBuaa/kitta-chat/issues/80#issuecomment-5275838939`.
- Approved v2 profiles and the runner workload executor are implemented; K4 automated tests pass 101/101 and
  `npm run test:ci` passes 132/132.
- Manual acceptance remains blocked by a concrete caller-graph defect: `runtimeComposition` constructs the
  observation lifecycle in the host CLI process, while the locked helper URL (`observer-helper:8080`) is only
  resolvable from the Compose observation network. The `observer` service is currently idle and does not own or
  expose the observation lifecycle. Running r4 now would therefore fail helper reachability or bypass the locked
  observer capability boundary.
- Next valid transition: implement and test the production observation RPC/caller path so the observer process on
  `k4-observation` owns observation lifecycle calls, the helper remains the only Docker authority, and the runner
  has no route or credential to either. Only after that path is proven should manual guide r4 execute.

## K4 Authorities

- Locked specification: https://github.com/NhiBuaa/kitta-chat/issues/80
- Ticket graph: https://github.com/NhiBuaa/kitta-chat/issues/81 through
  https://github.com/NhiBuaa/kitta-chat/issues/89
- Architecture boundary: `docs/adr/015-k4-performance-evidence-boundary.md`
- Locked Issue #82 guide: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.md`
- Issue #82 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.evaluations.jsonl`
- Locked Issue #83 guide: `.agents/manual-tests/k4-performance-evidence/issue-83-workload-profiles-runner-r3.md`
- Issue #83 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-83-workload-profiles-runner-r3.evaluations.jsonl`
- Issue #87 delivery summary: `docs/k4-performance-evidence.md`
- Locked Issue #87 guide: `.agents/manual-tests/k4-performance-evidence/issue-87-message-persistence-recipient-delivery-r2.md`
- Issue #87 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-87-message-persistence-recipient-delivery-r2.evaluations.jsonl`
- Issue #87 publication: PR #99, merge commit `cfd1bf90c490dfcfe3349107f841269d1b6aa720`
- Locked Issue #89 guide: `.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.md`
- Issue #89 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.evaluations.jsonl`
- Issue #89 publication: PR #103, merge commit `8871adeb6ad2913f435dc7d2272a6b650b61677d`
- Current World Model: `.agents/CONTEXT.md`
- Current workflow state: `.agents/current-session.md` and `.agents/feature-delivery-events/events.jsonl`;
  create a fresh Resume Contract only when suspending this workflow.
- Issue #84 historical execution branch/worktree: `codex/k4-issue84` /
  `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-84`
- Locked Issue #85 guide: `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.md`
- Issue #85 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.evaluations.jsonl`
- Resume Contract: `C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-feature-delivery-leader.json`
- Issue #85 completion worktree: `codex/k4-issue85` /
  `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-85`

## Guardrails

- Follow `feature-delivery` state transitions strictly.
- Implement only locked Issue #80 authority. Return ambiguity affecting benchmark semantics to
  Issue #80/ADR-015; do not create a new design decision in a ticket.
- Preserve MongoDB ownership, legacy `Message.conversationId`, internal-only `/metrics`, and
  all K3/K3.1 completion contracts.
- K4 must use separate Compose project, ports, volumes, databases, Redis, RabbitMQ, test target,
  and result directory from Issue #61.
- The approved single treatment and one post-treatment/optimization-comparison rerun are retained;
  no second optimization or rerun is authorized without a new explicit human gate.
