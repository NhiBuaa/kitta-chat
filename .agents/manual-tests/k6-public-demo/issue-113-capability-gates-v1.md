# Manual Test Guide: K6 Issue #113 — Backend Capability and Synthetic Identity Gates

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #113 — backend capability gates, synthetic signup, and environment validation
- Authoritative specification: `.agents/manual-tests/k6-public-demo/issue-113-spec-snapshot.md`
- Specification snapshot SHA-256: `3cff33389d6566c4ee725970937618b18a527cc726685fa17f7404f3c0ed6a18`
- Ticket review: `.agents/manual-tests/k6-public-demo/issue-113-ticket-review.json`
- Ticket review SHA-256: `58c4876fd1e48e21885841dadae286efd47bbe7370555c27af6bbbc458916a69`
- Design authority: `docs/deployment/k6-public-demo-phase2-design.md` and `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- Source base: `1b70741b4512e5cc727224a788477d87fa1e67be`
- Branch: `nhibuaa/k6-issue-113-capability-gates`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-113`
- Guide revision: `k6-113-capability-gates-v1`
- Writing mode: `strict`
- Lock status: candidate until external guide review and explicit maintainer approval
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-113-capability-gates-v1.evaluations.jsonl`

## Scope and authorization boundary

This guide validates only Issue #113 source and local behavior. It uses loopback, synthetic `.test`
data, and in-memory adapters. It does not use provider credentials or contact Railway, Atlas,
Upstash, CloudAMQP, AWS, Firebase, GHCR, or TURN.

Issue #114 owns S3 prefix, private-object, and upload activation behavior. Issue #115 owns ICE and
media readiness. This guide does not seed a remote database or claim live provider compatibility.

Required invariant: `D2_MUTATIONS=0`.

No per-Issue post-implementation code review runs after this guide passes. The single whole-K6 code
review runs after Issues #111–#118 are integrated and locally accepted.

## Prerequisites

1. Run all commands from the worktree in Metadata.
2. Verify that `git merge-base --is-ancestor 1b70741b4512e5cc727224a788477d87fa1e67be HEAD`
   exits `0`.
3. Verify that the external guide review is `APPROVE` with zero Critical and Major findings.
4. Obtain maintainer approval for this exact guide revision and SHA-256 before implementation.
5. After implementation, record the exact candidate commit and tree in the Evaluation. Do not
   change this guide to match observed behavior.
6. Use Node.js 22 and dependencies from the committed lockfiles.
7. Keep ports `4173` and `4184` free.
8. Do not load or print a local `.env` file. Do not retain passwords, tokens, cookies, raw request
   bodies, connection strings, or environment values.
9. Use only the test-owned in-memory database, provider spies, queue spies, and limiter adapters.

## Required implementation test seam

The implementation MUST provide these repository-owned commands:

```powershell
npm --prefix server run test:k6-capability-gates
npm --prefix server run demo:k6-capability-gates -- --fixture <fixture> --port 4184
```

`test:k6-capability-gates` MUST run only Issue #113 capability, synthetic-signup, environment,
payload-compatibility, and limiter regressions.

`demo:k6-capability-gates` MUST:

- bind only to `127.0.0.1:4184`;
- use in-memory User, provider, queue, S3, Socket.IO, and limiter adapters;
- support `disabled-default`, `calls-disabled`, `calls-enabled`, `synthetic-signup`, `legacy-local`,
  and `limiter-unavailable` fixtures;
- count provider, database, queue, signaling, history, and limiter side effects without exposing
  payload values;
- return only safe response envelopes and sanitized counters;
- never load provider SDK credentials or contact an external endpoint;
- stop cleanly and release the port.

The accepted #111 client fixture remains available for one UI projection check:

```powershell
npm --prefix client run demo:k6-target-config -- --fixture valid-disabled --port 4173
```

If a required command is absent after implementation, the affected case is `FAILED`.

## Test-Craft coverage

Included axes:

- Data shape and contract: missing, non-string, mixed-case, whitespace, control, Unicode separator,
  malformed domain, public domain, valid `.test`, and legacy email input.
- State and lifecycle: startup validation, disabled and enabled capability states, signup reject and
  persist paths, limiter exhaustion, and limiter outage.
- Async and concurrency: provider/queue short-circuiting, Socket.IO call events, and repeated direct
  requests through shared rate-limit policy seams.
- UI and observable transitions: disabled SPA controls/routes, direct HTTP bypass attempts, disabled
  socket events, and enabled-path response compatibility.
- Security and bounds: backend authority, least-privilege recipients, no secret logging, no personal
  data, unchanged quotas, and no D2 mutation.

Omitted axes:

- S3 prefix, multipart, private download, image processing, and upload activation: Issue #114.
- ICE/TURN and bidirectional media: Issue #115.
- Seed/reset operations: Issue #116.
- Live provider credentials, connectivity, and Railway binding: D2.

## Locked Test Cases

### MA-113-01: Public-demo startup validates capabilities and service recipients

- Purpose: Prove that capability state and secret recipients are explicit and fail closed.
- Steps:
  1. Run `npm --prefix server run test:k6-capability-gates`.
  2. Verify the valid backend, image-worker, audit-worker, edge, notification-worker, and one-off
     seed recipient sets.
  3. Verify missing and non-boolean capability values fail public-demo startup.
  4. Verify recovery, Google, upload, Issue #61, and synthetic-signup fixed states.
  5. Verify missing required, malformed, unknown, extra, and cross-service keys fail.
  6. Verify validation output contains key names only and no values.
- Expected results:
  - The focused command exits `0`.
  - Edge and notification-worker receive no application secret.
  - Audit-worker receives only RabbitMQ secret material and listed non-secret settings.
  - Image-worker receives only the canonical MongoDB, Redis, RabbitMQ, and S3 set.
  - JWT, refresh, public URL/CORS, Firebase, email, Google, and unspecified signing secrets are
    rejected for workers.
- Evidence to capture:
  - Command, exit code, service-to-key-name matrix, and rejected-category list. Do not capture values.

### MA-113-02: Recovery and Google remain hidden in the SPA and blocked at the backend

- Purpose: Prove that UI projection is not the enforcement authority.
- Steps:
  1. Start the #111 `valid-disabled` client fixture on port `4173`.
  2. Verify that Google login, forgot-password, and reset-password controls/routes are unavailable.
  3. Stop the client fixture.
  4. Start the server `disabled-default` fixture on port `4184`.
  5. Send direct requests to Google, forgot-password, and reset-password paths.
  6. Record the provider, JWT-reset, database, and queue side-effect counters.
  7. Stop the server fixture.
- Expected results:
  - The SPA exposes no dead control or route.
  - Every direct request returns `404` through the existing error envelope.
  - Error code is `CAPABILITY_DISABLED`; message is exactly `Feature unavailable`.
  - Provider, JWT-reset, database, and queue counters remain zero.
  - No missing-secret or provider error appears.
- Evidence to capture:
  - One safe UI screenshot, status/error-code matrix, and sanitized zero-side-effect counters.

### MA-113-03: Upload mutations fail closed while private download remains separate

- Purpose: Prove that upload starts disabled without redefining #114 private-object behavior.
- Steps:
  1. Start the `disabled-default` fixture.
  2. Send authenticated direct requests to `/api/files/init`, `/api/files/get-presigned-url`,
     `/api/files/complete`, and `/api/files/upload-single`.
  3. Record S3, queue, multer/body-processing, and database side-effect counters.
  4. Verify that the focused tests classify `/:fileId/download-url` as a separate #114 path.
  5. Stop the fixture.
- Expected results:
  - Every upload mutation returns the locked `404` `CAPABILITY_DISABLED` envelope.
  - Upload requests stop before S3, queue, file processing, or database work.
  - The implementation does not claim private download acceptance or S3 readiness.
- Evidence to capture:
  - Route/status/error-code matrix and sanitized zero-side-effect counters.

### MA-113-04: Call capability gates HTTP and Socket.IO without changing enabled behavior

- Purpose: Prove that disabled calls cannot cause history, rate-limit, Redis, database, or signaling
  work while enabled calls preserve existing contracts.
- Steps:
  1. Start the `calls-disabled` fixture.
  2. Request each `/api/calls` route through the fixture catalog.
  3. Emit `initCall`, `callUser`, `answerCall`, `endCall`, `rejectCall`, and `toggleMedia`.
  4. Verify every socket event receives `callRejected` with exact reason
     `Call feature unavailable`.
  5. Record all side-effect counters and stop the fixture.
  6. Start the `calls-enabled` fixture.
  7. Run the existing call contract suite and one synthetic call signaling flow.
  8. Stop the fixture.
- Expected results:
  - Disabled HTTP routes return the locked capability envelope.
  - Disabled socket events use the existing `callRejected` event and exact payload shape.
  - All disabled side-effect counters remain zero.
  - Enabled event names, payloads, ACKs, rooms, authorization, limits, and call-history shapes remain
    unchanged.
  - The case does not claim ICE or media readiness.
- Evidence to capture:
  - HTTP matrix, socket event/payload summary, zero-side-effect counters, and enabled regression exit.

### MA-113-05: Synthetic signup accepts only normalized `.test` identities

- Purpose: Prove that direct clients cannot persist a public or ambiguous identity.
- Steps:
  1. Start the `synthetic-signup` fixture.
  2. Register `Visitor@KittaChat.Test` and `visitor@team.kittachat.test` with synthetic display data.
  3. Verify that the first identity persists as `visitor@kittachat.test`.
  4. Run the rejected-class table from the specification snapshot.
  5. Include missing/non-string email, whitespace, controls, Unicode format/separator, missing or
     multiple `@`, empty/local/domain labels, hyphen boundaries, trailing dot, public domain, suffix
     confusion, wildcard, and normalization-to-non-`.test` cases.
  6. Record pre-persistence side-effect counters and stop the fixture.
- Expected results:
  - Both valid identities use the existing successful registration shape.
  - Every invalid identity uses the existing validation-error path.
  - Invalid requests cause zero find, hash, save, session, queue, or provider side effects.
  - Only the exact normalized value is queried and persisted.
- Evidence to capture:
  - Accepted normalized identities, rejected category/status matrix, and sanitized counters. Do not
    retain passwords or request bodies.

### MA-113-06: Legacy local signup and enabled public contracts remain compatible

- Purpose: Prevent the public-demo policy from changing ordinary local behavior or enabled payloads.
- Steps:
  1. Start the `legacy-local` fixture with synthetic-only explicitly false.
  2. Register and log in with a synthetic non-`.test` example domain used only by the local fixture.
  3. Run existing registration, login, refresh, logout, call, and file public-contract tests.
  4. Compare response keys and socket event shapes with the source-base fixtures.
  5. Stop the fixture.
- Expected results:
  - Explicit legacy/local mode retains existing registration behavior.
  - Enabled request/response keys, status classes, cookies, event names, ACKs, and public identifiers
    remain unchanged.
  - No public-demo fallback activates when target authority is missing or invalid.
- Evidence to capture:
  - Contract-test exits and key/event shape comparison. Do not capture cookie or token values.

### MA-113-07: Existing abuse controls remain unchanged

- Purpose: Prove that capability gates and synthetic signup do not add, remove, or retune quotas.
- Steps:
  1. Run the focused policy catalog and middleware composition tests.
  2. Verify existing policy IDs and numeric values against the source base.
  3. Use the fixture to exhaust the registration limit through one network actor.
  4. Verify the existing `429` and retry behavior.
  5. Start the `limiter-unavailable` fixture.
  6. Send protected HTTP and call Socket.IO attempts.
  7. Stop the fixture.
- Expected results:
  - No policy ID, limit, window, capacity, or middleware membership changes.
  - No alternate registration route bypasses the synthetic or actor-wide gate.
  - Confirmed exhaustion returns existing `429` behavior.
  - Store unavailability returns HTTP `503` with `RATE_LIMIT_UNAVAILABLE`, never `429`.
  - Socket.IO returns its structured `RATE_LIMIT_UNAVAILABLE` event/error behavior.
- Evidence to capture:
  - Policy diff summary, exhaustion result, unavailable result, and retry category without raw keys.

### MA-113-08: Full local gate and authorization boundary pass

- Purpose: Prove that the accepted candidate is green, secret-safe, and pre-D2.
- Steps:
  1. Run `npm --prefix server run test:k6-capability-gates`.
  2. Run `npm --prefix server test`, `npm --prefix client test`, and `npm run test:ci`.
  3. Run `npm run ci:validate`, `npm run lint:ci`, and the client production build.
  4. Build the production server and edge images locally.
  5. Run `git diff --check` and the pinned no-pull Gitleaks scan on the candidate diff.
  6. Verify that ports `4173` and `4184` are free and no fixture remains.
- Expected results:
  - Every required command exits `0`.
  - Changes remain inside Issue #113 backend/client-boundary/test/guide seams.
  - No personal data or secret appears in logs, responses, Git, or evidence.
  - No credential, provider, registry, Railway, deployment, rollback, or Issue #61 mutation occurs.
  - `D2_MUTATIONS=0`.
- Evidence to capture:
  - Commands, exits, test/build summaries, changed-file list, redacted scan, cleanup result, and
    `D2_MUTATIONS=0`.

## Evaluation rule

Do not execute this guide before implementation reaches an exact local candidate. Store every run
as a new append-only JSONL Evaluation record.

- `PASSED`: Every required case passes and the maintainer explicitly accepts the run.
- `FAILED`: A required command exits nonzero, an expected result differs, scope expands, a side
  effect occurs before a disabled gate, or a forbidden mutation occurs.
- `BLOCKED`: A required local prerequisite is unavailable. A missing live provider or D2 value is
  not a blocker because this guide forbids those inputs.

If a run fails or blocks, append the result and stop. Do not edit an earlier Evaluation.

## Cleanup

1. Stop both local fixtures.
2. Verify that ports `4173` and `4184` are free.
3. Verify that no test process or in-memory fixture remains.
4. Keep only secret-safe guide and Evaluation evidence.
5. Do not publish, deploy, bind a secret, or run a rollback.

This guide becomes immutable only after external review and explicit maintainer approval. A
semantic change requires a new revision.
