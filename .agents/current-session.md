# K3.1 Local Observability Demo — Current Session

## Status

- K2 GitHub Actions CI/CD and K3 Observability are complete.
- K3.1 is the active time-boxed feature-delivery workflow.
- The authoritative active specification is GitHub Issue #69, which is `OPEN` and labeled `ready-for-agent`.
- ADR-013 defines the accepted `LocalObservabilityDemo` Module and Local Observability Stack seam.
- A review of the first three-ticket graph returned `REQUEST_CHANGES` with five Major and one Minor finding.
- Issue #69 and ADR-013 have been remediated for host-port isolation, fresh-clone environment bootstrap, total request-rate evidence, Ticket 1 runtime smoke, two-phase reset confirmation, and supported image pins.
- Graph v2 is approved. Issues #70–#72 are published with real linear blocking edges and `ready-for-agent`.
- The design artifacts are checkpointed at commit `95f03f74` on branch `codex/k3-1-design-checkpoint` and published as draft PR #73: https://github.com/NhiBuaa/kitta-chat/pull/73. The PR is intentionally unmerged.

## Sources Of Truth

- Active specification: https://github.com/NhiBuaa/kitta-chat/issues/69
- Metrics boundary: `docs/adr/012-k3-observability-metrics-boundary.md`
- Local demo seam: `docs/adr/013-k3-1-local-observability-demo-seam.md`
- Feature ledger: `.agents/workflows/k3-1-local-observability-feature-delivery.md`
- Design checkpoint: branch `codex/k3-1-design-checkpoint`, commit `95f03f74`, draft PR https://github.com/NhiBuaa/kitta-chat/pull/73
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
- Implementation commit policy is `none`. Issue #70 implementation is complete on the independent branch `codex/k3-1-issue-70-implementation`; no commit, push, merge, or deployment was performed.

## Current Frontier

Issue #70 is complete on `codex/k3-1-issue-70-implementation`: all eight locked acceptance cases passed with explicit human approval, and final `code-review` returned `APPROVE` with zero Critical/Major findings. Issue #71 is the next published frontier and Issue #72 remains behind it; neither was started in this bounded delivery. Resume only after an explicit request for the next issue.

Issue #70's bounded delivery is complete on `codex/k3-1-issue-70-implementation` after approved acceptance and final `code-review` `APPROVE`. Implementation remains uncommitted under `commit_policy: none`; no push, merge, or deployment authority is implied. Resume only on an explicit request for the next frontier.
