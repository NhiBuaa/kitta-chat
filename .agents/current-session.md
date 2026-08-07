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
- Issue #71: https://github.com/NhiBuaa/kitta-chat/issues/71
- Active implementation branch: `codex/k3-1-issue-71-implementation` from `main` at `6928b729`
- Locked Issue #71 guide: `.agents/manual-tests/k3-1-local-observability/traffic-verify-reset-v1.md`
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
- Issue #70 implementation was committed as `3169a492`, pushed on `codex/k3-1-issue-70-implementation`, merged by PR #74 as `6928b729`, and the issue is closed. No deployment was performed.

## Current Frontier

Issue #70 is complete on `codex/k3-1-issue-70-implementation`: all eight locked acceptance cases passed with explicit human approval, and final `code-review` returned `APPROVE` with zero Critical/Major findings. Issue #71 implementation, review remediation, approved manual acceptance, and final review are complete on `codex/k3-1-issue-71-implementation`; its guide remains approved and locked, and the latest selector-remediation Evaluation has 9/9 PASS observations with `verdict=PASSED` and `human_approval=approved`. Final review aggregate is `APPROVE` with zero Critical and zero Major findings; two Minor findings remain recorded in the ledger. Issue #72 remains blocked behind #71 and is outside this approved slice.

Issue #70's bounded delivery is complete and merged on `main` after approved acceptance and final `code-review` `APPROVE`. PR #74 is merged as `6928b729`, and Issue #70 is closed. Issue #71 implementation, review remediation, approved bounded runtime acceptance, and final `code-review` are complete on the independent branch. No deployment or destructive reset was performed.
