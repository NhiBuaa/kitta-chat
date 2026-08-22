# Manual Test Guide: K6 Issue #111 — Target Configuration and Runtime Capabilities

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #111 — Target configuration, runtime capability document, and Vite same-origin contract
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/111
- Design authority: `docs/deployment/k6-public-demo-phase2-design.md` and `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- Source base: `0a4e350dfd21d1dc979392f1bf2261ae66a4093e`
- Branch: `nhibuaa/k6-issue-111-target-config`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111`
- Guide revision: `k6-111-target-config-v2`
- Drafted at: `2026-08-22T14:02:34.3282061+07:00`
- Ticket review: `APPROVE`; zero Critical, Major, or Minor findings after one bounded remediation
- Prior guide disposition: v1 SHA-256 `46ac8d2a5067c293c33d6712b622e340eaf9a3d24f5ad278852e63abb7313ca9`
  received `REQUEST_CHANGES`; v1 was never approved, locked, executed, or committed
- Guide review authority: separate `.guide-review.json` record bound to this exact revision and SHA-256
- Human approval authority: separate `.approval.json` record bound to this exact revision and SHA-256
- Lock status: candidate; these bytes become immutable only when both bound records approve them
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-111-target-config-v2.evaluations.jsonl` (create only when acceptance execution begins)

## Scope and authorization boundary

This guide validates only Issue #111 source and local test behavior. It does not authorize or test
live Railway/provider connectivity, credentials, GHCR publication, image digests, deployment,
generated hostnames, final CORS, rollback, or Issue #61 measurement.

Issue #112 owns nginx/edge Origin forwarding and public route exposure. Issue #113 owns backend
startup wiring, server capability enforcement, and protected REST/Socket.IO rejection. This guide
must not count missing #112/#113 behavior as Issue #111 failure, and Issue #111 must not implement
those downstream responsibilities.

## Prerequisites

- Repository state: run from the Issue #111 worktree on the exact implementation candidate derived
  from source base `0a4e350dfd21d1dc979392f1bf2261ae66a4093e`.
- Runtime: repository-supported Node.js 22 and dependencies installed from existing lockfiles.
- Services: MongoDB, Redis, RabbitMQ, S3, Railway, GHCR, Firebase, and TURN are not required and must
  not be contacted.
- Credentials: no `.env` secret, provider credential, token, cookie, deployment digest, generated
  hostname, or D2-only value is required. Do not print any local environment value.
- Focused automated command: the implementation must expose
  `npm --prefix client run test:k6-target-config`. It runs only the Issue #111 target parser,
  runtime loader/state/UI, build-contract, and public-contract compatibility tests.
- Test fixture: the implementation must provide a repository-owned loopback-only preview command:
  `npm --prefix client run demo:k6-target-config -- --fixture <name> --port 4173`. The fixture serves
  the production SPA and selected non-secret `/runtime-config.json`, stubs only the minimum local
  API/Socket.IO observations needed by this guide, reports a deterministic `DIST_SHA256` without
  printing bundle contents, never contacts external providers, and does not become production
  runtime code.
- Browser: use a clean browser profile or private context at `http://127.0.0.1:4173`. Clear site
  data between fixture changes.
- Evidence policy: retain command, exit code, test summary, browser screenshots, and sanitized
  network observations. Never retain authorization headers, cookies, token values, local environment
  contents, provider endpoints, or complete generated bundles.

## Pinned semantic fixtures

The focused tests use synthetic `.test` values only:

- `targetName`: exact `public-demo`.
- `publicAppUrl`: exact-origin URL `https://kittachat.example.test`; credentials, path, query,
  fragment, wildcard, wrong scheme, alternate port, and hostname variants are invalid.
- `allowedBrowserOrigins`: exactly `https://kittachat.example.test` for the public-demo fixture;
  blank, duplicate, wildcard, reflected, wrong-scheme, wrong-port, wrong-host, and evil-subdomain
  variants are invalid.
- `backendUpstream`: synthetic private origin `http://backend.internal.test:3000`; missing scheme,
  credentials, path, query, fragment, wildcard, and public-app-origin reuse are invalid.
- `capabilities`: exact boolean keys `directChat`, `groupChat`, `realtimeSidebar`, `calls`,
  `selfSignup`, `seededDemoAccounts`, `upload`, `recovery`, `googleLogin`, `metricsExport`, and
  `issue61Measurement`. Missing, non-boolean, or unknown capability keys are invalid.
