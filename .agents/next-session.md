# Next Session — Select a New Approved Slice

## Current State

K3 and K3.1 are complete, accepted, reviewed, published, and synchronized on `main` at `0cb0dc2afe63bd5858772bfdd738043bafc03a98`. Issues #70–#72 are closed. Parent specification Issue #69 remains open for tracker history, but it does not represent pending K3.1 implementation.

No approved next slice is active.

## Next Valid Transition

Choose the next milestone or approved issue before changing code. If the next work expands observability, create or approve a new specification instead of reopening K3 or K3.1.

Before implementation:

1. Confirm the new issue or specification and its boundaries.
2. Create an independent `codex/` branch from the current `main`.
3. Prepare acceptance evidence for that slice.
4. Preserve the completed K3/K3.1 contracts and locked Evaluation history.

## K3/K3.1 Reference

- Completion checkpoint: `.agents/current-session.md`
- Observability documentation: `docs/observability/README.md`
- K3 delivery ledger: `.agents/workflows/k3-observability-feature-delivery.md`
- K3.1 delivery ledger: `.agents/workflows/k3-1-local-observability-feature-delivery.md`
- K3.1 Grafana URL when the opt-in demo is running: `http://127.0.0.1:3001`

## Guardrails

- Do not deploy or run destructive reset without explicit authorization.
- Do not treat Issue #69 as an unimplemented ticket graph.
- Do not rewrite locked manual guides or append-only Evaluation histories.
- Keep metrics disabled in the default runtime and keep `/metrics` off the nginx/public surface.
