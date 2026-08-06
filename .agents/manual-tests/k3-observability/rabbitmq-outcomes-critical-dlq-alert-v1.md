# Manual Test Guide: K3 RabbitMQ Outcomes and Critical DLQ Alert

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #47 — RabbitMQ outcomes and critical DLQ alert
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Ticket authority: https://github.com/NhiBuaa/kitta-chat/issues/47
- Workflow authority: `.agents/workflows/k3-observability-feature-delivery.md` (read-only)
- Design authority: `docs/adr/012-k3-observability-metrics-boundary.md`
- Correlation authority: `docs/observability/k3-correlation-contract.md`
- Alert authority: `docs/observability/alerts/k3-queue-alerts.yml`
- Runbook authority: `docs/observability/runbooks/k3-queue-dead-lettered.md`
- Repository rules: `.agents/AGENTS.md` and `.agents/rules/data-ownership.md`
- Dependency baseline: Issues #45 and #46 are accepted, closed, and merged through PR #55
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-06T11:26:25+07:00

## Prerequisites

- Environment: the dedicated repository worktree with Node 22 and server dependencies installed; run targeted tests through the existing `server` Node test setup.
- Data and state: use the `startQueueWorker` runtime seam with an in-memory MetricsModule adapter, a fake connection manager/channel, a controllable publisher-confirm callback, and a structured-log capture. No live MongoDB, Redis, RabbitMQ, Prometheus, Grafana, or Alertmanager runtime is required.
- Fixture defaults: use queue `image`, business job type `chat-image`, `maxAttempts=3`, and synthetic correlation values such as `corr-47-01`. Reset the in-memory metric snapshot, fake channel calls, and captured logs before each case.
- Alert validation: use the repository alert artifact and deterministic rule fixtures/evaluator for zero-event, one-event, and multi-replica cases. Do not require an outbound notification service.
- Credentials and permissions: local repository test execution only. Any DLQ payload inspection must use the controlled-access tooling boundary described by the runbook.
- Evidence policy: capture test output, metric names/labels/counts, channel disposition calls, carrier metadata, alert results, and sanitized structured logs. Do not capture message bodies, raw malformed payloads, secrets, tokens, credentials, cookies, or unnecessary personal data.

## Coverage Axes

- Included: queue outcome contract, application-layer disposition, publisher-confirm ordering, retry/DLQ handoff success and failure, poison parsing, correlation precedence and propagation, closed metric labels, exactly-once delivery outcome, best-effort telemetry, alert semantics, runbook sequence, and controlled-access boundaries.
- Omitted: REST/HTTP metrics, Socket.IO lifecycle metrics, MongoDB persistence metrics, Redis metrics, dashboard panels, client behavior, deployment, and notification delivery; those belong to other K3 tickets or are explicitly out of scope for Issue #47.

## Shared Execution Rules

- Observe the queue metrics through the semantic MetricsModule Interface. Do not assert on exporter-library internals or claim broker acknowledgement confirmation from an application-layer `ack` call.
- A worker delivery must produce exactly one `kittachat_queue_jobs_total` outcome: `processed`, `retried`, or `failed`. A successful terminal DLQ may also produce one separate `kittachat_queue_dead_lettered_total` event.
- Keep the guide's synthetic correlation values out of metric labels. Use them only in sanitized carrier and log evidence.
- When a publication confirm is intentionally held, record the state before and after the confirm callback. The `retried` or `dead_lettered` event must not be observed before the corresponding publication succeeds.

## Locked Test Cases

### MA-47-01: Successful processing records one processed outcome

- Purpose: Verify that a successful handler plus application-layer terminal disposition is recorded as exactly one `processed` outcome, without claiming broker acknowledgement confirmation.
- Steps:
  1. Reset the in-memory MetricsModule, fake channel, and structured-log capture.
  2. Start `startQueueWorker` for queue `image` with `maxAttempts=3`; make `processJob` resolve once for a valid `chat-image` job.
  3. Deliver one message whose valid canonical correlation ID is present in the AMQP property, header, and payload carriers.
  4. Await the worker delivery handler, then inspect the channel calls, metric snapshot, and structured logs.
