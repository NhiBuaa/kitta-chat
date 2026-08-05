# K3 Observability — Feature Delivery Ledger

## Workflow Input

- Workflow: `feature-delivery`
- Action: `start`
- Commit policy: `none`
- Requested outcome: deliver K3 observability end to end.
- Authorized design helpers: `grill-with-docs`, `to-spec`, and `to-tickets` when runtime-reachable.

## Requested Deliverables

- Structured JSON logging.
- Request/correlation IDs across REST and applicable background jobs.
- API request-duration metrics.
- Socket connection count.
- Message persistence duration.
- Redis fallback/error count.
- RabbitMQ processed/retried/failed counters.
- Prometheus metrics endpoint.
- A minimal Grafana dashboard.
- At least one alert or documented threshold for a severe failure.

## Completion Criteria

- A request or message can be traced from its entry point to persistence or a worker.
- A dashboard shows latency, error rate, and primary resource signals.
- Documentation identifies failures that are swallowed or handled by fallback and failures that must fail the request.

## Current State

The K3 specification, Design, `codebase-design`, decomposition, and frontier acceptance preparation are complete. The current frontier is MetricsModule Issue #46 and Structured Logging/Correlation Issue #45. Manual-acceptance guide revision v1 is locked and user-approved for both frontier tickets. The workflow is suspended before implementation at `C:/Users/Nhi/AppData/Local/Temp/agent-handoffs/k3-observability-feature-delivery.json`.

Spec reference: https://github.com/NhiBuaa/kitta-chat/issues/44

Approved test seams:

- `createApp` integration seam for request IDs, structured request/error logging, request duration metrics, and `/metrics` exposition.
- `initSocket` lifecycle seam for active connection gauge increments/decrements without changing Socket.IO contracts.
- Persistence/cache seam for message duration, Redis fallback/error counters, and durable MongoDB recovery behavior.
- `startQueueWorker` runtime seam for processed/retried/failed/poison/DLQ counters and correlation propagation.
- Prometheus/Grafana artifact seam for metric names, bounded labels, dashboard queries, and the documented severe-failure threshold.

## Published Ticket Graph

- #46 — MetricsModule contracts and adapters — blocked by none; blocks #49, #48, #50, #51, #47.
- #45 — Structured logging and correlation context — blocked by none; blocks #49, #48, #47.
- #49 — HTTP exporter and HTTP metrics — blocked by #46 and #45; blocks #52.
- #48 — Socket active connection metric — blocked by #46 and #45; blocks #52.
- #50 — Message persistence duration metric — blocked by #46; blocks #52.
- #51 — Redis metrics — blocked by #46; blocks #52.
- #47 — RabbitMQ queue metrics and critical alert — blocked by #46 and #45; blocks #52.
- #52 — Grafana dashboard and E2E validation — blocked by #49, #48, #50, #51, and #47.

Current frontier: #46 and #45.

## Completed Transitions

