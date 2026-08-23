# Manual Test Guide: K6 Issue #111 — Target Configuration and Runtime Capabilities

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #111 — Target configuration, runtime capability document, and Vite same-origin contract
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/111
- Design authority: `docs/deployment/k6-public-demo-phase2-design.md` and `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- Source base: `0a4e350dfd21d1dc979392f1bf2261ae66a4093e`
- Branch: `nhibuaa/k6-issue-111-target-config`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111`
- Guide revision: `k6-111-target-config-v3`
- Writing mode: `mode=strict`
- Drafted at: `2026-08-22`
- Prior guide: v2 SHA-256 `a5a97dca1df0fc020a14b835fdbd580cdd928eead4726b69175326ed731110ec` remains immutable and approved for the earlier implementation contract. Do not execute v2 against this candidate.
- Guide review authority: a separate `.guide-review.json` record must bind this exact file revision and SHA-256.
- Human approval authority: a separate `.approval.json` record must bind this exact file revision and SHA-256.
- Lock status: candidate. The guide becomes immutable only after external review and explicit maintainer approval.
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-111-target-config-v3.evaluations.jsonl`. Create this file only when guide execution begins.

## Scope and authorization boundary

Use this guide only for the staged Issue #111 candidate. The Git index is the candidate authority because the implementation is staged and not committed. Do not use a `base...HEAD` diff as implementation evidence.

This guide does not authorize or test:

- Issue #112 edge proxy, Origin forwarding, or public-route exposure;
- Issue #113 backend startup wiring, request enforcement, or synthetic signup enforcement;
- provider credentials or live provider compatibility;
- GHCR publication or immutable deployment digests;
- Railway configuration, hostname allocation, health-check configuration, or deployment;
- final S3 CORS, upload storage, WebRTC media readiness, rollback, or Issue #61 measurement.

Stop and classify the run as `FAILED` if any forbidden mutation occurs. Do not perform an unapproved rollback or compensating mutation.

## Prerequisites

1. Run all commands from `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111`.
2. Confirm that the current branch is `nhibuaa/k6-issue-111-target-config`.
3. Confirm that `HEAD` is the committed guide checkpoint `13e65c11f040d0efa88b7805c93293a78c2eb97e`.
4. Confirm that the staged candidate is derived from source base `0a4e350dfd21d1dc979392f1bf2261ae66a4093e`.
5. Use repository-supported Node.js 22 and dependencies from the existing lockfiles.
6. Use a clean browser profile or a private browser context for loopback checks.
7. Do not load a `.env` file. Do not print environment-variable values.
8. Do not contact MongoDB, Redis, RabbitMQ, S3, Railway, GHCR, Firebase, or TURN.
9. Do not place credentials, tokens, cookies, generated hostnames, image digests, or provider endpoints in evidence.
10. Record each command, exit code, concise test summary, browser screenshot, and sanitized host/path observation.

## Candidate authority commands

Confirm the branch and committed checkpoint:

```powershell
git branch --show-current
git rev-parse HEAD
git merge-base 0a4e350dfd21d1dc979392f1bf2261ae66a4093e HEAD
```

List the staged candidate files:

```powershell
git diff --cached --name-only 0a4e350dfd21d1dc979392f1bf2261ae66a4093e
```

Inspect the staged candidate:

```powershell
git diff --cached --binary 0a4e350dfd21d1dc979392f1bf2261ae66a4093e
```

Do not use `git diff 0a4e350d...HEAD` as candidate authority. That command omits the staged implementation.

## Pinned semantic contracts

### Target configuration

The accepted synthetic target uses these values:

- `targetName`: `public-demo`.
- `publicAppUrl`: `https://kittachat.example.test`.
- `allowedBrowserOrigins`: one exact entry, `https://kittachat.example.test`.
- `backendUpstream`: `http://backend.internal.test:3000` only through the explicit synthetic test adapter.
- Trusted target binding:
  - `expectedPublicAppUrl`: `https://kittachat.example.test`.
  - `expectedBackendUpstream`: `http://backend.internal.test:3000`.
  - `allowSyntheticTestValues`: `true` only in tests.

