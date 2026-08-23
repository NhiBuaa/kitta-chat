# Manual Test Guide: K6 Issue #111 — Target Configuration and Runtime Capabilities

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #111 — target configuration, runtime capability document, and Vite same-origin contract
- Authoritative specification: `.agents/manual-tests/k6-public-demo/issue-111-spec-snapshot.md`
- Specification snapshot SHA-256: `0d6127f8d166b0df3cd2177eb523932c4411128b7a208e58d8914b06e75dfbbb`
- Live issue: https://github.com/NhiBuaa/kitta-chat/issues/111
- Design: `docs/deployment/k6-public-demo-phase2-design.md` and `docs/adr/016-k6-public-demo-target-configuration-seam.md`
- Source base: `0a4e350dfd21d1dc979392f1bf2261ae66a4093e`
- Committed checkpoint: `13e65c11f040d0efa88b7805c93293a78c2eb97e`
- Branch: `nhibuaa/k6-issue-111-target-config`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111`
- Execution-tree candidate: `6f53a78d88137e0d8dd48aac91e0672d312c3d6f`
- Guide revision: `k6-111-target-config-v6`
- Writing mode: `strict`
- Lock status: candidate until external review and explicit maintainer approval
- Guide review: `issue-111-target-config-v6.guide-review.json`
- Guide approval: `issue-111-target-config-v6.approval.json`
- Evaluation history: `issue-111-target-config-v6.evaluations.jsonl`
- Run acceptance sidecar: `issue-111-target-config-v6.acceptance.json`; create only after the maintainer accepts the pending observation

Guide v5 and its Evaluation history are immutable historical evidence. Do not edit, replace, or
reinterpret them. V6 exists because implementation changed and v5 did not retain enough concrete
evidence for the direct-route, screenshot, digest, and request-inventory requirements.

## Scope and authorization boundary

Use this guide only for execution tree `6f53a78d88137e0d8dd48aac91e0672d312c3d6f`.
The candidate helper excludes only these mutable workflow artifacts:

- `.agents/current-session.md`;
- `.agents/next-session.md`;
- `docs/deployment/k6-public-demo-feature-delivery.md`;
- every file below `.agents/manual-tests/k6-public-demo/`.

All runtime source, tests, package files, Docker files, nginx files, CI policy, and acceptance
tooling remain part of the pinned execution tree.

This guide does not authorize or test:

- Issue #112 edge proxy or public-route behavior;
- Issue #113 backend startup wiring or synthetic-signup request enforcement;
- provider credentials or live provider compatibility;
- GHCR publication or image digests;
- Railway mutation, hostname allocation, secret binding, deployment, or rollback;
- final S3 CORS, provider-backed upload, public WebRTC media readiness, or Issue #61 measurement.

Required invariant: `D2_MUTATIONS=0`.

## Prerequisites

1. Work only in the exact branch/worktree and committed checkpoint in Metadata.
2. `git status --short` may show the known staged Issue #111 candidate and mutable v6 evidence only.
3. The v6 external guide review must be `APPROVE` with zero Critical/Major findings.
4. The maintainer must approve the exact v6 guide SHA-256 and execution tree before execution.
5. Node.js, npm, Python, Docker, and the pinned Gitleaks image must already be available locally.
6. Ports `4173` and `4174` must be free.
7. Use only loopback fixtures. Do not contact Railway, MongoDB Atlas, Upstash, CloudAMQP, AWS S3,
   Firebase, TURN, GHCR, or any external provider.
8. Do not read or print environment values. Do not include credentials, cookies, tokens, provider
   endpoints, generated hostnames, or raw environment output in evidence.
9. Create a fresh run evidence directory:

   `.agents/manual-tests/k6-public-demo/issue-111-target-config-v6-evidence/<run-id>/`

   It must not already exist. Keep only screenshots, deterministic command summaries, exact
   non-secret digests, response categories, and sanitized loopback host/path inventories.

## Stage A — Pin and materialize the candidate

Run from the source worktree:

```powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-111'
$SourceBase = '0a4e350dfd21d1dc979392f1bf2261ae66a4093e'
$ExpectedHead = '13e65c11f040d0efa88b7805c93293a78c2eb97e'
$ExpectedBranch = 'nhibuaa/k6-issue-111-target-config'
$ExpectedExecutionTree = '6f53a78d88137e0d8dd48aac91e0672d312c3d6f'

