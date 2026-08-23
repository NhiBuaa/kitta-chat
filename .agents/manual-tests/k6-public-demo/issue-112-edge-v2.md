# Manual Test Guide: K6 Issue #112 — Railway Edge and Public Routes

## Metadata

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #112
- Specification: `.agents/manual-tests/k6-public-demo/issue-112-spec-snapshot.md`
- Specification SHA-256: `1b6503782392665e8414f5da19b1ce68ca54735664ec19366ed0118b672635ac`
- Ticket review: `.agents/manual-tests/k6-public-demo/issue-112-ticket-review.json`
- Ticket review SHA-256: `19d95114f9d9dfc8ee239c0774036a16946e1f54716b93fc7446746a9e862d0b`
- Source base: `1b70741b4512e5cc727224a788477d87fa1e67be`
- Branch: `nhibuaa/k6-issue-112-edge`
- Worktree: `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-112`
- Guide revision: `k6-112-edge-v2`
- Prior guide: `k6-112-edge-v1` received `REQUEST_CHANGES`; it is not approved or executable
- Lock status: candidate until external guide review and maintainer approval
- Evaluation history: `.agents/manual-tests/k6-public-demo/issue-112-edge-v2.evaluations.jsonl`

## Authorization boundary

This guide uses only a staged local candidate, loopback ingress, and a private synthetic Docker
backend. It MUST NOT read a Railway hostname or provider credential. It MUST NOT publish, deploy,
bind a secret, run a rollback, or enable Issue #61 measurement.

Required result: `D2_MUTATIONS=0`.

This guide is not a code review. No post-implementation code review runs for Issue #112. The single
whole-K6 code review remains deferred until Issues #111–#118 are integrated and locally accepted.

## Candidate identity and isolated execution

Before execution, stage every Issue #112 runtime source and automated test file. Do not stage
unrelated work. The existing candidate helper excludes K6 manual-test and mutable workflow files
from the executable tree.

Run this procedure from the source worktree:

```powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-112'
$SourceBase = '1b70741b4512e5cc727224a788477d87fa1e67be'
$ExpectedBranch = 'nhibuaa/k6-issue-112-edge'

if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }

$CandidateState = python scripts/k6/issue111_candidate.py `
  --repository $SourceWorktree `
  --source-base $SourceBase | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
$CandidateTree = $CandidateState.execution_tree

$Nonce = [Guid]::NewGuid().ToString('N')
$CandidateArchive = Join-Path ([IO.Path]::GetTempPath()) "k6-112-v2-$Nonce.zip"
$CandidateRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-112-v2-$Nonce"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-112-edge-v2-evidence\$Nonce"
if ((Test-Path $CandidateArchive) -or (Test-Path $CandidateRoot) -or (Test-Path $EvidenceRoot)) {
  throw 'BLOCKED: candidate or evidence path collision'
}

python scripts/k6/issue111_candidate.py `
  --repository $SourceWorktree `
  --source-base $SourceBase `
  --expected-tree $CandidateTree `
  --archive $CandidateArchive | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate archive failed' }
Expand-Archive -LiteralPath $CandidateArchive -DestinationPath $CandidateRoot
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
```

Reject any runtime environment file in the candidate. Remove inherited deployment/provider values
from the child shell without printing them:

```powershell
$RuntimeEnvFiles = Get-ChildItem -LiteralPath $CandidateRoot -Recurse -Force -File |
  Where-Object { $_.Name -eq '.env' -or $_.Name -like '.env.*' }
if ($RuntimeEnvFiles) { throw 'FAILED: candidate contains a runtime environment file' }

Get-ChildItem Env: |
  Where-Object Name -Match '(?i)(MONGO|REDIS|RABBIT|AWS_|FIREBASE|JWT|TOKEN|SECRET|PASSWORD|CREDENTIAL|CORS|URL_FRONTEND|BACKEND_UPSTREAM|RAILWAY)' |
  ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }

Push-Location $CandidateRoot
try {
  npm ci
  npm --prefix client ci
  npm --prefix server ci
} finally {
  Pop-Location
}
```

