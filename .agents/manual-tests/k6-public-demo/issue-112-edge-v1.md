# Manual Test Guide: K6 Issue #112 — Railway Edge and Public Routes

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #112 — Railway edge upstream, public routes, and sanitized health projection
- Authoritative specification: `.agents/manual-tests/k6-public-demo/issue-112-spec-snapshot.md`
- Specification snapshot SHA-256: `1b6503782392665e8414f5da19b1ce68ca54735664ec19366ed0118b672635ac`
- Ticket review: `.agents/manual-tests/k6-public-demo/issue-112-ticket-review.json`
- Ticket review SHA-256: `19d95114f9d9dfc8ee239c0774036a16946e1f54716b93fc7446746a9e862d0b`
- Design authority: `docs/deployment/k6-public-demo-phase2-design.md` and `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- Source base: `1b70741b4512e5cc727224a788477d87fa1e67be`
- Branch: `nhibuaa/k6-issue-112-edge`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-112`
- Guide revision: `k6-112-edge-v1`
- Writing mode: `strict`
- Lock status: candidate until external guide review and explicit maintainer approval
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-112-edge-v1.evaluations.jsonl`

## Scope and authorization boundary

This guide validates only Issue #112 source and local behavior. It does not use a Railway hostname,
provider credential, public Internet service, GHCR publication, deployment, rollback, or Issue #61
measurement.

Issue #113 owns backend capability and environment gates. Issue #114 owns S3 behavior. Issue #115
owns WebRTC media readiness. Backend `/readyz` remains private. This guide does not claim live
Railway health or provider compatibility.

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
6. Use Node.js 22, npm, Docker, and the pinned cached Gitleaks image.
7. Keep ports `4182` and `4183` free. Expose only the edge fixture on loopback.
8. Do not read or print environment values. Do not use a local `.env` file.
9. Do not contact Railway, Atlas, Upstash, CloudAMQP, AWS, GHCR, Firebase, or a TURN provider.

## Required implementation test seam

The implementation MUST provide these repository-owned commands:

```powershell
npm run test:k6-edge
npm run demo:k6-edge -- --fixture <fixture> --port 4182
```

`test:k6-edge` MUST run only Issue #112 edge rendering, startup validation, Origin forwarding,
Socket.IO proxy, health, route exclusion, and SPA precedence tests.

`demo:k6-edge` MUST:

- build or use the local production edge image;
- start a synthetic backend on a private local Docker network;
- expose the edge only at `http://127.0.0.1:4182`;
- use a synthetic `.internal.test` upstream only through explicit test authority;
- support `origin-echo`, `socket-reconnect`, and `backend-down` fixtures;
- retain only method, path, Origin state, upgrade state, response class, and upstream-hit count;
- never retain raw cookies, authorization headers, tokens, request bodies, or environment values;
- stop every container and network that it creates.

If either command is absent after implementation, the affected case is `FAILED`. Do not replace the
command with an ad hoc provider or Railway test.

## Test-Craft coverage

Included axes:

- Data shape and contract: valid, missing, blank, malformed, loopback, wildcard, scheme-bearing,
  path-bearing, wrong-port, and untrusted upstream values.
- State and lifecycle: edge startup, backend ready/down, browser route reload, WebSocket reconnect,
  and fixture teardown.
- Async and concurrency: Socket.IO polling-to-upgrade, reconnect, long-lived connection headers, and
  no stale upstream fallback after restart.
- UI and observable transitions: SPA navigation, static assets, denied routes, liveness, and
  non-HTML operational failures.
- Security and bounds: exact Origin pass-through, absent Origin, no header substitution, no public
  diagnostics, no secret values, and no D2 mutation.

Omitted axes:

- Backend capability and synthetic-signup enforcement: Issue #113.
- Provider-backed upload and private-object delivery: Issue #114 and D2.
- WebRTC ICE and media: Issue #115 and D2.
- Live Railway hostnames, healthcheck settings, and provider connectivity: D2.

## Locked Test Cases

### MA-112-01: Public-demo upstream validation fails before edge startup

- Purpose: Prove that public-demo never uses an implicit or reflected backend target.
- Steps:
  1. Run `npm run test:k6-edge`.
  2. Verify the valid production authority shape is `<hostname>.railway.internal:3000`.
  3. Verify synthetic `.internal.test` input requires explicit test authority.
  4. Verify missing, blank, whitespace, scheme, userinfo, path, query, fragment, wildcard,
     loopback, public host, and wrong-port inputs fail.
  5. Verify each invalid fixture exits before nginx serves traffic.
- Expected results:
  - The focused command exits `0`.
  - No public-demo fixture falls back to `backend:3000`, localhost, `Host`, or an empty value.
  - Local Compose uses an explicit non-public-demo adapter.
- Evidence to capture:
  - Command, exit code, named invalid categories, and startup outcome. Do not capture input values.

### MA-112-02: REST and auth routes forward Origin unchanged

- Purpose: Prove that both general REST and the more-specific auth route use the same Origin
  contract.
- Steps:
  1. Start the `origin-echo` fixture.
  2. Send one request with a synthetic allowed Origin to `/api/users/probe`.
  3. Send one request with the same Origin to `/api/auth/login`.
  4. Send both requests again without `Origin`.
  5. Stop the fixture.
- Expected results:
  - Present `Origin` reaches the backend unchanged on both route classes.
  - Absent `Origin` remains absent.
  - `Accept`, `Host`, `X-Forwarded-Host`, and edge-derived values do not replace `Origin`.
  - Required forwarding headers are present without exposing their values in evidence.
- Evidence to capture:
  - Sanitized request matrix with route class, Origin state, and header-presence booleans.

### MA-112-03: Socket.IO polling, upgrade, and reconnect preserve the proxy contract

