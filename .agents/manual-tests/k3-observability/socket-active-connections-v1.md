# Manual Test Guide: K3 Active Socket.IO Connections

## Metadata

- Feature: K3 Observability
- Slice: GitHub Issue #48 — Track active Socket.IO connections
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- Ticket: https://github.com/NhiBuaa/kitta-chat/issues/48
- Design authority: docs/adr/012-k3-observability-metrics-boundary.md
- Guide revision: v1 (locked)
- Approved by: user
- Approved at: 2026-08-06T11:33:37+07:00

## Prerequisites

- Environment: Issue #48 worktree with Node 22 and server dependencies installed; run the focused Socket.IO lifecycle tests with an isolated MetricsModule Adapter.
- Data and state: use the existing in-process Socket.IO integration seam with mocked Redis/handlers, a fresh in-memory metrics Adapter for lifecycle assertions, a Prometheus Adapter with an isolated Registry for exposition assertions, and a warning-capturing canonical logger. No live MongoDB, Redis, RabbitMQ, Prometheus, Grafana, or nginx runtime is required.
- Credentials and permissions: local repository test execution only; use test-only JWT fixtures and never real credentials.
- Evidence policy: capture test output, gauge values, exposition excerpts, and redacted structured warning records. Do not retain JWTs, message bodies, raw tokens, or unnecessary socket/user identifiers.

## Coverage Axes

- Included: metric data shape and label bounds, authentication/lifecycle ordering, concurrent socket counts, disconnect repetition and reconnect state, structured warning shape, and best-effort telemetry failure behavior.
- Omitted: UI behavior, presence semantics, room/event/payload redesign, Engine.IO transport accounting, deployment topology, and client changes; these are explicitly outside Issue #48.

## Locked Test Cases

### MA-48-01: Unlabeled Gauge exposition contract

- Purpose: Verify the approved per-replica metric family is exported with the correct name, type, unit, and cardinality.
- Steps:
  1. Construct the MetricsModule through the approved factory with a Prometheus Adapter backed by an isolated Registry.
  2. Drive one authenticated application-namespace `/` socket through the accepted connection lifecycle.
  3. Await `renderPrometheus()` and inspect the `kittachat_socket_active_connections` family.
- Expected results:
  - The metric family is an unlabeled Gauge named `kittachat_socket_active_connections`.
  - The exposition contains one active-socket sample for this backend target and no application label block on the sample.
  - The family has no user, socket, namespace, room, transport, request, or other high-cardinality labels.
  - No cumulative connection counter is exported as part of this slice.
- Evidence to capture:
  - Focused test output.
  - Redacted exposition excerpt and assertions for metric name, Gauge type, sample count, and empty label set.

### MA-48-02: Authentication gates the first increment

- Purpose: Verify rejected connections never enter the active-socket count and accepted connections increment only after authentication succeeds.
- Steps:
  1. Start an isolated in-process Socket.IO server and connect one client with a valid test JWT.
  2. Wait for the normal `connect` lifecycle, then render or snapshot the Gauge.
  3. Attempt one connection without a token and one with an invalid/expired token.
  4. Capture both `connect_error` results and render or snapshot the Gauge again.
  5. Close the accepted client and verify the final count.
- Expected results:
  - The valid client connects through the existing namespace `/` contract and the Gauge becomes `1` only after the connection is accepted.
  - Missing and invalid credentials are rejected by the existing authentication middleware and do not increment the Gauge.
  - While the accepted client remains connected, rejected attempts do not change the count; after it closes, the count returns to `0`.
  - No Socket.IO event name, payload, room identifier, presence behavior, or client-visible error contract changes.
- Evidence to capture:
  - Connection/rejection assertions and redacted Gauge snapshots.
  - Existing `connect_error` messages with credentials omitted.

### MA-48-03: Concurrent socket instances are counted independently

- Purpose: Verify one unit means one accepted Socket.IO socket instance, not one unique user.
- Steps:
  1. Connect three valid clients to namespace `/`, using two clients for the same test user and one for another test user.
  2. Observe the Gauge while all three clients are connected.
  3. Close one client, then the second client for the same user, then the final client, observing after each lifecycle transition.
- Expected results:
  - The Gauge is `3` while all three socket instances are active, including both sockets for the same user.
  - Each disconnect reduces the count by exactly one, independent of user identity or room membership.
  - The Gauge reaches `0` after all three clients close and never becomes negative.
