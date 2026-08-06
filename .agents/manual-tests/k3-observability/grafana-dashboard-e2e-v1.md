# Manual Test Guide: K3 Grafana Dashboard and End-to-End Observability Validation

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #52 — Grafana dashboard and end-to-end observability validation
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/52
- Parent specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Design authority: `docs/adr/012-k3-observability-metrics-boundary.md`
- Authoritative artifact paths:
  - `docs/observability/dashboards/k3-observability.json`
  - `docs/observability/prometheus/k3-scrape-config.yml`
  - `docs/observability/alerts/k3-queue-alerts.yml`
  - `docs/observability/runbooks/k3-queue-dead-lettered.md`
  - `docs/observability/k3-operator-validation.md`
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-06T19:30:24+07:00
- Evaluation history: `.agents/manual-tests/k3-observability/grafana-dashboard-e2e-v1.evaluations.jsonl` (created only when execution begins)

## Scope and invariants

- This slice publishes a repository-owned Grafana 11.x dashboard (schema version 39), a static per-replica scrape contract, direct `/metrics` endpoint smoke evidence, end-to-end correlation evidence, aggregate metric evidence, and an operator validation guide.
- MongoDB remains the durable source of truth. Redis remains cache/coordination only, and RabbitMQ remains background-only.
- `/metrics` is an internal backend route. It is never proxied by nginx, advertised as public API, or used as a public capability. `METRICS_ENABLED=false` remains the default.
- Metrics prove aggregate operation signals only. A metric sample must not be described as a per-request trace; request/job identity is verified from structured logs and carrier assertions separately.
- Prometheus, Grafana, and Alertmanager are not deployed by this slice. Static checks do not claim Prometheus target health, and the direct smoke test is explicitly endpoint evidence only.
- Dashboard application labels remain bounded to the ADR-012 catalog. Prometheus infrastructure labels `job` and `instance` are allowed for replica selection and aggregation. Request IDs, correlation IDs, user/message identifiers, raw URLs, cache keys, payloads, and raw errors must not become metric labels.
- Synthetic fixtures and sanitized errors are required in captured evidence. Never record credentials, tokens, cookies, message bodies, DLQ payloads, connection strings, or raw provider errors.

## Prerequisites

- Environment: the isolated `codex/k3-issue-52` checkout with Node 22 and repository dependencies installed (`npm install` at the relevant package roots when needed).
- Working directory: repository root for CI/artifact checks; `server/` for server-focused tests.
- Runtime fixture: a monitoring-enabled backend fixture that can expose one direct HTTP endpoint per configured backend replica with `METRICS_ENABLED=true`, an isolated MetricsModule/registry per replica, and synthetic health/dependency doubles. If the implementation requires live dependencies for a case, the operator guide must name them and the run is `BLOCKED` when they are unavailable.
- Data and state: fresh metrics registries and deterministic synthetic request/job/socket/cache/persistence fixtures for each case; capture before/after deltas rather than relying on process-global counters.
- Credentials and permissions: local repository test execution only. No Grafana login, Prometheus server, Alertmanager, production database, or public network access is required.
- Required commands: run the focused Issue #52 test command documented by the implementation, then `npm run test:ci` and `npm --prefix server test` when the focused run is green. Run the exact static and direct-smoke commands recorded in `docs/observability/k3-operator-validation.md`.
- Evidence policy: retain command output, sanitized JSON/YAML metadata, metric snapshots/exposition excerpts, direct endpoint status/content-type results, structured log/carrier tables, and artifact paths. Do not retain secrets or raw payloads.
- Approval gate: this guide received explicit human approval at the timestamp above. Keep the guide immutable; implementation may proceed, but acceptance execution remains a later gated transition.

## Coverage axes

- Included: dashboard JSON/schema and identity contracts; datasource and metric/label bounds; PromQL semantics and replica aggregation; static scrape configuration; monitoring-enabled direct endpoint behavior; request/job correlation across publish/retry/DLQ/worker paths; HTTP, socket, persistence, Redis, and queue aggregate signals; alert/runbook/operator boundaries; failure recovery semantics; regression and public-surface safety.
- Omitted: Grafana UI/runtime rendering, Prometheus target-health evaluation, Alertmanager delivery, production deployment/rollback, load or SLO benchmarking, client-side observability, and unapproved changes to API or Socket.IO payload contracts. Issue #52 explicitly excludes these behaviors or requires them to remain outside the repository test suite.
- Boundary rationale: static artifact checks and direct endpoint smoke are separate evidence classes; no external monitoring process is needed to prove syntax/query contracts, and endpoint smoke must not be promoted to target-health evidence.