- Purpose: Prove that the edge supports the existing Socket.IO transport lifecycle.
- Steps:
  1. Start the `socket-reconnect` fixture.
  2. Connect a local Socket.IO client through the edge with a synthetic Origin.
  3. Verify polling or handshake completion and WebSocket upgrade.
  4. Restart only the synthetic backend as the fixture defines.
  5. Verify one reconnect through the same edge endpoint.
  6. Repeat the handshake without `Origin` through the non-browser test client.
  7. Stop the fixture.
- Expected results:
  - Upgrade and reconnect succeed.
  - Present `Origin` remains unchanged. Absent `Origin` remains absent.
  - `Upgrade`, mapped `Connection`, no-buffering, and timeout contracts remain active.
  - Socket event and auth payloads remain unchanged.
- Evidence to capture:
  - Transport states, reconnect count, sanitized Origin state, and command exit.

### MA-112-04: Edge health is minimal and independent of backend readiness

- Purpose: Prove that `/healthz` is edge liveness and does not disclose backend state.
- Steps:
  1. Start the `backend-down` fixture.
  2. Request exact `/healthz`.
  3. Inspect status, content type, and body.
  4. Scan the response for provider, hostname, dependency, PID, memory, stack, and secret terms.
  5. Stop the fixture.
- Expected results:
  - Response is `200`, `text/plain`, and body exactly `OK` while the backend is down.
  - The response contains no internal or provider detail.
  - The result is not reported as backend readiness.
- Evidence to capture:
  - Status, content type, body digest or exact safe body, and prohibited-term scan result.

### MA-112-05: Public readiness and operational routes are not exposed

- Purpose: Prove that verbose backend and operational surfaces cannot reach the public edge.
- Steps:
  1. Start the `origin-echo` fixture.
  2. Request `/readyz`, `/readyz/`, `/ops`, `/ops/child`, `/metrics`, `/metrics/`,
     `/backend-healthz`, and `/backend-healthz/child`.
  3. Request exact `/api` and exact `/socket.io`.
  4. Record the upstream-hit count before and after the requests.
  5. Stop the fixture.
- Expected results:
  - Every omitted or denied route returns a generic non-HTML response.
  - `/readyz` and its nested forms return `404` and do not proxy private readiness.
  - No denied request reaches the backend.
  - No denied request returns `index.html`.
- Evidence to capture:
  - Path, status class, content category, and upstream-hit delta.

### MA-112-06: SPA fallback applies only to eligible browser routes

- Purpose: Prove that SPA navigation cannot shadow reserved routes.
- Steps:
  1. Start the `origin-echo` fixture.
  2. Open `/login` and one unknown browser navigation path.
  3. Request one built static asset.
  4. Repeat one API, health, runtime-config, ready, and denied operational path.
  5. Stop the fixture.
- Expected results:
  - Eligible browser routes return the SPA entry.
  - Static assets return their file content.
  - API, Socket.IO, health, runtime config, omitted readiness, and denied routes never fall through
    to the SPA.
- Evidence to capture:
  - Sanitized path-to-content-category matrix and one SPA screenshot.

### MA-112-07: The edge artifact contains no hard-coded deployment authority or secret

- Purpose: Prove that runtime upstream injection does not place D2-only values in source or the SPA.
- Steps:
  1. Build the production edge image with a synthetic public-demo test authority.
  2. Run `npm --prefix client run build`.
  3. Scan the candidate diff and built artifact for provider hostnames, credential keys, tokens,
     generated domains, and mutable image tags.
  4. Run the pinned no-pull Gitleaks scan on the candidate diff.
- Expected results:
  - Builds and scan exit `0`.
  - The SPA contains no `BACKEND_UPSTREAM`, Railway hostname, secret, token, or deployment digest.
  - The nginx runtime template contains no authoritative hard-coded public-demo backend.
- Evidence to capture:
  - Build exits, static scan summary, and redacted Gitleaks result.

### MA-112-08: Full local gate and authorization boundary pass

- Purpose: Prove that the accepted candidate is green and remains pre-D2.
- Steps:
  1. Run `npm run test:k6-edge`.
  2. Run `npm run test:ci`, `npm run ci:validate`, and `npm run lint:ci`.
  3. Run client tests and the client production build.
  4. Build the production server and edge images locally.
  5. Run `git diff --check` and the pinned no-pull Gitleaks scan.
  6. Verify that all fixture containers, networks, and ports are clean.
- Expected results:
  - Every required command exits `0`.
  - Changes remain inside Issue #112 edge/test/guide seams.
  - No credential, provider, registry, Railway, deployment, rollback, or Issue #61 mutation occurs.
  - `D2_MUTATIONS=0`.
- Evidence to capture:
  - Commands, exits, test/build summaries, changed-file list, cleanup inventory, and
    `D2_MUTATIONS=0`.

## Evaluation rule

Do not execute this guide before implementation reaches an exact local candidate. Store every run
as a new append-only JSONL Evaluation record.

- `PASSED`: Every required case passes and the maintainer explicitly accepts the run.
- `FAILED`: A required command exits nonzero, an expected result differs, scope expands, a fixture
  leaks detail, or a forbidden mutation occurs.
- `BLOCKED`: A required local prerequisite is unavailable. A missing live provider or D2 value is
  not a blocker because this guide forbids those inputs.

If a run fails or blocks, append the result and stop. Do not edit an earlier Evaluation.

## Cleanup

1. Stop the local fixture.
2. Verify that ports `4182` and `4183` are free.
3. Verify that the fixture left no container or network.
4. Keep only secret-safe guide and Evaluation evidence.
5. Do not publish, deploy, bind a secret, or run a rollback.

This guide becomes immutable only after external review and explicit maintainer approval. A
semantic change requires a new revision.