- Evidence to capture:
  - Count timeline `0 -> 3 -> 2 -> 1 -> 0` with user/socket identifiers redacted.
  - Existing room/presence assertions, if exercised, showing no contract change.

### MA-48-04: Normal disconnect cleanup is exactly once and reconnect is new lifecycle

- Purpose: Verify single-fire disconnect cleanup, normal decrement semantics, and reconnect accounting.
- Steps:
  1. Connect one valid client and confirm the Gauge is `1`.
  2. Close or disconnect that client and wait for the server lifecycle to settle.
  3. Exercise the approved lifecycle test seam so the same disconnect cleanup path is notified again, representing a duplicate notification.
  4. Connect a fresh valid client, then close it normally.
- Expected results:
  - The first disconnect decrements the Gauge once to `0`.
  - The duplicate notification does not decrement again; the Gauge remains `0` and never goes negative.
  - The fresh connection increments the Gauge to `1` as a new socket lifecycle, and its normal disconnect returns the Gauge to `0`.
  - Cleanup registration is single-fire/exactly-once for each socket instance.
- Evidence to capture:
  - Lifecycle count assertions for each transition.
  - Test evidence that the duplicate cleanup path does not produce a second decrement.

### MA-48-05: Unmatched or duplicate disconnect emits a structured warning

- Purpose: Verify unmatched/duplicate cleanup is visible through the structured logging foundation without failing the business flow.
- Steps:
  1. Start with no active sockets and invoke the approved cleanup seam for an unmatched or already-cleaned socket lifecycle.
  2. Repeat the notification once for the same lifecycle.
  3. Parse all captured warning output as JSON and continue with a normal authenticated connection and disconnect.
- Expected results:
  - Each unmatched/duplicate condition emits a warning through the canonical logger; every warning is one parseable JSON object with `level: "warn"`, a timestamp, and a non-empty event identifier.
  - The structured fields identify the unmatched/duplicate lifecycle condition without logging JWTs, tokens, message bodies, raw payloads, or unnecessary identifiers.
  - The Gauge remains `0` when no socket is active and never becomes negative.
  - The normal connection/disconnection after the warning still succeeds and has the expected count transitions; the warning does not fail or alter Socket.IO business behavior.
- Evidence to capture:
  - Redacted parsed warning records, including the event and bounded reason/lifecycle fields.
  - Gauge and subsequent connection assertions.

### MA-48-06: Metrics and logging failures are best-effort

- Purpose: Verify observability failures cannot change Socket.IO authentication, connection, disconnect, or client behavior.
- Steps:
  1. Inject a test MetricsModule Adapter whose observation method throws for connected and disconnected events.
  2. Inject a warning logger whose warning method also throws.
  3. Connect a valid client, observe the existing `me` response, exercise a normal Socket.IO operation, and disconnect it.
  4. Capture the client result and server-side completion without treating telemetry output as the business result.
- Expected results:
  - The client still connects, receives the existing `me` event, and disconnects without a telemetry-induced exception or `connect_error`.
  - Existing Socket.IO event names, payloads, room identifiers, and presence behavior remain unchanged.
  - The throwing Adapter/logger is contained by the best-effort observability boundary; the business flow completes with its original result.
  - No sensitive fallback output is emitted.
- Evidence to capture:
  - Client lifecycle and existing event/payload assertions with identifiers redacted.
  - No-throw assertion and safe failure handling output.

### MA-48-07: Socket integration regression guard

- Purpose: Verify the active-connection instrumentation remains additive and does not regress existing Socket.IO behavior.
- Steps:
  1. Run the existing Socket.IO integration coverage together with the new Issue #48 lifecycle cases.
  2. Exercise authenticated room join and the existing message delivery path used by the integration fixture.
  3. Compare event names, payload shapes, and room assertions with the pre-implementation contract.
- Expected results:
  - The existing Socket.IO integration tests pass.
  - Authenticated room joins and message delivery retain their existing event names, payloads, and room identifiers.
  - The only new observable behavior is the backend-side active-socket Gauge and its structured warning path; no client behavior or presence semantics change.
- Evidence to capture:
  - Focused test command and complete pass/fail summary.
  - Redacted event/payload/room assertions and Gauge evidence.

This guide is locked at revision v1 after explicit human approval. Create a new revision for any semantic change; do not rewrite this revision from later observations. Acceptance execution and Evaluation recording are separate transitions.
