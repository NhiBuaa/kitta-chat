# K3/K3.1 Completion and K4 Active Checkpoint

## Status

- K3 Observability is complete. Issue #44 and implementation Issues #45–#52 are closed.
- K3.1 Local Observability Demo is complete. Implementation Issues #70–#72 are closed.
- The K3.1 parent specification, Issue #69, remains open for tracker history. It is not an implementation frontier.
- Local `main` and `github/main` were previously synchronized at `0cb0dc2afe63bd5858772bfdd738043bafc03a98`; K4 Issue #81 was published by PR #91 merge commit `3015031dacea7f1624f989d1cb9b9c2f14c6e9ce`.
- No deployment or destructive K3.1 reset was performed.
- K4 Reproducible Performance Evidence is active under locked specification Issue #80 and ADR-015.
- Issues #81–#89 are published. Issues #81 and #82 are closed with accepted final reviews. Issue #83 is the next K4 frontier because its sole blocker, #82, is closed; #84–#89 remain blocked until their real dependencies complete.
- K4 is leader-coordinated: the leader does not implement issues. Guide revisions `k4-issue-81-r1` through `k4-issue-81-r3` remain immutable; `k4-issue-81-r4` is locked and approved. Issue #81 implementation and mandatory acceptance TC-81-01 through TC-81-04 are complete and accepted; TC-81-05 was not run because it remains conditional.
- Issue #81 final remediation fixed point has append-only Evaluation `tc81digest-v1`; mandatory TC-81-01 through TC-81-04 pass, TC-81-05 remains conditional/non-blocking.
- Final review of the remediation fixed point is `APPROVE` with zero Critical and zero Major findings. Issue #81 is closed.
- Issue #82 manual-acceptance guide `k4-issue-82-r4` is locked and human-approved; r1 through r3 remain immutable. The deterministic-seed timestamp and disposable credential remediations are implemented: fresh K4 setup/preflight verifies the declared and observed canonical fingerprint as equal, admits warm-up, completes nginx login and Socket.IO authentication, and scans the complete retained-evidence inventory clear. Two independently verified fresh runs produced the same canonical fingerprint and the acceptance-only oracle returned `EQUIVALENT`; all disposable runs were cleaned to empty target inventories.
- TC-82-03 is complete: nginx-mediated public-login failure returns `FAILED_SETUP` at `login`, with owner marker only and no admission/measurement; cleanup inventory is empty. Internal `migrate:k4` and `seed:demo` non-zero command propagation is proven through the actual generic CLI command-execution path without a production-configurable failure injection. TC-82-05 runtime evidence proves prior-run, foreign-K4, and non-K4 resources were neither adopted nor mutated. Append-only Evaluation `tc82r4-acceptance-20260812` is `PASSED` with explicit human approval.
- Issue #82 final review is `APPROVE` with zero Critical and zero Major findings, against repository standards, Issue #82, locked r4, and ADR-015. K4 regression is 47/47 and related server regression is 21/21. It was delivered by PR #92, merge commit `af9daaacd1ec6c347f0c7fef74603c908e652608`, and GitHub Issue #82 is closed.

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
- K4 locked specification: https://github.com/NhiBuaa/kitta-chat/issues/80
- K4 issue graph: https://github.com/NhiBuaa/kitta-chat/issues/81 through https://github.com/NhiBuaa/kitta-chat/issues/89
- K4 architecture authority: `docs/adr/015-k4-performance-evidence-boundary.md`
- K4 current acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.md` (locked; r1 through r3 remain immutable)
- K4 Issue #81 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.evaluations.jsonl` (latest PASSED run `tc81digest-v1`)
- K4 Issue #82 acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.md` (locked and approved; r1 through r3 remain immutable)
- K4 Issue #82 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.evaluations.jsonl` (PASSED run `tc82r4-acceptance-20260812`)
- K4 Issue #82 publication: PR #92, merge commit `af9daaacd1ec6c347f0c7fef74603c908e652608`

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
- K4 benchmark work is a separate approved milestone, not an expansion of K3/K3.1. K4 resources must remain K4-owned and must never share target resources with Issue #61.
- K4 semantics are locked by Issue #80 and ADR-015. Any ambiguity affecting benchmark meaning returns to those authorities before implementation.
- Do not implement an issue from the leader session. After manual-acceptance approval, delegate the issue to an execution agent.