if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
if ((git rev-parse HEAD).Trim() -ne $ExpectedHead) { throw 'BLOCKED: unexpected checkpoint' }

$Nonce = [Guid]::NewGuid().ToString('N')
$CandidateArchive = Join-Path ([IO.Path]::GetTempPath()) "k6-111-v6-$Nonce.zip"
$CandidateRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-111-v6-$Nonce"
if ((Test-Path $CandidateArchive) -or (Test-Path $CandidateRoot)) {
  throw 'BLOCKED: candidate path collision'
}

$CandidateState = python scripts/k6/issue111_candidate.py `
  --repository $SourceWorktree `
  --source-base $SourceBase `
  --expected-tree $ExpectedExecutionTree `
  --archive $CandidateArchive | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $CandidateState.execution_tree -ne $ExpectedExecutionTree) {
  throw 'BLOCKED: candidate identity mismatch'
}
Expand-Archive -LiteralPath $CandidateArchive -DestinationPath $CandidateRoot
```

Record only the four Git identities and command exit code. Do not record environment values.

Reject any runtime environment file in the archive, sanitize the dedicated shell, and install only
from pinned lockfiles. Do not copy `node_modules` or environment files from the source worktree:

```powershell
$RuntimeEnvFiles = Get-ChildItem -LiteralPath $CandidateRoot -Recurse -Force -File |
  Where-Object {
    $_.Name -eq '.env' -or
    $_.Name -in @('.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.env.test', '.env.test.local')
  }
if ($RuntimeEnvFiles) { throw 'FAILED: candidate contains a runtime environment file' }

Get-ChildItem Env: |
  Where-Object Name -Match '(?i)(VITE_|MONGO|REDIS|RABBIT|AWS_|FIREBASE|JWT|TOKEN|SECRET|PASSWORD|CREDENTIAL|CORS|URL_FRONTEND|BACKEND_UPSTREAM)' |
  ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }

Push-Location $CandidateRoot
try {
  npm ci
  npm --prefix client ci
  npm --prefix server ci
} finally {
  Pop-Location
}

$ExecutionPathspec = @(
  '.',
  ':(exclude).agents/current-session.md',
  ':(exclude).agents/next-session.md',
  ':(exclude).agents/manual-tests/k6-public-demo/**',
  ':(exclude)docs/deployment/k6-public-demo-feature-delivery.md'
)
```

Dependency installation failure is `BLOCKED`. Never print removed environment values.

## Stage B — Deterministic automated gate

Run against `$CandidateRoot`:

```powershell
Push-Location $CandidateRoot
try {
  npm --prefix client run test:k6-target-config
  python -m unittest discover -s scripts/test/k6 -p 'test_*.py'
  python -m unittest discover -s scripts/test/manual_acceptance -p 'test_*.py'
  npm run test:ci
  npm run ci:validate
  npm run lint:ci
  npm --prefix client test
  npm --prefix client run build
  npm --prefix server test
} finally {
  Pop-Location
}

git -C $SourceWorktree diff --name-only $SourceBase $ExpectedExecutionTree -- $ExecutionPathspec
git -C $SourceWorktree diff --check $SourceBase $ExpectedExecutionTree -- $ExecutionPathspec
```

Required:

- target/build contract: `60/60`;
- candidate helper: `3/3`;
- Evaluation recorder: `14/14`;
- every broader suite passes;
- lint has zero errors;
- no whitespace error.

Run local image checks only:

```powershell
docker build --target prod --tag kittachat-k6-111-v6-server:local "$CandidateRoot/server"
docker build --build-arg VITE_TARGET=public-demo --tag kittachat-k6-111-v6-edge:local --file "$CandidateRoot/nginx/Dockerfile" $CandidateRoot
docker run --rm --entrypoint sh kittachat-k6-111-v6-server:local -c 'test ! -e /app/.env && test ! -e /app/.env.local && test ! -e /app/.env.production && test ! -e /app/.env.production.local'
```

Run the cached, no-pull secret scan:

```powershell
$GitleaksImage = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
docker image inspect $GitleaksImage | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: pinned Gitleaks image missing' }

