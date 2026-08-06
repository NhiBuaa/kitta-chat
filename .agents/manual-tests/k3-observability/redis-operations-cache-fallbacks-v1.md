# Manual Test Guide: K3 Redis Operations and Cache Fallbacks

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #51 — Redis operations and cache fallbacks
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/51
- Parent specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Design authority: D:/Developer/Projects/shotter/shot-chat-worktrees/issue-51/docs/adr/012-k3-observability-metrics-boundary.md
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-06T11:34:55+07:00
- Evaluation history: not created; no acceptance run has started

## Scope and invariants

- Redis remains cache/coordination only. MongoDB remains the durable source of truth and the recovery path for durable user/group data.
- The approved Redis operation label values are `get`, `set`, `set_ex`, and `del`; the approved outcomes are `success` and `error`.
- The approved cache-fallback reason values are `miss` and `redis_error`.
- A Redis GET miss is a successful Redis operation plus an application fallback decision with reason `miss`.
- A Redis GET error is an errored Redis operation plus an application fallback decision with reason `redis_error`.
- The fallback observation is emitted when the application decides to query MongoDB. A later MongoDB success or failure must not rewrite the Redis outcome or fallback reason.
- Cache keys, user/group/message identifiers, request or correlation IDs, raw URLs, and raw error messages must never be metric labels.
- The guide covers application-owned cache paths. It does not instrument Socket.IO Redis Adapter internals, introduce a new source of truth, or change existing cache-aside/business results.
- The `SET` matrix uses the existing application cache-aside producer `resourceService.loadCommonGroups`; `cacheService.js` remains the canonical user-profile GET/SET_EX/DEL seam named by ADR-012. No new business path is introduced solely for acceptance.

## Prerequisites

- Environment: the Issue #51 worktree with Node 22 and server dependencies installed; run from `D:/Developer/Projects/shotter/shot-chat-worktrees/issue-51/server`.
- Runtime: use the existing cache/persistence test seam with a controlled Redis client double, a controlled MongoDB model double, and the injected in-memory MetricsModule adapter. A live Redis or MongoDB instance is not required.
- Test isolation: start each Test Case with a fresh metrics adapter/module and fresh Redis/Mongo doubles so counter deltas are attributable to one logical operation.
- Fixtures: use synthetic profiles/groups only. Do not use real cache keys, user IDs, request IDs, connection strings, secrets, or raw provider errors in captured evidence.
- Evidence: capture targeted test output, operation/fallback counter snapshots or Prometheus exposition excerpts, business return/error assertions, and sanitized call/decision traces.
- Acceptance command: use the focused Issue #51 test command selected by implementation, then run `npm test` from `server` if the focused command is green. The guide must not be executed until this revision is explicitly approved.

## Coverage axes

- Included: cache hit/miss/error data shapes; fallback state transitions; SET/SET_EX/DEL success and error outcomes; independent exactly-once operation/decision accounting; best-effort telemetry failures; allowlisted exposition and cardinality safety.
- Omitted: UI behavior, deployment/network health, Grafana/Prometheus runtime, Socket.IO adapter internals, presence/hash/set-specific Redis commands outside the approved catalog, malformed cached JSON classification, and changes to MongoDB ownership. These are not specified by Issue #51's approved metric vocabulary and must not be invented during acceptance.

## Locked Test Cases (v1)

### MA-51-01: GET hit and GET miss classification

- Purpose: Verify that a cache hit records one successful GET with no fallback, while a cache miss records one successful GET and one `miss` fallback without changing the returned business data.
- Steps:
  1. Create a fresh in-memory MetricsModule and controlled `cacheService` seam.
  2. Configure `cacheClient.get` to return a serialized profile and invoke `getCachedUserProfile` once.
  3. Assert that the cached profile is returned, `UserModel.findById` is not called, and no fallback observation is emitted.
  4. Reset the metrics and doubles. Configure `cacheClient.get` to return an empty/missing value and `UserModel.findById(...).select(...).lean()` to return a synthetic Mongo profile.
  5. Invoke `getCachedUserProfile` once and capture the complete metric delta, including the cache warm-up command when the existing path writes the profile back to Redis.
- Expected results:
  - Hit: exactly one `kittachat_redis_operations_total{operation="get",outcome="success"}`; zero cache-fallback observations; no MongoDB query and no warm-up write.
  - Miss: exactly one successful GET and exactly one `kittachat_cache_fallbacks_total{reason="miss"}`; the MongoDB profile is returned unchanged.
  - Any subsequent `set_ex` warm-up observation is independent and is counted once as covered by MA-51-03; it does not change the `miss` reason.
