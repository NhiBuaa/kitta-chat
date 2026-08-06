# Manual Test Guide: K3 MongoDB Message Persistence Duration

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #50 — MongoDB message persistence duration
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/50 (parent: https://github.com/NhiBuaa/kitta-chat/issues/44)
- Design authority: D:/Developer/Projects/shotter/shot-chat-worktrees/issue-50/docs/adr/012-k3-observability-metrics-boundary.md
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-06T11:31:52+07:00
- Acceptance status: approved and locked

## Prerequisites

- Environment: Issue #50 worktree with Node 22 and server dependencies installed.
- Data and state: use an isolated test fixture and the owning message-persistence seam. Use an in-memory MetricsModule Adapter for business-path assertions. MongoDB outcomes, acknowledgments, retries, duplicate lookups, and transaction outcomes must be deterministic; use an isolated test database only where an integration test genuinely requires Mongoose/MongoDB.
- Dependencies: Redis, dual-write, RabbitMQ, Socket.IO, and public API runtime are not required to measure the Mongo-only timing. Stub downstream work when needed to prove it is excluded from the timer.
- Timeout configuration: record the MongoDB operation timeout used by the test harness or implementation configuration. Do not substitute an unrelated connection or server-selection timeout.
- Credentials and permissions: local repository test execution only; never use production data or credentials.
- Evidence policy: capture targeted test output, metric observations, call-order/timing evidence, and redacted exposition. Do not include message bodies, message/conversation/request/correlation IDs, cache keys, credentials, or raw error details in artifacts.

## Coverage Axes

- Included: metric contract/data shape, Mongo lifecycle boundaries, acknowledged success, final failure classification, retry ordering, idempotent duplicate verification, pre-Mongo short-circuiting, timeout/bucket compatibility, exposition/cardinality, and best-effort telemetry behavior.
- Omitted: UI behavior, Socket.IO/API contract changes, dashboard/deployment behavior, Redis/RabbitMQ instrumentation, and migration read-switch behavior. Issue #50 must only measure Mongo-backed persistence and must not change those areas.

## Locked Test Cases

### MA-50-01: Persistence Histogram contract and exposition

- Purpose: Verify the Issue #50 metric is exported through the existing MetricsModule contract with the approved bounded label and bucket policy.
- Steps:
  1. Construct the MetricsModule using the repository's existing catalog and the test Adapter used by the persistence seam.
  2. Record one valid success observation and one valid failed observation through the semantic persistence Interface, or exercise the corresponding owner seam after implementation.
  3. Render the Prometheus exposition and inspect the registered definition and samples.
- Expected results:
  - The metric name is exactly `kittachat_message_persistence_duration_seconds`.
  - The metric is a Histogram with only the `outcome` label and only `success` or `failed` values.
  - Durations are finite, non-negative seconds.
  - The baseline finite buckets are `0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5`, subject to the timeout-compatibility case below.
  - Exposition is valid and contains no message, conversation, request, correlation, or error identifier label.
- Evidence to capture:
  - Targeted contract test output.
  - Redacted metric definition and exposition excerpt.
  - Label-key/value assertions and bucket list.

### MA-50-02: Acknowledged success and Mongo-only timing boundary

- Purpose: Verify timing starts before the first MongoDB interaction, ends after acknowledged success, and excludes Redis/cache and downstream dual-write work.
- Steps:
  1. Execute one new message persistence operation with a deterministic MongoDB delay before its acknowledged success.
  2. Make Redis/cache and dual-write stubs complete after the Mongo acknowledgment, with a deliberately larger delay than the Mongo operation.
  3. Capture the owner call timeline, returned persistence result, and MetricsModule observations.
- Expected results:
  - The durable MongoDB write is acknowledged before the `success` observation is recorded.
  - Exactly one Histogram observation is emitted for the logical operation with `outcome=success`.
  - The observed duration includes the MongoDB operation but does not include the later Redis/cache or dual-write delay.
  - MongoDB remains the durable source of truth and the existing persistence result is unchanged.
- Evidence to capture:
  - Redacted call-order/timestamp table.
  - Persisted-document or mocked-acknowledgment evidence.
  - One-and-only-one success observation.

### MA-50-03: Final failure classification matrix

- Purpose: Verify terminal MongoDB failure modes are classified as `failed` without turning an unacknowledged or ambiguous write into success.
- Steps:
  1. Run independent fixtures for timeout, write-concern error, transaction abort, exhausted retry, and unverified ambiguous result.
  2. For each fixture, allow the persistence owner to reach its final result and capture the returned result plus metric observations.
  3. Compare the observed sample count and outcome for every fixture.
- Expected results:
  - Each listed terminal condition produces exactly one `outcome=failed` observation.
  - No fixture records a success sample before MongoDB acknowledgment/commit is known.
  - An ambiguous or unverified result is never reported as success.
  - Existing persistence failure behavior remains unchanged; telemetry does not manufacture a retry, response, or durable state.
- Evidence to capture:
  - A redacted matrix of failure fixture, final business result, outcome, and observation count.
  - Targeted test output proving no extra sample was recorded.

### MA-50-04: Retry sequence has exactly one logical observation

- Purpose: Verify internal MongoDB retries are included in one logical-operation duration rather than producing one sample per attempt.
- Steps:
  1. Run a fixture where the first MongoDB attempt fails transiently and a later attempt is acknowledged successfully.
  2. Run a second fixture where one or more attempts fail and the retry sequence ends in a terminal failure.
  3. Capture the first Mongo interaction time, final terminal time, attempt count, and Histogram observations for each logical operation.
- Expected results:
  - Timing begins before the first attempt and ends only after the final success or failure.
  - The successful retry sequence emits exactly one `success` observation.
  - The exhausted retry sequence emits exactly one `failed` observation.
  - Intermediate attempts do not create additional observations or alter the existing retry semantics.
- Evidence to capture:
  - Redacted attempt/timing timeline for both sequences.
  - Observation count and final outcome assertions.

### MA-50-05: Verified idempotent duplicate is successful

- Purpose: Verify a duplicate is counted as success only after identity and canonical persisted payload/result verification succeeds.
- Steps:
  1. Seed or return an existing MongoDB message with the matching sender/idempotency identity and canonical persisted payload.
  2. Execute the same logical message operation through the idempotent retry path.
  3. Capture the duplicate result and the persistence metric observation.
- Expected results:
  - The existing duplicate is verified against the expected identity and canonical payload/result before success is recorded.
  - Exactly one `outcome=success` observation is emitted for the logical operation.
  - No second durable message is created and existing duplicate handling/downstream behavior remains unchanged.
- Evidence to capture:
  - Redacted identity/payload-match assertions.
  - Existing-document count and duplicate-result evidence.
  - Exactly-one success sample.

### MA-50-06: Invalid duplicate-key and payload mismatch are failures

- Purpose: Verify a duplicate-key signal is not treated as a successful duplicate when the existing result cannot be verified or its canonical payload does not match.
- Steps:
  1. Run a duplicate-key fixture where the follow-up lookup cannot verify the existing message.
  2. Run a fixture where identity exists but the canonical persisted payload/result differs from the attempted message.
  3. Capture the final persistence result and metric observations for both fixtures.
- Expected results:
  - Each invalid duplicate-key or payload-mismatch fixture emits exactly one `outcome=failed` observation.
  - Neither fixture emits a success sample or silently accepts the mismatched result.
  - Existing error/idempotency behavior remains within the approved persistence contract.
- Evidence to capture:
  - Redacted verification-failure matrix.
  - Observation counts and final outcomes.

### MA-50-07: Pre-Mongo short-circuit is excluded

- Purpose: Verify a duplicate or already-resolved result that is short-circuited before any MongoDB interaction does not enter the Mongo persistence Histogram.
- Steps:
  1. Invoke the approved pre-Mongo short-circuit fixture and prove that no Message model/MongoDB operation is called.
  2. Capture the business result and all persistence metric observations.
  3. Confirm that the fixture is not represented by a `success` or `failed` sample.
- Expected results:
  - Zero MongoDB interactions occur in the short-circuit path.
  - No persistence Histogram observation is emitted.
  - The existing short-circuit result is unchanged.
  - A path that performs `Message.findById` or another MongoDB call is not accepted as evidence for this case; it is a Mongo interaction and must be tested under the appropriate timed path.
- Evidence to capture:
  - Mock call count showing zero MongoDB interactions.
  - Empty observation assertion and unchanged business result.

### MA-50-08: Finite bucket covers the MongoDB operation timeout

- Purpose: Verify the Histogram's largest finite bucket covers the configured MongoDB operation timeout.
- Steps:
  1. Read and record the MongoDB operation timeout used by the implementation/test harness, converting it to seconds.
  2. Inspect `MESSAGE_PERSISTENCE_DURATION_BUCKETS` and the exported Histogram bucket samples.
  3. If the configured timeout exceeds five seconds, exercise the timeout path and verify that a finite bucket at or above that timeout is present.
- Expected results:
  - The largest finite bucket is greater than or equal to the configured MongoDB operation timeout.
  - The `+Inf` bucket alone is not treated as satisfying the requirement.
  - A timeout above five seconds adds an appropriate finite bucket (for example, `10`) without changing the metric name or label contract.
  - The timeout fixture is classified as `failed` and is observed once.
- Evidence to capture:
  - Redacted timeout configuration value.
  - Bucket definition/exposition and compatibility assertion.
  - Timeout outcome and observation count.

### MA-50-09: Exposition has no high-cardinality labels

- Purpose: Verify Issue #50 cannot add unbounded identifiers or error data to the metric label set.
- Steps:
  1. Exercise success, failure, retry, and duplicate scenarios using synthetic message, conversation, request, correlation, user, cache-key, and error values in the surrounding operation context.
  2. Render the metric exposition after all scenarios.
  3. Inspect every label key and value in the message-persistence metric family.
- Expected results:
  - The only label key is `outcome`.
  - No message ID, conversation ID, request ID, correlation ID, user ID, cache key, raw URL, message body, or error message appears as a label value.
  - No additional label key or unbounded metric family is created.
  - Evidence and warnings remain redacted.
- Evidence to capture:
  - Label-key/value allowlist assertion.
  - Redacted exposition excerpt and targeted test output.

### MA-50-10: Observability failure preserves persistence behavior

- Purpose: Verify metrics remain best-effort and do not change durable persistence, idempotency, downstream behavior, or existing API/Socket.IO contracts.
- Steps:
  1. Inject a MetricsModule Adapter or observation path that throws/fails after initialization.
  2. Execute representative acknowledged success, terminal failure, and verified duplicate persistence operations.
  3. Compare the returned business results, durable MongoDB state, duplicate behavior, and downstream call sequence with the normal adapter run.
- Expected results:
  - A metrics failure is handled safely and never becomes a new persistence failure.
  - Success, failure, and duplicate business results remain unchanged.
  - MongoDB remains the durable source of truth; Redis remains cache/coordination only, and dual-write behavior remains governed by its existing flag and success/duplicate rules.
  - No REST response, Socket.IO payload, room identifier, retry behavior, or idempotency contract changes because of telemetry.
- Evidence to capture:
  - Normal-versus-failing-Adapter business-result comparison.
  - Durable-state and downstream call assertions.
  - Safe warning/failure-handling output with sensitive values omitted.

This guide is locked at revision v1 after explicit human approval. Create a new revision for any
semantic change, and record every execution as a separate append-only Evaluation JSONL record. Do
not rewrite this revision to fit later observations.
