# Manual Test Guide: K6 Issue #113 — Backend Capability and Synthetic Identity Gates

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #113
- Specification: `.agents/manual-tests/k6-public-demo/issue-113-spec-snapshot.md`
- Specification SHA-256: `3cff33389d6566c4ee725970937618b18a527cc726685fa17f7404f3c0ed6a18`
- Ticket review: `.agents/manual-tests/k6-public-demo/issue-113-ticket-review.json`
- Ticket review SHA-256: `58c4876fd1e48e21885841dadae286efd47bbe7370555c27af6bbbc458916a69`
- Source base: `1b70741b4512e5cc727224a788477d87fa1e67be`
- Branch: `nhibuaa/k6-issue-113-capability-gates`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-113`
- Guide revision: `k6-113-capability-gates-v3`
- Prior guides: `k6-113-capability-gates-v1` and `k6-113-capability-gates-v2` received `REQUEST_CHANGES`; both remain immutable and are not approved or executable
- Lock status: candidate until external guide review and maintainer approval
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-113-capability-gates-v3.evaluations.jsonl`

## Authorization boundary

This guide uses a staged local candidate, loopback HTTP/Socket.IO, synthetic `.test` data, and
in-memory adapters. It MUST NOT read or create a provider credential. It MUST NOT contact Railway,
Atlas, Upstash, CloudAMQP, AWS, Firebase, GHCR, or TURN. It MUST NOT deploy, publish, bind, roll back,
or enable Issue #61 measurement.

Required result: `D2_MUTATIONS=0`.

This guide is not a code review. No post-implementation code review runs for Issue #113. The single
whole-K6 code review remains deferred until Issues #111–#118 are integrated and locally accepted.

## Candidate identity and isolated execution

Before execution, stage every Issue #113 runtime source and automated test file. Do not stage
unrelated work. The existing candidate helper excludes K6 manual-test and mutable workflow files
from the executable tree.

```powershell
$ErrorActionPreference = 'Stop'
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-113'
$SourceBase = '1b70741b4512e5cc727224a788477d87fa1e67be'
$ExpectedBranch = 'nhibuaa/k6-issue-113-capability-gates'

if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }

$CandidateState = python scripts/k6/issue111_candidate.py `
  --repository $SourceWorktree `
  --source-base $SourceBase | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
$CandidateTree = $CandidateState.execution_tree
$CommandEvidence = [Collections.Generic.List[object]]::new()

function Invoke-K6Command {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][ValidateSet('BLOCKED', 'FAILED')][string]$FailureClass,
    [Parameter(Mandatory)][string]$WorkingDirectory,
    [Parameter(Mandatory)][scriptblock]$Command
  )

  $PreviousLocation = Get-Location
  $ExitCode = -1
  $CommandThrew = $false
  try {
    Set-Location -LiteralPath $WorkingDirectory
    & $Command
    $ExitCode = [int]$LASTEXITCODE
  } catch {
    $CommandThrew = $true
  } finally {
    Set-Location -LiteralPath $PreviousLocation
  }
  $CommandEvidence.Add([pscustomobject]@{ name = $Name; exitCode = $ExitCode })
  if ($CommandThrew) { throw "$FailureClass`: $Name threw before a native exit code was available" }
  if ($ExitCode -ne 0) { throw "$FailureClass`: $Name exited $ExitCode" }
}

$Nonce = [Guid]::NewGuid().ToString('N')
$CandidateArchive = Join-Path ([IO.Path]::GetTempPath()) "k6-113-v3-$Nonce.zip"
$CandidateRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-113-v3-$Nonce"
$SourceBaseArchive = Join-Path ([IO.Path]::GetTempPath()) "k6-113-source-$Nonce.zip"
$SourceBaseRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-113-source-$Nonce"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-113-capability-gates-v3-evidence\$Nonce"
$CollisionPaths = @($CandidateArchive, $CandidateRoot, $SourceBaseArchive, $SourceBaseRoot, $EvidenceRoot)
if ($CollisionPaths | Where-Object { Test-Path -LiteralPath $_ }) {
  throw 'BLOCKED: candidate, source-base, or evidence path collision'
}