Production validation must accept only the exact trusted public origin and a private Railway origin ending in `.railway.internal` on port `3000`. Production validation must reject `.internal.test` unless the explicit synthetic test adapter is active.

### Capability policy

The runtime document contains exactly these boolean keys:

- Core enabled: `directChat`, `groupChat`, `realtimeSidebar`, `selfSignup`, and `seededDemoAccounts`.
- Runtime-selectable in this Issue #111 fixture: `upload`.
- Initially disabled in `valid-disabled`: `calls` and `upload`.
- Fixed disabled for K6: `recovery`, `googleLogin`, `metricsExport`, and `issue61Measurement`.

No valid Issue #111 fixture may enable recovery, Google login, metrics export, or Issue #61 measurement.

### Runtime document

The same-origin path is `/runtime-config.json`. The document uses exact `schemaVersion: 1` and exact `target: "public-demo"`.

The `webrtc` object may contain only `iceServers[].urls`. Each `urls` value is one safe ICE URL string or a non-empty array of safe ICE URL strings. The document must reject `username`, `credential`, `token`, unknown fields, and secret-bearing values. Issue #115 owns real ICE configuration and media readiness.

### Worker dependency bindings

The exact dependency recipients are:

- `imageWorker=[mongo,redis,rabbitmq,objectStorage]`.
- `auditWorker=[rabbitmq]`.
- `notificationWorker=[]`.

Unknown recipients, unknown dependencies, duplicates, omissions, or extra notification-worker bindings are invalid.

## Pinned commands

### Focused Issue #111 tests

```powershell
npm --prefix client run test:k6-target-config
```

The focused command must build and test both paths:

1. A legacy local build without `VITE_TARGET=public-demo`. An unrelated non-empty `VITE_*` sentinel must not enter that artifact.
2. A public-demo build with explicit `VITE_TARGET=public-demo`, exact same-origin paths, and rejection of any unknown non-empty `VITE_*` input.

### Isolated public-demo build

This child PowerShell process removes inherited `VITE_*` values. It does not change the parent shell.

```powershell
pwsh -NoProfile -Command {
  Get-ChildItem Env: | Where-Object Name -Like 'VITE_*' | ForEach-Object {
    Remove-Item -LiteralPath "Env:$($_.Name)"
  }
  $env:VITE_TARGET = 'public-demo'
  $env:VITE_API_URL = '/'
  $env:VITE_API_URL_AUTH = '/api/auth'
  $env:VITE_API_URL_USERS = '/api/users'
  $env:VITE_API_URL_MESSAGES = '/api/messages'
  $env:VITE_API_URL_GROUPS = '/api/groups'
  $env:VITE_API_URL_FILES = '/api/files'
  $env:VITE_API_URL_CALLS = '/api/calls'
  npm --prefix client run build
  exit $LASTEXITCODE
}
```

### Secret-safe staged-candidate scan

```powershell
git diff --cached --binary 0a4e350dfd21d1dc979392f1bf2261ae66a4093e |
  docker run --rm -i -v "${PWD}:/repo:ro" `
    ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f `
    detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
```

### Local production image builds

These commands build local validation images. They do not publish images.

```powershell
docker build --target prod --tag kittachat-k6-111-server:local ./server
docker build --build-arg VITE_TARGET=public-demo --tag kittachat-k6-111-edge:local --file nginx/Dockerfile .
```

### Loopback preview

Build `client/dist` with the isolated public-demo command before the first preview.

```powershell
npm --prefix client run demo:k6-target-config -- --fixture <fixture-name> --port 4173
```

Use only these fixture names:

- `valid-disabled`;
- `valid-upload-enabled`;
- `missing`;
- `malformed`;
- `old-version`;
- `future-version`;
- `wrong-target`.

Use only these loopback routes:

- SPA login: `http://127.0.0.1:4173/login`.
- Authenticated chat fixture: `http://127.0.0.1:4173/__k6-test__/authenticated-chat`.
- Runtime document: `http://127.0.0.1:4173/runtime-config.json`.
- Disabled call route: `http://127.0.0.1:4173/call/bob.test`.
- Disabled recovery routes:
  - `http://127.0.0.1:4173/forgot-password`;
  - `http://127.0.0.1:4173/reset-password/demo-id`.

