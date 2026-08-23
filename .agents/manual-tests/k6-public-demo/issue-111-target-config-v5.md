# Manual Test Guide: K6 Issue #111 — Target Configuration and Runtime Capabilities

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #111 — Target configuration, runtime capability document, and Vite same-origin contract
- Authoritative specification: `.agents/manual-tests/k6-public-demo/issue-111-spec-snapshot.md`
- Specification snapshot SHA-256: `0d6127f8d166b0df3cd2177eb523932c4411128b7a208e58d8914b06e75dfbbb`
- Live issue reference: https://github.com/NhiBuaa/kitta-chat/issues/111
- Design authority: `docs/deployment/k6-public-demo-phase2-design.md` and `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- Source base: `0a4e350dfd21d1dc979392f1bf2261ae66a4093e`
- Committed checkpoint: `13e65c11f040d0efa88b7805c93293a78c2eb97e`
- Branch: `nhibuaa/k6-issue-111-target-config`
- Source worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111`
- Approved execution-tree candidate: `60edb5717b7dfc51b7be383b413eeef3f60c1264`
- Guide revision: `k6-111-target-config-v5`
- Writing mode: `mode=strict`
- Drafted at: `2026-08-22`
- v2 disposition: immutable and approved for an earlier contract; superseded for current-candidate applicability; do not execute.
- v3 disposition: immutable; external `REQUEST_CHANGES` with eight Major findings; never approved or executed.
- v4 disposition: immutable; external `BLOCK` with seven Major findings; never approved or executed.
- Guide review authority: a separate `.guide-review.json` must bind this exact v5 revision and SHA-256.
- Human approval authority: a separate `.approval.json` must bind this exact v5 revision and SHA-256.
- Lock status: candidate. The guide becomes immutable only after external review and explicit maintainer approval.
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-111-target-config-v5.evaluations.jsonl`. Create only when execution begins.

## Scope and authorization boundary

Use this guide only for the approved execution-tree candidate. The execution tree excludes mutable workflow artifacts that are not test or runtime inputs:

- `.agents/current-session.md`;
- `.agents/next-session.md`;
- every file under `.agents/manual-tests/k6-public-demo/`;
- `docs/deployment/k6-public-demo-feature-delivery.md`.

This exclusion prevents a guide, review sidecar, approval sidecar, Evaluation, or ledger update from creating a self-referential candidate digest. All source, tests, package files, CI policy, Docker files, nginx files, and acceptance tooling remain in the execution tree.

This guide does not authorize or test:

- Issue #112 edge proxy, Origin forwarding, or public-route exposure;
- Issue #113 backend startup wiring, request enforcement, or synthetic signup enforcement;
- provider credentials or live provider compatibility;
- GHCR image publication or immutable deployment digests;
- Railway configuration, hostname allocation, health-check configuration, or deployment;
- final S3 CORS, provider-backed upload, WebRTC media readiness, rollback, or Issue #61 measurement.

The pinned Gitleaks image must already exist in the local Docker cache. Do not pull it. If it is absent, classify the run as `BLOCKED`.

Stop and classify the run as `FAILED` if a forbidden mutation occurs. Do not perform an unapproved rollback or compensating mutation.

## Prerequisites

1. Open a dedicated PowerShell 7 session.
2. Start in `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111`.
3. Use repository-supported Node.js 22, Python 3, Docker, Git, and PowerShell 7.
4. Use a clean browser profile or private browser context for loopback checks.
5. Do not print environment-variable values.
6. Do not contact MongoDB, Redis, RabbitMQ, S3, Railway, Firebase, TURN, or GHCR.
7. Do not place credentials, tokens, cookies, generated hostnames, image digests, provider endpoints, or raw environment output in evidence.
8. Record command names, exit codes, concise summaries, screenshots, and sanitized host/path observations.

## Stage A — Materialize and verify the pinned execution tree

Run this block from the source worktree:

```powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111'
$SourceBase = '0a4e350dfd21d1dc979392f1bf2261ae66a4093e'
$ExpectedHead = '13e65c11f040d0efa88b7805c93293a78c2eb97e'
$ExpectedBranch = 'nhibuaa/k6-issue-111-target-config'
$ExpectedExecutionTree = '60edb5717b7dfc51b7be383b413eeef3f60c1264'

