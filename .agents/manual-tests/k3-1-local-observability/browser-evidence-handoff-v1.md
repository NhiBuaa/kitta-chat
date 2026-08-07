# Manual Test Guide: K3.1 Issue #72 Browser Evidence and Portfolio Handoff

## Metadata

- Feature: K3.1 Local Observability Demo
- Slice: GitHub Issue #72 — capture browser evidence and publish the portfolio handoff
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/69
- Slice specification: https://github.com/NhiBuaa/kitta-chat/issues/72
- Design reference: `docs/adr/013-k3-1-local-observability-demo-seam.md`
- Metrics boundary: `docs/adr/012-k3-observability-metrics-boundary.md`
- Operator guide: `docs/observability/k3-local-demo.md`
- Guide revision: `k3-1-issue-72-v1`
- Drafted at: `2026-08-07T16:11:46.4696446+07:00`
- Approval status: approved
- Lock status: locked
- Approved by: user
- Approved at: `2026-08-07T16:20:55.2522697+07:00`

## Prerequisites

- Environment: Windows host with PowerShell, Node.js 22, Docker Engine, Docker Compose 2.24.4 or later, and a browser that can open `http://127.0.0.1:3001` and capture screenshots.
- Repository state: the approved Issue #72 implementation is present in the independent branch under test; the repository root is the working directory.
- Docker state: Docker daemon is available, host port `127.0.0.1:3001` is free before start, and project name `kittachat-k3-1` is not shared with an unrelated stack.
- Environment file: `server/.env` may already exist or may be created by the approved start preflight. Never print it, its values, generated secrets, credentials, tokens, or connection strings. An existing file must remain unchanged.
- Data and state: no business-data seed is required. Safe traffic must use only the approved internal health route and must not create users, conversations, messages, calls, files, or other business records.
- Evidence destination: sanitized screenshots belong under `docs/assets/readme/k3-observability/` with stable names `dashboard-overview.png`, `dashboard-request-rate.png`, and `dashboard-latency.png`; use two or three files, not both screenshots and a video.
- Safety: do not run `npm run demo:observability -- reset --confirm <target-set-digest>` during normal acceptance. Safe stop must run without `--volumes`.
- Evidence hygiene: remove secrets, credentials, tokens, connection strings, request payloads, personal data, unrelated tabs, and unrelated terminal output from every captured artifact.

## Test-Craft Coverage

Included axes:

- Data shape and contract: non-empty total request-rate and latency series, distinct total/5xx/ratio claims, direct README evidence links, and the four documented demo actions.
- State and lifecycle: clean start, running dashboard, traffic-before-observation ordering, evidence capture while data is live, and safe stop with unchanged volumes.
- Async and concurrency: dashboard observation occurs only after the start and traffic actions complete; repeated refresh or a second verify must not be treated as a new claim without its own evidence.
- UI and observable transitions: automatic dashboard availability, visible non-empty timeseries panels, panel identity, and absence of manual datasource/dashboard import.
- Security and bounds: loopback-only browser surface, sanitized evidence, project-scoped cleanup, no destructive reset, and the K3.1 stop rule.

Omitted axes:

- Business-data variants: the approved traffic path must not create business data, so business-domain scenarios are outside this slice.
- Internal implementation tests: Issue #70 and Issue #71 own static, fake-Adapter, lifecycle, target, query, and dashboard-discovery contract coverage; this guide records those claims separately and adds the browser-visible proof.
- Production and benchmark behavior: K3.1 is local-only. K4 may reuse the dashboard later, but benchmark outcomes are not acceptance criteria here.

## Locked Test Cases

### MA-72-01: Layered static and startup evidence remains separate

- Purpose: Prove that the handoff distinguishes static validation from a running local stack and preserves the K3.1 host-surface boundary before browser observation.
- Steps:
  1. From the repository root, run `npx --yes node@22 --test scripts/ci/k3LocalObservabilityStack.test.cjs`.
  2. Record the exit code and sanitized test summary without printing environment contents.
  3. Run `npm run demo:observability -- start` and retain only the preflight, Compose, readiness, provisioning, and Grafana URL output.
  4. Check the K3.1 container port table with `docker ps --filter label=com.docker.compose.project=kittachat-k3-1 --format "table {{.Names}}\t{{.Ports}}"`.
- Expected results:
  - The focused contract suite exits `0` and reports the approved static/profile/provisioning/reset boundaries as passing.
  - Start exits `0`, reports the isolated `kittachat-k3-1` project as ready, and reports Grafana at `http://127.0.0.1:3001`.
  - Grafana is the only K3.1 service with a published host port; backend, Prometheus, MongoDB, and Redis remain internal.
  - The evidence record labels static validation, bounded runtime smoke, and host-port isolation as separate claims. No browser, query-data, or cleanup claim is inferred from static success.