## Locked Test Cases (v1)

### MA-52-01: Dashboard JSON identity, schema, and datasource contract

- Purpose: Verify that the repository-owned dashboard is importable, stable, environment-neutral, and references exactly one Prometheus datasource variable.
- Seam: static artifact/CI contract test.
- Steps:
  1. Load `docs/observability/dashboards/k3-observability.json` as JSON and run the focused dashboard contract test.
  2. Inspect the dashboard metadata, `templating` section, panel tree, panel IDs, and every panel target datasource reference.
  3. Search the artifact for environment-specific datasource URLs, names, UIDs, numeric dashboard IDs, and duplicate panel IDs.
- Expected results:
  - JSON syntax is valid and the dashboard declares Grafana 11.x schema version `39`.
  - The dashboard UID is stable and non-numeric.
  - `DS_PROMETHEUS` is the only datasource variable, and every panel uses `${DS_PROMETHEUS}`.
  - No environment-specific URL, datasource name/UID, numeric dashboard ID, or duplicate panel ID is present.
  - The contract test reports the artifact path and passes without requiring a Grafana runtime.
- Evidence to capture:
  - Focused test output and exit code.
  - Sanitized metadata summary (`schemaVersion`, UID shape, datasource variable count, panel ID count).
  - Artifact path and content hash; do not capture credentials or deployment-specific endpoints.

### MA-52-02: Dashboard metric coverage, bounded labels, and PromQL semantics

- Purpose: Verify that every locked K3 signal is represented with the approved labels, replica semantics, query functions, and presentation settings.
- Seam: static dashboard contract test plus deterministic query/field inspection.
- Steps:
  1. Enumerate every panel target and map it to the locked metric families: HTTP request count/duration, active sockets, message persistence duration, Redis operations, cache fallbacks, queue jobs, and queue dead letters.
  2. Inspect each query for application-label allowlists and the permitted Prometheus `job`/`instance` infrastructure labels.
  3. Verify the default all-replica query form and the `instance` filter behavior.
  4. Inspect panel units, legends, default time range, refresh interval, and explicit no-data behavior.
- Expected results:
  - Active sockets use `sum` and show all replicas by default.
  - HTTP 5xx request rate and HTTP 5xx ratio are separate panels.
  - p50 and p95 latency use `histogram_quantile()` over `rate(..._bucket[$__rate_interval])` and retain `le` in the aggregation.
  - Persistence failure rate is derived from the histogram `_count`, not from an unapproved per-request label.
  - Redis command errors and cache fallbacks are separate queries/series.
  - Queue outcomes use `rate`; dead-letter reasons use `increase(...[$__range])`.
  - All locked metric families are present, application label values remain bounded, and no request/correlation/user/message/cache/raw-URL/error value appears as a metric label.
  - Units, legends, time range, refresh, and no-data behavior are explicit and deterministic.
- Evidence to capture:
  - Static test output with one sanitized panel-to-requirement table.
  - Query excerpts with identifiers and environment-specific values removed.
  - Assertions for metric-family presence, label allowlists, unique panel IDs, and presentation fields.

### MA-52-03: Static scrape configuration and internal-surface boundary

- Purpose: Verify that scrape configuration is reproducible and describes per-replica endpoint selection without claiming runtime health or widening the public surface.
- Seam: static YAML/Compose/nginx/README CI contract tests.
- Steps:
  1. Parse `docs/observability/prometheus/k3-scrape-config.yml` and run the focused static scrape validation.
  2. Count declared backend targets and compare them with the repository's documented replica layout.
  3. Run the existing nginx/Compose/public-artifact boundary checks and inspect the operator guide's distinction between static validation and runtime smoke.