git -C $SourceWorktree diff --binary $SourceBase $ExpectedExecutionTree -- $ExecutionPathspec |
  docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" `
    $GitleaksImage detect --pipe --config /repo/.gitleaks.toml `
    --redact=100 --no-banner --no-color --log-level warn
```

Every command must exit `0`. A missing cached scanner is `BLOCKED`, not PASS.

## Stage C — Browser and retained-evidence procedure

Run Stage C commands from `$CandidateRoot`. Write retained evidence only below the v6 evidence
directory in `$SourceWorktree`.

### C1. Ordinary local target

1. Build without `VITE_TARGET`:

   `npm --prefix client run build`

2. Start the `malformed` fixture on `4173`.
3. Open `http://127.0.0.1:4173/login`.
4. Confirm the ordinary local application reaches login and does not render
   `data-runtime-config-state="error"` even though the served runtime document is malformed.
5. Save a screenshot as `ma111-02-legacy-local.png`.
6. Stop the fixture.

### C2. Public-demo fixtures

1. Run `npm --prefix client run test:k6-target-config`. This leaves the validated public-demo
   artifact in `client/dist`.
2. Start only one fixture at a time:

   `npm --prefix client run demo:k6-target-config -- --fixture <fixture> --port 4173`

3. Open each route in a fresh tab or clean context.
4. Stop the fixture and verify port release before starting the next fixture.
5. Never leave a preview process running after the case.

For browser network evidence, retain only:

- scheme category `http-loopback`;
- host `127.0.0.1`;
- port `4173`;
- request path;
- method;
- response category such as `2xx-static`, `2xx-config`, `4xx-local-api`, or `4xx-missing`.

Do not retain headers, cookies, bodies, query values, or raw console/environment output.

## Locked Test Cases

### MA-111-01: Server target authority rejects unsafe bindings

- Purpose: prove exact target identity, public origin, private upstream, capability, and worker
  dependency contracts fail closed.
- Steps:
  1. Run the 60-case focused target/build suite.
  2. Confirm loopback public origins fail even when target and authority repeat them.
  3. Confirm synthetic `.internal.test` values require an own boolean `true` test authority.
  4. Confirm `selfSignup` and `seededDemoAccounts` cannot be false.
  5. Confirm incomplete or over-privileged worker bindings fail.
- Expected:
  - no fallback origin or upstream;
  - trusted Railway-style private upstream remains accepted only through exact authority;
  - every negative case remains invalid.
- Evidence:
  - focused command exit and `60/60` summary;
  - sanitized list of rejected categories, without endpoint values.

### MA-111-02: Legacy local bootstrap remains usable; public-demo loading remains fail-closed

- Purpose: prevent the public-demo seam from breaking ordinary local Vite/Compose behavior.
- Steps:
  1. Execute C1 and capture `ma111-02-legacy-local.png`.
  2. Confirm the provider-level integration test reaches the application for the absent target.
  3. Rebuild the public-demo artifact and start `valid-disabled`.
  4. Confirm loading hides application controls until a valid document reaches ready.
- Expected:
  - ordinary local target reaches login without fetching public-demo configuration;
  - explicit public-demo target loads the same-origin document and fails closed until ready;
  - unknown targets produce the safe error state.
- Evidence:
  - screenshot file path and SHA-256;
  - provider test name and exit code;
  - sanitized loopback request inventory.

### MA-111-03: Public-demo build is same-origin and secret-safe

- Purpose: prove only approved relative paths enter the public-demo artifact.
- Steps:
  1. Run the actual legacy, rejected, and valid build matrix.
  2. Confirm a `VITE_DEFAULT_AVATAR` value containing the forbidden sentinel rejects the real build.
  3. Confirm recursive artifact scan finds no sentinel or D2-only binding.
  4. Run the pinned no-pull Gitleaks scan.
