# Next Session — K4 Leader Continuation

## Session Completion Override

Issue #85 is complete and manually accepted. This worktree retains its implementation and
append-only acceptance evidence. This session stops here; Issue #86 is being handled in a
separate parallel worktree and is not this session's next frontier.

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

Next valid transition: stop this session with Issue #85 marked complete. Do not run a per-issue
code review; the final feature review is deferred until the complete K4 feature reaches its fixed
point.

## Current State

K4 Reproducible Performance Evidence remains active under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89. Issues #81–#85 are complete and manually accepted. The remaining K4 issues are
managed in separate worktrees and are outside this session's next transition.

The K4 session is leader-only. The leader coordinates `feature-delivery`, acceptance gates,
delegation, evidence, and issue state; it does not implement an issue itself. Remaining K4 work
uses independent branches and worktrees outside this completed Issue #85 session.

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

1. Preserve accepted Issue #81–#85 implementations, immutable guide revisions, and append-only Evaluation histories; none has further scope.
2. Mark this Issue #85 session complete. Do not choose or execute Issue #86 from this worktree.
3. After the complete K4 feature is finished, run one high-cadence final feature code review; only an APPROVE fixed point may proceed to integration/publication.

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
- Locked Issue #85 guide: `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.md`
- Issue #85 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.evaluations.jsonl`
- Current World Model: `.agents/CONTEXT.md`
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
