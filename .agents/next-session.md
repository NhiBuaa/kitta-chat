# Next Session — K4 Leader Continuation

## Current Frontier Override

Issues #81–#89 are complete, closed, and integrated into `main`. Issue #89 was published by PR
#103, merged at `8871adeb6ad2913f435dc7d2272a6b650b61677d`; the integration branch head before
merge was `4609fcf`. The only remaining K4 transition is the single final feature review at the
complete fixed point.

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
is `MERGED` into `main`, and GitHub Issue #89 is `CLOSED`. Final review remains deferred.

## Current Parallel Frontier Override

Issues #81–#89 are complete and integrated; no implementation frontier remains. Final K4 review is
deferred until the complete feature fixed point.

## Issue #86 Completion Checkpoint

Manual guide revision `k4-issue-86-r2` is locked and human-approved at
`.agents/manual-tests/k4-performance-evidence/issue-86-sidebar-scenario-r2.md`; r1 remains
immutable and unapproved. Implementation and automated verification are complete. Fresh execution
`issue86-r2-attribution-20260816` observed TC-86-01 through TC-86-04 PASS; its pending record was
followed by approved append-only Evaluation `issue86-r2-attribution-20260816-approved`. The
explicit TC-86-02 matrix proves identical commit SHA, hardware, dataset, workload,
runner/configuration, and only topology/replica-count differences. Issue #86 was published by PR
#102 and is closed; final K4 review remains deferred until the complete fixed point.

## Issue #88 Completion Checkpoint

Issue #88 implementation and manual acceptance are complete and integrated by PR #101. Guide
`k4-issue-88-r3` remains immutable; Evaluation
`tc88r3-acceptance-20260816-approved` is `PASSED` with explicit human approval. Final K4 feature
review remains deferred until the complete fixed point.

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
feature review remains deferred until the complete fixed point. Preserve all prior guide revisions,
Evaluation records, and treated comparison artifacts.

K4 Reproducible Performance Evidence remains active under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89; implementation, acceptance, integration, publication, and closure are complete.
Final K4 review remains governed by the approved dependency graph and complete-feature fixed point.

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
2. Issue #89 is integrated and published by PR #103 at merge commit
   `8871adeb6ad2913f435dc7d2272a6b650b61677d`; GitHub Issues #81–#89 are closed.
3. The only remaining K4 transition is the single final feature review at the complete fixed point;
   do not run it until the governed review cadence and complete-feature evidence are ready.

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