if ($SourceWorktree -ne $ExpectedWorktree) {
  throw 'BLOCKED: unexpected Issue #111 worktree'
}
if ((git branch --show-current).Trim() -ne $ExpectedBranch) {
  throw 'BLOCKED: unexpected Issue #111 branch'
}
if ((git rev-parse HEAD).Trim() -ne $ExpectedHead) {
  throw 'BLOCKED: unexpected committed checkpoint'
}
git cat-file -e "$SourceBase^{commit}"
if ($LASTEXITCODE -ne 0) {
  throw 'BLOCKED: source base is not a commit object'
}
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) {
  throw 'BLOCKED: source base is not an ancestor of HEAD'
}
if ((git cat-file -t $ExpectedExecutionTree).Trim() -ne 'tree') {
  throw 'BLOCKED: approved execution candidate is not a Git tree object'
}

$RunNonce = [Guid]::NewGuid().ToString('N')
$CandidateArchive = Join-Path ([IO.Path]::GetTempPath()) "k6-111-execution-$RunNonce.zip"
$CandidateRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-111-execution-$RunNonce"
if ((Test-Path -LiteralPath $CandidateArchive) -or (Test-Path -LiteralPath $CandidateRoot)) {
  throw 'BLOCKED: candidate materialization path already exists'
}

git archive --format=zip --output=$CandidateArchive $ExpectedExecutionTree
if ($LASTEXITCODE -ne 0) {
  throw 'BLOCKED: approved execution-tree archive failed'
}
Expand-Archive -LiteralPath $CandidateArchive -DestinationPath $CandidateRoot

$CandidateState = python "$CandidateRoot/scripts/k6/issue111_candidate.py" `
  --repository $SourceWorktree `
  --source-base $SourceBase `
  --expected-tree $ExpectedExecutionTree | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $CandidateState.execution_tree -ne $ExpectedExecutionTree) {
  throw 'BLOCKED: live Git index does not match the approved execution tree'
}

$RuntimeEnvFiles = Get-ChildItem -LiteralPath $CandidateRoot -Recurse -Force -File |
  Where-Object {
    $_.Name -eq '.env' -or
    $_.Name -in @('.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local')
  }
if ($RuntimeEnvFiles) {
  throw 'FAILED: approved execution tree contains a runtime environment file'
}

Set-Location -LiteralPath $CandidateRoot
```

Record the exact worktree, branch, `HEAD`, `SourceBase`, and `ExpectedExecutionTree`. Do not record environment values.

### Sanitize the dedicated acceptance shell

```powershell
Get-ChildItem Env: |
  Where-Object Name -Match '(?i)(VITE_|MONGO|REDIS|RABBIT|AWS_|FIREBASE|JWT|TOKEN|SECRET|PASSWORD|CREDENTIAL|CORS|URL_FRONTEND|BACKEND_UPSTREAM)' |
  ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
```

Install dependencies from the pinned tree:

```powershell
npm ci
npm --prefix client ci
npm --prefix server ci
```

If installation fails, classify the run as `BLOCKED`. Do not copy `node_modules` or `.env` files from the source worktree.

## Exact candidate evidence commands

Use these path exclusions for source-base comparisons:

```powershell
$ExecutionPathspec = @(
  '.',
  ':(exclude).agents/current-session.md',
  ':(exclude).agents/next-session.md',
  ':(exclude).agents/manual-tests/k6-public-demo/**',
  ':(exclude)docs/deployment/k6-public-demo-feature-delivery.md'
)
```

List and check the exact pinned execution-tree diff:

