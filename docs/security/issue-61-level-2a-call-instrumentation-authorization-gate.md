# Issue #61 Level 2A Call-Only Instrumentation Human Authorization Gate

## 1. Level 2A A/B Human Authorization Gate

Maintainer selection is recorded: **A — `Authorize call-only Level 2A aggregate instrumentation implementation`**. This authorizes only code and test implementation of the bounded call-only aggregate MVP. It does not authorize deployment, enabling, behavioral collection, production-data access/analysis, Level 2B or numeric-policy work.

| Choice | Exact decision | Effect |
| --- | --- | --- |
| **A** | `Authorize call-only Level 2A aggregate instrumentation implementation` | **Recorded.** Authorizes only the implementation scope and locked contracts in this gate |
| **B** | `Keep Level 2A implementation on hold` | Leaves all Level 2A runtime/code changes prohibited |

## 2. Exact Implementation Scope

If A is selected, implementation is limited to:

- one bounded `Issue61AggregateMeasurementModule`, not a generic observability framework;
- the exact call schema, frozen enums and valid phase-stage manifest in section 3;
- typed call-only observation methods and completion-safe lifecycle handling;
- aggregate observation wiring at authenticated `initCall` and `callUser` handler invocation boundaries only;
- a fixed-catalog aggregate metrics adapter, an in-memory/test adapter and a default-disabled/no-op path;
- fixed common loss, lifecycle, health and completeness-provenance families listed in section 3;
- unit, integration, observation-boundary, privacy-negative, exported-cardinality, fail-inert, lifecycle, disabled-mode and removal tests;
- the existing metrics-registration seam only where strictly necessary to register the locked catalog.

The implementation purpose is limited to future aggregate evidence for:

- raw authenticated `initCall` handler load;
- raw authenticated `callUser` handler load;
- bounded call phase/stage/outcome mix;
- aggregate validation, current local-limit evaluation, DB/Redis and signalling cost;
- measurement completeness and loss health.

The only policy question this slice may materially advance is:

> Is independent raw call-event protection warranted because authenticated raw handler traffic performs enough work to create an abuse/exhaustion surface?

Auth, recovery, refresh, friendship, M1/M2, `read_bounded`, other call events and unrelated observability refactors are outside scope. A required change outside the list above must stop for scope review.

## 3. Exact Call-Only Schema And Cardinality Ceiling

### Locked phase, stage and outcome vocabulary

| Dimension | Exact vocabulary |
| --- | --- |
| `phase` | `init_call`, `call_user` |
| `stage` | `handler_entry`, `syntactic_validation`, `current_local_limit`, `db_redis_work`, `signalling` |
| `outcome` | `continued`, `stopped`, `suppressed`, `error` |

The valid phase-stage manifest is exactly:

| Phase | Allowed stages |
| --- | --- |
| `init_call` | `handler_entry`, `syntactic_validation`, `db_redis_work` |
| `call_user` | `handler_entry`, `current_local_limit`, `syntactic_validation`, `db_redis_work`, `signalling` |

All four outcome values are the complete bounded outcome vocabulary. An implementation must use only outcomes meaningful at a valid manifest entry and must reject invalid enum/manifest combinations without turning caller input into a label. `current_local_limit` is not a valid `init_call` stage. `signalling` is not a valid `init_call` stage under the current source boundary.

The duration histogram uses seconds and exactly these eight finite buckets:

```text
0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 1, 5
```

Prometheus expansion includes those eight finite `_bucket` series, one `+Inf` `_bucket`, `_sum` and `_count`: eleven exported series per instantiated logical histogram combination.

### Locked metric-family manifest

