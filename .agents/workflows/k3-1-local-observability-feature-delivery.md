# K3.1 Local Observability Demo — Feature Delivery Ledger

## Workflow Input

- Workflow: `feature-delivery`
- Action: `start`
- Commit policy: `none` for implementation. The user later authorized one design-only Git/GitHub checkpoint containing the K3.1 specification state, ADRs, session state, this ledger, and the locked Issue #70 guide; that checkpoint does not authorize implementation, merge, or deployment.
- Requested outcome: provide time-boxed, browser-visible local demo evidence for the completed K3 observability work.
- Constraints: local-only; demo evidence rather than a new observability workstream; no backend or Prometheus host port; Grafana on loopback only; no Alertmanager, cAdvisor, Loki, Tempo, OpenTelemetry, benchmark work, production deployment, commit, push, or merge.

## Authoritative Specification

- GitHub Issue: https://github.com/NhiBuaa/kitta-chat/issues/69
- Title: `K3.1 Local Observability Demo: browser-visible evidence`
- Status at read-back: `OPEN`
- Triage label at read-back: `ready-for-agent`
- Published body SHA-256: `3B035D640C3F96ADBEEC711609B987392D484415EC1282CE083C67ED302E8A86`

## Approved Test Seam

`Local Observability Stack seam` — static Compose/provisioning/dashboard-query validation, bounded start/stop runtime smoke, deeper health/scrape/query/dashboard discovery automation, and separate manual browser acceptance of the provisioned dashboard with live total HTTP request-rate and latency data.

The seam has three evidence layers:

1. Static automation validates the opt-in profile, Grafana-only host port across the full resolved model, removal of inherited fixed names, provisioning, supported pinned images, the single internal scrape target, and total request-rate query.
2. Ticket 1 bounded runtime smoke validates environment preflight, start, readiness, provisioning, safe stop, and volume preservation.
3. Ticket 2 runtime automation validates Prometheus target state, safe traffic, total request-rate and latency data, and Grafana dashboard discovery.
4. Manual browser acceptance validates automatic dashboard availability and visible total request-rate and latency data.

## Current State

Specify, Design, Decompose, and Prepare acceptance for the first frontier are complete. Issue #70 Implement is complete on independent branch `codex/k3-1-issue-70-implementation` with green automated verification. Manual acceptance executed all eight cases with PASS observations, and approved Evaluation `k3-1-issue-70-v1-approved-20260807T112736+0700` is `PASSED`. Final `code-review` completed with verdict `APPROVE`, zero Critical findings, and zero Major findings. The bounded Issue #70 delivery is complete. Guide revision `k3-1-issue-70-v1` is explicitly human-approved and locked. The approved design artifacts are checkpointed at commit `95f03f74` on branch `codex/k3-1-design-checkpoint` and published as unmerged draft PR #73: https://github.com/NhiBuaa/kitta-chat/pull/73. Issues #71 and #72 remain outside this delivery and were not started.

## Completed Transitions

- `session-continuity` restored the K3.1 checkpoint from the validated Resume Contract.
- The user explicitly made `to-spec` and `to-tickets` runtime-reachable for this feature-delivery workflow.
- The dependency evaluator returned `status: continue`.
- Repository, domain, ADR, Compose, K3 runtime, test, and issue-tracker context were explored.
- The user approved the Local Observability Stack seam with three evidence layers, isolated cleanup, a time-boxed stop rule, and `mode=default`.
- `to-spec` published GitHub Issue #69 with `ready-for-agent` and read back its complete body and labels.
- `codebase-design` finalized the operational Module and test seam in ADR-013 without changing ADR-012's application metrics boundary.
- Docker Compose v5.3.1 resolved `!reset null` as required: the K3.1 override can remove fixed MongoDB and Redis container names while preserving project-scoped volumes.
- The first graph review returned `REQUEST_CHANGES`: reset confirmation ordering, fresh-clone env bootstrap, MongoDB host-port inheritance, total request-rate evidence, Ticket 1 runtime verification, and stale session state required remediation.
- Issue #69 and ADR-013 now require two-phase reset, safe environment initialization, reset of every inherited non-Grafana port/fixed name, one bounded total request-rate panel, bounded Ticket 1 runtime smoke, and reconciled session state.
- Prometheus `v3.13.2` and Grafana `12.4.8` were selected from supported release lines and pinned by ADR-013.
- The user approved graph v2 with three linear tickets and its blocking edges.
- `to-tickets` published Issues #70, #71, and #72 in dependency order and read them back successfully.
- `test-craft` produced eight Issue #70 Test Cases across contract, lifecycle, async ordering, observable Grafana state, and host/resource safety axes.
- `manual-acceptance` rendered guide revision `k3-1-issue-70-v1`; the user approved and locked it without semantic changes.
- The user explicitly approved guide revision `k3-1-issue-70-v1`; it was locked without semantic Test Case changes.
- Implement #70 completed in this context after a RED-to-GREEN cycle.
- Implementation evidence: `scripts/ci/k3LocalObservabilityStack.test.cjs` passed 9/9; `node --test scripts/ci/*.test.cjs` passed 108/108; `server` `node --test` passed 390/390; Node syntax checks and `docker compose ... config --quiet` exited `0`.
- Feature-delivery terminal evaluation returned `{"status":"continue"}` because final review remains pending.
- Changed scope: `scripts/observabilityDemo.js`, `docker-compose.observability.yml`, local Prometheus/Grafana provisioning, bounded total request-rate dashboard panel, root `demo:observability` script, and K3.1 static/fake-adapter tests.
- `manual-acceptance execute` ran `k3-1-issue-70-v1-20260807T112048+0700`: MA-70-01 through MA-70-08 all observed `PASS`; the first Evaluation was appended as `BLOCKED` pending approval.
- The user explicitly approved the observed PASS; `record_evaluation.py` appended superseding Evaluation `k3-1-issue-70-v1-approved-20260807T112736+0700` with `verdict=PASSED` and `human_approval=approved`.
- Runtime remediation during acceptance mounted Grafana datasource/dashboard provisioning files into Grafana's required subdirectories and consumed Docker stderr without exposing it; Node 22 regression remained green.
- Final `code-review` aggregate returned `APPROVE` with zero Critical findings, zero Major findings, and no findings on either the standards or spec axis.
- Feature-delivery terminal evaluation returned `{"status":"completed"}` for the bounded Issue #70 delivery.
- The user explicitly authorized a design-only Git/GitHub checkpoint after suspension; implementation commit policy remains `none`.
- The design-only checkpoint was committed as `95f03f74`, pushed to `github/codex/k3-1-design-checkpoint`, and published as unmerged draft PR #73.

