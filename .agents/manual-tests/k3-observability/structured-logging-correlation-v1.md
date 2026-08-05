# Manual Test Guide: K3 Structured Logging and Correlation Context

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #45 — Structured logging and correlation context
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Design authority: D:/Developer/Projects/shotter/shot-chat/docs/adr/012-k3-observability-metrics-boundary.md
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-05T22:15:10+07:00

## Prerequisites

- Environment: repository workspace with Node 22 and server dependencies installed.
- Data and state: use in-memory HTTP, producer, AMQP, retry, DLQ, and worker adapters; no live MongoDB, Redis, RabbitMQ, or external logging service required.
- Credentials and permissions: local repository test execution only.
- Evidence policy: capture JSON log lines and carrier values without message bodies, tokens, credentials, or DLQ payloads.

## Coverage Axes

- Included: JSON contract, request-ID bounds, async concurrency, carrier precedence, mismatch handling, retry/DLQ propagation, worker context, and sensitive-data omission.
- Omitted: metric exposition and producer-specific business metrics; those belong to later tickets.

## Locked Test Cases

### MA-45-01: Existing logger emits one structured JSON object per line

- Purpose: Verify K3 extends the existing logger rather than creating a parallel logging stack.
- Steps:
  1. Emit info, warning, and error events through the existing logger Interface.
  2. Parse each captured output line as JSON.
- Expected results:
  - Every line is exactly one JSON object.
  - Each object contains `timestamp`, `level`, and `event`.
  - Existing logger callers remain compatible.
  - No second logger singleton or alternate logging format is introduced.
- Evidence to capture:
  - Parsed JSON assertions.
  - Logger construction/import evidence.

### MA-45-02: Request-ID preservation, validation, and regeneration

- Purpose: Verify bounded request context at the REST entry seam.
- Steps:
  1. Send requests with a valid ID, missing ID, empty ID, overlong ID, repeated/multi-value ID, control characters, and unsupported characters.
  2. Capture response headers and structured completion/error logs.
- Expected results:
  - Valid IDs in the approved 1–128 character safe set are preserved and returned.
  - Missing or invalid IDs are replaced with a generated UUID and the generated ID is returned.
  - Completion/error logs use the same canonical ID as the response.
  - No raw invalid header value is propagated into logs or queue metadata.
- Evidence to capture:
  - Request/response header pairs.
  - Redacted structured log lines.

### MA-45-03: Concurrent async-context isolation

- Purpose: Verify concurrent requests cannot leak request-scoped fields into one another.
- Steps:
  1. Start at least two overlapping asynchronous requests with distinct valid request IDs.
  2. Interleave delayed log calls from both request handlers.
  3. Complete both requests and inspect all emitted lines.
- Expected results:
  - Each log line contains only the request context belonging to its originating request.
  - No request ID, user context, or other structured field crosses the async boundary.
  - Both responses retain their own canonical request IDs.
- Evidence to capture:
  - Interleaved event log with request IDs annotated externally.
  - Isolation assertion output.

### MA-45-04: Correlation source of truth and mismatch behavior

- Purpose: Verify deterministic precedence across payload, AMQP property, and headers.
- Steps:
  1. Publish jobs with matching carriers.
  2. Publish jobs with only payload/request ID, only headers, only AMQP property, and no carrier.
  3. Deliver a job whose carriers disagree.
- Expected results:
  - Producer canonicalizes a valid explicit payload correlation ID, otherwise request ID, otherwise a generated ID, and writes it to all carriers.
  - Worker precedence is AMQP `correlationId`, then headers, then payload correlation ID, then payload request ID, then generated ID.
  - A mismatch selects the highest-precedence valid value, emits structured `correlation_context_mismatch`, and does not fail the job.
  - The selected canonical value is used for downstream propagation.
- Evidence to capture:
  - Redacted carrier matrix.
  - Canonical value and warning event assertions.

### MA-45-05: Retry and DLQ correlation preservation

- Purpose: Verify one correlation context survives the entire background-job lifecycle.
- Steps:
  1. Publish a job with a known canonical correlation ID.
  2. Force one retry and then a successful processing path.
  3. Force a retry-exhausted/DLQ path.
  4. Capture payload, AMQP property/header, and worker log evidence at each stage.
- Expected results:
  - The same canonical correlation ID is present in initial publish, retry, DLQ, and worker logs.
  - Attempt/failure-stage fields change only as lifecycle state changes.
  - No message body, secret, or credential is logged.
- Evidence to capture:
  - Carrier and log correlation table.

### MA-45-06: Logging failure does not change business result

- Purpose: Verify structured logging/context failures remain best-effort.
- Steps:
  1. Inject a logger/context adapter that fails during request completion and worker failure logging.
  2. Execute a valid request and a representative job outcome.
- Expected results:
  - Request response and worker disposition remain unchanged.
  - The failure is handled safely without cascading into business logic.
  - No sensitive fallback output is emitted.
- Evidence to capture:
  - Business outcome assertions.
  - Safe failure handling output.

This guide is locked at revision v1 after explicit human approval. Create a new revision for any semantic change; do not rewrite this revision from later observations.