- `webrtc`: may contain only `iceServers[].urls` as a string or non-empty string array. Synthetic
  `stun:stun.example.test:3478` is validation data only. `username`, `credential`, `token`, unknown
  keys, and any secret-bearing value are invalid. Issue #115 owns real ICE values and ephemeral TURN.
- `workerDependencyBindings`: exact recipients and dependency names:
  `imageWorker=[mongo,redis,rabbitmq,objectStorage]`, `auditWorker=[rabbitmq]`, and
  `notificationWorker=[]`. Unknown recipient/dependency names, duplicates, omissions, or extra
  notification bindings are invalid.

These fixtures validate the shared contract only. They do not wire backend startup, render nginx,
connect a worker, or contact any provider.

## Pinned commands and fixture routes

Focused tests:

```powershell
npm --prefix client run test:k6-target-config
```

Isolated public-demo build. This nested PowerShell removes inherited `VITE_*` variables only from
its own process, sets the seven approved non-secret relative paths, and leaves the parent shell
unchanged:

```powershell
pwsh -NoProfile -Command {
  Get-ChildItem Env: | Where-Object Name -Like 'VITE_*' | ForEach-Object {
    Remove-Item -LiteralPath "Env:$($_.Name)"
  }
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

Secret-safe candidate diff scan:

```powershell
git diff --binary 0a4e350dfd21d1dc979392f1bf2261ae66a4093e...HEAD |
  docker run --rm -i -v "${PWD}:/repo:ro" `
    ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f `
    detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
```

Preview command, fixture routes, and shutdown:

```powershell
npm --prefix client run demo:k6-target-config -- --fixture <fixture-name> --port 4173
```

- Public SPA login: `http://127.0.0.1:4173/login`.
- Test-only authenticated component harness: `http://127.0.0.1:4173/__k6-test__/authenticated-chat`.
- Runtime document: `http://127.0.0.1:4173/runtime-config.json`.
- Stop each fixture with `Ctrl+C` in its terminal and confirm the command exits before starting the
  next fixture. If the process does not stop, mark the affected case `FAILED`; do not start another
  server on a different port.

## Test-Craft coverage

Included axes:

- Data shape and contract: valid, absent, blank, malformed, unknown, target-mismatched, old-version,
  future-version, and incomplete target/runtime documents.
- State and lifecycle: initial loading, ready, error, reload, fixture change, and production build.
- Async and concurrency: delayed configuration, response-after-unmount/reload safety, and no stale
  capability state after an error.
- UI and observable transitions: no optional-control flash, disabled controls, guarded SPA routes,
  explicit unavailable state, and valid runtime enablement without a hostname rebuild.
- Security and bounds: exact same-origin paths, forbidden origin fallbacks, safe field allowlist,
  no secret/D2-only data, and no changes to public REST/Socket.IO identity contracts.

Omitted axes:

- Live edge Origin forwarding and public route exclusion: owned by Issue #112.
- Backend startup/request capability enforcement and synthetic signup: owned by Issue #113.
- S3 upload execution, private-object behavior, and image processing: owned by Issue #114 and D2.
- ICE/TURN connectivity and bidirectional media: owned by Issue #115 and D2.
- Seed/reset behavior, immutable image publication, Railway rollout, and deployed-target acceptance:
  owned by Issues #116–#118 and D2.

## Candidate Test Cases

### MA-111-01: Target configuration rejects unsafe public-demo input without fallback

- Purpose: Prove the semantic target parser returns a fatal validation result for unsafe
  public-demo input and never substitutes a permissive value.
- Steps:
  1. Run `npm --prefix client run test:k6-target-config`.
  2. Confirm the valid fixture contains `targetName`, `publicAppUrl`, `allowedBrowserOrigins`,
     `backendUpstream`, `capabilities`, and `workerDependencyBindings`.
  3. Confirm negative fixtures cover missing, blank, malformed, wildcard, reflected, duplicate,
     wrong-scheme, wrong-host, wrong-port, evil-subdomain, and absent origin values.
  4. Confirm separate negative fixtures reject invalid `targetName`, every invalid
     `publicAppUrl`/`backendUpstream` form in Pinned semantic fixtures, missing/non-boolean/unknown
     capabilities, and missing/duplicate/unknown worker bindings.
  5. Inspect the negative-fixture assertions for forbidden fallback values.
- Expected results:
  - The command exits `0` and every named invalid fixture for all six semantic fields is rejected.
  - Invalid public-demo input produces a fatal validation result for startup consumers.
  - No fixture falls back to localhost, an empty allowlist, `Host`, a reflected request origin, or a
    wildcard/permissive policy.
  - Tests do not wire backend startup or implement edge forwarding owned by #112/#113.