- K3 request, deliverables, completion criteria, constraints, and `commit_policy: none` were captured in this ledger.
- The authorized dependency reachability retry passed for `to-spec` and `to-tickets`; terminal evaluator returned `status: continue`.
- The approved K3 spec was published as GitHub Issue #44 with `ready-for-agent` and read back with all five approved test seams.
- The user accepted the custom-registry/metrics-adapter decision; ADR-012 records the boundary, label constraints, endpoint separation, and duplicate/exposition test requirements.
- The user accepted the semantic metrics Interface: closed-union allowlists, `routeTemplate`, seconds-based durations, async `{ body, contentType }` exposition, fail-fast conflicting definitions, and best-effort observe methods.
- Compatibility evidence recorded: repository Node 22 and `prom-client@15.1.3` engine `^16 || ^18 || >=20`; the package is not installed until implementation.
- The user accepted `GET /metrics` as a backend-only route: conditional registration by `METRICS_ENABLED`, `404` when disabled, no nginx proxy, no public backend port, Prometheus scraping every replica, Grafana querying Prometheus, `contentType` passthrough, `Cache-Control: no-store`, and monitoring-enabled scrape smoke/integration coverage.
- The user accepted the HTTP metric taxonomy: `kittachat_http_requests_total` and `kittachat_http_request_duration_seconds`, `method`/`route_template`/`status_class` labels, `OTHER` method sentinel, `NOT_FOUND` and `UNMAPPED_ROUTE` route sentinels, mounted-router canonical resolution, `/metrics` exclusion, finish-time exactly-once observation, and the baseline seconds buckets.
- The user accepted `kittachat_socket_active_connections` as an unlabeled Gauge counting accepted application-namespace `/` Socket.IO instances per Prometheus target, with post-auth increment, exactly-once disconnect cleanup, warning-visible unmatched disconnect, reconnect-as-new-lifecycle, and no cumulative counter.
- The user accepted `kittachat_message_persistence_duration_seconds` as an `outcome`-labeled Histogram with `success | failed`, logical-operation exactly-once timing, Mongo acknowledgment/commit semantics, retry/ambiguous/timeout failure classification, verified idempotent duplicate handling, pre-Mongo short-circuit exclusion, timeout-aware finite buckets, and Mongo-only scope.
- The user accepted separated Redis signals: `kittachat_redis_operations_total{operation,outcome}` with `get | set | set_ex | del` and `success | error`, plus `kittachat_cache_fallbacks_total{reason}` with `miss | redis_error`; GET misses are Redis success plus fallback miss, Redis errors are Redis error plus fallback redis_error, and each operation/decision is observed exactly once.
- The user accepted queue metrics: `kittachat_queue_jobs_total{queue,job_type,outcome}` with `processed | retried | failed`, plus `kittachat_queue_dead_lettered_total{queue,job_type,reason}` with `poison | retry_exhausted`; `poison` is not a job type, publication errors are failed outcomes with structured failure stage, and publisher-confirm/terminal-disposition/DLQ-handoff semantics are explicit.
- The user accepted the Grafana artifact contract: Grafana 11.x/schema 39, stable non-numeric UID, one `${DS_PROMETHEUS}` variable, Prometheus `job`/`instance` infrastructure labels, all-replica aggregation with instance filter, locked PromQL semantics/units/legend/time/refresh/no-data settings, and static contract validation without Grafana runtime.
- The user accepted `KittaChatQueueDeadLettered`: no `for`, `poison` and `retry_exhausted` critical under `expected dead-letter count = 0`, stable runbook reference, controlled DLQ payload access, no out-of-contract automatic retry, CI syntax/unit coverage, and explicit no-Alertmanager outbound-notification scope. Rule artifact: `docs/observability/alerts/k3-queue-alerts.yml`; runbook: `docs/observability/runbooks/k3-queue-dead-lettered.md`.
- The design artifacts were accepted as the source for the pending tracer-bullet ticket graph.
- `codebase-design` checkpoint completed: one deep `MetricsModule` Interface is finalized; production Prometheus and in-memory test Adapters are explicit; framework/queue/cache/persistence lifecycle seams remain in owning modules and cross the port once.
- ADR-012 semantic consistency correction: the Interface summary now separates Redis command outcomes (`success | error`) from cache-fallback reasons (`miss | redis_error`); no mixed Redis fallback outcome remains.
- `to-tickets` completed: Issues #45 through #52 contain the approved eight-ticket graph, real `blocked_by`/`blocks` references, and `ready-for-agent`; readback matched every published body.
- `manual-acceptance` preparation completed for frontier #46 and #45 using `test-craft` cases; guide revision v1 is locked and user-approved.
- `session-continuity` suspended the workflow before implementation and published a validated Resume Contract.

## Attempt History