Stop each preview with `Ctrl+C`. Confirm that the process exits before the next fixture starts. If the process does not exit, classify the affected case as `FAILED`. Do not use another port as a workaround.

## Test-Craft coverage

Included axes:

- Data shape and contract: valid, absent, blank, malformed, unknown, target-mismatched, old-version, future-version, and incomplete input.
- State and lifecycle: loading, ready, error, reload, stale response, unmount, fixture change, and production build.
- Async and concurrency: delayed configuration, cancelled work, stale response ordering, and reload after a ready state.
- UI and observable transitions: no optional-control flash, hidden controls, guarded routes, unavailable states, and runtime upload activation without rebuild.
- Security and bounds: exact origins, trusted binding, synthetic test adapter, safe field allowlists, same-origin paths, no secret-bearing values, and no D2 mutation.

Omitted axes:

- Edge proxy and public-route behavior belong to Issue #112.
- Backend startup and request enforcement belong to Issue #113.
- Live S3 and private-object behavior belong to Issue #114 and D2.
- Live ICE/TURN and bidirectional media belong to Issue #115 and D2.
- Seed/reset, artifact publication, Railway rollout, and deployed-target acceptance belong to Issues #116–#118 and D2.

## Locked Test Cases

### MA-111-01: Target configuration rejects untrusted and unsafe input

- Purpose: Prove that the target parser requires an exact trusted binding and has no permissive fallback.
- Steps:
  1. Run `npm --prefix client run test:k6-target-config`.
  2. Confirm that the valid synthetic test passes only with all six semantic fields and the explicit trusted adapter.
  3. Confirm that tests reject a missing trusted binding.
  4. Confirm that tests reject `.internal.test` when `allowSyntheticTestValues` is not active.
  5. Confirm that tests accept an exact `.railway.internal:3000` private origin from a trusted target adapter.
  6. Confirm that tests reject absent, blank, malformed, credential-bearing, wildcard, reflected, duplicate, wrong-scheme, wrong-host, wrong-port, evil-subdomain, path, query, and fragment variants.
  7. Confirm that tests reject unknown, missing, duplicated, or over-privileged worker bindings.
- Expected results:
  - The command exits `0`.
  - Invalid input returns a fatal validation result for startup consumers.
  - The parser never substitutes localhost, an empty origin, `Host`, a reflected origin, wildcard policy, or a caller-supplied untrusted origin.
  - The test-only `.internal.test` exception cannot activate in production validation.
- Evidence to capture:
  - Command, exit code, named test summary, and sanitized assertion output.

### MA-111-02: Runtime document and loader fail closed

- Purpose: Prove that the runtime document has one exact safe contract and that invalid responses cannot retain capability state.
- Steps:
  1. Run `npm --prefix client run test:k6-target-config`.
  2. Confirm that the valid document uses exact `schemaVersion: 1` and exact target `public-demo`.
  3. Confirm that tests reject missing keys, unknown fields, non-boolean capability values, unsafe ICE URLs, and secret-bearing WebRTC fields.
  4. Confirm that tests reject unavailable, malformed, wrong-target, old-version, future-version, and incomplete responses.
  5. Confirm that tests cover delayed loading, reload, stale response ordering, unmount, and a failed reload after a ready state.
- Expected results:
  - The command exits `0`.
  - The loader exposes only `loading`, `ready`, or `error`.
  - The loader disables cache reuse.
  - Every invalid response leaves all optional capabilities false.
  - A failed reload does not retain a previous ready capability state.
  - The runtime document does not use a wall-clock TTL.
- Evidence to capture:
  - Command, exit code, named state-transition tests, and sanitized error categories.

### MA-111-03: Public-demo build is explicit, same-origin, and secret-safe