| Family | Type | Exact application dimensions/vocabulary | Absolute series contribution/process |
| --- | --- | --- | ---: |
| `call_phase_total` | Counter | `phase`, `stage`, `outcome` from the locked manifest | ≤32 |
| `call_stage_duration_seconds` | Histogram | Same locked call dimensions; exactly eight finite buckets | ≤352 |
| `measurement_dropped_total` | Monotonic counter | `domain=call`; `reason ∈ {invalid_schema, invalid_value, adapter_unavailable, buffer_overflow, internal_error}` | 5 |
| `measurement_handle_anomaly_total` | Monotonic counter | `domain=call`; `reason ∈ {abandoned, double_finish, invalid_completion}` | 3 |
| `measurement_health` | Gauge/state set | `state ∈ {healthy, degraded}`; `degraded` is sticky for the process lifetime | 2 |
| `measurement_process_start_time_seconds` | Gauge | No application label | 1 |
| `measurement_enabled` | Gauge | No application label | 1 |
| `measurement_schema_info` | Gauge/info | One frozen call-only Level 2A schema-version tuple | 1 |

The valid manifest instantiates exactly eight phase-stage tuples. Its exact exported maximum is therefore:

```text
MANIFEST_MAX_EXPORTED_SERIES_PER_PROCESS = 8 × 4 × (1 counter + 11 histogram series) + 13 diagnostics = 397
MANIFEST_MAX_FLEET_SERIES = 397 × R
```

The separately approved conservative outer authorization ceiling remains:

```text
AUTHORIZED_HARD_CEILING_PER_PROCESS = 493
AUTHORIZED_HARD_CEILING_FLEET = 493 × R
```

`R` is the actual number of simultaneously instrumented backend processes/replicas. The repository Compose example is `R = 3 -> manifest maximum 1,191; authorization ceiling 1,479`. The observability overlay's `R = 1` is a local overlay example, not a production-topology guarantee.

`493` is an outer authorization ceiling, not the exact manifest-derived series count and not spare capacity. Invalid manifest tuples must never be registered or emitted merely to reach it. No new family, phase/event, stage, outcome, dimension/label, finite bucket, drop reason or lifecycle-anomaly reason may be added because observed cardinality happens to remain below either bound. Any schema extension requires a new privacy/cardinality review.

Enums and manifests are frozen. No arbitrary metric/event name, label, tag, metadata map, runtime schema registration or application-controlled deployment/infrastructure label is allowed. Tests must render actual exporter output and verify finite buckets, `+Inf`, `_sum`, `_count`, valid combinations and both per-process/fleet bounds.

## 4. Observation Boundary

The locked observation boundary is:

```text
Socket.IO handshake authentication already succeeded
→ authenticated call handler invocation
→ Level 2A aggregate handler-entry observation
→ cheap validation / current callUser local-limit stage where applicable
→ DB / Redis / signalling / business work
```

Counts represent authenticated invocations of the `initCall` and `callUser` handlers. They do not represent raw network packets, Engine.IO transport traffic, unauthenticated Socket.IO handshake attempts, Nginx/network flood or traffic rejected before the authenticated call handlers. No later consumer may use this Level 2A evidence to make claims about those excluded threat planes.

The observed event path may perform only bounded in-process counter, histogram and lifecycle work. Telemetry may not perform Redis, Mongo/DB, RabbitMQ/queue, external/network or filesystem I/O; synchronous exporter scrape work; unbounded allocation/queueing; synchronous retry; or an `await` whose purpose is telemetry delivery. It must not materially change call scheduling or protocol/business behavior.

## 5. Fail-Inert And Completeness Contracts

Measurement failure drops only the observation. It must not:

- alter a Socket.IO ACK/error or business outcome;
- create `RATE_LIMIT_UNAVAILABLE`;
- affect current or future limiter state;
- roll back call work;
- swallow, wrap or replace a business exception;
- retry or queue without a fixed bound.

`measurement_dropped_total` is monotonic per process and uses only the five locked reasons. No dropped raw observation, identifier, payload or exception text is retained. Diagnostic logging, if needed, is identifier-free, bounded/rate-limited and non-recursive.

The mandatory count invariant is:

```text
unsampled != guaranteed complete
```

