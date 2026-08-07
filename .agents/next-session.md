# Next Session — Implement K3.1 Issue #70

## Current State

K3.1 Specify, Design, Decompose, and Prepare acceptance for the first frontier are complete.

The published graph is:

1. #70 — start, smoke-test, and safely stop the isolated Local Observability Stack — current frontier.
2. #71 — generate live traffic and verify Prometheus/Grafana data — blocked by #70.
3. #72 — capture browser evidence and publish the portfolio handoff — blocked by #71.

Guide revision `k3-1-issue-70-v1` is explicitly approved and locked at `.agents/manual-tests/k3-1-local-observability/start-smoke-stop-v1.md`. Its locked SHA-256 is `26055774EDB39EE065890D817291402AB7F778C3F5C978026830B9AD9A14F245`.

Issue #70 implementation and acceptance execution have not started.

## Next Valid Transition

Resume the `feature-delivery` workflow and invoke `implement` once for Issue #70.

Implementation must:

1. Read Issue #70, Issue #69, ADR-012, ADR-013, and the locked guide.
2. Use CodeGraph before grep or direct source exploration.
3. Follow repository TDD policy: author RED tests where practical, verify intended failure, implement the minimum approved slice, and run targeted plus appropriate regression tests.
4. Satisfy every #70 acceptance criterion without starting #71 traffic/query/reset work or #72 evidence work.
5. Preserve `commit_policy: none`; do not create a branch, commit, push, merge, or deploy.
6. Return implementation and green-test evidence before manual acceptance execution.

## Locked Acceptance Scope

- Test Cases `MA-70-01` through `MA-70-08` are immutable for revision v1.
- Do not execute them until implementation and automated tests are green.
- Do not rewrite the guide to match observations; use append-only Evaluation history when execution begins.
- Do not run destructive reset.

## Guardrails

- Grafana is the only published K3.1 host surface.
- Every non-Grafana published port and inherited fixed container name is reset in the K3.1 resolved model.
- Environment bootstrap never overwrites an existing file or prints secrets.
- Conversation migration flags remain disabled.
- Do not start #71 or #72.
- Implementation commit policy remains `none`. A design-only checkpoint may exist on `codex/k3-1-design-checkpoint`; do not treat it as implementation authorization or merge authority.

## Resume Contract

`C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\kitta-chat-k3-1-feature-delivery-issue-70.json`
