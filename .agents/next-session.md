# Next Session — K4 Leader Continuation

## Current Parallel Frontier Override

Issue #84 and #87 are complete. This worktree records the Issue #87 message persistence and
recipient-delivery fixed point. Issues #85, #86, and #88 must be handled in their own worktrees.

## Issue #87 Continuation Checkpoint

Issue #87 implementation and TC-87-03 remediation are complete on `codex/k4-issue87`. The locked
`k4-issue-87-r2` guide and append-only Evaluation history are unchanged except for the new
remediation record: TC-87-01 through TC-87-05 all pass, and `tc87-r2-acceptance-20260814` is
`PASSED` with explicit human approval. The next review transition remains intentionally pending;
do not integrate before that gate.

## Current State

K4 Reproducible Performance Evidence remains active under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89. Issues #81–#84 and #87 have completed their implementation/acceptance milestones.
Issues #85, #86, and #88 remain separate frontiers; later dependent issues remain governed by the
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

## Next Valid Transition

1. Preserve accepted Issue #81–#84 and #87 implementations, immutable guide revisions, and
   append-only Evaluation histories. These slices have no additional implementation scope.
2. Issue #87 is acceptance-complete. The next transition is final code review when explicitly
   requested; do not integrate the branch before that review.
3. Issues #85, #86, and #88 remain separate K4 frontiers in their own worktrees. Do not start
   them from this Issue #87 worktree.

## Issue #87 Fixed Point

- Locked guide `k4-issue-87-r2` is approved and immutable.
- Evaluation `tc87-r2-acceptance-20260814` is `PASSED` with explicit human approval.
- `docs/k4-performance-evidence.md` is the repository delivery summary.
- K4 136/136, repository CI 132/132, and server 476 passed/5 skipped/0 failed remain the recorded
  verification results.
- Final code review and integration are intentionally pending; no review verdict is recorded here.

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
- Current World Model: `.agents/CONTEXT.md`
- Current workflow state: `.agents/current-session.md` and `.agents/feature-delivery-events/events.jsonl`;
  create a fresh Resume Contract only when suspending this workflow.
- Issue #84 historical execution branch/worktree: `codex/k4-issue84` /
  `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-84`

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