- Expected results:
  - The scrape configuration is valid YAML, declares one `/metrics` target per backend replica, and uses the approved `job`/`instance` infrastructure-label boundary.
  - Static validation passes without a running Prometheus process and does not claim target health, scrape success, or alert delivery.
  - Backend port `3000` remains internal; nginx has no `/metrics` proxy; public API/capability artifacts do not advertise `/metrics`; and `METRICS_ENABLED=false` remains the example default.
  - Static scrape checks remain separate from application endpoint tests and direct runtime smoke evidence.
- Evidence to capture:
  - YAML parser/contract test output and sanitized target count/list.
  - CI boundary test output and exit codes.
  - A redacted operator-guide excerpt showing the static-versus-runtime evidence boundary.

### MA-52-04: Direct per-replica monitoring-enabled `/metrics` smoke

- Purpose: Verify each configured backend replica directly serves valid Prometheus exposition when monitoring is enabled, without routing through nginx or inferring Prometheus target health.
- Seam: direct HTTP endpoint smoke against the named monitoring-enabled runtime fixture.
- Steps:
  1. Start the monitoring-enabled fixture with `METRICS_ENABLED=true`, one isolated registry per backend replica, and the replica identities recorded by the operator guide.
  2. Send a direct HTTP request to `/metrics` on every replica endpoint named by the scrape configuration; do not use nginx, Grafana, or a Prometheus proxy.
  3. Validate status, content type, `Cache-Control`, Prometheus text parseability, and presence of the locked metric families on each response.
  4. Scrape each endpoint twice and compare application-metric snapshots before and after the scrapes.
  5. Repeat the endpoint check with metrics disabled and record the control result.
- Expected results:
  - Every configured replica returns `200` with the MetricsModule-provided Prometheus content type, `Cache-Control: no-store`, parseable exposition, and the locked metric families.
  - The direct endpoint identity matches the static target entry; no request is sent through nginx or a public interface.
  - Repeated scrapes do not increment application HTTP metrics because `/metrics` is excluded from them.
  - When disabled, `/metrics` is unregistered and returns `404`; existing `/ops` behavior remains available.
  - Evidence is labeled “direct endpoint smoke” and makes no claim about Prometheus target health or Alertmanager notification.
- Evidence to capture:
  - Per-replica endpoint, status, content type, cache-control, parse result, and metric-family summary.
  - Before/after scrape-delta assertion and disabled-control response.
  - Sanitized command output with host credentials and connection strings removed.

### MA-52-05: REST-to-worker correlation across publish, retry, and DLQ

- Purpose: Verify that one canonical request/correlation identity can be followed through structured REST, publication, retry/DLQ, and worker logs while preserving the approved carrier precedence and failure-stage semantics.
- Seam: `createApp` request context, producer/AMQP carrier adapter, and `startQueueWorker` integration fixture.
- Steps:
  1. Start with a fresh log collector and synthetic request ID; issue a REST operation that publishes a representative job.
  2. Capture the request completion/error log, publication payload/properties/headers, and worker ingress log using sanitized synthetic values.
  3. Exercise a successful worker path, a publisher-confirmed retry path, and a retry-exhausted/DLQ path.
  4. Include one carrier-mismatch fixture and inspect the selected canonical value and mismatch warning.
  5. Compare the correlation log trail with the metrics snapshots, keeping the two evidence classes separate.
- Expected results:
  - The canonical correlation ID is consistent across REST logs, initial publication, retry/DLQ carriers, worker context, and worker lifecycle logs.
  - Worker lifecycle logs retain `queue`, `jobType`, `attempt`, `correlationId`, and `failureStage` with the approved values; mismatch handling follows ADR-012 precedence and does not fail the job by itself.
  - Retry and DLQ publication errors retain the existing business disposition and expose the correct failure stage.
  - No request body, token, cookie, credential, secret, raw DLQ payload, or raw provider error appears in captured structured logs.
  - Metrics are reported only as aggregate operation evidence; no metric label is used as an individual trace.
- Evidence to capture:
  - A redacted correlation/carrier matrix for success, retry, and DLQ paths.
  - Sanitized JSON log lines and mismatch/failure-stage assertions.
  - Separate before/after aggregate metric snapshots; never merge identifiers into metric labels.

### MA-52-06: Request-to-persistence aggregate metric integration