Invoke-K6Command -Name 'candidate-archive' -FailureClass BLOCKED -WorkingDirectory $SourceWorktree -Command {
  python scripts/k6/issue111_candidate.py `
    --repository $SourceWorktree `
    --source-base $SourceBase `
    --expected-tree $CandidateTree `
    --archive $CandidateArchive | Out-Null
}
Invoke-K6Command -Name 'source-base-archive' -FailureClass BLOCKED -WorkingDirectory $SourceWorktree -Command {
  git archive --format=zip --output=$SourceBaseArchive $SourceBase
}
Expand-Archive -LiteralPath $CandidateArchive -DestinationPath $CandidateRoot
Expand-Archive -LiteralPath $SourceBaseArchive -DestinationPath $SourceBaseRoot
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$SourceBaseTree = (git -C $SourceWorktree rev-parse "$SourceBase^{tree}").Trim()
if ($LASTEXITCODE -ne 0 -or -not $SourceBaseTree) { throw 'BLOCKED: source-base tree unresolved' }
```

Reject runtime environment files. Remove inherited deployment/provider values from the child shell
without printing them:

```powershell
$RuntimeEnvFiles = Get-ChildItem -LiteralPath $CandidateRoot -Recurse -Force -File |
  Where-Object {
    ($_.Name -eq '.env' -or $_.Name -like '.env.*') -and
    $_.Name -notlike '*.example'
  }
if ($RuntimeEnvFiles) { throw 'FAILED: candidate contains a runtime environment file' }

Get-ChildItem Env: |
  Where-Object Name -Match '(?i)(MONGO|REDIS|RABBIT|AWS_|FIREBASE|JWT|TOKEN|SECRET|PASSWORD|CREDENTIAL|CORS|URL_FRONTEND|BACKEND_UPSTREAM|RAILWAY|VITE_)' |
  ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }

foreach ($Root in @($CandidateRoot, $SourceBaseRoot)) {
  $Label = if ($Root -eq $CandidateRoot) { 'candidate' } else { 'source-base' }
  Invoke-K6Command -Name "$Label-root-npm-ci" -FailureClass BLOCKED -WorkingDirectory $Root -Command { npm ci }
  Invoke-K6Command -Name "$Label-client-npm-ci" -FailureClass BLOCKED -WorkingDirectory $Root -Command { npm --prefix client ci }
  Invoke-K6Command -Name "$Label-server-npm-ci" -FailureClass BLOCKED -WorkingDirectory $Root -Command { npm --prefix server ci }
}
```

Dependency installation failure is `BLOCKED`. Do not print removed values.

## Required implementation commands and observation schema

The candidate MUST provide:

```powershell
npm run test:k6-capability-gates
npm run oracle:k6-capability-gates -- --source-base-root <absolute-path> --candidate-root <absolute-path> --output <absolute-json-path>
npm run accept:k6-capability-gates -- --scenario <scenario> --port 4184 --output <absolute-json-path>
```

Supported one-shot scenarios are `env-matrix`, `disabled-auth`, `disabled-upload`,
`calls-disabled`, `calls-enabled`, `synthetic-signup`, `legacy-contract`, and `limiter-contract`.
Unknown scenarios MUST fail before a listener starts.

Execute the immutable source-base oracle and every scenario from the candidate root with exact paths:

```powershell
$OracleOutput = Join-Path $EvidenceRoot 'contract-oracle.json'
Invoke-K6Command -Name 'source-base-contract-oracle' -FailureClass FAILED -WorkingDirectory $CandidateRoot -Command {
  npm run oracle:k6-capability-gates -- `
    --source-base-root $SourceBaseRoot `
    --candidate-root $CandidateRoot `
    --source-base $SourceBase `
    --source-base-tree $SourceBaseTree `
    --output $OracleOutput
}

$Scenarios = @('env-matrix', 'disabled-auth', 'disabled-upload', 'calls-disabled',
  'calls-enabled', 'synthetic-signup', 'legacy-contract', 'limiter-contract')
foreach ($Scenario in $Scenarios) {
  $ScenarioOutput = Join-Path $EvidenceRoot "$Scenario.json"
  Invoke-K6Command -Name "scenario-$Scenario" -FailureClass FAILED -WorkingDirectory $CandidateRoot -Command {
    npm run accept:k6-capability-gates -- --scenario $Scenario --port 4184 --output $ScenarioOutput
  }
}
```

For each invocation, `accept:k6-capability-gates` MUST bind `127.0.0.1:4184`, wait for a test-owned
readiness signal, reset all test counters before each Test Case and again before every synthetic
identity row, run the complete scenario, write one sanitized JSON file, stop in a `finally`/signal
trap, and verify port release. It MUST use only in-memory User, provider,
queue, S3, Socket.IO, and limiter adapters. Synthetic authentication MUST come from a test-owned
principal fixture. No raw cookie or token may enter evidence.

Each observation JSON MUST contain only:

```text
schemaVersion=1
scenario
candidateTree
commands[].name + exitCode
http[].method + pathTemplate + status + success + errorCode + messageEqual + requestIdMatched + retryAfter
socket[].inputEvent + outputEvent + payloadShape + reasonEqual
identity[].inputId + normalizedCategory + persistedIdentity + responseClass + sideEffectDelta.find + sideEffectDelta.normalizedQuery + sideEffectDelta.hash + sideEffectDelta.save + sideEffectDelta.session + sideEffectDelta.limiter + sideEffectDelta.queue + sideEffectDelta.provider
recipientChecks[].service + actualKeyNames + expectedKeyNames + exactMatch
policyChecks[].policyId + actualTuple + expectedTuple + exactMatch
operationPolicyChecks[].operation + actualPolicyIds + expectedPolicyIds + exactMatch
contractChecks[].seam + actualShape + expectedShape + exactMatch
sourceBaseOracle.sourceBase + sourceBaseTree + sourceObservationSha256 + candidateObservationSha256 + exactMatch
sideEffects.limiter + controller + provider + database + queue + s3 + bodyProcessing + signaling + history + session
externalProviderRequestCount
providerMutationCount
cleanup.portReleased + cleanup.processCount
```

`inputId` is a safe row identifier from the identity table below, not the email value. The file MUST
NOT contain passwords, raw bodies, email values beyond the two approved normalized `.test` outputs,
cookies, tokens, connection strings, environment values, provider endpoints, or raw logs. The runner
records observations. It does not author Test Case PASS/FAIL.

## Exact disabled response and gate ordering

Every disabled HTTP route MUST return status `404` with exactly these top-level keys:

```json
{
  "success": false,
  "error": {
    "code": "CAPABILITY_DISABLED",
    "message": "Feature unavailable"
  },
  "message": "Feature unavailable",
  "requestId": "<matching safe request ID>"
}
```

The `error` object MUST contain only `code` and `message`. `requestIdMatched` MUST be true. Before
that response, all scenario counters MUST be zero: limiter, controller, provider, database, queue,
S3, body processing, signaling, history, and session.

Disabled call socket events MUST emit existing event `callRejected` with exact payload shape
`{ "reason": "Call feature unavailable" }`. All counters MUST remain zero.

Exact disabled HTTP inventory:

- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password/:id`
- `POST /api/auth/google`
- `POST /api/files/init`
- `POST /api/files/get-presigned-url`
- `POST /api/files/complete`
- `POST /api/files/upload-single`
- `GET /api/calls/history`
- `GET /api/calls/missed`
- `POST /api/calls/:id/read`
- `POST /api/calls/read-all`

Exact disabled socket inventory: `initCall`, `callUser`, `answerCall`, `endCall`, `rejectCall`, and
`toggleMedia`.

`POST /api/files/:fileId/download-url` is not an upload gate. This guide records it as delegated to
Issue #114 and does not claim its provider behavior.

## Exact K6-managed recipient matrix

The validator MUST compare an explicit K6 binding manifest. It MUST NOT reject unrelated platform
process variables. For each recipient, sort key names and require exact equality with this matrix.

### Backend

```text
AUTH_COOKIE_SECURE
AWS_ACCESS_KEY_ID
AWS_REGION
AWS_S3_BUCKET_NAME
AWS_SECRET_ACCESS_KEY
CALL_DISTRIBUTED_TIMEOUT_ENABLED
CALL_DISTRIBUTED_TIMEOUT_POLL_MS
CONVERSATION_DUAL_WRITE_ENABLED
CONVERSATION_PANEL_ENABLED
CONVERSATION_PANEL_RATE_LIMIT
CONVERSATION_PANEL_RESOURCES_ENABLED
CONVERSATION_SHADOW_COMPARE_ENABLED
CONVERSATION_SIDEBAR_READ_MODEL_ENABLED
CORS_ALLOWED_ORIGINS
DEFAULT_AVATAR
JWT_SECRET
K6_CAPABILITY_CALLS
K6_CAPABILITY_GOOGLE_LOGIN
K6_CAPABILITY_ISSUE61_MEASUREMENT
K6_CAPABILITY_RECOVERY
K6_CAPABILITY_UPLOAD
K6_SYNTHETIC_SIGNUP_ONLY
K6_TARGET
METRICS_ENABLED
MONGO_URI
NODE_ENV
NODE_NAME
PORT
RABBITMQ_MAX_ATTEMPTS
RABBITMQ_RETRY_DELAY_MS
RABBITMQ_URL
RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS
RABBITMQ_WORKER_RECONNECT_DELAY_MS
REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES
REDIS_URL
REFRESH_TOKEN_SECRET
URL_FRONTEND
```

### Image worker

```text
AWS_ACCESS_KEY_ID
AWS_REGION
AWS_S3_BUCKET_NAME
AWS_SECRET_ACCESS_KEY
IMAGE_WORKER_CONCURRENCY
MONGO_URI
NODE_ENV
NODE_NAME
RABBITMQ_MAX_ATTEMPTS
RABBITMQ_RETRY_DELAY_MS
RABBITMQ_URL
RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS
RABBITMQ_WORKER_RECONNECT_DELAY_MS
REDIS_URL
```

### Audit worker

```text
AUDIT_WORKER_CONCURRENCY
NODE_ENV
NODE_NAME
RABBITMQ_MAX_ATTEMPTS
RABBITMQ_RETRY_DELAY_MS
RABBITMQ_URL
RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS
RABBITMQ_WORKER_RECONNECT_DELAY_MS
```

### Edge runtime, edge build, notification worker, and one-off seed

```text
edge runtime: BACKEND_UPSTREAM, K6_CAPABILITY_CALLS, K6_CAPABILITY_GOOGLE_LOGIN,
K6_CAPABILITY_ISSUE61_MEASUREMENT, K6_CAPABILITY_RECOVERY, K6_CAPABILITY_UPLOAD,
K6_RUNTIME_CONFIG_FILE, K6_TARGET

edge build external bindings: VITE_TARGET, VITE_API_URL, VITE_API_URL_AUTH, VITE_API_URL_CALLS,
VITE_API_URL_FILES, VITE_API_URL_GROUPS, VITE_API_URL_MESSAGES, VITE_API_URL_USERS

notification worker: <empty>

one-off seed: ALLOW_REMOTE_DEMO_SEED, DEMO_SEED_PASSWORD, MONGO_URI
```

The tests MUST also verify fixed literals without recording secret values: production environment,
port `3000`, secure cookies true, metrics and migration/read-model flags false, panel rate `30`,
call timeout disabled with poll `1000`, RabbitMQ attempts `3`, retry `30000`, reconnect `1000` and
max `30000`, worker concurrency `2`/`10`, K6 fixed capability values, empty Redis cluster roots,
AWS region `ap-southeast-1`, and the approved bucket name. `CLOUDFRONT_URL` is forbidden/unset.
For edge build, `VITE_TARGET` MUST equal `public-demo`; the seven API values MUST equal the accepted
same-origin paths from #111. `VITE_DEFAULT_AVATAR` is not an accepted external binding. Its Docker
ARG/ENV may exist only as an internal empty default, and any non-empty value MUST fail the build
contract before Vite runs.

## Exact synthetic identity table

Every row MUST run through direct HTTP. Rows `V01`, `V02`, `R01`, `R08`, and `R25` MUST also run
through the SPA-shape submission adapter. Before each row, reset the test-owned counters; after the
row, record its individual find, normalized-query, hash, save, session, limiter, queue, and provider
deltas. Rejected rows return the existing registration validation status `400` and require every
per-row delta to be zero.

| ID | Input representation | Expected result |
| --- | --- | --- |
| V01 | `Visitor@KittaChat.Test` | accept; persist `visitor@kittachat.test` |
| V02 | `visitor@team.kittachat.test` | accept unchanged |
| R01 | missing field | reject required-field path |
| R02 | JSON `null` | reject type/format path |
| R03 | JSON number `42` | reject type/format path |
| R04 | ` visitor@kittachat.test` | reject leading whitespace |
| R05 | `visitor@kittachat.test ` | reject trailing whitespace |
| R06 | `visitor @kittachat.test` | reject internal whitespace |
| R07 | `visitor\u0009@kittachat.test` | reject ASCII control tab |
| R08 | `visitor\u200B@kittachat.test` | reject Unicode format character |
| R09 | `visitor@kittachat\u3002test` | reject ideographic full stop |
| R10 | `visitor@kittachat\uFF0Etest` | reject fullwidth full stop |
| R11 | `visitorkittachat.test` | reject missing `@` |
| R12 | `visitor@@kittachat.test` | reject multiple `@` |
| R13 | `@kittachat.test` | reject empty local part |
| R14 | `visitor@test` | reject missing label before `test` |
| R15 | `visitor@.test` | reject empty domain label |
| R16 | `visitor@kittachat..test` | reject empty interior label |
| R17 | `visitor@-kittachat.test` | reject leading label hyphen |
| R18 | `visitor@kittachat-.test` | reject trailing label hyphen |
| R19 | `visitor@kittachat.test.` | reject trailing dot |
| R20 | `visitor@example.com` | reject public domain |
| R21 | `visitor@kittachat.test.evil` | reject suffix confusion |
| R22 | `visitor@kittachattest` | reject substring confusion |
| R23 | `visitor@test.evil` | reject non-final `test` |
| R24 | `visitor@*.test` | reject wildcard label |
| R25 | `visitor:opaque@kittachat.test` | reject userinfo-like local-part syntax |

Do not retain rejected email strings in the observation file. Retain only row ID, status, rejection
class, and the per-row side-effect deltas. Accepted rows may retain only the two approved normalized
`.test` outputs.

## Exact public-contract and rate-limit oracles

The exact source base is an immutable oracle, not a prose expectation. `oracle:k6-capability-gates`
MUST launch separate child processes rooted at `$SourceBaseRoot` and `$CandidateRoot`, each with only
test-owned environment and in-memory adapters. It MUST execute the same fixture inventory against
both roots and compare sanitized shapes. The source archive is bound to `$SourceBase` and
`$SourceBaseTree`; a root/tree mismatch is `BLOCKED`.

Required contract-check IDs are:

- `auth.register.response-keys`: `success`, `message`, `token`, `user`;
- `auth.login.response-keys`: `success`, `message`, `token`, `user`;
- `auth.refresh.cookie-presence-attributes` and `auth.request-id-field`, retaining names/presence only;
- one check for each call input event `initCall`, `callUser`, `answerCall`, `endCall`, `rejectCall`,
  and `toggleMedia`, including output event names, payload keys, ACK keys, target room class,
  authorization outcome class, and public call/conversation identifier keys;
- `call.history.response-identifiers` for every HTTP history route;
- `file.private-download.delegation` for route/auth/rate-limit shape only, without S3 behavior.

Every check MUST record `actualShape`, source-base `expectedShape`, and `exactMatch`. Token, cookie,
request-ID, room-ID, and public-ID values are forbidden; only presence, key names, safe type names,
and equality booleans may be retained. The oracle output records SHA-256 digests of the two sanitized
child observations and requires every check to match.

The `calls-enabled` scenario MUST run the same call fixtures. The `legacy-contract` scenario MUST
run explicit synthetic-only false registration/login and require exact equality with the isolated
source-base observation. A source-base child that cannot execute makes the case `BLOCKED`.

Policy tuples MUST equal:

| Policy ID | Algorithm | Limit | Window ms | Capacity | Scope |
| --- | --- | ---: | ---: | ---: | --- |
| `auth_entry.aggregate` | sliding_window | 20 | 900000 | n/a | network |
| `auth_entry.login` | sliding_window | 10 | 900000 | n/a | network |
| `auth_entry.register` | sliding_window | 5 | 3600000 | n/a | network |
| `auth_entry.google` | sliding_window | 10 | 900000 | n/a | network |
| `auth_recovery_request` | sliding_window | 5 | 3600000 | n/a | network |
| `auth_recovery_complete` | sliding_window | 10 | 900000 | n/a | network |
| `auth_refresh.stage_a` | token_bucket | 60 | 60000 | 10 | network |
| `auth_refresh.stage_b` | token_bucket | 20 | 60000 | 5 | subject |
| `file_resource.aggregate` | token_bucket | 300 | 3600000 | 50 | user |
| `file_resource.upload_control` | token_bucket | 30 | 3600000 | 10 | user |
| `file_resource.part_presign` | token_bucket | 240 | 3600000 | 40 | user |
| `file_resource.download_signing` | token_bucket | 120 | 3600000 | 30 | user |
| `call_initiation` | sliding_window | 10 | 60000 | n/a | socket_user |
| `read_expensive.aggregate` | token_bucket | 240 | 60000 | 60 | user |
| `read_expensive.call_history` | token_bucket | 30 | 60000 | 10 | user |
| `state_mutation.aggregate` | token_bucket | 120 | 60000 | 30 | user |
| `state_mutation.call_history` | token_bucket | 120 | 60000 | 30 | user |

Operation membership MUST equal:

| Operation | Required policy IDs in order |
| --- | --- |
| `POST /api/auth/login` | `auth_entry.aggregate`, `auth_entry.login` |
| `POST /api/auth/register` | `auth_entry.aggregate`, `auth_entry.register` |
| `POST /api/auth/google` | `auth_entry.aggregate`, `auth_entry.google` |
| `POST /api/auth/forgot-password` | `auth_recovery_request` |
| `POST /api/auth/reset-password/:id` | `auth_recovery_complete` |
| `POST /api/auth/refresh` stage A | `auth_refresh.stage_a` |
| refresh subject admission stage B | `auth_refresh.stage_b` |
| `POST /api/files/init` | `file_resource.aggregate`, `file_resource.upload_control` |
| `POST /api/files/get-presigned-url` | `file_resource.aggregate`, `file_resource.part_presign` |
| `POST /api/files/complete` | `file_resource.aggregate`, `file_resource.upload_control` |
| `POST /api/files/upload-single` | `file_resource.aggregate`, `file_resource.upload_control` |
| `POST /api/files/:fileId/download-url` | `file_resource.aggregate`, `file_resource.download_signing` |
| `GET /api/calls/history`, `GET /api/calls/missed` | `read_expensive.aggregate`, `read_expensive.call_history` |
| `POST /api/calls/:id/read`, `POST /api/calls/read-all` | `state_mutation.aggregate`, `state_mutation.call_history` |
| Socket.IO `initCall`, `callUser` | `call_initiation` |
| Socket.IO `answerCall`, `endCall`, `rejectCall`, `toggleMedia` | `<none>` |

The runner MUST compare the sorted route/event inventory and the ordered policy lists to this matrix.
An omitted operation, duplicate middleware, reordered stages, or alternate auth/file/call route/event
is `FAILED`.

The `limiter-contract` scenario runs with calls enabled. A stubbed 1000 ms retry produces HTTP
`429`, `Retry-After: 1`, and the existing `sendError` envelope with code `RATE_LIMITED` and message
`Too many requests. Please try again later.`. Store unavailability produces HTTP `503`, no
`Retry-After`, code `RATE_LIMIT_UNAVAILABLE`, and message `Rate-limit service is unavailable`.
Socket unavailability emits `RATE_LIMIT_UNAVAILABLE` with `{ "code": "RATE_LIMIT_UNAVAILABLE" }`.
Socket exhaustion emits `RATE_LIMITED` with code and positive `retryAfterSeconds`.

## Deterministic automated and image gate

```powershell
$GateCommands = @(
  @{ Name='focused'; Script={ npm run test:k6-capability-gates } },
  @{ Name='root-ci'; Script={ npm run test:ci } },
  @{ Name='ci-validate'; Script={ npm run ci:validate } },
  @{ Name='lint'; Script={ npm run lint:ci } },
  @{ Name='client-test'; Script={ npm --prefix client test } },
  @{ Name='client-build'; Script={ npm --prefix client run build } },
  @{ Name='server-test'; Script={ npm --prefix server test } },
  @{ Name='server-image'; Script={ docker build --pull=false --target prod --tag kittachat-k6-113-server:local ./server } },
  @{ Name='edge-image'; Script={ docker build --pull=false --build-arg VITE_TARGET=public-demo --tag kittachat-k6-113-edge:local --file ./nginx/Dockerfile . } }
)
foreach ($Gate in $GateCommands) {
  Invoke-K6Command -Name $Gate.Name -FailureClass FAILED -WorkingDirectory $CandidateRoot -Command $Gate.Script
}
```

Run the exact candidate diff and cached no-pull secret scan:

```powershell
$GitleaksImage = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
Invoke-K6Command -Name 'gitleaks-image-inspect' -FailureClass BLOCKED -WorkingDirectory $CandidateRoot -Command {
  docker image inspect $GitleaksImage | Out-Null
}
Invoke-K6Command -Name 'candidate-secret-scan' -FailureClass FAILED -WorkingDirectory $SourceWorktree -Command {
  git diff --binary $SourceBase $CandidateTree -- . |
    docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" `
      $GitleaksImage detect --pipe --config /repo/.gitleaks.toml `
      --redact=100 --no-banner --no-color --log-level warn
}
Invoke-K6Command -Name 'candidate-diff-check' -FailureClass FAILED -WorkingDirectory $SourceWorktree -Command {
  git diff --check $SourceBase $CandidateTree -- .
}
```

## Locked Test Cases

### MA-113-01: Capability and recipient validation

Run `env-matrix`. Require exact recipient key equality, fixed literals, missing/malformed/unknown/
excessive/cross-service rejection, and value-free errors. Run the focused startup tests for every
capability boolean and fixed public-demo state.

### MA-113-02: Recovery and Google direct-client gates

Run `disabled-auth`. Also run the accepted #111 client disabled-control tests. Every direct disabled
route MUST return the exact HTTP envelope. Every side-effect counter, including limiter, MUST be
zero. UI projection and direct-client enforcement MUST agree without using a missing secret.

### MA-113-03: Upload mutation gate

Run `disabled-upload`. All four mutation routes MUST return the exact disabled envelope. Limiter,
body processing, controller, S3, queue, and database counters MUST be zero. The private-download
route MUST remain explicitly delegated to #114.

### MA-113-04: Call-disabled and call-enabled contracts

Run `calls-disabled` and `calls-enabled`. Disabled HTTP and all six socket events MUST use the exact
locked responses with every counter zero. Enabled route inventory, input/output events, ACKs,
authorization, policy membership, signaling, and history shapes MUST match the source-base oracle.
This case does not claim ICE or media readiness.

### MA-113-05: Synthetic identity boundary

Run `synthetic-signup`. Execute every identity table row at its required direct/SPA seams. Reset and
snapshot counters around each row. Valid rows MUST persist only the exact normalized output.
Rejected rows MUST return status `400` through the existing validation path and have zero find,
normalized-query, hash, save, session, limiter, queue, and provider deltas.

### MA-113-06: Legacy and enabled payload compatibility

Run the isolated `source-base-contract-oracle` command, then `legacy-contract`. Synthetic-only false
local mode MUST accept the test-owned non-`.test` fixture. Every required contract-check ID,
source/candidate observation digest, and exact-match boolean MUST pass. Registration, login,
refresh-cookie presence, request ID, file download delegation, call/ACK/room/authorization, and
public identifier shapes MUST equal the exact source-base observation. No raw token, cookie, room,
or identifier value enters evidence.

### MA-113-07: Abuse-control preservation

Run `limiter-contract`. Every policy tuple and every operation-policy membership row MUST match.
Confirmed exhaustion MUST return the exact `429`/retry contract. Store unavailability MUST return
the exact HTTP `503` and Socket.IO `RATE_LIMIT_UNAVAILABLE` contracts, never `429`. No alternate
auth, upload, call-history, or call-socket route/event may bypass or add a policy.

### MA-113-08: Full local gate and pre-D2 invariant

Run the full automated/image gate, exact diff check, and Gitleaks command. Verify every scenario JSON
has `externalProviderRequestCount=0`, `providerMutationCount=0`, `cleanup.portReleased=true`, and
`cleanup.processCount=0`. Record the sanitized command/network inventory and `D2_MUTATIONS=0`.

## Evidence manifest

Create `$EvidenceRoot\evidence-manifest.json` with only:

- guide revision and SHA-256;
- source base, source-base tree, HEAD, full index tree, and candidate tree;
- every wrapper-captured command name and exit code;
- scenario JSON paths and SHA-256 digests;
- source/candidate contract-observation digests, exact public-contract checks, and policy-oracle identifiers;
- changed-file inventory;
- external provider request count, provider mutation count, side-effect counters, and cleanup state;
- `D2_MUTATIONS=0`.

Run the pinned Gitleaks image against the manifest before Evaluation append:

```powershell
$ManifestPath = Join-Path $EvidenceRoot 'evidence-manifest.json'
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw 'BLOCKED: evidence manifest missing'
}
Invoke-K6Command -Name 'manifest-secret-scan' -FailureClass FAILED -WorkingDirectory $CandidateRoot -Command {
  Get-Content -Raw -LiteralPath $ManifestPath |
    docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" `
      $GitleaksImage detect --pipe --config /repo/.gitleaks.toml `
      --redact=100 --no-banner --no-color --log-level warn
}
```

Retain only command name, exit code, pinned image digest, and `GITLEAKS_PASS`; do not retain raw
command output.

## Append-only Evaluation procedure

Issue #113 implementation MUST generalize `scripts/record_evaluation.py` so required case IDs derive
safely from guide revision `k6-113-capability-gates-v3`. It MUST continue to validate existing
Issue #111 history byte-for-byte. Focused recorder tests MUST cover `MA-113-01` through `MA-113-08`,
unknown IDs, prior history, approval binding, and secret-bearing evidence rejection.

For a failed or blocked run, include all eight case IDs. Use `NOT_RUN` after the first terminal case.
Append `FAILED/pending` when any case is `FAIL`. Append `BLOCKED/pending` when no case failed but one
cannot run.

If all eight observations pass, first append a schema-version-2 `BLOCKED/pending` observation with
`accepted_run_id=null` and `approval_sha256=null`:

```powershell
python scripts/record_evaluation.py `
  --history .agents/manual-tests/k6-public-demo/issue-113-capability-gates-v3.evaluations.jsonl `
  --evaluation <absolute-observation-json> `
  --repository . `
  --guide .agents/manual-tests/k6-public-demo/issue-113-capability-gates-v3.md `
  --guide-revision k6-113-capability-gates-v3 `
  --source-base 1b70741b4512e5cc727224a788477d87fa1e67be `
  --candidate-tree $CandidateTree
```

Stop and request maintainer acceptance of that exact pending run. After approval, create
`issue-113-capability-gates-v3.acceptance.json` with the repository approval schema. Bind the guide
revision and SHA-256, source base, candidate tree, accepted pending run ID, approval time,
maintainer identity, safe approval reference, and `human_approval=approved`.

Create a new schema-version-2 `PASSED/approved` record. Its eight `test_results` MUST equal the
accepted pending observation. Bind `accepted_run_id` and the lowercase SHA-256 of the acceptance
sidecar. Append with the same command plus:

```powershell
--acceptance-approval .agents/manual-tests/k6-public-demo/issue-113-capability-gates-v3.acceptance.json
```

Never edit or delete an Evaluation line.

## Final cleanup

After evidence capture, rerun the candidate helper with `--expected-tree $CandidateTree`. Require
every scenario cleanup count to be zero. Then perform guarded cleanup:

```powershell
$Listening = Get-NetTCPConnection -State Listen | Where-Object LocalPort -EQ 4184
if ($Listening) { throw 'FAILED: acceptance port remains in use' }

$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
foreach ($Path in @($CandidateArchive, $CandidateRoot, $SourceBaseArchive, $SourceBaseRoot)) {
  $Resolved = [IO.Path]::GetFullPath($Path)
  if (-not $Resolved.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'BLOCKED: cleanup path escaped OS temp root'
  }
}
Remove-Item -LiteralPath $CandidateArchive -Force
Remove-Item -LiteralPath $CandidateRoot -Recurse -Force
Remove-Item -LiteralPath $SourceBaseArchive -Force
Remove-Item -LiteralPath $SourceBaseRoot -Recurse -Force

$ListeningAfter = Get-NetTCPConnection -State Listen | Where-Object LocalPort -EQ 4184
if ($ListeningAfter) { throw 'FAILED: acceptance port was not released' }
```

Keep the guide, evidence manifest, sanitized scenario/oracle observations, and Evaluation history.
This guide becomes immutable only after external review and explicit maintainer approval. A
semantic change requires v4.