Counts are unsampled observation attempts. They may be treated as complete for an analysis interval only after a later collection/analysis gate verifies the required provenance. `measurement_dropped_total == 0` alone does not prove completeness. A future completeness review must account for process restart/crash, disabled instrumentation intervals, deployment/rollout boundaries, scrape/export gaps, collector/backend outages, schema/version changes and internal measurement drops.

The implementation may expose only the locked health/provenance families in section 3. It may not add provenance telemetry outside that schema. Collection, retention-backend configuration and completeness analysis remain future gates.

Completion lifecycle remains completion-safe for normal completion, early return, exception, cancellation/disconnect, double finish, missing finish/abandonment, adapter failure during begin and adapter failure during finish. `finish(outcome)` is idempotent and emits at most once. Error/cancellation mapping uses only the locked bounded outcomes; no raw exception or disconnect text enters metrics. The implementation may not rely on garbage collection/finalizers to find abandoned handles.

## 6. Explicit Things A Does Not Authorize

Choice A does **not** authorize:

- deployment or any deployed environment/configuration change;
- enabling instrumentation in production or another deployed environment;
- behavioral collection or selection/configuration of a retention backend;
- production-data access, querying, export or analysis;
- Level 2B identity/linkage design or implementation;
- user ID, `socket.userId`, IP/network actor, callee/call/conversation/target/account identity as telemetry data;
- HMAC, digest, pseudonym, correlation/logical-attempt identity or cross-event actor/session state;
- an optional identity field, linkage extension hook or future-2B decorator in Level 2A;
- quota tuning, numeric approval or promotion of `10 logical attempts/min` or `4 attempts/5 min actor-callee`;
- rate-limiter implementation, Redis rate-limit keys or Nginx changes;
- auth/recovery/refresh/friendship instrumentation;
- M1/M2, message access-control remediation, reset-token logging remediation or alert dismissal;
- unrelated observability refactoring.

Level 2A cannot answer logical attempts per actor, whether `initCall` and `callUser` share an attempt, duplicate/replay attribution, multi-device/socket concentration, per-user redial or actor-callee concentration. Its evidence must not promote those numeric candidates.

Implementation must remain non-collecting/default-inert. Tests may exercise in-memory/test adapters. A later deployment/collection gate is required to enable any deployed collection.

## 7. Implementation Stop Conditions

An A-authorized implementation must stop and return for human scope/schema review if:

- a new or changed family, phase/event, stage, outcome, label/dimension, histogram bucket or diagnostic reason appears necessary;
- a required phase-stage pair is absent from the locked manifest;
- implementation would exceed the `397` manifest-derived exported maximum per process, the `493` authorization ceiling per process, or cannot verify both fleet bounds as `397 × R` and `493 × R`;
- a call observation needs an identity, pseudonym, correlation reference, logical-attempt state or cross-event/session state;
- telemetry needs remote/storage I/O, telemetry-delivery `await`, unbounded work, retry or queueing on the handler path;
- implementation would change call ACK/error payloads, current rate-limit behavior, business scheduling, DB/Redis/signalling semantics or error propagation;
- default-inert behavior, fail-inert behavior, no-sample-when-disabled behavior or exact removal verification cannot be proven;
- work outside the enumerated module, call wiring, adapters, locked registration seam or tests is required;
- a deployment/configuration change or behavioral collection is proposed;
- any privacy-negative, lifecycle, boundary or actual-exported-cardinality test cannot be made green without weakening this contract.

Disable/removal must stop emission without changing call behavior, create no identity state requiring cleanup, keep local state bounded, emit no measurement samples when disabled and preserve a later decision to retain or remove the instrumentation after quota work.

## 8. Recommendation

**Recommendation: A — `Authorize call-only Level 2A aggregate instrumentation implementation`**, subject to every bounded contract and stop condition above.

Reason: this is the smallest aggregate-only implementation that can materially support or reject whether independent authenticated raw call-event protection should exist. It remains default-inert, contains no linkage surface and cannot approve the pending logical-attempt or actor-callee numbers.