```powershell
git -C $SourceWorktree diff --name-only $SourceBase $ExpectedExecutionTree -- $ExecutionPathspec
git -C $SourceWorktree diff --check $SourceBase $ExpectedExecutionTree -- $ExecutionPathspec
```

Both commands use immutable Git objects. The whitespace check must exit `0`.

Do not use a live-index diff or `git diff $SourceBase...HEAD` as execution evidence.

## Pinned semantic contracts

### Target configuration

The accepted synthetic target uses:

- `targetName=public-demo`;
- `publicAppUrl=https://kittachat.example.test`;
- one exact `allowedBrowserOrigins` entry equal to the public origin;
- `backendUpstream=http://backend.internal.test:3000` only through the explicit synthetic test adapter;
- trusted `expectedPublicAppUrl` and `expectedBackendUpstream` values equal to the test values;
- `allowSyntheticTestValues=true` only in tests.

Production validation accepts only the exact trusted public origin and a private `.railway.internal:3000` origin. It rejects `.internal.test` without the explicit test adapter.

### Capability policy

The runtime document contains exactly these boolean keys:

- Core enabled: `directChat`, `groupChat`, `realtimeSidebar`, `selfSignup`, and `seededDemoAccounts`.
- Runtime-selectable in this local fixture: `upload`.
- Initially disabled in `valid-disabled`: `calls` and `upload`.
- Fixed disabled: `recovery`, `googleLogin`, `metricsExport`, and `issue61Measurement`.

No valid Issue #111 fixture may enable a fixed-disabled capability.

### Runtime document and worker binding

- Path: `/runtime-config.json`.
- Envelope: exact `schemaVersion: 1` and target `public-demo`.
- WebRTC: only safe `iceServers[].urls`; no username, credential, token, or unknown field.
- Worker bindings:
  - `imageWorker=[mongo,redis,rabbitmq,objectStorage]`;
  - `auditWorker=[rabbitmq]`;
  - `notificationWorker=[]`.

## Pinned commands

Run this section from `$CandidateRoot`.

### Focused Issue #111 tests

```powershell
npm --prefix client run test:k6-target-config
```

The command must execute:

1. a legacy build without `VITE_TARGET=public-demo`;
2. an actual public-demo build with an unknown non-empty `VITE_*` value that fails for the expected validation category;
3. a valid public-demo build with the seven exact same-origin paths;
4. all real disabled-call controls in `Sidebar`, `ChatWindow`, `UserProfileModal`, and `CallLogItem`;
5. recursive byte scanning of every file in `client/dist`, including JSON, nested assets, source maps if present, SVG, CSS, JavaScript, and binary assets.

The command must fail if the rejected build succeeds or fails for an unrelated reason.

### Isolated public-demo build

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

### Secret-safe pinned-tree scan

```powershell
$GitleaksImage = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
docker image inspect $GitleaksImage | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'BLOCKED: pinned Gitleaks image is not present in the local Docker cache'
}

git -C $SourceWorktree diff --binary $SourceBase $ExpectedExecutionTree -- $ExecutionPathspec |
  docker run --pull=never --rm -i -v "${CandidateRoot}:/repo:ro" `
    $GitleaksImage `
    detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
```

The scan must exit `0` with no finding and no registry pull.

### Acceptance-tooling tests

```powershell
python -m unittest discover -s scripts/test/k6 -p 'test_*.py'
python -m unittest discover -s scripts/test/manual_acceptance -p 'test_*.py'
```

The candidate helper must prove workflow-artifact exclusion, expected-tree enforcement, and archive contents. The recorder must prove exact guide/source/tree binding, Git object types, eight exact case IDs, verdict/approval consistency, strict field allowlists, secret-bearing evidence rejection, duplicate-run rejection, prior-byte preservation, and CLI append behavior.

### Local production image builds

```powershell
docker build --target prod --tag kittachat-k6-111-server:local ./server
docker build --build-arg VITE_TARGET=public-demo --tag kittachat-k6-111-edge:local --file nginx/Dockerfile .
docker run --rm --entrypoint sh kittachat-k6-111-server:local -c 'test ! -e /app/.env && test ! -e /app/.env.local && test ! -e /app/.env.production && test ! -e /app/.env.production.local'
```

