# K3.1 Local Observability Demo — Current Session

## Status

- K2 GitHub Actions CI/CD and K3 Observability are complete.
- K3.1 is the active time-boxed feature-delivery workflow.
- The authoritative active specification is GitHub Issue #69, which is `OPEN` and labeled `ready-for-agent`.
- ADR-013 defines the accepted `LocalObservabilityDemo` Module and Local Observability Stack seam.
- A review of the first three-ticket graph returned `REQUEST_CHANGES` with five Major and one Minor finding.
- Issue #69 and ADR-013 have been remediated for host-port isolation, fresh-clone environment bootstrap, total request-rate evidence, Ticket 1 runtime smoke, two-phase reset confirmation, and supported image pins.
- Graph v2 is approved. Issues #70–#72 are published with real linear blocking edges and `ready-for-agent`.

## Sources Of Truth

- Active specification: https://github.com/NhiBuaa/kitta-chat/issues/69
- Metrics boundary: `docs/adr/012-k3-observability-metrics-boundary.md`
- Local demo seam: `docs/adr/013-k3-1-local-observability-demo-seam.md`
- Feature ledger: `.agents/workflows/k3-1-local-observability-feature-delivery.md`
- Existing dashboard: `docs/observability/dashboards/k3-observability.json`
- Existing K3 operator guide: `docs/observability/k3-operator-validation.md`

Issue #69 is tracker-owned by the configured `to-spec` workflow. It is the authoritative K3.1 active spec. `specs/README.md` links to it; no duplicate file belongs under `specs/active/`.

## Approved Scope

- Add an opt-in, local-only Prometheus and Grafana demo stack.
- Publish only Grafana at `127.0.0.1:3001`.
- Keep every non-Grafana service port unpublished in the resolved K3.1 model.
- Reuse K3 metrics and dashboard; permit only one bounded total HTTP request-rate panel.
- Provide one deep operator Interface with `start`, `traffic`, `verify`, `stop`, and two-phase `reset` actions.
- Capture browser evidence and link it from the README.
- Stop after the accepted evidence is complete.

## Guardrails

- MongoDB remains the durable source of truth. Redis remains cache/coordination only. RabbitMQ remains background-only.
- Metrics remain disabled in the default runtime.
- nginx must not proxy `/metrics`.
- K3.1 must not add Alertmanager, cAdvisor, Loki, Tempo, OpenTelemetry, new application metrics, benchmarks, production deployment, or open-ended dashboard tuning.
- Safe cleanup must not pass `--volumes`.
- Reset must display exact project-owned volumes before a separate confirmation tied to the unchanged target set.
- Implementation commit policy is `none`. The user authorized one design-only Git/GitHub checkpoint; that exception does not authorize Issue #70 implementation, merge, or deployment.

## Current Frontier

The current frontier is Issue #70. Issues #71 and #72 remain blocked. Manual guide revision `k3-1-issue-70-v1` covers Test Cases `MA-70-01` through `MA-70-08` and is human-approved, locked, and immutable. Implementation has not started. The next valid transition is Implement #70 in a new context; manual acceptance execution remains deferred until implementation and automated verification are green.