- Evidence to capture:
  - Focused test command, exit code, sanitized summary, start output, and sanitized port table.
  - No `.env` content, generated secret, credential, token, connection string, or unrelated container log.

### MA-72-02: Safe traffic and runtime verification produce distinct claims

- Purpose: Prove that live data exists before browser observation and that traffic, target health, metric queries, Grafana health, and dashboard discovery are reported independently.
- Steps:
  1. After MA-72-01 start succeeds, run `npm run demo:observability -- traffic`.
  2. Capture sanitized stdout, stderr, and exit code.
  3. Run `npm run demo:observability -- verify`.
  4. Preserve each verification line as a separate evidence item: readiness, Prometheus target, total request-rate query, latency query, Grafana health, and dashboard discovery.
- Expected results:
  - Traffic exits `0` and reports exactly five successful internal `2xx` requests from inside the backend service.
  - Traffic does not publish a backend port, fabricate `5xx` traffic, or create business data.
  - Verify exits `0` and reports the backend target `UP`, non-empty total request-rate data, non-empty histogram-derived latency data, Grafana health, and dashboard discovery as separate claims.
  - Total request-rate evidence is not represented as HTTP 5xx rate or HTTP 5xx ratio evidence.
  - The record does not claim browser-panel visibility or destructive-reset completion.
- Evidence to capture:
  - Sanitized traffic output and exit code.
  - Sanitized verify output with all six claim labels and exit code.
  - A concise statement that no business-data seed or mutation was used.

### MA-72-03: Grafana browser observation shows the provisioned dashboard and live panels

- Purpose: Prove the user-visible acceptance outcome: a reviewer can open the loopback Grafana UI without manual imports and see live total request-rate and latency data.
- Steps:
  1. Open `http://127.0.0.1:3001` in the browser after MA-72-02 succeeds.
  2. Confirm the page shows `KittaChat K3 Observability` and that no datasource import, dashboard import, or manual provisioning step was required.
  3. Locate the `Total HTTP request rate` panel and inspect the current time range after the safe traffic run.
  4. Locate `HTTP latency p50` and `HTTP latency p95` and inspect the same current time range.
  5. Locate `HTTP 5xx request rate` and `HTTP 5xx ratio` separately; record them as distinct panels and do not use their zero/empty state as proof of total request rate.
- Expected results:
  - Grafana opens through the loopback-only URL and the provisioned dashboard is available without manual datasource or dashboard import.
  - `Total HTTP request rate` displays a non-empty series after safe traffic.
  - Both `HTTP latency p50` and `HTTP latency p95` display non-empty series after safe traffic.
  - The total request-rate panel is visibly distinct from the HTTP 5xx rate and HTTP 5xx ratio panels.
  - Browser observation is recorded separately from static validation, runtime smoke, Prometheus target/query state, and Grafana HTTP discovery.
- Evidence to capture:
  - Browser observation notes naming the dashboard and each required panel.
  - Screenshot candidates showing the dashboard title and live total/latency panels without unrelated tabs or sensitive content.

### MA-72-04: Durable evidence is sanitized and portfolio-ready

- Purpose: Prove that the accepted browser result survives outside the running session and can be linked from the project README without exposing sensitive or personal information.
- Steps:
  1. Capture two or three screenshots while MA-72-03 is visibly passing: `dashboard-overview.png`, `dashboard-request-rate.png`, and optionally `dashboard-latency.png`.
  2. Save the selected files under `docs/assets/readme/k3-observability/`.
  3. Review each image at its saved path and remove any credentials, tokens, connection strings, environment values, request payloads, personal data, unrelated browser tabs, or unrelated terminal content.
  4. Confirm the selected artifacts show the running dashboard and live HTTP data, rather than only a static JSON or HTTP response.
- Expected results:
  - Exactly two or three sanitized screenshot files are present under the README asset path, or one approved short sanitized video is present instead; do not claim both formats.
  - The evidence shows the provisioned dashboard, total HTTP request-rate data, and HTTP latency data.
  - No screenshot or video exposes secrets, credentials, tokens, connection strings, or personal data.
  - Filenames and links are stable enough for a recruiter or reviewer to open from the repository.
- Evidence to capture:
  - The relative paths and file sizes of the selected artifacts.
  - Visual review result for each artifact and a short sanitization statement.

### MA-72-05: README and operator handoff are directly usable

