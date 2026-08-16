# Manual Test Guide: K4 message persistence and recipient-delivery scenario evidence

## Metadata

- Feature: `k4-performance-evidence`
- Slice: `issue-87-message-persistence-recipient-delivery`
- Authoritative specification: [Issue #87](https://github.com/NhiBuaa/kitta-chat/issues/87), constrained by [Issue #80](https://github.com/NhiBuaa/kitta-chat/issues/80) and `docs/adr/015-k4-performance-evidence-boundary.md`
- Guide revision: `k4-issue-87-r2`
- Guide status: LOCKED — human-approved
- Approved by: user
- Approved at: 2026-08-14T11:00:42+07:00

## Prerequisites

- Environment: independent Issue #87 worktree `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-87`, branch `codex/k4-issue87`, using the K4-owned isolated Compose project and nginx workload target. Do not use the Issue #61 runtime, a host workload runner, or a direct backend target.
- Data and state: create a fresh run with the approved deterministic K4 dataset; complete `setup/seed` and receive `WARMUP_ADMITTED` before measurement. Use approved `message:2` workload semantics with `alice` as sender and `bob` as recipient. Run single-replica and multi-replica profiles as separate owned runs when the case calls for both.
- Credentials and permissions: disposable benchmark credentials supplied through the existing K4 environment mechanism; do not print or store secret values. The runner may send workload only through nginx and must not have Docker-management access or a route/credential to the observer helper.
- Tools and commands: repository `npm` scripts, Docker Compose, access to the run result directory, and the typed observation path for replica metrics/logs. The nominal command shape is `npm run k4 -- start --run-id <run-id> --profile <profile> --image-set-id <approved-image-set>` followed by `npm run k4 -- execute --run-id <run-id> --profile <profile> --scenario message --workload-version 2`; use the implementation's locked command output if its invocation spelling differs.
- Evidence hygiene: retain raw runner output, pre/post histogram snapshots, raw attribution sources, source identities and digests, parser/schema versions, measurement-window timestamps, and the result inventory. Redact credentials and tokens. Do not rewrite a source artifact to make an observation pass.
- Failure-fixture prerequisite: TC-87-03 requires a documented, isolated scenario-level fault fixture or an equivalent disposable-target fault mechanism. Record the exact injection mechanism and its run identifier; if no controlled mechanism exists, mark the case `BLOCKED` with that concrete reason rather than treating an unforced success as coverage.

## Locked Test Cases

### TC-87-01: Derive persistence evidence from the acknowledged Mongo histogram window

- Purpose: Verify the Issue #87 persistence measurement boundary and the Issue #80 rule that persistence quantiles are derived from retained Prometheus histogram snapshots and labeled `histogram-derived`.
- Steps:
  1. Start a fresh K4-owned single-replica run and verify the deterministic dataset and authentication preflight admit warm-up.
  2. Execute the approved `message:2` scenario through nginx and record the declared `measurement_start` and `measurement_end`.
  3. Locate the raw persistence histogram snapshot captured immediately before measurement and the snapshot captured immediately after measurement.
  4. Recompute the bucket, `_count`, and `_sum` deltas from those two snapshots and compare them with the scenario's retained persistence evidence.
  5. Inspect any derived persistence quantile or summary field without treating it as an exact per-sample percentile.
- Expected results:
  - Both snapshots contain `kittachat_message_persistence_duration_seconds` for the successful outcome, every bucket boundary and bucket count, `_count`, and `_sum`; the raw snapshots are retained as separate immutable evidence.
  - The retained delta is computed only from the before/after measurement snapshots. Setup and warm-up observations do not contribute to published measurement evidence.
  - Any quantile derived from the histogram is explicitly labeled `histogram-derived`; no field describes it as an exact per-sample percentile.
  - Persistence evidence is separate from recipient-delivery evidence and does not replace or imply delivery success.
- Evidence to capture:
  - Run manifest and phase timestamps proving the measurement window.
  - Paths, digests, and complete contents or redacted excerpts of both histogram snapshots.
  - Recomputed delta and the retained histogram-derived label.
  - Result inventory showing the raw artifacts were retained.

### TC-87-02: Correlate a successful send, acknowledgement, persistence record, and recipient delivery

- Purpose: Verify the Issue #80 recipient-delivery temporal boundary and validity contract: start immediately before the `sendMessage` emit, end when the recipient receives the matched `getMessage`, and use acknowledgement `{ success, realId }` only as a validity gate. Do not add callback fields or change the existing public contract.
- Steps:
  1. Execute a measurement run that produces at least one successful `message:2` opportunity with `alice` as sender and `bob` as recipient.
  2. Capture the runner timestamp immediately before emitting `sendMessage` and the timestamp when the recipient receives the matched `getMessage`; derive delivery duration from exactly those two timestamps using the same runner clock.
  3. Select the opportunity and trace its unique `idempotencyKey` through runner output, sender/acknowledgement/receiver attribution records, and the recipient `getMessage` record.
  4. Validate the acknowledgement using only `{ success, realId }`: compare `realId` with the delivered message `_id`, then compare sender identity, recipient identity, and legacy public `Message.conversationId` across the correlated records.
  5. Inspect the persisted raw evidence and determine whether the opportunity is included in the successful delivery set and in any cross-replica qualification input.
- Expected results:
  - The delivery interval starts immediately before `sendMessage` is emitted and ends when the recipient receives the matched `getMessage`; the retained duration is `getMessage_received_at - sendMessage_emit_at` and does not use the acknowledgement callback timestamp as an endpoint.
  - The acknowledgement validity gate succeeds when its existing `{ success: true, realId }` values are valid and `realId` equals the delivered payload `_id`. The test neither requires nor introduces idempotency, sender, recipient, or conversation fields in the callback.
  - Exactly one correlation identity binds the sender event, acknowledgement event, receiver event, and `getMessage` delivery. The idempotency key, sender, recipient, and legacy `Message.conversationId` agree across the correlated records.
  - The opportunity is a latency sample only when all required records are present and matched. No unrelated `getMessage` event is counted.
  - Public/socket evidence retains the legacy conversation identity and does not expose backend-internal `Conversation._id` as a substitute.
- Evidence to capture:
  - Redacted runner opportunity record containing the pre-emit and matched-delivery timestamps, the derived duration, and the four correlated raw records.
  - The acknowledgement `{ success, realId }`, delivered `_id`, actor identities, and legacy conversation identifier comparison.
  - The retained success/failure classification and the correlation identifier's source digest.

### TC-87-03: Retain callback failure, delivery timeout, and correlation mismatch as failures

- Purpose: Verify that failure evidence is not converted into latency samples, as required by Issue #87 and the Issue #80 delivery oracle.
- Steps:
  1. In separate disposable runs, invoke the documented controlled fault fixture for an unsuccessful or timed-out `sendMessage` acknowledgement, a recipient `getMessage` delivery timeout, and a delivered record with a deliberately mismatched correlation identity or message ID.
  2. For each run, retain the raw runner output and the corresponding measurement-window attribution records.
  3. Compare the opportunity status, error reason, successful correlation set, persistence evidence, and any claim-qualification fields.
  4. Verify teardown and result ownership after each faulted run; do not edit raw artifacts or retry a failed opportunity into the same record.
- Expected results:
  - Each injected callback failure, delivery timeout, or correlation mismatch is retained as failure evidence with a concrete reason.
  - No failed opportunity contributes a recipient-delivery latency sample, successful correlation, or cross-replica claim.
  - A persistence histogram delta, if present for other successful operations, remains independently usable and is not erased or relabeled because one delivery failed.
  - The run's execution/qualification state prevents unsupported claims while retaining the raw failure and cleanup evidence.
- Evidence to capture:
  - The fault-fixture declaration and run IDs, without secret values.
  - Raw opportunity/error records and the absence of the failed correlation from successful latency samples.
  - Any retained persistence delta, qualification flags, teardown result, and final result inventory.

### TC-87-04: Require measurement-phase proof for a cross-replica delivery claim

- Purpose: Verify that a multi-replica message claim is based on measured attribution, not topology inventory alone, and that sample-level non-eligibility is distinct from a run-level `TOPOLOGY_NOT_EXERCISED` flag.
- Steps:
  1. Start a fresh K4-owned multi-replica run with the same approved `message:2` workload and deterministic dataset used for the single-replica run.
  2. Execute the measurement phase through nginx and record the exact measurement window.
  3. Reconstruct the sender and recipient socket/attribution records for one successful correlation, including the replica or `NODE_NAME` observed at the sample time.
  4. Inspect raw nginx/backend sources, parser diagnostics, source digests, and the resulting sample and run-level qualification fields.
  5. For a same-replica sample, verify sample-level cross-replica ineligibility without assigning a run-level flag. Assign run-level `TOPOLOGY_NOT_EXERCISED` only when complete measurement-phase observation proves that all measured activity in the run exercised exactly one replica under the existing Issue #80/ADR-015 rule.
- Expected results:
  - A cross-replica claim is eligible only when the same complete correlation proves successful acknowledgement and delivery and the measured sender and recipient replicas are distinct during the measurement window.
  - Topology inventory without measurement-phase traffic attribution cannot make the claim eligible.
  - A complete same-replica correlation is ineligible for a cross-replica claim at sample level; one such correlation alone does not set run-level `TOPOLOGY_NOT_EXERCISED` when other measured activity may exercise another replica.
  - Run-level `TOPOLOGY_NOT_EXERCISED` is recorded only when complete observation proves the measured run exercised exactly one replica. Ambiguous, truncated, or incomplete source evidence is marked `OBSERVATION_INCOMPLETE` for the affected claim and is not treated as proof of a run-level topology result.
  - The single-replica and multi-replica runs retain equivalent workload and dataset identity; only the declared topology differs.
- Evidence to capture:
  - Multi-replica run manifest, measurement window, and workload/dataset digests.
  - Raw nginx/backend attribution sources, actor lifecycle records, parser version, diagnostics, and source digests.
  - The correlated sender/recipient replica identities, sample-level eligibility, run-level topology flag (if any), and final claim-qualification fields.

### TC-87-05: Keep the scenario output at the raw-evidence boundary

- Purpose: Verify the Issue #87 boundary that this slice produces raw scenario evidence and does not invent a report or provenance format or change public runtime contracts.
- Steps:
  1. Inventory the complete result directory after a successful message run and one faulted message run.
  2. Classify each retained artifact as runner output, histogram snapshot/delta source, raw attribution source, manifest/inventory, completion marker, or another already-authorized K4 artifact.
  3. Inspect the scenario entrypoint and emitted Socket.IO/REST traffic for new client-visible events, fields, room identifiers, or backend-internal conversation identifiers.
  4. Check that raw evidence remains usable even when a claim is ineligible or a required observation is incomplete.
- Expected results:
  - The scenario retains raw inputs and observations needed by later report/provenance work, including their identity, digest, window, and completeness information.
  - Issue #87 does not create a new scenario-specific report/provenance schema or publish unsupported benchmark claims.
  - Existing REST, Socket.IO, legacy conversation identity, MongoDB, Redis, and RabbitMQ ownership contracts remain unchanged; no new client-visible event or room identifier is introduced.
  - Incomplete or failed evidence remains retained and explicitly classified rather than silently discarded.
- Evidence to capture:
  - Complete redacted result inventory and artifact classifications.
  - CLI/runner output showing raw-evidence status and qualification state.
  - Contract comparison for emitted REST/Socket.IO payloads and a scan proving no internal `Conversation._id` was exposed.

This guide becomes immutable after explicit human approval. Create `k4-issue-87-r3` for any semantic change; never rewrite this revision to fit later observations. Store each execution as a separate append-only Evaluation JSONL record.