- Evidence to capture:
  - Focused test output for hit/miss and Mongo-call assertions.
  - Sanitized metrics snapshot/exposition showing only approved operation/reason labels.
  - Redacted call trace proving the fallback decision occurs after the successful empty GET.

### MA-51-02: GET error with MongoDB fallback success and failure

- Purpose: Verify the Redis-error classification and prove that the eventual MongoDB result does not change the Redis operation outcome or fallback reason.
- Steps:
  1. Start a fresh metrics/double setup and make `cacheClient.get` reject with a sanitized Redis failure.
  2. Run `getCachedUserProfile` with MongoDB returning a synthetic profile.
  3. Reset the metrics/doubles, keep the Redis GET rejection, and make the MongoDB query reject with a sanitized persistence failure.
  4. Run `getCachedUserProfile` again and capture both metric deltas and the business result/error.
- Expected results:
  - In both runs, exactly one `kittachat_redis_operations_total{operation="get",outcome="error"}` and exactly one `kittachat_cache_fallbacks_total{reason="redis_error"}` are recorded.
  - The successful MongoDB run returns its fixture; the failed MongoDB run preserves the existing MongoDB error behavior.
  - No `reason="miss"` is emitted for a Redis GET rejection, and the later MongoDB result does not add, remove, or relabel the Redis observation.
  - If the successful fallback warms Redis, its `set_ex` result is an independent command observation and does not alter the GET error or `redis_error` fallback counts.
- Evidence to capture:
  - Separate sanitized counter snapshots for Mongo success and Mongo failure.
  - Business return/error assertions and a redacted fallback-decision trace.
  - Assertion that neither a cache key nor the raw Redis/Mongo error appears in metric labels or captured exposition.

### MA-51-03: SET_EX warm-up success/error

- Purpose: Verify that the cache warm-up after a Mongo-backed fallback records one `set_ex` outcome and that a telemetry/cache write failure remains best-effort.
- Steps:
  1. Configure GET to miss, MongoDB to return a synthetic profile, and `cacheClient.setEx` to resolve.
  2. Invoke `getCachedUserProfile` once and record the Redis/fallback delta.
  3. Reset the metrics/doubles, keep GET miss and Mongo success, and make `cacheClient.setEx` reject with a sanitized Redis failure.
  4. Invoke the same service path once more.
- Expected results:
  - SET_EX success run: exactly one GET success, one fallback `miss`, and one `set_ex` success; the profile is returned.
  - SET_EX error run: exactly one GET success, one fallback `miss`, and one `set_ex` error; the profile is still returned and the cache-write failure does not escape as a business error.
  - The `set_ex` command is observed once per logical warm-up attempt, never once in both the cache service and MetricsModule caller.
  - The later SET_EX result never changes the already-recorded fallback reason from `miss`.
- Evidence to capture:
  - Focused test output and sanitized operation/fallback counter deltas.
  - Returned-profile assertions for both warm-up outcomes.
  - Sanitized warning evidence with no raw cache key or error message.

### MA-51-04: SET success/error on the existing common-groups cache path

- Purpose: Verify the approved `set` operation outcome on the existing application cache-aside path without changing the MongoDB-derived result.
- Steps:
  1. Use `resourceService.loadCommonGroups` with no cursor, a controlled cache miss, and a synthetic MongoDB group result.
  2. Run once with `cacheClient.set` resolving and once with `cacheClient.set` rejecting with a sanitized Redis failure.
  3. Capture the complete operation/fallback delta and the returned group payload for each run.
- Expected results:
  - SET success run records exactly one `kittachat_redis_operations_total{operation="set",outcome="success"}` for the logical cache write.
  - SET error run records exactly one `kittachat_redis_operations_total{operation="set",outcome="error"}` and still returns the MongoDB-derived group payload according to the existing cache-aside behavior.
  - Any preceding GET/miss/fallback observations are counted independently; the SET outcome is not used as a fallback reason and does not change MongoDB ownership.
  - The cache write is not retried or double-counted by the observation layer.
- Evidence to capture:
  - Focused test output with the MongoDB-derived payload assertion.
  - Sanitized counter delta isolating the SET result from preceding GET/fallback events.
  - Call count showing one logical SET attempt per invocation.

### MA-51-05: DEL invalidation success/error

- Purpose: Verify that profile-cache invalidation records one DEL outcome and remains best-effort without inventing a MongoDB fallback.
- Steps:
  1. Configure `cacheClient.del` to resolve and invoke `invalidateUserProfile` once.
  2. Reset the metrics/doubles, make `cacheClient.del` reject with a sanitized Redis failure, and invoke the same function once.
  3. Capture the promise result, command count, fallback count, and exposition for each run.
