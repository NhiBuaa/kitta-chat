# Next Session — K4 Leader Continuation

## Current State

K4 Reproducible Performance Evidence remains active under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89. Issues #81–#83 are complete and closed. Issue #84 is now the next frontier
because its sole blocker, #83, is complete. Issues #85–#89 remain visibly `blocked` and must not
start before their listed dependencies are complete.

The K4 session is leader-only. The leader coordinates `feature-delivery`, acceptance gates,
delegation, evidence, and issue state; it does not implement an issue itself.

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

1. Preserve accepted Issue #81/#82/#83 implementations, immutable guide revisions, and append-only Evaluation histories; none has further scope.
2. Reconcile the Issue #84 tracker frontier and prepare its manual-acceptance guide from locked Issue #80/ADR-015 before implementation.
3. Do not execute TC-81-05 unless upstream authority explicitly permits concurrent/stale real K4 runs.

## K4 Authorities

- Locked specification: https://github.com/NhiBuaa/kitta-chat/issues/80
- Ticket graph: https://github.com/NhiBuaa/kitta-chat/issues/81 through
  https://github.com/NhiBuaa/kitta-chat/issues/89
- Architecture boundary: `docs/adr/015-k4-performance-evidence-boundary.md`
- Locked Issue #82 guide: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.md`
- Issue #82 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.evaluations.jsonl`
- Locked Issue #83 guide: `.agents/manual-tests/k4-performance-evidence/issue-83-workload-profiles-runner-r3.md`
- Issue #83 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-83-workload-profiles-runner-r3.evaluations.jsonl`
- Current World Model: `.agents/CONTEXT.md`
- Resume Contract: `C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-feature-delivery-leader.json`

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