- Purpose: Prove that the portfolio handoff leads a reviewer to the demo instructions and durable evidence while preserving the layered claim boundary and stop rule.
- Steps:
  1. Inspect `README.md` and follow its K3.1 observability link to `docs/observability/k3-local-demo.md`.
  2. Follow every K3.1 command in the linked instructions and confirm there is one documented action each for `start`, `traffic`, `verify`, and safe `stop`.
  3. Follow the README links to the selected screenshot/video artifacts and confirm each link resolves to the saved evidence.
  4. Check that the handoff describes static validation, bounded runtime smoke, Prometheus target state, Prometheus query data, Grafana discovery, browser observation, and safe stop as separate claims.
  5. Check that the handoff states the K3.1 stop rule, excludes cAdvisor/Loki/Tempo/OpenTelemetry/Alertmanager/new metrics/benchmark requirements/production deployment/open-ended dashboard tuning, and explains that K4 may reuse the dashboard for future benchmark work without making K3.1 own benchmark outcomes.
- Expected results:
  - README links directly to the K3.1 demo instructions and to the durable evidence files.
  - The documented start, traffic, verify, and safe-stop actions are unambiguous and do not require hidden setup or manual dashboard import.
  - The handoff never treats one layer of evidence as proof of another.
  - The stop rule and K4 boundary are explicit, and no out-of-scope observability or deployment work is introduced.
- Evidence to capture:
  - README line references or rendered link checks.
  - The linked instruction path and evidence paths.
  - A checklist of the separate claims, stop rule, K4 note, and explicit non-goals.

### MA-72-06: Safe cleanup preserves the K3.1 volume identities

- Purpose: Prove that the evidence workflow can end without deleting K3.1 data or touching another Compose project.
- Steps:
  1. Before cleanup, list and sort the exact volumes labeled `com.docker.compose.project=kittachat-k3-1`; retain the sanitized pre-stop list.
  2. Run `npm run demo:observability -- stop` without `--volumes` and capture output plus exit code.
  3. Confirm no running container remains with the K3.1 project label.
  4. List and sort the same project-labeled volumes after cleanup and compare the pre-stop and post-stop lists.
  5. Do not run `npm run demo:observability -- reset --confirm <target-set-digest>`. If a reset boundary must be mentioned, link the Issue #71 fake-Adapter evidence and the non-destructive preview documentation instead.
- Expected results:
  - Stop exits `0`, removes only the isolated K3.1 containers/networks, and does not pass `--volumes`.
  - No K3.1 container remains running after stop.
  - The exact K3.1 volume names are unchanged before and after safe stop, and no foreign volume is listed or changed.
  - Destructive reset is clearly separated from safe cleanup and no real volume-removal command runs during acceptance.
- Evidence to capture:
  - Sanitized stop output and exit code.
  - Exact pre-stop and post-stop volume names plus an equality result.
  - Container-count result and an explicit `reset --confirm not executed` statement.

### MA-72-07: Blocked prerequisites and the K3.1 scope guard are handled honestly

- Purpose: Prove that unavailable infrastructure produces an honest blocked result and that the final handoff stops when the approved evidence outcome is complete.
- Steps:
  1. If Docker, Grafana, Prometheus, or the required browser is unavailable at any point, stop the affected acceptance run and record `BLOCKED` with the missing prerequisite and the last completed case; do not manufacture screenshots, target health, query data, or dashboard observations.
  2. Otherwise, review the complete evidence set after MA-72-06 and confirm every required Issue #72 claim is present.
  3. Confirm no destructive reset, deployment, production setup, benchmark, multi-replica discovery, or new observability component was executed or documented as part of this slice.
  4. Confirm the handoff says K3.1 ends after browser evidence, README evidence links, and safe cleanup are accepted; later work may reuse the dashboard under K4 ownership.
- Expected results:
  - An unavailable prerequisite is recorded as `BLOCKED`, never as `PASSED`, with no invented evidence.
  - A passing run has separate evidence for static validation, runtime smoke, target state, query data, Grafana discovery, browser observation, durable artifacts, README handoff, and safe stop.
  - The final handoff states the K3.1 stop rule and the K4 benchmark boundary without expanding K3.1 scope.
- Evidence to capture:
  - Either the blocked-run record with its missing prerequisite, or the completed claim matrix.
  - Final scope/stop-rule checklist and confirmation that destructive reset was not executed.

## Approval Gate

This guide is approved and locked at revision `k3-1-issue-72-v1`. It is immutable after approval. A semantic change requires a new guide revision; observations belong in the separate append-only Evaluation history `.agents/manual-tests/k3-1-local-observability/browser-evidence-handoff-v1.evaluations.jsonl`.

Approval unlocks the independent Issue #72 implementation branch and implementation work. It does not authorize deployment, destructive reset, publication, merge, or benchmark work.