1. Initial dependency gate: failed with `dependency_unreachable` for `to-spec` and `to-tickets`; terminal evaluator confirmed the failure.
2. Retry after the user granted permission: failed with the same reachability condition because permission did not add either skill to the host dispatch catalog.
3. Authorized retry in the resumed workflow: both dependency contracts were loaded and `evaluate_terminal.py` returned `status: continue`.
4. Specify: `gh issue create` published Issue #44; `gh issue view 44 --comments --json ...` returned the complete body and `ready-for-agent` label.
5. Design decision 1: user approved custom `prom-client` `Registry`, internal metrics adapter/port, centralized bounded labels/buckets, internal endpoint scope, and duplicate/exposition tests; ADR-012 created and indexed.
6. Design decision 2: user approved the semantic Interface and requested exact package verification; npm metadata confirmed `prom-client@15.1.3` is compatible with Node 22.
7. Design decision 3: user approved the backend-only `/metrics` exposure and replica scrape requirements; ADR-012 records the endpoint contract and internal-only constraints.
8. Design decision 4: user approved HTTP metric names, labels, buckets, route canonicalization/sentinels, `/metrics` exclusion, and exactly-once response observation; ADR-012 updated.
9. Design decision 5: user approved Socket.IO Gauge name, unit, namespace, auth/lifecycle ordering, disconnect warning semantics, and test matrix; ADR-012 updated.
10. Design decision 6: user approved message persistence metric name, buckets, exactly-once logical timing, Mongo acknowledgment/failure semantics, duplicate verification, and timeout coverage; ADR-012 updated.
11. Design decision 7: user rejected mixed Redis command/fallback outcomes and approved separate command and fallback metrics/interfaces; ADR-012 updated.
12. Design decision 8: user approved queue job/dead-letter metrics, closed job allowlists, publisher-confirm semantics, terminal disposition boundary, and exactly-one delivery outcome; ADR-012 updated.
13. Design decision 9: user approved the Grafana JSON dashboard contract, schema target, datasource variable, replica semantics, PromQL rules, and static validation requirements; ADR-012 updated.
14. Design decision 10: user approved the critical dead-letter alert, no-`for` semantics, invariant, runbook, controlled access, CI coverage, and Alertmanager scope; alert/runbook artifacts created and ADR-012 updated.
15. Decompose preparation: the initial six-ticket draft was presented; publication remained held for user approval.
16. Codebase-design checkpoint: deep module, semantic Interface, Adapter strategy, and seam placement recorded in ADR-012 before ticket publication.
17. Decompose revision: user identified missing authoritative logging/correlation deliverables and required Socket/persistence separation; an eight-ticket graph is now drafted and publication remains held.
18. Decompose publication: Issues #46, #45, #49, #48, #50, #51, #47, and #52 were created in dependency order, updated with real reverse edges, and read back successfully.
19. Acceptance preparation: guide revision v1 created and locked at `.agents/manual-tests/k3-observability/metrics-module-v1.md` and `.agents/manual-tests/k3-observability/structured-logging-correlation-v1.md`.
20. Human approval: user approved guide v1 for Issues #46 and #45; implementation and execution intentionally deferred to the next session.
21. Suspension attempt 1: handoff writer rejected the orchestration-shaped draft because `next_valid_transition` had not yet been mapped to the Resume Contract schema; no artifact was published.
22. Suspension retry: exact Resume Contract schema was written and validated at `C:/Users/Nhi/AppData/Local/Temp/agent-handoffs/k3-observability-feature-delivery.json`.

## Blockers

- Existing spec lifecycle reconciliation remains pending: the completed recruiter-facing README spec is still under `specs/active/`, and `specs/README.md` still points to the archived Conversation Read Model migration as active. This does not gate the approved K3 frontier.

## Next Valid Transition

In the next session, resume `feature-delivery`, verify locked guide revision v1, then call `implement` for Issue #46 (MetricsModule) before implementing Issue #45. Do not execute acceptance until each corresponding implementation result is complete.