## 9. Exact Human Response Format

```text
Level 2A implementation: A | B
```

The maintainer returned A. Implementation remains bounded by this gate; all later deployment, collection, analysis, Level 2B and numeric-policy decisions remain separate holds.

## 10. Implementation Approval Record

Maintainer decision: **Level 2A call-only aggregate instrumentation implementation — APPROVED**.

This approves only the completed code/test implementation. The approval basis is the frozen typed schema; the reconciled `397` manifest maximum and separately preserved `493` authorization ceiling; rejection of invalid manifest pairs; absence of Level 2B identity/correlation; default-disabled production composition; fail-inert behavior; no telemetry remote/storage I/O or telemetry `await`; focused regression `40/40`; two consecutive post-audit full server-suite runs `405/405`; and green syntax, diff and scoped path-I/O checks.

### Historical Verification Caveat

The historical result is: `historical full-suite failure unclassified because original failure output was not retained; no current reproduction after audited corrections`.

- An earlier full-suite run had one failure, but its exact test identifier and error output are unavailable.
- The record does not infer a test name, failure cause, relatedness or flakiness from memory.
- The subsequent audit separately corrected the manifest-cardinality distinction and default-disable composition coverage, then verified the results above without reproducing a failure.

This caveat is retained transparently but does not block this code/test implementation approval because there is no actionable or reproducible failure.

### Verification-Evidence Retention Rule

For future security-sensitive verification failures, retain when tooling permits the failing test/file identifier, failure/error summary, command, and relevant timestamp or run reference before rerunning. If that evidence is unavailable, record `evidence unavailable`; do not reconstruct details from memory or automatically classify the failure as related or unrelated. This is a verification-process rule only and does not authorize runtime logging or telemetry.

### D1 — Deployment-Readiness / Target-Binding Human Gate

D1 is planning-only. It is required before an actionable inert deployment authorization and does not authorize deployment, configuration changes, telemetry enablement or collection.

| Choice | Exact decision | Effect |
| --- | --- | --- |
| **A** | `Provide/approve a concrete deployment target for inert Level 2A rollout planning` | Supplies the target-binding facts needed to plan D2; it still does not authorize deployment or collection |
| **B** | `Keep Level 2A deployment planning on hold` | **Recommended until a maintainer supplies the concrete target/provider/deployment mechanism.** No target, provider or mechanism may be inferred from repository files |

An actionable A record must bind the exact environment and whether it may contribute future Issue #61 evidence; responsible deployment owner; deployment mechanism and status source of truth; immutable source commit → build/run → artifact/image digest → deployed revision; runtime topology; disabled configuration proof; and exact rollback target, mechanism and post-rollback verification.

Current repository facts are deliberately narrower: the implementation worktree has no newly created immutable commit/revision for deployment provenance; repository Compose's `R = 3` is not production topology evidence; and `METRICS_ENABLED=true` must not enable Issue #61 without a separate explicit mechanism. No deployed target, provider, environment, owner, artifact/image digest, deployed revision, configuration state, rollback target, Socket.IO routing assumption, Redis topology or observability topology is currently bound.

Branch name, a dirty-tree hash or repository Compose metadata are not an immutable production binding. If a commit, push or artifact publication becomes prerequisite work, D1 must surface it as a new explicit maintainer authorization rather than performing it.

### Ordered Gates After D1

| Gate | Capability | Required boundary |
| --- | --- | --- |
| **D1** | Deployment readiness / target binding | Planning only; produces no deployment or collection |
| **S1** | Public-demo security readiness | Resolves public-demo blockers and dependency/security dispositions before Internet exposure; does not authorize deployment or collection |
| **D2** | Inert deployment authorization | May deploy the approved code only with Issue #61 measurement disabled; does not authorize collection |
| **C1** | Measurement enablement and collection-window authorization | After known deployment state; specifies environment, deployed revision, enablement mechanism, observation window, retention, access, export/query boundary, provenance/completeness signals and disable/rollback trigger |
| **A1** | Production-data analysis authorization | Separate from C1 whenever collected aggregate production data would be inspected or queried |
| **Numeric-policy gate** | Numeric-policy decision | Later; may use only evidence whose collection and analysis were independently authorized |

