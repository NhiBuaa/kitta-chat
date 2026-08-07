---
status: accepted
---

# K3 observability metrics boundary

K3 uses `prom-client` version `15.1.3` (engine `^16 || ^18 || >=20`, compatible with this repository's Node 22 runtime) behind a custom `Registry` and internal metrics adapter/port rather than exposing the library to business logic. Metric names, closed-union allowlists, bounded labels, and seconds-based histogram buckets are centralized; request, correlation, user, message, raw URL, and error-message values are never metric labels. The Prometheus endpoint is an internal operations surface separate from `/ops`, and duplicate registration plus exposition format are tested. This preserves the existing operational JSON contract while providing a standard scrape surface without coupling domain modules to the exporter library.

The deep metrics Interface uses semantic events and outcomes: socket connection events are `connected | disconnected`; Redis command outcomes are `success | error`, while application cache-fallback reasons are `miss | redis_error`; queue outcomes are `processed | retried | failed`; message persistence outcomes are `success | failed`. `routeTemplate` is the only HTTP route field, and durations are expressed in seconds. `renderPrometheus()` is asynchronous and returns `{ body, contentType }`. Duplicate registration is safe across repeated construction, while conflicting definitions fail fast rather than silently reusing a metric name. After initialization, observation methods are best-effort and must not fail the business flow.

The exporter endpoint is `GET /metrics`, registered only when `METRICS_ENABLED=true`; when disabled, no route is registered and the request returns `404`. The backend port `3000` remains internal and is never published on a public interface, and nginx does not proxy this route. Prometheus scrapes each backend replica; Grafana queries Prometheus as its datasource. The endpoint uses the metrics module's returned `contentType`, sends `Cache-Control: no-store`, is excluded from public API documentation and capability discovery, and requires a scrape smoke/integration test in monitoring-enabled environments.

HTTP application metrics are `kittachat_http_requests_total` and `kittachat_http_request_duration_seconds`, both labeled only by `method`, `route_template`, and `status_class`. Methods use a closed allowlist with `OTHER` for unsupported methods. Route resolution includes mounted routers and then passes through a canonical route-template allowlist: unmatched requests use `NOT_FOUND`, matched but non-canonical routes use `UNMAPPED_ROUTE`, and raw URLs are never used. `/metrics` is excluded from these application metrics. Duration is measured once per response from middleware entry through `response.finish`, using the final status class. The baseline histogram buckets are `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` seconds and may be tuned later against production distribution/SLO evidence.

Socket.IO observability uses the unlabeled Gauge `kittachat_socket_active_connections`. One unit is one Socket.IO socket instance accepted by the application namespace, not a unique user and not an Engine.IO transport connection. K3 currently instruments only namespace `/`; each Prometheus target therefore represents that namespace's active sockets on one backend replica. The gauge increments only after authentication/connection middleware succeeds, and disconnect cleanup is registered exactly once (for example with `socket.once("disconnect", ...)`). A reconnect is a new socket lifecycle. An unmatched or duplicate disconnect leaves the gauge at zero when no active socket remains, emits a structured warning, and never fails the business flow. K3 does not add a cumulative connection counter.

Message persistence observability uses `kittachat_message_persistence_duration_seconds`, a Histogram labeled only by `outcome` (`success | failed`) with baseline buckets `[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]` seconds. One logical persistence operation is observed exactly once, including any internal MongoDB retry: timing begins before the first MongoDB interaction and ends after final success or failure. Success requires MongoDB acknowledgment under the configured write concern, including a successful transaction commit when applicable. Timeout, write-concern error, transaction abort, exhausted retry, and an unverified ambiguous result are failures. An idempotent duplicate is successful only after matching idempotency identity and canonical persisted payload/result are verified; invalid duplicate-key or payload mismatch is failure. A duplicate short-circuited before MongoDB is not recorded in this histogram. The largest finite bucket must cover the configured MongoDB operation timeout; add a bucket such as `10` seconds when the timeout exceeds `5`. The metric measures Mongo-backed persistence only, excludes Redis/downstream work, and remains best-effort without changing persistence results.

Redis command outcomes and application cache-fallback decisions are separate signals. `kittachat_redis_operations_total` is a Counter labeled by `operation` (`get | set | set_ex | del`) and `outcome` (`success | error`). A GET hit and a GET miss both record Redis `success`; command failure records `error`. `kittachat_cache_fallbacks_total` is a Counter labeled by `reason` (`miss | redis_error`). A GET miss records `miss`, and a Redis GET error that causes the application to use MongoDB records `redis_error`; the fallback event is observed when the application makes that decision, independent of MongoDB's eventual result. Each logical Redis operation and each fallback decision is observed exactly once. Cache keys, identifiers, and error messages are never labels. Both observations are best-effort and cannot change existing business outcomes.

RabbitMQ worker observability uses `kittachat_queue_jobs_total`, a Counter labeled by canonical `queue`, closed-allowlist `job_type`, and `outcome` (`processed | retried | failed`), plus `kittachat_queue_dead_lettered_total`, a Counter labeled by `queue`, `job_type`, and `reason` (`poison | retry_exhausted`). `job_type` contains only business job types (`chat-image | avatar-image | email.password_reset | message.created`) plus `OTHER`; `poison` is a failure reason, not a job type. `processed` means the handler succeeded and the worker performed the application-layer terminal disposition/ack; it does not claim broker confirmation. `retried` is observed only after publisher-confirmed retry publication and the original delivery's retry disposition. `dead_lettered` is observed only after successful DLQ handoff. Retry/DLQ publication errors produce one `failed` outcome and a structured log with failure stage, but not a dead-letter reason. Each worker delivery has exactly one jobs outcome; a terminal DLQ may also increment the separate dead-letter event. These metrics are best-effort and cannot change ack/retry/failure behavior.

The Grafana dashboard is a repository-owned JSON artifact using dashboard schema version 39 and a stable non-numeric UID. K3 originally targeted Grafana 11.x. K3.1 pins the supported Grafana 12.4.8 runtime and must prove schema-39 provisioning and query compatibility through real runtime acceptance. The dashboard defines exactly one Prometheus datasource variable, `DS_PROMETHEUS`; every panel references `${DS_PROMETHEUS}` and contains no environment-specific URL, name, UID, or numeric dashboard ID. Prometheus infrastructure labels `job` and `instance` are permitted separately from the application label allowlist. Panels aggregate all replicas by default and offer an `instance` filter. Active sockets use `sum`, total HTTP request rate uses the existing request counter without a status-class filter, HTTP 5xx rate and 5xx ratio remain separate panels, latency uses `histogram_quantile()` over `rate(..._bucket[$__rate_interval])` while retaining `le` in aggregation, persistence failure rate uses histogram `_count`, Redis command errors and cache fallbacks are separate series, queue outcomes use `rate`, and dead-letter reasons use `increase(...[$__range])`. Units, legends, default time range, refresh interval, and no-data behavior are explicit. Static contract tests validate datasource references, metric/label allowlists, query semantics, unique panel IDs, and presence of every locked metric; K3.1 adds the bounded Grafana runtime proof without replacing those static tests.

K3's severe-failure rule is `KittaChatQueueDeadLettered`: it evaluates `sum by (queue, job_type, reason) (increase(kittachat_queue_dead_lettered_total{reason=~"poison|retry_exhausted"}[5m])) > 0` with labels `severity=critical`, `service=kittachat`, and `component=queue`. There is intentionally no `for` clause: one counter increment is a real event, not sample noise. Both `poison` and `retry_exhausted` are critical under the current invariant `expected dead-letter count = 0`; if poison later becomes expected from untrusted input, it must be downgraded to warning while retry exhaustion remains critical. The rule includes a stable runbook reference, and CI must syntax-check the rule plus unit-test zero-event, one-event, and multi-replica aggregation cases. The runbook starts from queue/job type/reason/time window, then structured logs, correlation ID/trace, and only then controlled DLQ payload access. K3 does not deploy Alertmanager; without a notification consumer, Prometheus evaluates the rule but sends no outbound notification.

## Deep Module and Seam Checkpoint

The deep `MetricsModule` owns canonical metric definitions, closed-union allowlists, bucket configuration, duplicate-safe registration, conflict fail-fast behavior, best-effort observation, and asynchronous exposition. Its public Interface is the semantic port consumed by business paths:

```text
observeHttpRequest({ method, routeTemplate, statusClass, durationSeconds })
observeSocketConnection({ event: "connected" | "disconnected" })
observeMessagePersistence({ outcome, durationSeconds })
observeRedisOperation({ operation, outcome })
observeCacheFallback({ reason })
observeQueueJob({ queue, jobType, outcome })
observeQueueDeadLettered({ queue, jobType, reason })
renderPrometheus(): Promise<{ body: string; contentType: string }>
```

`prom-client` is confined to a production `PromClientMetricsAdapter` behind the port and custom Registry. Tests for business paths use an in-memory adapter; exporter contract tests use the real Prometheus adapter and custom Registry. HTTP route-template resolution remains in an Express-facing adapter and passes only canonical/sentinel values into the port. Socket lifecycle, Mongo persistence timing, Redis fallback decisions, and RabbitMQ disposition semantics remain in their owning modules; each crosses the same MetricsModule Interface at exactly one observation seam. The endpoint is an Express adapter over `renderPrometheus`, conditional on `METRICS_ENABLED`, and never becomes part of business logic or public API discovery. This concentrates metric definitions and policy in one deep Module while keeping external dependencies and framework details replaceable.

## Authoritative Repository Layout

The following layout is the K3 implementation target. It is part of this ADR: agents must preserve these seams and ownership rules while implementing Issues #46, #45, #49, #48, #50, #51, #47, and #52.

```text
server/
├── package.json                         # prom-client: 15.1.3
├── package-lock.json
├── .env.example                         # METRICS_ENABLED=false
├── src/
│   ├── app.js                           # composition root and dependency wiring
│   ├── observability/
│   │   ├── metrics/
│   │   │   ├── index.js                 # MetricsModule Interface/factory
│   │   │   ├── metricsModule.js         # policy, validation, best-effort observe
│   │   │   ├── metricCatalog.js         # names, labels, sentinels, allowlists
│   │   │   ├── histogramBuckets.js      # approved histogram bucket baselines
│   │   │   ├── adapters/
│   │   │   │   ├── promClientMetricsAdapter.js
│   │   │   │   └── inMemoryMetricsAdapter.js
│   │   │   └── http/
│   │   │       ├── metricsRoute.js      # conditional internal GET /metrics
│   │   │       ├── httpMetricsMiddleware.js
│   │   │       └── routeTemplateResolver.js
│   │   └── correlation/
│   │       ├── asyncContext.js           # AsyncLocalStorage isolation
│   │       ├── idPolicy.js               # request/correlation ID validation
│   │       └── carrierPolicy.js          # payload/AMQP/header precedence
│   ├── middlewares/
│   │   └── requestLogging.js             # existing logger middleware, extended
│   ├── utils/
│   │   ├── logger.js                     # canonical JSON logger; no second stack
│   │   └── saveMessageInBackground.js    # Mongo persistence metric seam
│   ├── queues/
│   │   └── correlation.js                 # thin compatibility adapter
│   ├── services/
│   │   └── cacheService.js                # Redis/fallback metric seam
│   ├── socket/
│   │   └── index.js                       # accepted socket lifecycle metric seam
│   └── workers/
│       └── workerRuntime.js               # queue/DLQ metric and log seam
└── test/
    └── observability/                     # runtime and interface contract tests
```

Operational artifacts are repository-owned under `docs/observability/`:

```text
docs/observability/
├── dashboards/k3-observability.json
├── prometheus/k3-scrape-config.yml
├── alerts/k3-queue-alerts.yml
├── runbooks/k3-queue-dead-lettered.md
└── k3-operator-validation.md
```

Static nginx, Compose, dashboard, scrape, and alert checks remain separate from application endpoint tests and belong in the repository CI contract suite (`scripts/ci/`).

The layout has these non-negotiable rules:

- `observability/metrics` is the only policy-owning MetricsModule. Business modules call its semantic Interface and never import `prom-client`.
- Socket, Mongo persistence, Redis, and RabbitMQ instrumentation stays at the existing owner module's lifecycle seam; do not create parallel producer folders under `observability/`.
- `utils/logger.js` remains the canonical logger and is extended rather than replaced. Correlation policy has one source of truth under `observability/correlation`; `queues/correlation.js` may only adapt existing callers.
- `app.js` is the composition root for MetricsModule construction, request context, HTTP instrumentation, and conditional `/metrics` registration.
- There is no client observability module, public `/metrics` documentation, nginx `/metrics` proxy, or public backend port exposure.

## Considered Options

- Use `prom-client`'s global registry: rejected because global mutable state makes duplicate registration and test isolation harder.
- Expose `prom-client` types throughout business modules: rejected because it couples domain paths to a replaceable exporter implementation.
- Hand-format Prometheus text: rejected because it duplicates a standard exposition implementation and increases contract risk.

## Compatibility Evidence

- Repository runtime: `.nvmrc` is `22`.
- `prom-client@15.1.3` declares Node engine `^16 || ^18 || >=20` and Apache-2.0 licensing, which is already permitted by the repository's license policy.