- Purpose: Prove that the K6 build contract activates only for explicit `VITE_TARGET=public-demo` and does not embed D2 values.
- Steps:
  1. Record the names of inherited `VITE_*` variables. Do not record their values.
  2. Run the exact isolated public-demo build command.
  3. Confirm that the parent shell has the same `VITE_*` variable names after the child process exits.
  4. Run `npm --prefix client run test:k6-target-config`.
  5. Confirm that the focused tests execute both the legacy local build and the public-demo build.
  6. Run the exact secret-safe staged-candidate scan.
- Expected results:
  - All commands exit `0`.
  - The K6 build accepts only explicit `VITE_TARGET=public-demo` and the seven exact same-origin paths.
  - Unknown non-empty `VITE_*` values make the K6 build validation fail.
  - A legacy local build does not silently activate the K6 contract or embed the test sentinel.
  - The artifact contains no Railway hostname, provider credential, token, digest, `URL_FRONTEND`, `CORS_ALLOWED_ORIGINS`, `BACKEND_UPSTREAM`, or GHCR deployment reference.
  - The Gitleaks result has no finding.
- Evidence to capture:
  - Before/after environment-variable names, build summaries, exit codes, static contract summary, and redacted Gitleaks result.

### MA-111-04: Initial capability state renders no dead controls or routes

- Purpose: Prove that loading and `valid-disabled` state hide fixed-disabled and initially disabled capabilities.
- Steps:
  1. Start the `valid-disabled` preview.
  2. Open `/login` in a clean browser context. Use network throttling for the first load.
  3. Observe the page before, during, and after `/runtime-config.json` completes.
  4. Confirm that Google login and recovery controls never appear.
  5. Open `/forgot-password` and `/reset-password/demo-id` directly.
  6. Open `/__k6-test__/authenticated-chat` and inspect upload controls.
  7. Open `/call/bob.test` directly.
  8. Run `npm --prefix client run test:k6-target-config` and confirm that the real call-log component omits recall controls when calls are disabled.
  9. Stop the preview and confirm that it exits.
- Expected results:
  - No optional control flashes during loading.
  - Google login, recovery controls, upload controls, call routes, and call controls remain hidden or render a non-sensitive unavailable state.
  - Disabled routes do not issue recovery, call, upload, Firebase, or provider requests.
  - The unavailable state does not disclose provider or internal details.
  - No request leaves loopback.
- Evidence to capture:
  - Loading and ready screenshots, disabled-route screenshots, focused test name, and sanitized network host/path list.

### MA-111-05: Missing and incompatible documents remain fail-closed

- Purpose: Prove that all unavailable or incompatible documents produce the same safe observable state.
- Steps:
  1. Run the preview separately with `missing`, `malformed`, `old-version`, `future-version`, and `wrong-target`.
  2. For each fixture, open `/login` and wait for the runtime-config request to finish.
  3. For each fixture, open `/forgot-password`, `/reset-password/demo-id`, and `/call/bob.test` directly.
  4. Between fixtures, stop the preview, clear site data, and start the next fixture against the same `client/dist`.
- Expected results:
  - Every fixture enters the same non-sensitive error or unavailable state.
  - Optional controls and guarded routes remain fail-closed without a transient flash.
  - A prior valid result is not reused after a failed load or cleared-site-data restart.
  - No provider, backend, or non-loopback request occurs.
- Evidence to capture:
  - Fixture name, response status/category, screenshot, and sanitized host/path list for each fixture.

### MA-111-06: Upload capability can activate without a hostname rebuild

- Purpose: Prove that one allowlisted runtime capability can change while the exact production bundle remains unchanged.
- Steps:
  1. Start `valid-disabled` against the current `client/dist`.
  2. Record the reported `DIST_SHA256`.
  3. Open `/__k6-test__/authenticated-chat` and confirm that the upload control is absent.
  4. Stop the preview and confirm that it exits.
  5. Start `valid-upload-enabled` against the same `client/dist` without rebuilding.
  6. Record the reported `DIST_SHA256`.
  7. Open `/__k6-test__/authenticated-chat` and confirm that the upload control is present.
  8. Confirm that recovery, Google login, metrics, Issue #61, and calls remain disabled.
  9. Do not select a file or submit an upload request.
  10. Stop the preview and confirm that it exits.