`B = 0` remains unchanged. Deploying inert code, exposing a metrics endpoint, or running ordinary deployment health checks does not create provenance-qualified Issue #61 evidence and does not increment B. A later source can become candidate evidence only after explicit Issue #61 enablement, deployed-revision binding, a known collection interval, collection/backend provenance, completeness status, schema version, relevant topology/configuration and permitted analysis access are established.

D2 verification may check service health, code revision, disabled Issue #61 catalog/samples and normal call behavior. It must not intentionally collect behavioral call-rate/cost values or treat deployment health checks as an Issue #61 behavioral observation window.

Level 2B, pseudonymous linkage, logical-attempt correlation, rate-limit implementation, numeric quota approval, Nginx changes, M1/M2 remediation and reset-token remediation remain unapproved throughout D1/D2/C1/A1 unless separately authorized.

## 11. Exact D1 Human Response Format

```text
Deployment target readiness: A | B
```

## 12. D1 Decision Record

Maintainer decision: **Deployment target readiness: B — Keep Level 2A deployment planning on hold**.

Effective terminal state: `Level 2A implementation-approved / D1 deployment readiness HOLD / B = 0`.

This decision does not revoke or weaken the approved Level 2A call-only code/test implementation. It records that the operational prerequisites for a concrete rollout are unbound: environment, provider/target, owner, deployment mechanism and status source, immutable source-to-build-to-artifact-to-deployed-revision lineage, actual replica/process count, Socket.IO routing, Redis and observability topology, effective configuration, and rollback target/mechanism.

Repository Compose, branch names, the historical GitHub build workflow, a dirty worktree and the repository `R = 3` example remain insufficient for those facts. `397 × actual instrumented R` and `493 × R` remain formulas only; no production R is instantiated.

Decision B stops the deployment lane. It does not authorize provenance audit #3, `read:packages`, provider discovery, production-system or raw-log inspection, cloud-account enumeration, deployment, commit/push, artifact publication, telemetry enablement or behavioral collection. Reopen D1 only when the maintainer supplies an actionable target-binding package: exact environment/type and owner; deployment path and status source; immutable source commit SHA → build/run → artifact/image digest → deployed revision; effective topology; disabled-configuration proof; and known rollback target, action and verification.

D2, C1, A1 and the numeric-policy gate remain unapproved and sequential. In particular, future inert deployment or its health checks do not create provenance-qualified Issue #61 evidence, increment `B`, or constitute a behavioral collection window.

## 13. Public-Demo D1 Reopening And S1 Prerequisite

Maintainer supplied a new target context: `public-demo` on Railway for `portfolio / recruiter evaluation`, with GitHub-connected controlled deployment (Auto Deploy off; only a deliberately selected immutable reviewed commit), one backend instance, one Redis service in the same Railway project, and Railway rollback to a previous successful deployment with redeploy of a known-good commit/build as fallback.

D1 is therefore **target-ready for S1 consideration**, not D2-ready. This is a demo topology only, not a production topology or a production `R` claim. The planned lineage remains `source commit SHA → build/run → artifact/image digest → demo deployed revision`; D1 requires a credible plan for it, not pre-existing values. Issue #61 Level 2A remains disabled/inert, global metrics enablement remains insufficient to enable it, and `B = 0` remains unchanged.

Before D2, S1 must resolve the public-demo security readiness record in `issue-61-public-demo-security-readiness-gate.md`. Public-demo traffic is not representative production workload evidence and does not establish production quota compatibility, capacity, actor burst distribution, logical-attempt rate or actor-callee fairness. C1/A1 remain optional evidence gates after D2, not prerequisites for a recruiter demo.