These commands build and inspect local images only. They do not publish.

### Loopback preview

Build `client/dist` first. Start one fixture at a time:

```powershell
npm --prefix client run demo:k6-target-config -- --fixture <fixture-name> --port 4173
```

Allowed fixtures:

- `valid-disabled`;
- `valid-upload-enabled`;
- `missing`;
- `malformed`;
- `old-version`;
- `future-version`;
- `wrong-target`.

Allowed loopback routes:

- `http://127.0.0.1:4173/login`;
- `http://127.0.0.1:4173/__k6-test__/authenticated-chat`;
- `http://127.0.0.1:4173/runtime-config.json`;
- `http://127.0.0.1:4173/call/bob.test`;
- `http://127.0.0.1:4173/forgot-password`;
- `http://127.0.0.1:4173/reset-password/demo-id`.

Stop each fixture with `Ctrl+C`. Confirm exit before the next fixture. If it does not stop, classify the case as `FAILED`. Do not change ports as a workaround.

## Locked Test Cases

### MA-111-01: Target configuration rejects untrusted and unsafe input

- Purpose: Prove exact trusted binding and no permissive fallback.
- Steps:
  1. Run the focused tests.
  2. Confirm that the valid synthetic target needs all six semantic fields and the explicit test adapter.
  3. Confirm rejection of missing binding and production use of `.internal.test`.
  4. Confirm acceptance of one exact trusted `.railway.internal:3000` origin.
  5. Confirm rejection of absent, blank, malformed, credential-bearing, wildcard, reflected, duplicate, wrong-scheme, wrong-host, wrong-port, evil-subdomain, path, query, and fragment variants.
  6. Confirm rejection of unknown, missing, duplicated, or over-privileged worker bindings.
- Expected results:
  - Command exits `0`.
  - Invalid input returns fatal validation with no localhost, empty, host-derived, reflected, or wildcard fallback.
  - The synthetic namespace cannot activate in production validation.
- Evidence:
  - Command, exit code, named tests, and sanitized assertion categories.

### MA-111-02: Runtime document and loader fail closed

- Purpose: Prove one safe runtime contract and no stale capability retention.
- Steps:
  1. Run the focused tests.
  2. Confirm exact schema, target, capability keys, and safe ICE shape.
  3. Confirm rejection of unknown fields, unsafe ICE, and secret-bearing WebRTC fields.
  4. Confirm unavailable, malformed, wrong-target, old, future, and incomplete document rejection.
  5. Confirm loading, reload, stale response, unmount, and failed-reload behavior.
- Expected results:
  - Command exits `0`.
  - States are only `loading`, `ready`, or `error`; cache reuse is disabled.
  - Invalid or failed reload state keeps every optional capability false.
- Evidence:
  - Command, exit code, state-transition test names, and sanitized categories.

### MA-111-03: Complete public-demo artifact is explicit, same-origin, and secret-safe

- Purpose: Prove explicit build activation and complete artifact coverage.
- Steps:
  1. Run the focused tests and isolated build.
  2. Confirm legacy, rejected, and valid Vite builds execute.
  3. Confirm recursive inventory scans every generated artifact file.
  4. Run the exact pinned-tree Gitleaks scan.
- Expected results:
  - Commands exit `0`.
  - Only explicit `VITE_TARGET=public-demo` plus exact relative paths is accepted.
  - Unknown non-empty `VITE_*` causes the actual build to fail for the expected category.
  - No generated file contains the named D2 keys, Railway host patterns, localhost/loopback backend origins, GHCR deployment reference, or forbidden sentinel.
  - Gitleaks reports no finding and performs no pull.
- Evidence:
  - Build summaries, artifact-inventory test, exit codes, and redacted scan result.

### MA-111-04: Initial state renders no dead controls, call actions, or routes