- Expected results:
  - The upload control changes only after the valid runtime document enables `upload`.
  - Both `DIST_SHA256` values are identical.
  - Recovery remains fixed disabled in both fixtures.
  - No artifact rebuild, upload request, provider request, or D2 mutation occurs.
- Evidence to capture:
  - Fixture names, digest equality, before/after screenshots, and sanitized host/path list.

### MA-111-07: Public API, Socket.IO, route, and identity contracts remain unchanged

- Purpose: Prove that the configuration seam does not rewrite public contracts.
- Steps:
  1. Run `npm --prefix client test`.
  2. Run `npm --prefix server test`.
  3. Confirm that Issue #111 tests cover REST paths and payloads, Socket.IO event/auth payloads, room identifiers, public conversation identifiers, route guards, disabled call routes, and disabled call-log controls.
  4. Run the staged changed-file command from Candidate authority commands.
  5. Inspect the changed-file list for server controllers, Socket.IO handlers, message schemas, and conversation schemas.
- Expected results:
  - Client and server tests exit `0`.
  - REST and Socket.IO request/response shapes, event names, room identifiers, `Message.conversationId`, and public conversation identifiers remain unchanged.
  - No server controller, Socket.IO handler, message schema, or conversation schema is changed.
  - If one of these public-contract files changed, classify this case as `BLOCKED` for scope review. Do not silently accept the change as Issue #111 work.
- Evidence to capture:
  - Test summaries and staged changed-file list. Do not record payload values or secret-bearing data.

### MA-111-08: Full local gate and authorization boundary remain intact

- Purpose: Prove that the staged candidate is green, locally packageable, secret-safe, and inside Issue #111 authority.
- Steps:
  1. Run `npm run test:ci`.
  2. Run `npm run ci:validate`.
  3. Run `npm run lint:ci`.
  4. Run `npm --prefix client test`.
  5. Run `npm --prefix server test`.
  6. Run the exact isolated public-demo build.
  7. Run both local production image-build commands.
  8. Run `git diff --check`.
  9. Run the exact secret-safe staged-candidate scan.
  10. Review the staged changed-file list and all process/network evidence from MA-111-01 through MA-111-07.
- Expected results:
  - Every required command exits `0`.
  - Lint has zero errors. Existing warnings are acceptable only when the warning count does not exceed the repository gate and each warning is unchanged.
  - Both local production images build without publication.
  - Changes remain limited to Issue #111 target/configuration, client integration, tests, guide, and workflow-state seams.
  - No credential is created or bound.
  - No GHCR image is published.
  - No Railway or provider configuration is mutated.
  - No live provider validation, deployed-target acceptance, rollback, or Issue #61 measurement occurs.
- Evidence to capture:
  - Commands, exit codes, test/build summaries, changed-file list, secret-scan result, and explicit `D2_MUTATIONS=0` observation.

## Evaluation rules

Do not execute this guide until all of these conditions are true:

1. A fresh external review approves this exact v3 file and SHA-256 with zero Critical or Major findings.
2. The maintainer explicitly approves this exact v3 revision and SHA-256.
3. The implementation remains the same staged candidate or any changed candidate receives a new guide applicability decision.

When execution starts, append one new JSON object to `.agents/manual-tests/k6-public-demo/issue-111-target-config-v3.evaluations.jsonl` through `scripts/record_evaluation.py`.

- `PASSED`: All eight required cases pass, the Evaluation append succeeds, and the maintainer explicitly approves the observed acceptance run.
- `FAILED`: A required command exits nonzero, an expected result differs, a fixture does not stop, a scope violation exists, a secret appears, or a forbidden mutation occurs.
- `BLOCKED`: A required case cannot run because an approved local prerequisite or tool is unavailable. Missing provider access or credentials are not blockers because this guide forbids their use.

Append every `FAILED` or `BLOCKED` run. Never edit an earlier Evaluation. Use a new run ID after authorized remediation.

This guide becomes immutable after external approval and explicit maintainer approval. Create v4 if its semantics must change.
