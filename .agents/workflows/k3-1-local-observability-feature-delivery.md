# K3.1 Local Observability Demo — Feature Delivery Ledger

## Workflow Input

- Workflow: `feature-delivery`
- Action: `start`
- Initial commit policy: `none` for implementation. The user later authorized the design-only checkpoint, explicitly authorized Issue #70 implementation commit, push, PR creation, merge when required checks passed, and Issue #70 closure, and then authorized the approved Issue #72 implementation checkpoint to stage, commit, push, open a PR, merge, and close Issue #72 after final review. Deployment remains unauthorized for Issue #72.
- Requested outcome: provide time-boxed, browser-visible local demo evidence for the completed K3 observability work.
- Constraints: local-only; demo evidence rather than a new observability workstream; no backend or Prometheus host port; Grafana on loopback only; no Alertmanager, cAdvisor, Loki, Tempo, OpenTelemetry, benchmark work, or production deployment. The Issue #72 publication checkpoint covered staging, committing, pushing the independent branch, and opening a PR after final review; the user later explicitly authorized merge and issue closure. Deployment remains unauthorized.

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

Specify, Design, Decompose, and Prepare acceptance for Issue #70 and Issue #71 are complete. Issue #70 Implement is complete on independent branch `codex/k3-1-issue-70-implementation` with green automated verification. Manual acceptance executed all eight cases with PASS observations, and approved Evaluation `k3-1-issue-70-v1-approved-20260807T112736+0700` is `PASSED`. Final `code-review` completed with verdict `APPROVE`, zero Critical findings, and zero Major findings. The implementation commit is `3169a492`; PR #74 merged it into `main` as `6928b729`, and Issue #70 is closed. Guide revision `k3-1-issue-70-v1` is explicitly human-approved and locked. Issue #71 implementation, review remediation, approved acceptance, final review, publication, and closure are complete at merge commit `811cde8351d8b612dd2816d5b517c18873580f8b` via PR #75; its guide revision `k3-1-issue-71-v1` is explicitly approved and locked. The latest selector-remediation Evaluation `k3-1-issue-71-v1-selector-remediation-approved-20260807T153854+0700` records all nine cases as `PASS` with `verdict=PASSED` and `human_approval=approved`; final review aggregate is `APPROVE` with zero Critical and zero Major findings. The approved design artifacts are checkpointed at commit `95f03f74` on branch `codex/k3-1-design-checkpoint` and published as unmerged draft PR #73: https://github.com/NhiBuaa/kitta-chat/pull/73.
Issue #72 guide revision `k3-1-issue-72-v1` is approved and locked at `.agents/manual-tests/k3-1-local-observability/browser-evidence-handoff-v1.md` with SHA-256 `AEDFEA527EB829016B104A8EC19D78D6772C1F631192ADD245AAB6AD51166747`. Implementation and original approved acceptance are complete on `codex/k3-1-issue-72-implementation`; the latest full-scope Evaluation is `PASSED` with explicit user approval. The initial final review was `APPROVE` with zero Critical/Major findings and one Minor spec finding about JPEG bytes stored under `.png` names. The artifacts are now valid PNGs, remediation Evaluation `k3-1-issue-72-v1-png-remediation-approved-20260807T182331+0700` is `PASSED` with explicit approval, and updated final review aggregate is `APPROVE` with zero Critical/Major findings and no findings. Publication checkpoint commit `bd0f63eaf8ea860e0ff9e1283badfc6b3231c96a` was pushed and merged by PR #76 as `6bc0405cc35c77ec0e82609227c1f44c92b4e252`; Issue #72 is closed. No deployment was performed.

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
- User-authorized publication completed: commit `3169a492` was pushed, PR #74 merged as `6928b729`, and Issue #70 closed; no deployment was performed.
- The user explicitly authorized a design-only Git/GitHub checkpoint after suspension; implementation commit policy remains `none`.
- The design-only checkpoint was committed as `95f03f74`, pushed to `github/codex/k3-1-design-checkpoint`, and published as unmerged draft PR #73.
- `session-continuity` validated the Issue #70 Resume Contract and restored the `feature-delivery` workflow at its Issue #71 frontier.
- `test-craft` and `manual-acceptance` prepared the nine-case Issue #71 guide from Issue #71, ADR-012, and ADR-013; the user approved and locked revision `k3-1-issue-71-v1` at `2026-08-07T12:03:45.4203149+07:00` with SHA-256 `700B706FADCB5F8EC794417E9ED302191BE09609F23BC9DBD86162948385E491`.
- The user-authorized independent branch `codex/k3-1-issue-71-implementation` was created from `main` at `6928b729`; implementation and acceptance execution proceeded on that branch.
- Implement #71 completed through TDD on `codex/k3-1-issue-71-implementation`; the focused suite passed 18/18, root CI passed 117/117, server tests passed 390/390, syntax and Compose config checks exited 0, and the bounded Docker runtime start/traffic/verify/reset-preview/stop flow passed.
- `manual-acceptance execute` appended Evaluation `k3-1-issue-71-v1-20260807T122915+0700` with MA-71-01 through MA-71-09 all observed `PASS`; after explicit user approval, superseding Evaluation `k3-1-issue-71-v1-approved-20260807T124107+0700` was appended with `verdict=PASSED` and `human_approval=approved`.
- Final `code-review` of the pinned Issue #71 worktree diff returned `REQUEST_CHANGES` with zero Critical, four Major, and three Minor findings across standards/spec axes.
- Implement remediation completed in the same approved Issue #71 slice: exact traffic/PromQL/dashboard contract assertions, abortable Docker/fetch operation deadlines, final labeled-volume revalidation before removal, stale/changed reset coverage, and reconciled session-state instructions.
- Focused remediation verification passed 22/22; root CI contract suite passed 121/121; server suite passed 390/390; syntax and Compose config checks exited 0; the bounded Docker start/traffic/verify/reset-preview/stop flow passed.
- `manual-acceptance execute` appended Evaluation `k3-1-issue-71-v1-remediation-20260807T131438+0700` with MA-71-01 through MA-71-09 all observed `PASS`; it remains `verdict=BLOCKED` with `human_approval=pending` until explicit user approval.
- User approved the remediation observations; `manual-acceptance` appended superseding Evaluation `k3-1-issue-71-v1-remediation-approved-20260807T132516+0700` with 9/9 PASS, `verdict=PASSED`, and `human_approval=approved`.
- Selector-remediation cycle 2 added a total-rate assertion rejecting every `status_class` matcher; the approved Evaluation `k3-1-issue-71-v1-selector-remediation-approved-20260807T153854+0700` recorded 9/9 PASS, and final review returned `APPROVE` with zero Critical/Major findings.
- Publication checkpoint: commit `4d579e6d` was pushed to `github/codex/k3-1-issue-71-implementation`, PR #75 merged into `main` as `811cde8351d8b612dd2816d5b517c18873580f8b`, and Issue #71 closed automatically.
- User approved and locked Issue #72 guide revision `k3-1-issue-72-v1` at `2026-08-07T16:20:55.2522697+07:00`; its locked SHA-256 is `AEDFEA527EB829016B104A8EC19D78D6772C1F631192ADD245AAB6AD51166747`.
- The user-authorized independent branch `codex/k3-1-issue-72-implementation` was created from `main` at `811cde8351d8b612dd2816d5b517c18873580f8b`.
- Implement #72 changed `README.md` and `docs/observability/k3-local-demo.md`, and added three sanitized dashboard evidence artifacts under `docs/assets/readme/k3-observability/`. Focused K3.1 contract tests passed `23/23`; root CI contract tests passed `122/122`; `git diff --check` passed.
- Issue #72 runtime/browser acceptance passed all seven cases: start/readiness/provisioning, safe traffic, separate verify claims, browser panel observation, sanitized evidence, README handoff, and safe stop with unchanged volumes. Evaluation `k3-1-issue-72-v1-20260807T163105+0700` was appended with `7/7 PASS`, `verdict=BLOCKED`, and `human_approval=pending`.
- User approved Evaluation `k3-1-issue-72-v1-20260807T163105+0700`; superseding Evaluation `k3-1-issue-72-v1-approved-20260807T164827+0700` was appended with `7/7 PASS`, `verdict=PASSED`, and `human_approval=approved`.
- Initial `code-review` on the pinned Issue #72 diff returned `APPROVE` with zero Critical findings, zero Major findings, and one Minor spec finding about the three screenshot files containing JPEG bytes under `.png` names.
- Remediation converted all three artifacts to valid PNGs and appended Evaluation `k3-1-issue-72-v1-png-remediation-20260807T181742+0700`; the user approved superseding Evaluation `k3-1-issue-72-v1-png-remediation-approved-20260807T182331+0700` with MA-72-04 and MA-72-05 both `PASS`.
- The user authorized the Issue #72 publication checkpoint after final review: stage, commit, push the independent branch, and open a PR. The user later authorized PR #76 merge and Issue #72 closure; deployment remained out of scope.
- Updated final `code-review` aggregate returned `APPROVE`, `0` Critical, `0` Major, and no findings across Standards and Spec axes.
- Publication checkpoint completed as commit `bd0f63eaf8ea860e0ff9e1283badfc6b3231c96a`, pushed to `github/codex/k3-1-issue-72-implementation`, merged by PR #76 into `main` as `6bc0405cc35c77ec0e82609227c1f44c92b4e252`, and Issue #72 was closed; no deployment was performed.

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
2. **#71 — Generate live traffic and verify Prometheus/Grafana data** — complete, merged by PR #75, and closed. Owns safe successful traffic, the bounded total HTTP request-rate dashboard panel, Prometheus target and query checks, Grafana discovery, and the two-phase reset Interface with post-disclosure target-set confirmation tests.
3. **#72 — Capture browser evidence and publish the portfolio handoff** — implementation, remediation acceptance, updated final review, authorized publication, merge, and issue closure are complete. Owns manual browser acceptance of non-empty total request-rate and latency panels, two or three screenshots or a short video, README evidence links, safe cleanup evidence, and the stop rule.

