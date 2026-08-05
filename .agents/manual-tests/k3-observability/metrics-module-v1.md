# Manual Test Guide: K3 MetricsModule Contracts and Adapters

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #46 — MetricsModule contracts and adapters
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Design authority: D:/Developer/Projects/shotter/shot-chat/docs/adr/012-k3-observability-metrics-boundary.md
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-05T22:15:10+07:00

## Prerequisites

- Environment: repository workspace with Node 22 and server dependencies installed.
- Data and state: no MongoDB, Redis, RabbitMQ, Prometheus, Grafana, or nginx runtime required; use the production Prometheus Adapter and injected in-memory Adapter as specified by the ticket.
- Credentials and permissions: local repository test execution only.
- Evidence policy: capture command output, test results, structured warnings, and representative exposition text without secrets or identifiers.

## Coverage Axes

- Included: contract/data shape, allowlist bounds, construction lifecycle, conflict failure, async observation failure, and exposition shape.
- Omitted: UI behavior, external dependency health, deployment routing, and business producer integration; those belong to later tickets.

## Locked Test Cases

### MA-46-01: Baseline construction and exposition contract

- Purpose: Verify the deep Module exposes the approved semantic Interface and asynchronous Prometheus result.
- Steps:
  1. Construct the MetricsModule once with the production Prometheus Adapter and isolated custom Registry.
  2. Invoke each semantic observation with valid allowlisted values.
  3. Await `renderPrometheus()`.
- Expected results:
  - Construction succeeds without touching a global registry.
  - The result contains a non-empty exposition body and a Prometheus content type.
  - The body contains only the approved metric names and label keys.
  - No `prom-client` object is required by the caller.
- Evidence to capture:
  - Focused test output.
  - Returned content type.
  - Redacted exposition excerpt and metric-name assertion output.

### MA-46-02: Repeated construction is duplicate-safe

- Purpose: Verify identical definitions do not create duplicate registration or exposition collisions.
- Steps:
  1. Construct the Module twice using the documented construction path.
  2. Observe the same valid event through both returned Interfaces.
  3. Render exposition from the active Registry.
- Expected results:
  - Construction succeeds deterministically.
  - Each metric family appears once in exposition.
  - No duplicate-registration exception or duplicate HELP/TYPE family is emitted.
- Evidence to capture:
  - Test output and metric-family occurrence counts.

### MA-46-03: Conflicting definitions fail fast

- Purpose: Verify a definition conflict is visible and never silently reused.
- Steps:
  1. Register a metric name with one type, label set, or bucket definition.
  2. Attempt construction with the same name but a conflicting definition.
- Expected results:
  - Initialization/test fails fast with a deterministic conflict error.
  - The conflicting definition is not silently reused.
  - No business caller is involved in the failure path.
- Evidence to capture:
  - Error type/message with identifiers redacted as needed.
  - Exposition proving the original definition was not mutated.

### MA-46-04: Sentinel mapping and invalid-value drop

- Purpose: Verify bounded label policy is deterministic and cannot expand cardinality.
- Steps:
  1. Observe valid and out-of-allowlist method/route/queue/job-type values where a sentinel exists.
  2. Observe invalid outcome, reason, operation, or another dimension without a sentinel.
  3. Render exposition and inspect structured warning output.
- Expected results:
  - Values with sentinels map to the approved sentinel (`OTHER`, `NOT_FOUND`, or `UNMAPPED_ROUTE`).
  - Invalid outcome/reason/dimension values are dropped and produce a structured warning.
  - No new label value appears in exposition.
  - The observation call does not throw into the caller.
- Evidence to capture:
  - Exposition label assertions.
  - Structured warning event and level.
  - Caller continuation assertion.

### MA-46-05: Best-effort observation failure

- Purpose: Verify post-initialization adapter failures do not change business flow.
- Steps:
  1. Inject an Adapter that fails during an observation call.
  2. Execute a representative caller operation that returns a business result after observation.
- Expected results:
  - The business result is unchanged and the caller does not throw due to telemetry.
  - A safe structured warning/error is emitted according to the design.
  - Initialization failures remain distinct from post-initialization observation failures.
- Evidence to capture:
  - Business result assertion.
  - Structured warning/error output.

### MA-46-06: High-cardinality rejection

- Purpose: Verify identifiers and unbounded values cannot enter metric labels.
- Steps:
  1. Attempt observations with request ID, correlation ID, user ID, message ID, raw URL, cache key, and error message values in label positions.
  2. Render exposition after all attempts.
- Expected results:
  - No high-cardinality value appears as a label.
  - Invalid observations are dropped/warned or canonicalized according to the applicable sentinel rule.
  - No new label key is created.
- Evidence to capture:
  - Label-key/value allowlist assertion.
  - Warning output with sensitive values omitted.

This guide is locked at revision v1 after explicit human approval. Create a new revision for any semantic change; do not rewrite this revision from later observations.
