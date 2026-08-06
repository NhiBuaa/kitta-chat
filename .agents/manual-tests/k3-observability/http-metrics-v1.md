# Manual Test Guide: K3 Internal HTTP Metrics and Prometheus Endpoint

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #49 — Internal HTTP metrics and Prometheus endpoint
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/49
- Parent specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Design authority: D:/Developer/Projects/shotter/shot-chat-worktrees/issue-49/docs/adr/012-k3-observability-metrics-boundary.md
- Correlation authority: D:/Developer/Projects/shotter/shot-chat-worktrees/issue-49/docs/observability/k3-correlation-contract.md
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-06T11:35:14+07:00
- Status: locked; immutable for acceptance execution.

## Prerequisites

- Environment: repository worktree with Node 22 and server dependencies installed.
- Data and state: use an isolated loopback HTTP server with injected health checks, a captured structured logger, and an isolated Prometheus or in-memory MetricsModule Adapter. No live MongoDB, Redis, RabbitMQ, Prometheus, Grafana, or nginx runtime is required for application cases.
- Configuration: run enabled and disabled cases with `METRICS_ENABLED=true`, `METRICS_ENABLED=false`, and the variable absent; restore the process environment after every case.
- Deployment checks: inspect repository-owned `nginx/nginx.conf` and `docker-compose.yml` through static contract tests or equivalent read-only assertions. Do not publish or bind backend port `3000` to a public interface.
- Credentials and permissions: local repository test execution only. No authentication credentials are required for the test fixtures.
- Evidence policy: capture status codes, response headers, redacted exposition assertions, structured event names/fields, label-key assertions, and static contract output. Never capture tokens, cookies, authorization headers, passwords, credentials, raw query secrets, request bodies, or connection strings.

## Coverage Axes

- Included: endpoint registration and response contract, Prometheus exposition shape, bounded labels and approved buckets, mounted-router route resolution, status/method sentinels, response lifecycle timing, exactly-once observation, request-context/log integration, scrape exclusion, and deployment exposure boundaries.
- Omitted: UI behavior, Socket.IO, MongoDB persistence, Redis, RabbitMQ, Grafana runtime, and exporter-library internals outside the HTTP Adapter contract; these are non-goals or separate K3 slices.

## Test Cases

### MA-49-01: Conditional internal endpoint and `/ops` preservation

- Purpose: Verify `/metrics` is registered only in monitoring-enabled environments and does not replace or alter the existing `/ops` contract.
- Steps:
  1. Start the application integration fixture with `METRICS_ENABLED` absent and request `GET /metrics` and `GET /ops`.
  2. Repeat with `METRICS_ENABLED=false`.
  3. Start a fresh isolated application fixture with `METRICS_ENABLED=true` and request `GET /metrics` and `GET /ops`.
  4. Compare `/ops` status, JSON shape, and established fields with the pre-#49 baseline.
- Expected results:
  - With the flag absent or false, no `/metrics` route is registered and `GET /metrics` returns the existing not-found response with status `404`.
  - With the flag true, `GET /metrics` is available only on the direct backend integration server and returns success.
  - `/ops` keeps its existing status, JSON response shape, lightweight operational semantics, and dependency/runtime fields in every configuration.
  - `/ops` is not replaced by Prometheus text, and no `/metrics` capability is added to public API discovery.
- Evidence to capture:
  - Redacted status/body assertions for all three flag states.
  - `/ops` baseline comparison output.
  - The test fixture's loopback-only address and restored environment state.

### MA-49-02: Prometheus content type, cache policy, metric families, labels, and buckets

- Purpose: Verify the enabled endpoint exposes both approved HTTP metric families through the MetricsModule Adapter without introducing unbounded labels.
- Steps:
  1. Start the enabled application fixture with an isolated Prometheus Registry.
  2. Send a canonical request such as `GET /healthz` and then request `GET /metrics`.
  3. Parse the exposition and inspect `kittachat_http_requests_total` and `kittachat_http_request_duration_seconds`.
  4. Inspect every application label and the histogram bucket boundaries.
- Expected results:
  - The response content type exactly matches the `contentType` returned by the MetricsModule exposition Adapter.
  - The response includes `Cache-Control: no-store`.
  - Both approved metric families are present and use only `method`, `route_template`, and `status_class` as application labels.
  - Histogram exposition's structural `le` label is accepted only for bucket samples; it is not treated as an additional application label.
  - The canonical sample contains bounded values such as `GET`, `/healthz`, and `2xx`; request IDs, correlation IDs, user IDs, raw URLs, query strings, and error messages never appear as labels.
  - HTTP duration buckets are exactly `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` seconds, plus the normal Prometheus `+Inf` bucket.
- Evidence to capture:
  - Response status, content type, and cache-control assertions.
  - Redacted metric-family/type/label assertions.
  - Bucket-boundary assertion output and a short exposition excerpt with identifiers omitted.

### MA-49-03: Mounted-router canonicalization and bounded method/route/status matrix