- Purpose: Prove loading and `valid-disabled` fail closed for all changed controls.
- Steps:
  1. Start `valid-disabled` and open `/login` with first-load throttling.
  2. Observe loading and ready state.
  3. Open recovery, reset, authenticated-chat, and call routes directly.
  4. Confirm focused tests render real `Sidebar`, `ChatWindow`, `UserProfileModal`, and `CallLogItem` components with calls disabled.
  5. Confirm no call-history, audio, video, profile-call, or recall control exists and no request is issued.
  6. Stop the fixture.
- Expected results:
  - No optional-control flash.
  - Google, recovery, upload, call routes, and every changed call control remain hidden or unavailable.
  - No provider, Firebase, upload, recovery, or call request occurs.
  - Unavailable text is non-sensitive.
- Evidence:
  - Loading/ready/route screenshots, named component tests, and sanitized host/path list.

### MA-111-05: Missing and incompatible documents remain fail-closed

- Purpose: Prove all unavailable or incompatible documents converge on safe state.
- Steps:
  1. Run `missing`, `malformed`, `old-version`, `future-version`, and `wrong-target` separately.
  2. Open login, recovery, reset, and call routes for each fixture.
  3. Stop preview and clear site data between fixtures without rebuilding.
- Expected results:
  - Every fixture shows the same non-sensitive error/unavailable state.
  - No optional control flashes or previous valid state survives.
  - No non-loopback request occurs.
- Evidence:
  - Fixture, status category, screenshot, and sanitized host/path list.

### MA-111-06: Upload capability changes without hostname rebuild

- Purpose: Prove one allowlisted runtime capability changes with identical bundle bytes.
- Steps:
  1. Start `valid-disabled`, record `DIST_SHA256`, and confirm upload controls absent.
  2. Stop it.
  3. Start `valid-upload-enabled` against the same `client/dist` without rebuilding.
  4. Record `DIST_SHA256` and confirm upload controls present.
  5. Confirm recovery, Google, metrics, Issue #61, and calls remain disabled.
  6. Do not select a file or submit an upload.
  7. Stop it.
- Expected results:
  - Digests are equal.
  - Only upload rendering changes.
  - No upload/provider request or D2 mutation occurs.
- Evidence:
  - Fixture names, digest equality, screenshots, and sanitized host/path list.

### MA-111-07: Public API, Socket.IO, route, and identity contracts remain unchanged

- Purpose: Prevent target configuration from rewriting public contracts.
- Steps:
  1. Run `npm --prefix client test`.
  2. Run `npm --prefix server test`.
  3. Confirm boundary tests cover REST paths/payloads, Socket.IO event/auth payloads, room identifiers, public conversation IDs, route guards, and all disabled call controls.
  4. Inspect the immutable execution-tree changed-file list.
- Expected results:
  - Client and server tests exit `0`.
  - Existing payloads, event names, rooms, `Message.conversationId`, and public IDs remain unchanged.
  - No server controller, Socket.IO handler, message schema, or conversation schema changes.
  - A public-contract implementation change makes this case `BLOCKED` for scope review.
- Evidence:
  - Test summaries and immutable changed-file list.

### MA-111-08: Full local gate, candidate identity, and authorization remain intact

- Purpose: Prove the exact execution tree is green and remains pre-D2.
- Steps:
  1. Run `npm run test:ci` and `npm run ci:validate`.
  2. Run `npm run lint:ci`, client tests, server tests, and both acceptance-tooling suites.
  3. Run the isolated build, local Docker builds, server-image environment assertion, whitespace check, and Gitleaks scan.
  4. Review process/network evidence from all cases.
  5. Recompute the execution candidate from the pinned script:

```powershell
$CandidateStateAfter = python "$CandidateRoot/scripts/k6/issue111_candidate.py" `
  --repository $SourceWorktree `
  --source-base $SourceBase `
  --expected-tree $ExpectedExecutionTree | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $CandidateStateAfter.execution_tree -ne $ExpectedExecutionTree) {
  throw 'FAILED: execution-tree candidate changed during acceptance'
}
```

- Expected results:
  - Required commands exit `0`.
  - Lint meets the repository gate: zero errors and no more than 13 warnings.
  - Candidate tree remains exact.
  - Local images build without publication; server image contains no runtime `.env`.
  - No credential operation, registry pull/publication, Railway/provider mutation, live validation, rollback, or Issue #61 measurement occurs.
- Evidence:
  - Commands, exit codes, summaries, tree equality, immutable changed-file list, scan result, and `D2_MUTATIONS=0`.

## Evaluation record contract

The JSON must contain only the recorder allowlisted fields and exactly one result for each `MA-111-01` through `MA-111-08`. The artifact binding must contain:

- `guide_revision=k6-111-target-config-v5`;
- SHA-256 of the approved v5 guide file;
- `source_base=0a4e350dfd21d1dc979392f1bf2261ae66a4093e`;
- `candidate_tree=60edb5717b7dfc51b7be383b413eeef3f60c1264`.

The recorder recomputes the guide hash, verifies source-base and tree Git object types, checks exact binding equality, rejects duplicate run IDs, and rejects secret-bearing evidence patterns.

Append with:

```powershell
python "$CandidateRoot/scripts/record_evaluation.py" `
  --history "$SourceWorktree/.agents/manual-tests/k6-public-demo/issue-111-target-config-v5.evaluations.jsonl" `
  --evaluation <absolute-secret-safe-evaluation-json-path> `
  --repository $SourceWorktree `
  --guide "$SourceWorktree/.agents/manual-tests/k6-public-demo/issue-111-target-config-v5.md" `
  --guide-revision 'k6-111-target-config-v5' `
  --source-base $SourceBase `
  --candidate-tree $ExpectedExecutionTree
```

The first observation record uses `human_approval=pending`. If all cases pass while approval is pending, use `verdict=BLOCKED`. After explicit maintainer acceptance, append a new run ID with eight `PASS` results, `verdict=PASSED`, and `human_approval=approved`.

Do not edit earlier Evaluation records. Do not include secret-bearing fields or values.

## Evaluation rules

Do not execute until:

1. fresh external review approves exact v5 bytes with zero Critical/Major;
2. the maintainer approves exact v5 revision/hash;
3. the live execution projection equals the pinned execution tree.

- `PASSED`: eight cases pass, approved Evaluation append succeeds, and maintainer acceptance is explicit.
- `FAILED`: command failure, expected-result mismatch, candidate drift, fixture shutdown failure, scope breach, secret exposure, or forbidden mutation.
- `BLOCKED`: an approved local prerequisite or tool is unavailable. Missing provider access is not a blocker because provider use is forbidden.

Append every `FAILED` or `BLOCKED` run. Never rewrite history.

## Safe temporary cleanup

Perform cleanup after evidence is recorded. Verify both paths are inside the operating-system temporary directory and start with `k6-111-execution-` before deletion.

```powershell
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$ResolvedCandidateRoot = [IO.Path]::GetFullPath($CandidateRoot)
$ResolvedCandidateArchive = [IO.Path]::GetFullPath($CandidateArchive)
if (-not $ResolvedCandidateRoot.StartsWith($TempRoot) -or -not (Split-Path $ResolvedCandidateRoot -Leaf).StartsWith('k6-111-execution-')) {
  throw 'BLOCKED: unsafe candidate cleanup path'
}
if (-not $ResolvedCandidateArchive.StartsWith($TempRoot) -or -not (Split-Path $ResolvedCandidateArchive -Leaf).StartsWith('k6-111-execution-')) {
  throw 'BLOCKED: unsafe archive cleanup path'
}
Remove-Item -LiteralPath $ResolvedCandidateRoot -Recurse -Force
Remove-Item -LiteralPath $ResolvedCandidateArchive -Force
```

This is the final guide-remediation revision allowed by the approved execution plan. If its external review does not approve with zero Critical/Major, suspend Issue #111 instead of creating v6.