Dependency installation failure is `BLOCKED`. Do not print removed values.

## Required implementation commands

The candidate MUST provide:

```powershell
npm run test:k6-edge
npm run accept:k6-edge -- --scenario <scenario> --edge-port 4182 --output <absolute-json-path>
```

`test:k6-edge` MUST include named assertions for upstream validation, rendered nginx directives,
Origin handling, Socket.IO headers, `proxy_buffering off`, read/send timeouts, route precedence, and
local Compose compatibility.

`accept:k6-edge` is a one-shot runner. For each invocation it MUST:

1. Create a unique Docker project named `k6-112-<nonce>`.
2. Keep the synthetic backend on a private Docker network with no host port.
3. Expose only edge port `4182` on `127.0.0.1`.
4. Inject `backend.internal.test:3000` at container runtime through explicit test authority.
5. Wait for exact edge `/healthz` before the scenario starts.
6. Run the selected requests and backend controls without user interaction.
7. Write one sanitized JSON observation before exit.
8. Stop and remove its containers and network in a `finally`/signal trap.
9. Verify that port `4182` is free and no `k6-112-<nonce>` resource remains.

Supported scenarios are `rest-origin`, `socket-reconnect`, `backend-down`, `route-matrix`, and
`spa-precedence`. Unknown scenarios MUST fail before Docker starts.

Each observation JSON MUST contain only:

```text
schemaVersion=1
scenario
candidateTree
commands[].name + exitCode
http[].method + path + status + contentCategory
headerChecks[].seam + originEqual + originAbsent + hostPresent + realIpPresent + forwardedForPresent + forwardedProtoPresent + forbiddenSubstitutionAbsent
socket.pollingConnected + upgraded + reconnected + originEqual + originAbsent + upgradeHeaderConformant + connectionHeaderConformant + payloadDigestEqual
upstreamHitCountBefore + upstreamHitCountAfter
artifactChecks[].name + matched
externalProviderRequestCount
providerMutationCount
cleanup.portReleased + cleanup.containerCount + cleanup.networkCount
```

The file MUST NOT contain raw headers, cookies, authorization data, bodies, environment values,
provider endpoints, container inspect output, or raw logs. The runner records observations. It does
not author Test Case PASS/FAIL.

## Exact route and header oracles

The `route-matrix` scenario MUST request every row:

| Path | Required result |
| --- | --- |
| `/readyz`, `/readyz/`, `/readyz/child` | `404`, generic non-HTML, zero upstream delta, no SPA |
| `/ops`, `/ops/`, `/ops/child` | `404`, generic non-HTML, zero upstream delta, no SPA |
| `/metrics`, `/metrics/`, `/metrics/child` | `404`, generic non-HTML, zero upstream delta, no SPA |
| `/backend-healthz`, `/backend-healthz/`, `/backend-healthz/child` | `404`, generic non-HTML, zero upstream delta, no SPA |
| exact `/api`, exact `/socket.io` | generic non-HTML, zero upstream delta, no SPA |
| `/api/probe`, `/api/auth/probe` | proxied to the synthetic backend |
| `/socket.io/?EIO=4&transport=polling` | Socket.IO path, never SPA |
| exact `/healthz` | `200`, `text/plain`, body exactly `OK` |
| exact `/runtime-config.json` | JSON runtime document, never SPA |
| `/login`, `/__k6_unknown_navigation__` | SPA entry document |

The `spa-precedence` scenario MUST parse the returned SPA entry, select its first local hashed
JavaScript asset path, request that exact path, and record `contentCategory=javascript-asset`.

The `rest-origin` and `socket-reconnect` scenarios use a safe synthetic Origin sentinel. The output
retains only equality/absence booleans. Focused configuration tests MUST prove these exact nginx
properties:

- REST and `/api/auth/`: `Origin` comes from `$http_origin`.
- REST and `/api/auth/`: `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` are set.
- Socket.IO: `Origin` comes from `$http_origin`; `Upgrade` and mapped `Connection` are set.
- No route assigns `$http_origin` to `Accept`.
- No route derives `Origin` from `Host`, `X-Forwarded-Host`, or another edge value.
- Socket.IO buffering is off and existing long read/send timeout values remain.
- The existing Socket.IO auth/event fixture digest is equal before and after the proxy change.

## Deterministic automated and image gate

Run from the candidate root:

```powershell
Push-Location $CandidateRoot
try {
  npm run test:k6-edge
  npm run test:ci
  npm run ci:validate
  npm run lint:ci
  npm --prefix client test
  npm --prefix client run build
  npm --prefix server test
  docker build --pull=false --target prod --tag kittachat-k6-112-server:local ./server
  docker build --pull=false --build-arg VITE_TARGET=public-demo --tag kittachat-k6-112-edge:local --file ./nginx/Dockerfile .
} finally {
  Pop-Location
}
```

`BACKEND_UPSTREAM` is not a build argument. The scenario runner injects only the synthetic runtime
authority. The built SPA MUST NOT contain that sentinel. Do not scan for required configuration key
names. Scan for forbidden values and credential patterns.

Run the cached no-pull scanner against the exact source-base-to-candidate diff:

```powershell
$GitleaksImage = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
docker image inspect $GitleaksImage | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: pinned Gitleaks image missing' }

git -C $SourceWorktree diff --binary $SourceBase $CandidateTree -- . |
  docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" `
    $GitleaksImage detect --pipe --config /repo/.gitleaks.toml `
    --redact=100 --no-banner --no-color --log-level warn
if ($LASTEXITCODE -ne 0) { throw 'FAILED: candidate secret scan failed' }

git -C $SourceWorktree diff --check $SourceBase $CandidateTree -- .
if ($LASTEXITCODE -ne 0) { throw 'FAILED: candidate diff check failed' }
```

Issue #117 owns GHCR tags and publication. This guide does not inspect or assert deployment-tag
policy beyond the existing CI contract.

## Locked Test Cases

### MA-112-01: Upstream validation and local adapter

Run `test:k6-edge`. Every valid and invalid category in the specification MUST have a named test.
Invalid public-demo input MUST fail before nginx starts. Local Compose MUST use an explicit
non-public-demo adapter. Capture the command exit and named category summary.

### MA-112-02: REST and auth Origin forwarding

Run `accept:k6-edge -- --scenario rest-origin --edge-port 4182 --output
"$EvidenceRoot\rest-origin.json"`. Present Origin equality MUST be true for REST and auth. Absent
Origin MUST remain absent. Every required forwarding-header conformance field MUST be true.
Forbidden substitution MUST be absent. Upstream hits MUST match only the intended requests.

### MA-112-03: Socket.IO polling, upgrade, and reconnect

Run `accept:k6-edge -- --scenario socket-reconnect --edge-port 4182 --output
"$EvidenceRoot\socket-reconnect.json"`. Polling, upgrade, one controlled backend restart, and
reconnect MUST succeed. Present and absent Origin checks MUST pass. Header and payload digest
conformance MUST be true. Run the named focused configuration assertions for buffering and timeouts.

### MA-112-04: Minimal edge liveness with backend down

Run `accept:k6-edge -- --scenario backend-down --edge-port 4182 --output
"$EvidenceRoot\backend-down.json"`. Exact `/healthz` MUST remain `200 text/plain OK`. The body MUST
contain no provider, hostname, dependency, process, memory, stack, or secret detail. The result MUST
be labeled edge liveness, not backend readiness.

### MA-112-05: Omitted readiness and denied operational routes

Run `accept:k6-edge -- --scenario route-matrix --edge-port 4182 --output
"$EvidenceRoot\route-matrix.json"`. Every omitted, denied, and reserved path in the exact matrix
MUST return its required category. Upstream-hit delta MUST be zero for those paths. No response may
be the SPA entry.

### MA-112-06: SPA and reserved-route precedence