## Attempt History

1. The first resumed attempt stopped at `dependency_unreachable` because direct dispatch authorization for `to-spec` and `to-tickets` was not yet present.
2. The user corrected the reachability state by explicitly invoking both skills.
3. The dependency evaluator returned `status: continue`.
4. The first K3.1 issue duplicate search returned no matches.
5. `to-spec` publication created Issue #69; read-back confirmed the title, full body, approved seam, `OPEN` state, and `ready-for-agent` label.
6. `codebase-design` selected one deep operational Module instead of exposing raw Compose commands.
7. A local Compose merge probe returned `mongoHasContainerName=false`, `redisHasContainerName=false`, `mongoVolume=mongo_data`, and `redisVolume=redis_data`.
8. Machine review of the initial graph returned zero Critical, five Major, one Minor, and `REQUEST_CHANGES`.
9. The specification was updated in place and read back from Issue #69 with `ready-for-agent` intact.
10. ADR-012/013 and repository session/spec indexes were reconciled with the remediated design.
11. A full resolved-model probe returned exactly one published service (`grafana`, `127.0.0.1:3001:3000`), zero fixed container names, `METRICS_ENABLED=true`, and all conversation migration flags disabled for the demo backend.
12. Docker registry manifest checks passed for `prom/prometheus:v3.13.2` and `grafana/grafana:12.4.8`.
13. The design checkpoint was verified on GitHub as draft PR #73 with head branch `codex/k3-1-design-checkpoint`, base `main`, and artifact commit `95f03f74`.

## Published Ticket Graph

1. **#70 — Start, smoke-test, and safely stop the isolated Local Observability Stack** — blocked by none. Owns clean-checkout environment preflight, the Grafana-only resolved host surface, profile/project isolation, supported pinned images, provisioning, static contract automation, and bounded real-runtime start/readiness/provisioning/stop/volume-preservation smoke.
2. **#71 — Generate live traffic and verify Prometheus/Grafana data** — unblocked after #70; not started in this delivery. Owns safe successful traffic, the bounded total HTTP request-rate dashboard panel, Prometheus target and query checks, Grafana discovery, and the two-phase reset Interface with post-disclosure target-set confirmation tests.
3. **#72 — Capture browser evidence and publish the portfolio handoff** — blocked by #71. Owns manual browser acceptance of non-empty total request-rate and latency panels, two or three screenshots or a short video, README evidence links, safe cleanup evidence, and the stop rule.

Current frontier after this bounded delivery: #70 is complete; #71 is the next published ticket, and #72 remains blocked behind it. Neither ticket was started in this delivery.

## Acceptance Guide State

- Slice: #70
- Guide: `.agents/manual-tests/k3-1-local-observability/start-smoke-stop-v1.md`
- Revision: `k3-1-issue-70-v1`
- Locked SHA-256: `26055774EDB39EE065890D817291402AB7F778C3F5C978026830B9AD9A14F245`
- Test Cases: `MA-70-01` through `MA-70-08`
- Human approval: approved by the user at `2026-08-07T10:21:07.1180231+07:00`
- Lock status: locked and immutable; semantic changes require a new revision
- Evaluation history: `.agents/manual-tests/k3-1-local-observability/start-smoke-stop-v1.evaluations.jsonl`; latest run has 8/8 PASS observations, verdict `PASSED`, and human approval `approved`.

## Next Valid Transition

The bounded Issue #70 delivery is complete after approved acceptance and final review. If the workflow is resumed, require an explicit request before beginning the next frontier (#71); do not merge draft PR #73, start #71/#72 implicitly, or perform destructive reset.
