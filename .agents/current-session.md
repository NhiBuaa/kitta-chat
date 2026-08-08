# K3 and K3.1 — Completion Checkpoint

## Status

- K3 Observability is complete. Issue #44 and implementation Issues #45–#52 are closed.
- K3.1 Local Observability Demo is complete. Implementation Issues #70–#72 are closed.
- The K3.1 parent specification, Issue #69, remains open for tracker history. It is not an implementation frontier.
- Local `main` and `github/main` are synchronized at `0cb0dc2afe63bd5858772bfdd738043bafc03a98` after PR #77.
- No deployment or destructive K3.1 reset was performed.

## Delivered Outcome

- K3 provides bounded Prometheus application metrics, structured correlation logging, a repository-owned Grafana dashboard and scrape contract, queue alert/runbook artifacts, and operator validation guidance.
- Metrics remain disabled by default. `/metrics` stays internal and is not proxied through nginx.
- K3.1 provides an opt-in local Prometheus/Grafana stack through `npm run demo:observability`.
- Grafana is the only published K3.1 host surface at `http://127.0.0.1:3001`.
- Browser evidence, automated checks, locked manual guides, and append-only Evaluation histories are accepted.
- The K3.1 stop rule has been reached. Any new observability scope requires a new approved issue or specification.

## Sources of Truth

- K3 specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- K3.1 parent specification: https://github.com/NhiBuaa/kitta-chat/issues/69
- K3 metrics boundary: `docs/adr/012-k3-observability-metrics-boundary.md`
- K3.1 local demo seam: `docs/adr/013-k3-1-local-observability-demo-seam.md`
- Observability documentation index: `docs/observability/README.md`
- K3 delivery ledger: `.agents/workflows/k3-observability-feature-delivery.md`
- K3.1 delivery ledger: `.agents/workflows/k3-1-local-observability-feature-delivery.md`
- Locked acceptance guides and Evaluation histories: `.agents/manual-tests/k3-observability/` and `.agents/manual-tests/k3-1-local-observability/`

## Publication History

- K3 terminal publication: PR #67, merge commit `0b28b9ad`.
- K3.1 design checkpoint: PR #73, merged after the implementation absorbed the approved design.
- K3.1 implementations: PR #74 for Issue #70, PR #75 for Issue #71, and PR #76 for Issue #72.
- K3.1 closure-ledger synchronization: PR #77, merge commit `0cb0dc2a`.

## Guardrails

- MongoDB remains the durable source of truth. Redis remains cache/coordination only. RabbitMQ remains background-only.
- Do not rewrite locked manual guides or append-only Evaluation histories.
- Do not add Alertmanager, cAdvisor, Loki, Tempo, OpenTelemetry, hosted monitoring, production deployment, benchmarks, or open-ended dashboard tuning under the completed K3/K3.1 scope.
- Safe stop must not pass `--volumes`. Destructive reset requires the separate two-phase confirmation flow and explicit approval.