Run `accept:k6-edge -- --scenario spa-precedence --edge-port 4182 --output
"$EvidenceRoot\spa-precedence.json"`. Eligible navigation MUST return the SPA. The discovered hashed
asset MUST return JavaScript. API, auth, Socket.IO, health, runtime config, readiness, and denied
routes MUST retain their non-SPA classes.

### MA-112-07: Candidate and artifact safety

Run the candidate procedure, full automated/image gate, exact diff check, and pinned Gitleaks
command. Verify that `BACKEND_UPSTREAM` was injected only at scenario runtime. Verify that the SPA
contains no synthetic upstream value or D2-only value. Capture commands, exits, candidate tree, and
safe scan summaries.

### MA-112-08: Cleanup and pre-D2 invariant

Verify every scenario JSON has `externalProviderRequestCount=0`, `providerMutationCount=0`,
`cleanup.portReleased=true`, `cleanup.containerCount=0`, and `cleanup.networkCount=0`. Record the
sanitized command/network inventory and `D2_MUTATIONS=0`. A nonzero provider count is `FAILED` and
stops the workflow without a compensating provider action.

## Evidence manifest

Create `$EvidenceRoot\evidence-manifest.json` with only:

- guide revision and SHA-256;
- source base, HEAD, full index tree, and candidate tree;
- exact command names and exit codes;
- scenario JSON paths and SHA-256 digests;
- image IDs for local images only;
- changed-file inventory;
- external provider request count, provider mutation count, and cleanup counts;
- `D2_MUTATIONS=0`.

Run Gitleaks on the manifest before Evaluation append. Do not retain raw command output.

## Append-only Evaluation procedure

Issue #112 implementation MUST generalize `scripts/record_evaluation.py` so the required case IDs
derive safely from guide revision `k6-112-edge-v2`. It MUST continue to validate existing Issue #111
history byte-for-byte. Focused recorder tests MUST cover `MA-112-01` through `MA-112-08`, unknown
IDs, prior history, approval binding, and secret-bearing evidence rejection.

For a failed or blocked run, include all eight case IDs. Use `NOT_RUN` for cases after the first
terminal case. Append `FAILED/pending` when any case is `FAIL`. Append `BLOCKED/pending` when no case
failed but one cannot run.

If all eight observations pass, first append a schema-version-2 `BLOCKED/pending` observation. Set
`accepted_run_id` and `approval_sha256` to `null`. Bind the exact guide SHA-256, source base, and
candidate tree.

Run:

```powershell
python scripts/record_evaluation.py `
  --history .agents/manual-tests/k6-public-demo/issue-112-edge-v2.evaluations.jsonl `
  --evaluation <absolute-observation-json> `
  --repository . `
  --guide .agents/manual-tests/k6-public-demo/issue-112-edge-v2.md `
  --guide-revision k6-112-edge-v2 `
  --source-base 1b70741b4512e5cc727224a788477d87fa1e67be `
  --candidate-tree $CandidateTree
```

Stop and request maintainer acceptance of that exact pending run. After approval, create
`issue-112-edge-v2.acceptance.json` with the repository approval schema. Bind the guide revision and
SHA-256, source base, candidate tree, accepted pending run ID, approval time, maintainer identity,
safe approval reference, and `human_approval=approved`.

Create a new schema-version-2 `PASSED/approved` record. Its eight `test_results` MUST equal the
accepted pending observation. Bind `accepted_run_id` and the lowercase SHA-256 of the acceptance
sidecar. Append with the same command plus:

```powershell
--acceptance-approval .agents/manual-tests/k6-public-demo/issue-112-edge-v2.acceptance.json
```

Never edit or delete an Evaluation line.

## Final cleanup

After evidence capture, verify that the candidate tree did not change. Verify that port `4182` is
free and no `k6-112-*` Docker resource remains. Remove only the unique candidate archive and
directory after their resolved paths are inside the OS temporary directory. Keep the guide,
manifest, scenario observations, and Evaluation history.

This guide becomes immutable only after external review and explicit maintainer approval. A
semantic change requires v3.