- Purpose: Verify that a request/message persistence operation changes the expected Mongo-backed aggregate histogram exactly once and that correlation evidence remains in logs rather than labels.
- Seam: persistence owner seam `saveMessageInBackground` with an injected MetricsModule and deterministic Mongo/clock doubles.
- Steps:
  1. Start with a fresh registry, log collector, and synthetic message/request context.
  2. Run an acknowledged persistence success, a terminal persistence failure, and a verified idempotent duplicate through the existing persistence path.
  3. Run an already-persisted lookup that short-circuits before Mongo persistence timing, and a persistence call followed by cache work.
  4. Render exposition before and after each logical operation and inspect the structured correlation logs independently.
  5. Inject a post-initialization metric observation failure and repeat one business operation.
- Expected results:
  - `kittachat_message_persistence_duration_seconds` records one `success` or `failed` observation per logical Mongo persistence operation, in seconds, including the final retry/commit outcome.
  - A verified idempotent duplicate is a success; an invalid/mismatched duplicate is a failure; a pre-Mongo short-circuit is not recorded; Redis/downstream work is excluded from the timing.
  - Histogram `_count` deltas and outcome labels match the operation result, and durations are finite/non-negative.
  - No request ID, correlation ID, message ID, payload, or raw error appears in metric labels or exposition.
  - Metric observation failure is best-effort and does not change the persistence return value/error behavior.
- Evidence to capture:
  - Sanitized metric before/after deltas and histogram `_count`/`outcome` assertions.
  - Persistence result assertions, timing seam trace, and redacted correlation logs.
  - Best-effort failure output without raw errors or identifiers.

### MA-52-07: HTTP, socket, and Redis aggregate signals across replicas

- Purpose: Verify the completed producer tickets contribute the expected aggregate signals and that dashboard replica aggregation/instance filtering has truthful source data.
- Seam: `createApp`/HTTP metrics middleware, authenticated Socket.IO lifecycle, and application cache service seams with in-memory adapters.
- Steps:
  1. Record a fresh per-replica metrics snapshot, then exercise a successful HTTP request, a 4xx/5xx response, and a mounted/unmapped route.
  2. Open and close an authenticated application-namespace `/` socket on each replica; include one duplicate/unmatched disconnect cleanup.
  3. Exercise a Redis cache hit, GET miss with Mongo fallback, GET error with Mongo fallback, warm-up `set_ex`, and invalidation `del` using synthetic fixtures.
  4. Render each replica's exposition and compute the all-replica sum plus an `instance`-filtered view.
  5. Compare the resulting series with the dashboard queries without treating any series as a request trace.
- Expected results:
  - HTTP counters/histograms use only `method`, canonical/sentinel `route_template`, and `status_class`; `/metrics` scrapes are excluded and each response is observed once.
  - Socket gauge counts accepted namespace `/` socket instances, increments after auth, decrements exactly once, warns on unmatched cleanup, and never becomes a cumulative connection counter.
  - Redis command outcomes (`get`, `set`, `set_ex`, `del` × `success|error`) and fallback reasons (`miss|redis_error`) remain separate and exactly once; later Mongo results do not relabel the Redis decision.
  - The default dashboard aggregation includes all replicas, while the `instance` filter isolates one replica without changing application label allowlists.
  - Telemetry failures do not change HTTP, socket, cache, or Mongo business outcomes.
- Evidence to capture:
  - Sanitized per-replica snapshots, aggregate/instance-filtered calculations, and exposition excerpts.
  - Socket lifecycle and Redis decision traces with cache keys/identifiers removed.
  - Focused test output proving exactly-once and best-effort behavior.

### MA-52-08: Queue aggregate metrics, alert rule, and runbook regression

- Purpose: Verify that queue outcomes and dead-letter events provide truthful aggregate evidence and that the severe-failure rule/runbook preserve the approved operational boundary.
- Seam: `startQueueWorker`, `docs/observability/alerts/k3-queue-alerts.yml`, and `docs/observability/runbooks/k3-queue-dead-lettered.md`.
- Steps:
  1. Exercise processed, publisher-confirmed retried, retry-publication-failed, poison, retry-exhausted, and terminal-DLQ-publication-failed deliveries with synthetic messages.
  2. Capture in-memory metric deltas, acknowledgement/disposition calls, failure stages, and correlation carriers.
  3. Parse the alert YAML and run its zero-event, one-event, and multi-replica evaluation fixtures.
  4. Read the runbook from the alert labels through structured logs/correlation and controlled DLQ access.