- Purpose: Verify route labels describe canonical templates, never raw URLs, and all bounded sentinel/status rules are deterministic.
- Steps:
  1. Exercise a route mounted under a router, including a parameterized route such as `/api/users/:id`, and capture the resulting route label.
  2. Exercise a mounted child route whose canonical template includes the mount prefix, such as `/api/auth/login`.
  3. Exercise an unmatched path containing a query string and a path identifier.
  4. Exercise a matched test-only route that is intentionally absent from the canonical route-template allowlist.
  5. Exercise an unsupported HTTP method against a route-resolving fixture, without changing the production allowlist.
  6. Exercise controlled responses for status classes `1xx`, `2xx`, `3xx`, `4xx`, and `5xx`.
- Expected results:
  - Mounted routes resolve to their canonical templates, including the mount prefix and parameter placeholders; no raw URL or concrete identifier is used.
  - An unmatched request uses `route_template="NOT_FOUND"`.
  - A matched but non-canonical route uses `route_template="UNMAPPED_ROUTE"`.
  - An unsupported method maps to `method="OTHER"` without throwing or expanding the label allowlist.
  - Each response is recorded under the final status class observed at completion.
  - Query strings, path identifiers, request IDs, and other unbounded values are absent from metric labels.
- Evidence to capture:
  - The request-to-label matrix for canonical, `NOT_FOUND`, `UNMAPPED_ROUTE`, and `OTHER` cases.
  - Status-class sample assertions for all five classes.
  - A label-key/value allowlist assertion proving no raw URL fallback.

### MA-49-04: Response-finish timing, final status, and exactly-once observation

- Purpose: Verify HTTP metrics cover the full middleware-entry-to-`response.finish` lifecycle and observe each response exactly once.
- Steps:
  1. Run a controlled handler that delays before finishing and records the middleware-entry timestamp.
  2. Complete one successful response, one client-error response, and one server-error response; change the response status before finish where the fixture permits it.
  3. Exercise the response lifecycle with duplicate finish notifications or an equivalent test seam that would expose duplicate listeners.
  4. Compare the counter and histogram samples before and after each response.
- Expected results:
  - Every completed non-`/metrics` response creates exactly one HTTP request counter observation and one duration observation.
  - Measured duration is finite, non-negative, and includes the controlled delay from middleware entry through `response.finish`.
  - The status label uses the final response status class, not an earlier intermediate status.
  - Duplicate finish notifications do not create duplicate observations.
  - Error and short-circuit responses retain the same exactly-once rule.
- Evidence to capture:
  - Before/after sample counts for each response.
  - Controlled delay and duration assertions.
  - Final-status and duplicate-finish test output.

### MA-49-05: Scrape exclusion and canonical request-context logging integration

- Purpose: Verify `/metrics` scrapes do not pollute application HTTP metrics while ordinary completion/error logs retain the canonical request ID from Issue #45.
- Steps:
  1. Start the enabled application with a captured structured logger and send an ordinary request with a valid `x-request-id`.
  2. Send an error-producing request with the same controlled request ID and a redacted query/body fixture.
  3. Record HTTP metric samples, request logs, and error logs before and after several `GET /metrics` scrapes.
  4. Run two overlapping requests with distinct valid request IDs and inspect their completion records.
- Expected results:
  - Ordinary completion and error logs retain the same canonical request ID returned by the response/context.
  - Query strings, request bodies, authorization material, cookies, tokens, and credentials are absent from structured logs.
  - `/metrics` scrapes do not increment either HTTP application metric and no `/metrics` route label is emitted.
  - Scrape exclusion does not suppress the existing structured request logger or change `/ops`/API behavior.
  - Concurrent request contexts remain isolated; no request ID or user context crosses between the two requests.
- Evidence to capture:
  - Redacted completion/error log records and response headers.
  - Metric sample-count delta before/after scrapes.
  - Concurrent isolation assertion output with controlled IDs only.

### MA-49-06: Static deployment and public-surface boundary

- Purpose: Verify the internal endpoint is not made public through nginx, Compose port publication, or public API discovery.
- Steps:
  1. Run the repository's static nginx contract check or inspect `nginx/nginx.conf` for exact and prefix locations involving `/metrics`.
  2. Run the repository's static Compose/runtime contract check or inspect the `backend` service in `docker-compose.yml`.
  3. Inspect public API documentation and capability-discovery artifacts for a newly advertised `/metrics` route.
  4. If `docker compose config` is used, inspect only rendered service/port metadata and do not start or publish services.
- Expected results:
  - nginx has no exact or prefix `/metrics` location and no proxy rule that exposes the endpoint; existing `/ops`, API, and Socket.IO proxy boundaries remain unchanged.
  - The backend service has no public `3000` port mapping; backend port `3000` remains reachable only on the internal Compose network, while public bindings remain owned by nginx.
  - `/metrics` is absent from public API documentation and capability discovery.
  - Static checks distinguish direct backend endpoint behavior from deployment exposure policy.
- Evidence to capture:
  - Static test output or redacted config assertions for nginx and Compose.
  - Public-surface search/assertion output.
  - No service startup, public port binding, or external scrape evidence is required.

## Approval Gate

Guide revision v1 is locked after explicit human approval. Execute these exact Test Cases and record observations in a separate append-only Evaluation JSONL artifact; do not rewrite the approved guide to fit later observations. Implementation may proceed through the feature-delivery gate, but acceptance execution remains a separate transition.