- Expected:
  - rejected build fails for the expected contract reason;
  - no artifact contains the forbidden value, generated/provider host patterns, D2 binding keys,
    loopback backend origins, or GHCR deployment references;
  - Gitleaks exits `0` with no finding.
- Evidence:
  - command exits, build summaries, artifact-inventory result, and redacted scan result.

### MA-111-04: Disabled controls and direct routes are browser-observable

- Purpose: prove disabled controls do not flash and direct routes fail closed.
- Steps:
  1. Start `valid-disabled`.
  2. Open `/login` with first-load throttling; capture loading and ready screenshots.
  3. Open `/forgot-password`, `/reset-password/demo-id`, and `/call/demo-user` directly in the
     browser address bar or by a real browser link, not only through an automated router test.
  4. Open the authenticated-chat fixture and inspect call/upload controls.
  5. Capture `ma111-04-disabled-call-route.png` and `ma111-04-disabled-chat.png`.
  6. Save the sanitized request inventory; stop the fixture.
- Expected:
  - no Google, recovery, upload, call-history, audio/video, profile-call, or recall control flashes;
  - every disabled route shows the same non-sensitive unavailable state;
  - no upload, recovery, provider, or call request is issued.
- Evidence:
  - screenshot paths and SHA-256 values;
  - route text observation;
  - sanitized host/path/method/response-category inventory.

### MA-111-05: Missing and incompatible runtime documents converge on one safe state

- Purpose: prove unavailable, malformed, old, future, and wrong-target documents never retain a
  previous ready capability.
- Steps:
  1. Run `missing`, `malformed`, `old-version`, `future-version`, and `wrong-target` separately.
  2. For each fixture, open `/login` and `/call/demo-user` in a clean context.
  3. Record only response category and visible safe state.
  4. Capture at least one screenshot per distinct visible state; identical states may share one
     screenshot only when the manifest lists all fixtures bound to it.
- Expected:
  - every fixture produces the same safe unavailable UI;
  - no provider detail, response body, previous capability, or dead control appears.
- Evidence:
  - screenshot paths/digests;
  - fixture-to-response-category matrix;
  - sanitized request inventory.

### MA-111-06: Upload capability changes at runtime without rebuilding

- Purpose: prove optional upload activation is runtime-only while fixed-disabled capabilities stay
  disabled.
- Steps:
  1. Start `valid-disabled`; record the printed `DIST_SHA256` and capture
     `ma111-06-upload-disabled.png`.
  2. Stop it, then start `valid-upload-enabled` from the same `client/dist`; record
     `DIST_SHA256` and capture `ma111-06-upload-enabled.png`.
  3. Confirm the two exact digest values are identical.
  4. Confirm recovery, Google login, metrics export, Issue #61 measurement, and calls remain false.
  5. Do not select a file or issue an upload request.
- Expected:
  - upload controls appear only in the enabled fixture;
  - exact digest pair is equal without rebuild;
  - fixed-disabled capabilities stay absent.
- Evidence:
  - both exact digest values;
  - both screenshot paths/digests;
  - sanitized request inventory proving no upload request.

### MA-111-07: Existing public API/socket/conversation contracts remain unchanged

- Purpose: protect existing REST, Socket.IO, auth payload, and conversation identity contracts.
- Steps:
  1. Run full client and server suites.
  2. Run the public-contract preservation tests.
  3. Inspect changed-file inventory for controller, Socket.IO handler, message schema, or
     conversation schema changes.
- Expected:
  - all tests pass;
  - request/response and socket payload shapes remain unchanged;
  - `Message.conversationId` remains the public bridge.
- Evidence:
  - exact suite counts/exits and changed-file inventory summary.

### MA-111-08: Evidence, approval transition, and pre-D2 boundary are intact

- Purpose: prove the complete candidate, evidence package, and human-required transition are
  reproducible and secret-safe.