- Expected results:
  - `kittachat_queue_jobs_total{queue="image",job_type="chat-image",outcome="processed"}` is observed exactly once.
  - No `retried`, `failed`, `poison`, or `retry_exhausted` observation is recorded for the delivery.
  - The handler runs once and the existing application-layer terminal disposition/ack runs once after handler success; no evidence claims broker-confirmed acknowledgement.
  - The processed worker log contains `queue`, `jobType`, `attempt`, the canonical `correlationId`, and `failureStage="none"`.
  - The job behavior and log evidence contain no message body, secret, token, or credential.
- Evidence to capture:
  - Focused test output and in-memory queue metric snapshot.
  - Redacted channel disposition calls showing one terminal disposition.
  - Sanitized `worker_job_processed` JSON log assertion.

### MA-47-02: Retry is recorded only after publisher-confirmed publication

- Purpose: Verify the retry outcome boundary, retry payload/carrier propagation, and original-delivery disposition ordering.
- Steps:
  1. Reset all captures and start the worker with `maxAttempts=3`; make `processJob` reject with a synthetic handler error on an attempt below the limit.
  2. Configure the fake retry publisher to capture the retry queue, payload, AMQP property, and headers but hold its publisher-confirm callback.
  3. Deliver one valid `chat-image` job with attempt `0` and a canonical correlation ID.
  4. Before invoking the publisher-confirm callback, inspect metrics and disposition calls.
  5. Complete the publisher confirm successfully, await the delivery handler, and inspect the final observations and logs.
- Expected results:
  - Before publisher confirmation, no `retried` outcome or dead-letter event is recorded and the original delivery has not been terminally dispositioned by the retry path.
  - The retry is published to the existing retry queue with the incremented attempt value.
  - The retry payload `correlationId`, AMQP `correlationId`, and AMQP header `correlationId` are equal to the canonical worker value.
  - After successful confirmation, exactly one `retried` outcome is recorded; no `processed`, `failed`, or dead-letter reason is recorded for that delivery.
  - The original delivery receives its existing application-layer retry disposition exactly once after confirmed publication; no out-of-contract automatic retry is added.
  - Worker failure/retry logs include queue, business job type, attempt, canonical correlation ID, and `failureStage` values `handler` and `retry_publish` as applicable.
- Evidence to capture:
  - Pre-confirm and post-confirm metric snapshots.
  - Sanitized retry carrier table and channel disposition calls.
  - Structured failure/retry log assertions with the synthetic error message only if it contains no sensitive data.

### MA-47-03: Retry publication failure records failed without a dead-letter reason

- Purpose: Verify that a retry handoff failure is classified as a failed worker outcome, not as a retry success or a dead-letter event.
- Steps:
  1. Reset all captures and configure a handler failure below `maxAttempts`.
  2. Configure the retry publisher-confirm callback to fail with a synthetic publication error.
  3. Deliver one valid job and await the worker delivery handler.
  4. Inspect metrics, structured logs, and the original delivery disposition.
- Expected results:
  - Exactly one `failed` queue-job outcome is recorded for the delivery.
  - No `retried` outcome and no `kittachat_queue_dead_lettered_total` event/reason is recorded because retry publication did not succeed and no DLQ handoff occurred.
  - Structured failure evidence includes `failureStage="retry_publish"`, the queue, job type, attempt, and canonical correlation ID.
  - The original delivery preserves the existing runtime disposition for a failed routing publication; the implementation does not add an acknowledgement, negative acknowledgement, or out-of-contract retry solely to satisfy telemetry.
  - The metric/logging failure classification does not change the established RabbitMQ retry/DLQ contract.
- Evidence to capture:
  - Queue metric snapshot proving one failed outcome and zero retry/dead-letter events.
  - Sanitized `failureStage` log assertion.
  - Existing channel disposition evidence, including the absence of an extra disposition where the baseline runtime leaves the delivery unacked.

### MA-47-04: Successful terminal DLQ records failed plus the separate dead-letter event

- Purpose: Verify successful DLQ handoff semantics for both `retry_exhausted` and `poison`, including the rule that `poison` is a reason and never a business job type.
- Steps:
  1. Run variant A with a valid `chat-image` job at `attempts=3`, a handler failure, and a successful DLQ publisher confirmation.
  2. Run variant B with malformed JSON, a valid synthetic correlation carrier, and a successful DLQ publisher confirmation; verify that `processJob` is not called.
  3. For both variants, inspect the queue metrics, DLQ metrics, DLQ carrier metadata, channel disposition calls, and structured logs.
