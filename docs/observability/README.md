# K3 and K3.1 Observability

K3 provides the application metrics, logging, dashboard, scrape and alert contracts. K3.1 adds a
reproducible, browser-visible local Prometheus/Grafana stack. Both milestones are complete and
accepted.

## Start here

- [K3 operator validation](k3-operator-validation.md) — validate static contracts and the
  monitoring-enabled application fixture.
- [K3.1 local demo](k3-local-demo.md) — start the isolated stack, create safe traffic, verify data,
  inspect Grafana and stop safely.
- [ADR-012](../adr/012-k3-observability-metrics-boundary.md) — metrics ownership, labels,
  instrumentation and failure boundaries.
- [ADR-013](../adr/013-k3-1-local-observability-demo-seam.md) — local stack isolation, operator
  actions, evidence layers and cleanup safety.

## Repository contracts

- [Grafana dashboard](dashboards/k3-observability.json)
- [Prometheus scrape configuration](prometheus/k3-scrape-config.yml)
- [Queue alert rules](alerts/k3-queue-alerts.yml)
- [Queue dead-letter runbook](runbooks/k3-queue-dead-lettered.md)
- [Correlation contract](k3-correlation-contract.md)

## Accepted browser evidence

- [Dashboard overview](../assets/readme/k3-observability/dashboard-overview.png)
- [Total HTTP request rate](../assets/readme/k3-observability/dashboard-request-rate.png)
- [HTTP latency](../assets/readme/k3-observability/dashboard-latency.png)

## Runtime boundary

The normal application stack keeps metrics disabled by default. K3.1 is opt-in and uses the fixed
Compose project `kittachat-k3-1`. Grafana is its only published host surface at
`http://127.0.0.1:3001`; backend, Prometheus, MongoDB and Redis remain internal. The normal
`shot-chat`/application stack does not need to run at the same time.

Hosted Prometheus/Grafana, outbound alert delivery, centralized logs, tracing, benchmarks and
production deployment remain outside K3/K3.1. They require a new approved issue or specification.