- Steps:
  1. Run every Stage B gate, both Docker builds, image environment assertion, diff check, and
     no-pull scan.
  2. Confirm candidate helper still returns `6f53a78d88137e0d8dd48aac91e0672d312c3d6f`.
  3. Create one evidence manifest listing command exits, screenshot paths/digests, exact dist
     digest pair, fixture response categories, and sanitized request inventories.
  4. Run recorder tests proving the first `PASSED` append is rejected, top-level secret-bearing
     fields are rejected, and approval-file mutation is rejected.
  5. Confirm no provider/registry/Railway mutation occurred.
- Expected:
  - all required gates pass;
  - evidence references resolve and contain no secret/provider detail;
  - `D2_MUTATIONS=0`;
  - a pending observation is required before human acceptance can create a `PASSED` record.
- Evidence:
  - evidence manifest path and SHA-256;
  - command exits;
  - recorder `14/14`;
  - final candidate identity.

## Evaluation procedure

Return to `$SourceWorktree` before running the recorder commands below.

1. Create a v6 schema-version-2 observation with:

   - a fresh run ID;
   - `accepted_run_id: null`;
   - `approval_sha256: null`;
   - eight exact case IDs;
   - concrete evidence-manifest/screenshot/digest references;
   - `verdict: BLOCKED` and `human_approval: pending` when all observations pass but maintainer
     acceptance has not yet occurred.

2. Append it without an acceptance sidecar:

```powershell
python scripts/record_evaluation.py `
  --history .agents/manual-tests/k6-public-demo/issue-111-target-config-v6.evaluations.jsonl `
  --evaluation <absolute-observation-json> `
  --repository . `
  --guide .agents/manual-tests/k6-public-demo/issue-111-target-config-v6.md `
  --guide-revision k6-111-target-config-v6 `
  --source-base 0a4e350dfd21d1dc979392f1bf2261ae66a4093e `
  --candidate-tree 6f53a78d88137e0d8dd48aac91e0672d312c3d6f
```

3. Stop and request explicit maintainer acceptance of that exact observation run.
4. Only after acceptance, create `issue-111-target-config-v6.acceptance.json` with the exact guide,
   source, tree, accepted pending run ID, approval time, maintainer identity, safe approval
   reference, and `human_approval=approved`.
5. Create a new schema-version-2 `PASSED/approved` run whose `test_results` are byte-for-byte
   equivalent as JSON values to the accepted pending observation. Set `accepted_run_id` to the
   pending run and `approval_sha256` to the lowercase SHA-256 of the acceptance sidecar.
6. Append it with:

```powershell
python scripts/record_evaluation.py `
  --history .agents/manual-tests/k6-public-demo/issue-111-target-config-v6.evaluations.jsonl `
  --evaluation <absolute-approved-json> `
  --acceptance-approval .agents/manual-tests/k6-public-demo/issue-111-target-config-v6.acceptance.json `
  --repository . `
  --guide .agents/manual-tests/k6-public-demo/issue-111-target-config-v6.md `
  --guide-revision k6-111-target-config-v6 `
  --source-base 0a4e350dfd21d1dc979392f1bf2261ae66a4093e `
  --candidate-tree 6f53a78d88137e0d8dd48aac91e0672d312c3d6f
```

Never edit or delete an existing Evaluation line.

## Stop and cleanup

1. Stop every preview process and verify ports `4173`/`4174` are free.
2. Verify the source execution tree still equals `6f53a78d88137e0d8dd48aac91e0672d312c3d6f`.
3. Keep the v6 evidence directory and Evaluation history.
4. Remove only the unique candidate temp directory/archive created by this run after verifying
   their resolved paths are below the OS temporary directory.
5. Keep local Docker images until the Issue #111 acceptance checkpoint is complete.
6. If any required case fails or cannot run, append `FAILED` or `BLOCKED` truthfully and stop.
7. Do not commit, push, open a PR, deploy, publish, bind credentials, or mutate D2.

This guide becomes immutable only after external review and explicit maintainer approval. Any
semantic change requires v7; never edit an approved v6 guide.