- Evidence to capture:
  - Command, exit code, named test summary, and sanitized assertion output.

### MA-111-02: Runtime document schema and loader fail closed deterministically

- Purpose: Prove `/runtime-config.json` has one exact contract and the client cannot retain or infer
  optional capability state from an invalid response.
- Steps:
  1. Run `npm --prefix client run test:k6-target-config` and inspect the runtime-config cases.
  2. Confirm the accepted fixture uses exact `schemaVersion: 1` and exact `target: "public-demo"`.
  3. Confirm the accepted document exposes only the exact capability keys and `webrtc.iceServers[].urls`
     shape listed in Pinned semantic fixtures.
  4. Confirm rejected fixtures cover missing/unavailable response, malformed JSON, missing required
     keys, wrong value types, unknown top-level/capability/WebRTC fields, secret-bearing WebRTC keys,
     wrong target, old version, and future version.
  5. Confirm tests exercise delayed loading, error, reload, and response-after-unmount or stale
     response ordering.
- Expected results:
  - The command exits `0`.
  - The loader exposes only `loading`, `ready`, or `error` and requests with cache reuse disabled.
  - Every rejected response leaves all optional capabilities false; prior ready state is not retained
    after a failed reload.
  - No wall-clock TTL is used. Unsupported version, wrong target, or incomplete contract is the
    deterministic stale/incompatible rule.
- Evidence to capture:
  - Command, exit code, test names, and state-transition assertions without document secrets.

### MA-111-03: Public-demo production build is hostname-independent and secret-safe

- Purpose: Prove one built frontend can be served from a future exact hostname without embedding
  Railway or backend runtime values.
- Steps:
  1. Run the exact Isolated public-demo build command from Pinned commands and fixture routes.
  2. Record its exit code and confirm the parent shell did not receive new `VITE_*` values.
  3. Run `npm --prefix client run test:k6-target-config` and inspect its build-contract cases against
     `client/dist`.
  4. Run the exact Secret-safe candidate diff scan from Pinned commands and fixture routes.
- Expected results:
  - Build and contract tests exit `0`.
  - API, Socket.IO, and runtime-config paths are same-origin relative paths.
  - The bundle contains no Railway-generated hostname, provider credential, token, digest,
    `URL_FRONTEND`, `CORS_ALLOWED_ORIGINS`, `BACKEND_UPSTREAM`, or other D2-only value.
  - Safe non-secret metadata is not misreported as live provider compatibility.
- Evidence to capture:
  - Build summary, exit codes, static contract summary, and Gitleaks no-finding result.

### MA-111-04: Valid disabled fixture renders no dead controls or client routes

- Purpose: Prove the initial public-demo capability state is fail-closed and does not flash optional
  controls while configuration is loading.
- Steps:
  1. Start `npm --prefix client run demo:k6-target-config -- --fixture valid-disabled --port 4173`.
  2. Open `http://127.0.0.1:4173/login` in a clean browser context with network throttling enabled
     for the first load.
  3. Observe the page before, during, and after `/runtime-config.json` completes.
  4. Check Google login and forgot-password/recovery navigation.
  5. Navigate directly to `/forgot-password` and `/reset-password/demo-id`.
  6. Open `http://127.0.0.1:4173/__k6-test__/authenticated-chat` and inspect upload controls.
  7. Stop the fixture with `Ctrl+C` and confirm the preview command exits.
- Expected results:
  - No optional control flashes during loading.
  - Google login, recovery navigation, reset navigation, and upload controls remain absent or
    explicitly unavailable after ready state.
  - Direct disabled SPA routes render a non-sensitive unavailable state or approved safe redirect;
    they do not issue provider/backend recovery requests.
  - No request leaves loopback and no provider credential is requested.
- Evidence to capture:
  - Loading and ready screenshots plus sanitized network host/path list.

### MA-111-05: Missing and incompatible runtime documents remain fail-closed

- Purpose: Prove all unavailable/stale paths converge on the same safe observable behavior.
- Steps:
  1. Run the preview fixture separately with `missing`, `malformed`, `old-version`, `future-version`,
     and `wrong-target`.
  2. For each fixture, open `/login`, wait for the config request to finish, then directly open
     `/forgot-password` and `/reset-password/demo-id`.
  3. Between fixtures, stop the preview, clear browser site data, and start the next fixture without
     rebuilding the SPA.