- Expected results:
  - Each delivery records exactly one `kittachat_queue_jobs_total` outcome; `retried` appears only after publisher confirmation; a dead-letter counter appears only after successful DLQ handoff.
  - `poison` and `retry_exhausted` are dead-letter reasons, never job types; publication failures are `failed` outcomes with the correct structured failure stage and no false dead-letter reason.
  - `KittaChatQueueDeadLettered` has the exact approved expression/labels, no `for` clause, and aggregates matching events across replicas; zero increase remains inactive.
  - The runbook starts with queue/job type/reason/time, follows structured logs and correlation, restricts payload access, forbids out-of-contract automatic retry, and states that without Alertmanager/another consumer there is no outbound notification.
- Evidence to capture:
  - Sanitized queue metric snapshots and disposition assertions for every outcome path.
  - Alert parser/evaluator test output and redacted rule metadata.
  - Runbook path and checklist evidence; never capture DLQ payload contents.

### MA-52-09: Operator validation guide and failure-semantics boundary

- Purpose: Verify that an operator can reproduce the static checks and direct smoke, interpret aggregate metrics correctly, and distinguish recovered failures from failures that must fail a request/job.
- Seam: repository-owned `docs/observability/k3-operator-validation.md` and its referenced commands/artifacts.
- Steps:
  1. Follow the guide from a clean checkout in the documented order: static dashboard/schema checks, static scrape checks, direct per-replica smoke, correlation validation, aggregate metric validation, and queue alert regression.
  2. Inspect the guide's failure matrix for HTTP metrics/exporter errors, Mongo persistence outcomes, Redis fallback/write failures, queue retry/DLQ publication failures, and logging/telemetry failures.
  3. Verify every evidence link points to a repository artifact or a named runtime observation and that no step silently converts unavailable runtime health into a pass.
- Expected results:
  - The guide names prerequisites, exact commands, environment flags, replica endpoints, cleanup steps, and evidence format without exposing secrets.
  - It explicitly says which failures are swallowed/recovered by fallback and which must fail the request/job, while preserving MongoDB ownership and existing API/socket contracts.
  - It explicitly separates correlation-log tracing from aggregate metrics, labels direct endpoint smoke as endpoint evidence, and states the no-Alertmanager outbound-notification boundary.
  - A missing monitoring runtime or dependency produces `BLOCKED` evidence rather than an invented success.
- Evidence to capture:
  - Operator guide command transcript with sanitized environment values.
  - Failure matrix assertions and references to static/runtime evidence.
  - Cleanup/rollback confirmation for only local test processes and temporary fixtures.

### MA-52-10: Full regression and repository-surface safety

- Purpose: Verify that the complete Issue #52 slice is green and does not widen public API, nginx, Compose, client, or source-of-truth boundaries.
- Seam: repository CI/server test suites and final artifact inventory.
- Steps:
  1. Run the focused Issue #52 tests selected by implementation.
  2. Run `npm run test:ci`; if green, run `npm --prefix server test` and any exact operator-validation command not already covered.
  3. Inspect the final diff and artifact inventory against ADR-012's authoritative layout.
- Expected results:
  - Focused tests, static contracts, direct smoke harness, correlation/aggregate integration tests, and the broader server/CI suites pass with reported exit codes.
  - Dashboard, scrape config, alert/runbook references, and operator guide are present at the ADR-authoritative paths.
  - No client observability module, public `/metrics` documentation, nginx `/metrics` proxy, public backend port, duplicate metrics/logging stack, or unapproved API/Socket.IO payload change is introduced.
  - Any unavailable external runtime is recorded as `BLOCKED`; no test claims deployment, Prometheus target health, Grafana runtime, or Alertmanager delivery.
- Evidence to capture:
  - Complete command output summaries and exit codes.
  - Final artifact inventory and sanitized diff summary.
  - Explicit list of non-goals not exercised by this slice.

## Approval and immutability

Guide v1 is locked after explicit human approval by the user at
`2026-08-06T19:30:24+07:00`. Keep this file immutable; record all observations in the append-only
Evaluation JSONL history. Any semantic change requires a new guide revision.