- Expected results:
  - Variant A records exactly one failed job outcome with `job_type="chat-image"` and exactly one separate dead-letter event with `reason="retry_exhausted"`.
  - Variant B records exactly one failed job outcome with the queue/job-type allowlist mapping required by ADR-012 (the job type is not `poison`) and exactly one separate dead-letter event with `reason="poison"`.
  - Each dead-letter event is recorded only after successful DLQ publisher confirmation.
  - The DLQ payload's canonical correlation ID, AMQP `correlationId`, and AMQP header `correlationId` are equal; the sanitized evidence does not include the raw malformed body or message payload.
  - The original delivery receives its existing application-layer terminal disposition once after successful DLQ handoff, with no additional retry.
  - Worker logs include the canonical correlation ID, queue, job type, attempt, and `failureStage="dlq_publish"` for the DLQ handoff; parse failures use the approved parse-stage field.
- Evidence to capture:
  - Separate metric snapshots for the `retry_exhausted` and `poison` variants.
  - Sanitized DLQ carrier equality assertions and channel disposition calls.
  - Redacted worker failure/DLQ log assertions; exclude raw malformed content.

### MA-47-05: DLQ publication failure records failed without a dead-letter event

- Purpose: Verify that a failed terminal DLQ handoff never claims a successful dead-letter event or reason.
- Steps:
  1. Run variant A with a handler failure at `maxAttempts` and make the DLQ publisher-confirm callback fail.
  2. Repeat with a malformed JSON poison message and a failing DLQ publisher confirmation.
  3. Await each delivery handler and inspect metrics, logs, and channel disposition calls.
- Expected results:
  - Each delivery records exactly one `failed` queue-job outcome.
  - Neither variant records `kittachat_queue_dead_lettered_total`; there is no `poison` or `retry_exhausted` reason when the handoff failed.
  - Structured failure evidence identifies `failureStage="dlq_publish"`, queue, job type, attempt, and canonical correlation ID.
  - The original delivery preserves the existing failed-routing disposition; no out-of-contract automatic retry or fabricated DLQ success is introduced.
  - The alert fixture remains inactive for these failed handoffs because the dead-letter counter did not increment.
- Evidence to capture:
  - Per-variant queue and dead-letter metric snapshots.
  - Sanitized routing-failure logs and existing channel disposition evidence.
  - Alert input/output showing no dead-letter event for a failed handoff.

### MA-47-06: Correlation precedence and propagation survive the full failure lifecycle

- Purpose: Verify integration with the accepted Issue #45 correlation contract from initial publication through worker processing, retry, and DLQ logging.
- Steps:
  1. Publish a job through the existing producer seam with a valid canonical correlation source and capture only the payload, AMQP property, and header correlation values.
  2. Deliver a message whose valid carriers intentionally disagree: transport property, AMQP header, payload `correlationId`, and payload `requestId` each use a different synthetic value.
  3. Confirm that the worker processes the highest-precedence transport value, then force a confirmed retry and a confirmed terminal DLQ using the same lifecycle fixture.
  4. Inspect the mismatch warning, worker context, retry/DLQ carriers, and processed/failed/retry/DLQ logs.
- Expected results:
  - Producer publication writes one canonical value to payload `correlationId`, AMQP `correlationId`, and AMQP header `correlationId`.
  - Worker precedence is AMQP property, then AMQP header, then payload `correlationId`, then payload `requestId`, then generated value.
  - A valid carrier mismatch emits `correlation_context_mismatch`, selects the highest-precedence valid value, rewrites the canonical job correlation value, and does not change job behavior.
  - The selected correlation ID remains identical in the retry and DLQ payload/property/header carriers and in all worker lifecycle logs.
  - Worker logs include queue, job type, attempt, canonical correlation ID, and failure stage where applicable; correlation IDs are not metric labels.
- Evidence to capture:
  - Redacted initial/retry/DLQ carrier matrix containing only synthetic correlation values.
  - Mismatch-warning and worker lifecycle log assertions.
  - Metric label assertions proving no correlation value was used as a label.