- Expected results:
  - Each fixture enters the explicit non-sensitive error/unavailable state.
  - All optional controls and guarded SPA routes remain fail-closed with no transient flash.
  - A previous valid response is not reused after site data is cleared or a failed reload occurs.
  - The browser never derives capability state from missing credentials or hostname values.
- Evidence to capture:
  - Fixture name, config response status/category, screenshot, and sanitized request list for each run.

### MA-111-06: Valid runtime capability can change without a hostname rebuild

- Purpose: Prove the runtime seam can enable one allowlisted client capability while the exact same
  production bundle remains unchanged.
- Steps:
  1. Start the `valid-disabled` fixture, record its reported `DIST_SHA256`, and confirm the recovery
     control is absent.
  3. Stop it and start `valid-recovery-enabled` against the same `client/dist` directory.
  4. Reload `/login` and inspect the recovery control and client route without submitting a request.
  5. Record the second fixture's reported `DIST_SHA256`.
  6. Stop the fixture with `Ctrl+C` and confirm the preview command exits.
- Expected results:
  - The recovery control/client route becomes available only for the valid enabled fixture.
  - The before/after production artifact digest is identical; no hostname rebuild occurred.
  - No recovery backend/provider request is submitted and this case does not claim #113 or D2
    readiness.
- Evidence to capture:
  - Fixture names, before/after digest equality result, screenshots, and sanitized network list.

### MA-111-07: Public API, Socket.IO, and conversation identity contracts are unchanged

- Purpose: Prevent the frontend target seam from rewriting existing public payloads or identifiers.
- Steps:
  1. Run `npm --prefix client test`.
  2. Confirm Issue #111 boundary tests cover REST URL/payload preservation, Socket.IO event/auth
     payload preservation, room/public conversation identifier preservation, and same-origin base
     selection.
  3. Inspect `git diff 0a4e350dfd21d1dc979392f1bf2261ae66a4093e...HEAD --name-only`.
- Expected results:
  - Client tests exit `0`.
  - Existing request/response payload shapes, event names, room identifiers,
    `Message.conversationId`, and public conversation identifiers are unchanged.
  - Any server controller/socket payload implementation change makes this case `BLOCKED` pending
    scope review; it is not silently accepted as Issue #111 work.
- Evidence to capture:
  - Test summary and changed-file list without source payload or secret values.

### MA-111-08: Full local gate and authorization boundary remain intact

- Purpose: Prove the accepted Issue #111 candidate is locally green and did not cross into #112,
  #113, or D2.
- Steps:
  1. Run `npm run test:ci` and `npm run ci:validate`.
  2. Run `npm run lint:ci`, `npm --prefix client test`, and the exact Isolated public-demo build
     command from Pinned commands and fixture routes.
  3. Run `git diff --check` and the exact Secret-safe candidate diff scan from Pinned commands and
     fixture routes.
  4. Review the changed-file list and process/network evidence from MA-111-01 through MA-111-07.
- Expected results:
  - Every required command exits `0`; known lint warnings may remain only if unchanged and explicitly
    recorded.
  - Changes remain limited to the Issue #111 configuration/client/test/manual-guide seams.
  - No credential is created/bound, no GHCR image is published, no Railway/provider mutation occurs,
    no live acceptance or rollback runs, and Issue #61 measurement remains disabled.
  - A nonzero required command, expected-result mismatch, scope violation, or detected forbidden
    mutation makes the Evaluation `FAILED`; it is never rewritten as pass.
- Evidence to capture:
  - Commands, exit codes, test/build summaries, changed-file list, secret-scan result, and explicit
    `D2_MUTATIONS=0` observation.

## Evaluation rule

Do not execute this guide before Issue #111 implementation reaches its reviewed local fixed point.
Store each execution as a new append-only JSONL Evaluation record. `PASSED` requires all eight cases
to pass and explicit maintainer acceptance.

- `FAILED`: a required command runs and exits nonzero; an observable result differs from this guide;
  a scope/contract violation is present; a fixture fails to stop; or any forbidden credential,
  provider, GHCR, Railway, deployment, live-acceptance, rollback, or Issue #61 mutation is attempted
  or detected. Stop immediately after a forbidden mutation and notify the maintainer; do not perform
  an unapproved rollback or compensating mutation.
- `BLOCKED`: a required case cannot run because an approved prerequisite or tool is unavailable,
  including a missing browser/runtime that prevents execution. A missing provider or credential is
  not a blocker because this guide forbids using them.
- Every `FAILED` or `BLOCKED` run is appended. Never edit an earlier Evaluation or convert it to
  `PASSED`; rerun under a new run ID after authorized remediation.
