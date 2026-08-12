# Next Session — K4 Leader Continuation

## Current State

K4 Reproducible Performance Evidence is active under locked specification
https://github.com/NhiBuaa/kitta-chat/issues/80 and ADR-015. The approved ticket graph is
Issues #81–#89. Issue #81 is the only frontier. Issues #82–#89 have the visible `blocked`
label and must not start before their listed dependencies are complete.

The K4 session is leader-only. The leader coordinates `feature-delivery`, acceptance gates,
delegation, evidence, and issue state; it does not implement an issue itself.

Manual-acceptance guide revision `k4-issue-81-r4` is locked at
`.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.md`; r1 through r3
remain immutable. Issue #81 implementation and mandatory TC-81-01 through TC-81-04 passed and
were recorded in `.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.evaluations.jsonl`.
TC-81-05 remains conditional/non-blocking and was not executed.

## Next Valid Transition

1. Preserve the approved implementation, immutable guide revisions, and append-only Evaluation history; no further Issue #81 scope is active.
2. Do not execute TC-81-05 unless upstream authority explicitly permits concurrent/stale real K4 runs.
3. Do not close #81 or remove `blocked` from Issue #82 without an explicit tracker-state instruction.

## K4 Authorities

- Locked specification: https://github.com/NhiBuaa/kitta-chat/issues/80
- Ticket graph: https://github.com/NhiBuaa/kitta-chat/issues/81 through
  https://github.com/NhiBuaa/kitta-chat/issues/89
- Architecture boundary: `docs/adr/015-k4-performance-evidence-boundary.md`
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