- Expected results:
  - DEL success run records exactly one `del`/`success` observation and resolves.
  - DEL error run records exactly one `del`/`error` observation and preserves the current non-throwing invalidation behavior.
  - Neither run emits `cache_fallbacks_total`; invalidation is not a GET fallback decision.
  - There is exactly one DEL observation per logical invalidation command.
- Evidence to capture:
  - Promise-resolution/no-throw assertion and Redis call count.
  - Sanitized `del` counter delta and zero fallback delta.
  - Warning evidence with identifiers and raw errors removed.

### MA-51-06: Exactly-once boundaries and independent decisions

- Purpose: Verify that command observations and fallback decisions are independent, exactly once, and scoped to logical operations rather than internal branches or repeated wrappers.
- Steps:
  1. Run one GET miss that performs MongoDB fallback and a successful SET_EX warm-up; record the full ordered semantic trace.
  2. Assert the trace contains one GET, one `miss` fallback decision, and one SET_EX, with no duplicate entry from the catch/fallback/warm-up layers.
  3. Run a second independent GET miss and assert that the counters increase by exactly one GET, one `miss` fallback, and one SET_EX for the second logical operation.
  4. Run one GET error followed by MongoDB failure and verify it adds exactly one GET error and one `redis_error` fallback, not an additional miss or a duplicate error event.
- Expected results:
  - Each logical Redis command contributes one and only one operation observation.
  - Each application fallback decision contributes one and only one fallback observation.
  - A GET miss plus SET_EX is represented as two independent Redis operations and one fallback decision.
  - Repeated independent calls are counted independently; deduplication must not collapse distinct logical operations.
- Evidence to capture:
  - Ordered, sanitized semantic event trace or per-case counter deltas.
  - Exact count assertions for all four approved operation labels and both fallback reasons.
  - No duplicate metric samples for one logical command.

### MA-51-07: Best-effort observation failure does not change cache behavior

- Purpose: Verify that a post-initialization MetricsModule/adapter failure cannot change cache hit, Mongo fallback, invalidation, or returned business results.
- Steps:
  1. Inject an adapter whose observation method throws after registration while the controlled Redis/Mongo doubles behave normally.
  2. Run a cache hit, a GET miss with Mongo success, a GET Redis error with Mongo success, and DEL invalidation.
  3. Capture returned values, propagated business errors, promise resolution, and safe warning events.
- Expected results:
  - Cache hit and both Mongo fallback variants preserve their existing returned data/error behavior.
  - DEL preserves its existing resolution behavior.
  - The caller never throws solely because observation failed; initialization failures remain distinct from post-initialization observation failures.
  - Warnings are structured and sanitized; no cache key, identifier, request context, or raw error is a metric label.
- Evidence to capture:
  - Business-result and no-telemetry-throw assertions for each path.
  - Sanitized warning event names/types and the absence of sensitive label values.

### MA-51-08: Allowlist and Prometheus exposition contract

- Purpose: Verify that the Redis and fallback metric families expose only the ADR/MetricCatalog contract and cannot grow cardinality from cache inputs or errors.
- Steps:
  1. Record valid observations for every approved operation (`get`, `set`, `set_ex`, `del`), outcome (`success`, `error`), and fallback reason (`miss`, `redis_error`) through the application seam and MetricsModule.
  2. Exercise observations with unsupported operation/reason values and with synthetic cache keys, user IDs, request/correlation IDs, raw URLs, and raw error text supplied as extra event data.
  3. Render Prometheus exposition from the custom registry and inspect the in-memory snapshot and structured warnings.
- Expected results:
  - The exposition contains `kittachat_redis_operations_total` with exactly `operation` and `outcome` labels and `kittachat_cache_fallbacks_total` with exactly `reason`.
  - Only the approved allowlist values appear; unsupported outcome/reason values are dropped and warned according to MetricsModule policy.
  - No cache key, identifier, raw URL, request context, or raw error text appears as a label key/value or in the rendered metric families.
  - Metric names, label names, and exposition content type match the existing custom-registry MetricsModule contract.
- Evidence to capture:
  - Redacted exposition excerpt and exact metric/label allowlist assertions.
  - In-memory snapshot showing invalid observations were not recorded.
  - Sanitized warning output; never capture raw secrets, identifiers, cache keys, or provider errors.

This guide is locked at revision v1 after explicit human approval. Keep this file immutable; record every execution separately in the Evaluation JSONL history and create a new guide revision for any semantic change.