Current frontier: #70, #71, and #72 are complete through approved acceptance, final review, publication, merge, and issue closure. K3.1 stops here; deployment and destructive reset remain out of scope.

## Acceptance Guide State

- Slice: #72
- Guide: `.agents/manual-tests/k3-1-local-observability/browser-evidence-handoff-v1.md`
- Revision: `k3-1-issue-72-v1`
- Locked SHA-256: `AEDFEA527EB829016B104A8EC19D78D6772C1F631192ADD245AAB6AD51166747`
- Test Cases: `MA-72-01` through `MA-72-07`
- Human approval: approved by the user at `2026-08-07T16:20:55.2522697+07:00`
- Lock status: locked and immutable; semantic changes require a new revision
- Evaluation history: `.agents/manual-tests/k3-1-local-observability/browser-evidence-handoff-v1.evaluations.jsonl`; latest full-scope run `k3-1-issue-72-v1-approved-20260807T164827+0700` has 7/7 PASS observations, and latest remediation run `k3-1-issue-72-v1-png-remediation-approved-20260807T182331+0700` has 2/2 PASS observations; both have verdict `PASSED` and human approval `approved`

- Slice: #70
- Guide: `.agents/manual-tests/k3-1-local-observability/start-smoke-stop-v1.md`
- Revision: `k3-1-issue-70-v1`
- Locked SHA-256: `26055774EDB39EE065890D817291402AB7F778C3F5C978026830B9AD9A14F245`
- Test Cases: `MA-70-01` through `MA-70-08`
- Human approval: approved by the user at `2026-08-07T10:21:07.1180231+07:00`
- Lock status: locked and immutable; semantic changes require a new revision
- Evaluation history: `.agents/manual-tests/k3-1-local-observability/start-smoke-stop-v1.evaluations.jsonl`; latest run has 8/8 PASS observations, verdict `PASSED`, and human approval `approved`.
- Slice: #71
- Guide: `.agents/manual-tests/k3-1-local-observability/traffic-verify-reset-v1.md`
- Revision: `k3-1-issue-71-v1`
- Locked SHA-256: `700B706FADCB5F8EC794417E9ED302191BE09609F23BC9DBD86162948385E491`
- Test Cases: `MA-71-01` through `MA-71-09`
- Human approval: approved by the user at `2026-08-07T12:03:45.4203149+07:00`
- Lock status: locked and immutable; semantic changes require a new revision
- Evaluation history: `.agents/manual-tests/k3-1-local-observability/traffic-verify-reset-v1.evaluations.jsonl`; the latest run is `k3-1-issue-71-v1-selector-remediation-approved-20260807T153854+0700`.
- Latest run has 9/9 PASS observations, verdict `PASSED`, and human approval `approved`; all earlier observations remain immutable history.

## Next Valid Transition

Issue #70 is complete, merged, and closed after approved acceptance and final review. Issue #71 is complete, merged, and closed after approved acceptance and final `code-review`. Issue #72 implementation, remediation acceptance, updated final review, authorized publication, PR #76 merge as `6bc0405cc35c77ec0e82609227c1f44c92b4e252`, and issue closure are complete. Stop per the K3.1 rule; do not deploy or perform destructive reset.
