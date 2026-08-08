# K3 operator validation

This guide validates K3 observability artifacts and a local monitoring-enabled runtime. It does
not deploy Prometheus, Grafana, or Alertmanager. It also does not claim Prometheus target health:
a successful direct endpoint smoke proves only that a named backend endpoint served valid
Prometheus exposition at the observed time.

## Boundaries

- MongoDB remains the durable source of truth. Redis remains cache/coordination only, and RabbitMQ
  remains background-only.
- Metrics are aggregate operation evidence. Never use a metric label as a request, user, message,
  or job trace; use structured logs and the canonical correlation ID for that purpose.
- `/metrics` is an internal backend endpoint. Do not proxy it through nginx, publish backend port
  `3000`, or add it to public API documentation.
- `KittaChatQueueDeadLettered` is evaluated by Prometheus only. Without Alertmanager or another
  notification consumer, it produces no outbound notification.

## Repository artifacts

- Dashboard: `docs/observability/dashboards/k3-observability.json`
- Static scrape contract: `docs/observability/prometheus/k3-scrape-config.yml`
- Queue alert: `docs/observability/alerts/k3-queue-alerts.yml`
- Queue runbook: `docs/observability/runbooks/k3-queue-dead-lettered.md`
- Correlation contract: `docs/observability/k3-correlation-contract.md`

The dashboard was originally designed with Grafana 11.x schema version 39. K3.1 runtime
acceptance also proved that the same dashboard and datasource provisioning work on the supported
and pinned Grafana `12.4.8` runtime. It has one Prometheus datasource variable named
`DS_PROMETHEUS`, aggregates all replicas by default, and lets an operator filter on the Prometheus
`instance` infrastructure label. The dashboard's HTTP, persistence, Redis, queue, and socket
panels use aggregate PromQL only.

## Static validation

Run from the repository root:

```powershell
npx --yes node@22 --test scripts/ci/k3ObservabilityDashboard.test.cjs
npx --yes node@22 --test scripts/ci/k3ObservabilityBoundaries.test.cjs scripts/ci/k3QueueAlerts.test.cjs
```

These checks parse dashboard JSON/YAML, validate datasource and query contracts, assert one static
target per configured backend replica, and preserve the internal endpoint boundary. They do not
start Prometheus and do not prove target health.

## Direct endpoint smoke

Use a monitoring-enabled local fixture with one backend process per entry in
`docs/observability/prometheus/k3-scrape-config.yml`. Set `METRICS_ENABLED=true` only for the
fixture; `server/.env.example` remains `METRICS_ENABLED=false`.

From the repository root, run the deterministic fixture commands:

```powershell
npx --yes node@22 --test server/test/observability/metricsReplicaSmoke.test.js
npx --yes node@22 --test server/test/observability/issue52EndToEnd.test.js
```

`metricsReplicaSmoke.test.js` sets `METRICS_ENABLED=true` only while it starts three isolated
loopback backend listeners, directly scrapes each listener, then exercises the disabled control.
Those three listeners represent the three replica roles declared as `backend-1:3000`,
`backend-2:3000`, and `backend-3:3000` in the static scrape contract; their ephemeral loopback
ports deliberately prove endpoint behavior without claiming Docker DNS resolution, Prometheus
target health, or an nginx/public route.

For every replica, directly request its internal endpoint (for example,
`http://backend-1:3000/metrics`) without nginx, Grafana, or a Prometheus proxy. Verify:

1. The response is `200`.
2. `Content-Type` is Prometheus exposition text and `Cache-Control` is `no-store`.
3. The body is valid Prometheus exposition and contains all K3 metric families.
4. Repeated `/metrics` requests do not increment `kittachat_http_requests_total` or
   `kittachat_http_request_duration_seconds`.
5. With metrics disabled, the direct endpoint returns `404` while `/ops` remains available.

Record the endpoint, timestamp, status, response headers, parse result, and metric-family summary
as **direct endpoint smoke evidence**. Do not relabel that evidence as Prometheus target health.
If the fixture or a required dependency cannot be started, record the run as `BLOCKED`; do not
invent a successful scrape.

Use this sanitized evidence format for each replica role:

| Replica role | Direct endpoint | Status | Content type | Cache-Control | Parse/family result |
| --- | --- | --- | --- | --- | --- |
| `backend-1` | loopback fixture endpoint | `200` | Prometheus text | `no-store` | eight K3 families present |
| `backend-2` | loopback fixture endpoint | `200` | Prometheus text | `no-store` | eight K3 families present |
| `backend-3` | loopback fixture endpoint | `200` | Prometheus text | `no-store` | eight K3 families present |

## Cleanup

The deterministic fixture closes every local listener in its `finally` block and restores the
original `METRICS_ENABLED` value after each test. If you start an equivalent fixture manually,
stop only those local backend processes when the observation is captured; do not delete or modify
MongoDB, Redis, RabbitMQ, Prometheus, Grafana, Alertmanager, or any production data. Record the
local-process cleanup outcome with the direct endpoint evidence.

## Correlation and aggregate validation

Use synthetic request/job fixtures and redact payloads, secrets, credentials, cookies, tokens,
connection strings, and raw provider errors from evidence.

1. Send a REST request with a valid `x-request-id` that publishes a representative job.
2. Verify the canonical correlation ID in the REST completion/error log, publish payload, AMQP
   property/header, retry or DLQ publication, and worker lifecycle log.
3. When carrier values disagree, verify the worker selects the ADR-012 precedence value and emits
   `correlation_context_mismatch` without failing the job only because of the mismatch.
4. Verify a Mongo-backed message persistence success/failure changes
   `kittachat_message_persistence_duration_seconds_count` with the appropriate `outcome` label.
   A verified idempotent duplicate is success; a pre-Mongo already-persisted lookup is not timed.
5. Verify HTTP, active-socket, Redis operation/cache-fallback, queue outcome, and dead-letter
   series change only as aggregate operation signals. Their labels must remain within the
   ADR-012 allowlists plus Prometheus `job` and `instance` infrastructure labels.

Do not use metric labels to follow an individual request or job. The structured correlation log
trail is the identity evidence; counters, gauges, and histograms are aggregate evidence.

## Failure semantics

| Situation | Required behavior |
| --- | --- |
| Metrics/logging observation fails after initialization | Best-effort: warn safely and preserve the request, persistence, cache, socket, or worker business result. |
| Redis GET misses | Record Redis `success` plus cache fallback `miss`; recover durable data from MongoDB and optionally warm the cache. |
| Redis GET or cache write fails | Record Redis `error` and, for a GET fallback, `redis_error`; preserve the MongoDB recovery/result behavior. |
| Mongo persistence fails, times out, aborts, exhausts retry, or is ambiguous | The persistence result is failed and the persistence histogram records `outcome="failed"`. |
| Worker retry/DLQ publication fails | Preserve the worker's approved failure disposition and record one `failed` queue outcome; do not fabricate a dead-letter event. |
| Poison or retry-exhausted job reaches a confirmed DLQ handoff | Record the separate dead-letter reason and follow the queue runbook. |
| A direct runtime fixture cannot be started | Record `BLOCKED`; do not claim endpoint smoke, target health, Grafana runtime, or Alertmanager delivery. |

For a queue dead-letter event, start with `queue`, `job_type`, `reason`, and time window, then
structured worker logs and correlation ID. Inspect a DLQ payload only through controlled access;
do not automatically retry outside the RabbitMQ contract.