### MA-47-07: Queue metric labels are bounded and telemetry remains best-effort

- Purpose: Verify the approved metric names, label keys, closed queue/job-type/outcome/reason unions, and the non-critical telemetry boundary.
- Steps:
  1. Render Prometheus exposition after successful processing, confirmed retry, failed retry publication, successful terminal DLQ, poison DLQ, and failed DLQ handoff fixtures.
  2. Inspect the queue metric families and every emitted label key/value.
  3. Exercise the queue metrics seam with an unsupported queue and unsupported business job type, and inspect the canonical sentinel mapping.
  4. Inject an adapter/observation failure after MetricsModule initialization and repeat a representative success and failure delivery.
- Expected results:
  - `kittachat_queue_jobs_total` has exactly `queue`, `job_type`, and `outcome` labels; outcomes are only `processed`, `retried`, and `failed`.
  - `kittachat_queue_dead_lettered_total` has exactly `queue`, `job_type`, and `reason` labels; reasons are only `poison` and `retry_exhausted`.
  - Queue and business job type values use the approved closed allowlists and `OTHER` sentinel where applicable; `poison` never appears as a `job_type`.
  - Correlation IDs, failure messages, message IDs, raw URLs, payload content, and secrets never appear as metric label values.
  - An observation failure is handled as best-effort: the worker's business result and existing ack/retry/DLQ disposition remain unchanged, and safe structured telemetry evidence is emitted without sensitive values.
  - The valid delivery fixtures still satisfy exactly one queue-job outcome per delivery even when observation fails.
- Evidence to capture:
  - Redacted exposition excerpt plus label allowlist assertions.
  - Sentinel mapping output and structured warning/error output with sensitive values omitted.
  - Business result and channel disposition assertions under an injected observation failure.

### MA-47-08: Critical dead-letter alert and controlled-access runbook are valid

- Purpose: Verify the repository-owned alert rule, aggregation behavior, critical labels, stable runbook reference, and the documented operator response boundary.
- Steps:
  1. Run the repository's alert syntax/contract check against `docs/observability/alerts/k3-queue-alerts.yml`.
  2. Evaluate a zero-event fixture for the approved dead-letter counter over five minutes.
  3. Evaluate one `poison` event and one `retry_exhausted` event, each with queue and job-type labels.
  4. Evaluate a multi-replica fixture where the same queue/job-type/reason event is present on more than one replica and inspect the aggregated alert labels.
  5. Inspect the rule and runbook text for the `for` clause, severity/service/component labels, reason filter, stable runbook URL, response order, controlled DLQ access, retry boundary, and notification scope.
- Expected results:
  - The alert artifact passes syntax/contract validation.
  - Zero dead-letter increase produces no `KittaChatQueueDeadLettered` alert.
  - A positive five-minute increase for either `poison` or `retry_exhausted` activates `KittaChatQueueDeadLettered`; the alert retains `queue`, `job_type`, and `reason` after aggregation.
  - Multi-replica samples aggregate by `queue`, `job_type`, and `reason` rather than firing one duplicate alert per replica.
  - The expression uses `increase(kittachat_queue_dead_lettered_total{reason=~"poison|retry_exhausted"}[5m]) > 0`, has no `for`, and labels the alert `severity=critical`, `service=kittachat`, and `component=queue`.
  - The runbook begins with queue/job type/reason/time window, then structured logs and correlation trace, and permits DLQ payload inspection only through controlled-access tooling.
  - The rule/runbook do not authorize automatic retry outside the existing RabbitMQ contract, and explicitly state that without Alertmanager or another notification consumer there is no outbound notification.
- Evidence to capture:
  - Alert syntax/contract command output and exit code.
  - Rule-evaluator results for zero, one, and multi-replica fixtures.
  - Sanitized rule metadata and a checklist of the runbook response order; do not capture DLQ payload contents.

## Approval Gate

This guide is locked at revision v1 after explicit human approval. Do not rewrite it from later observations. Execute each run as a separate JSONL Evaluation record at `.agents/manual-tests/k3-observability/rabbitmq-outcomes-critical-dlq-alert-v1.evaluations.jsonl`.
