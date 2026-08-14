# Next Session — K4 Leader Continuation

## Current Parallel Frontier Override

Issue #84 and #87 are complete. Issue #87 is fully integrated through PR #99; this worktree
records its closeout metadata on branch `codex/k4-issue87-closeout`. Issues #85, #86, and #88
must be handled in their own worktrees.

## Issue #87 Closeout Checkpoint

Issue #87 implementation and TC-87-03 remediation were completed on `codex/k4-issue87`, then
published by PR #99 and merged into `main` at `cfd1bf90c490dfcfe3349107f841269d1b6aa720`.
The locked `k4-issue-87-r2` guide and append-only Evaluation history are retained: TC-87-01 through
TC-87-05 all pass, and `tc87-r2-acceptance-20260814` is `PASSED` with explicit human approval.
GitHub Issue #87 is closed; do not reopen or extend this slice from this worktree.

## Issue #85 Completion Checkpoint (parallel frontier)

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

Next valid transition for the Issue #85 worktree was completion after acceptance. Its implementation
and evidence remain preserved here as a separate parallel frontier; do not select Issue #86 from
this Issue #87 worktree.

## Current State

K4 Reproducible Performance Evidence remains active under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89. Issues #81–#85 and #87 have completed their implementation/acceptance milestones.
Issues #86 and #88 remain separate frontiers; later dependent issues remain governed by the
approved dependency graph.

The K4 session is leader-only. The leader coordinates `feature-delivery`, acceptance gates,
delegation, evidence, and issue state; it does not implement an issue itself. This worktree is not
an implementation target for the remaining K4 frontiers.

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

1. Preserve accepted Issue #81–#85 and #87 implementations, immutable guide revisions, and
   append-only Evaluation histories. These slices have no additional implementation scope.
2. Issue #87 is acceptance-complete, fixed-point reviewed APPROVE, and integrated by PR #99 at
   `cfd1bf90c490dfcfe3349107f841269d1b6aa720`; keep the current accepted artifacts immutable.
3. Issues #86 and #88 remain separate K4 frontiers in their own worktrees. Do not start them
   from this Issue #87 worktree.

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
- No targeted optimization implementation ticket exists before Issue #89 baseline evidence and a
  separate human approval of exactly one evidence-backed candidate.
