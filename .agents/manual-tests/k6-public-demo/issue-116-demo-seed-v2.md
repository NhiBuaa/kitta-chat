# Manual Test Guide: K6 Issue #116 — Demo Seed and Reset Boundary

## Metadata and authority

- Feature/slice: K6 Railway Public Demo, GitHub Issue #116
- Specification: .agents/manual-tests/k6-public-demo/issue-116-spec-snapshot.md
- Specification SHA-256: 8d73c59a15d24d4938538a81edf596f5c215892c7d8a77df0f6e77809aa5f452
- Ticket review: .agents/manual-tests/k6-public-demo/issue-116-ticket-review.json
- Ticket review SHA-256: 97d435297f26a6ab519309b3a25c7503637256749c224b1b3060d0c5e598f12e
- Source base/tree: 79a2653464d0bf798b95222ec7434ce8722a696b /
  d9de20b5fac1da34c143d96fa26ae22843df042c
- Branch/worktree: nhibuaa/k6-issue-116-demo-seed at
  D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-116
- Guide revision: k6-116-demo-seed-v2
- Prior v1: immutable REQUEST_CHANGES; never executable
- Evaluation history: .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.evaluations.jsonl

This is pre-D2 local acceptance, not code review. No Atlas, Railway, S3, Redis, RabbitMQ, runtime
credential, remote seed/reset, or Issue #61 action is allowed. A guide-owned disposable local Mongo
target is the only real write target. Required: externalProviderRequestCount=0,
providerMutationCount=0, remoteMutationCount=0, D2_MUTATIONS=0.

After implementation, execute only:

~~~powershell
& scripts/k6/runIssue116Guide.ps1 -Repository (Resolve-Path '.').Path -GuideApproval .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.approval.json -ExecutionApproval .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.execution-approval.json
~~~

Guide approval binds revision/hash/SourceBase; later execution approval binds the same guide hash
and exact CandidateTree. The runner validates both and wraps every detailed command in one
registered try/finally. Missing/stale approval or direct subcommand execution is BLOCKED.

## Exact candidate/bootstrap

~~~powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-116'
$ExpectedBranch = 'nhibuaa/k6-issue-116-demo-seed'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
$SourceBaseTree = 'd9de20b5fac1da34c143d96fa26ae22843df042c'
$MongoImage = 'mongo@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703'
$Nonce = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$CandidateZip = Join-Path $TempRoot "k6-116-v2-$Nonce-candidate.zip"
$CandidateRoot = Join-Path $TempRoot "k6-116-v2-$Nonce-candidate"
$SourceZip = Join-Path $TempRoot "k6-116-v2-$Nonce-source.zip"
$SourceRoot = Join-Path $TempRoot "k6-116-v2-$Nonce-source"
$TempOutput = Join-Path $TempRoot "k6-116-v2-$Nonce-output"
$CandidateDiff = Join-Path $TempRoot "k6-116-v2-$Nonce.diff"
$ScopeOutput = Join-Path $TempRoot "k6-116-v2-$Nonce-scope.json"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-116-demo-seed-v2-evidence\$Nonce"
$MongoName = "k6-116-v2-$Nonce-mongo"
foreach ($Path in @($CandidateZip,$CandidateRoot,$SourceZip,$SourceRoot,$TempOutput,$CandidateDiff,$ScopeOutput,$EvidenceRoot)) {
  if (Test-Path -LiteralPath $Path) { throw 'BLOCKED: path collision' }
}
if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }
if ((git rev-parse "$SourceBase^{tree}").Trim() -ne $SourceBaseTree) { throw 'BLOCKED: source tree mismatch' }
docker container inspect $MongoName | Out-Null
if ($LASTEXITCODE -eq 0) { throw 'BLOCKED: Mongo name collision' }
docker image inspect $MongoImage | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: pinned cached Mongo image missing; do not pull' }
~~~

Allowed staged non-manual paths are package manifests and only: server/src/demo/;
server/scripts/seedDemo.js; server/scripts/resetDemo.js; server/src/models/; server/src/controllers/
registrationController.js; server/src/config/k6PublicDemoEnvironment.js; server/test/demo*;
server/test/config/k6PublicDemoEnvironment.test.js; scripts/k6/; and scripts/test/k6/. Manual
artifacts are excluded. The scope validator rejects any other staged path and writes only the sorted
path digest:

~~~powershell
node scripts/k6/validateIssue116StagedScope.cjs --repository $SourceWorktree --source-base $SourceBase --output $ScopeOutput
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: staged scope is not Issue #116 only' }
$Candidate = python scripts/k6/issue111_candidate.py --repository $SourceWorktree --source-base $SourceBase | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
$CandidateTree = $Candidate.execution_tree
python scripts/k6/issue111_candidate.py --repository $SourceWorktree --source-base $SourceBase --expected-tree $CandidateTree --archive $CandidateZip
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate archive failed' }
git archive --format=zip --output=$SourceZip $SourceBase
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: source archive failed' }
Expand-Archive -LiteralPath $CandidateZip -DestinationPath $CandidateRoot
Expand-Archive -LiteralPath $SourceZip -DestinationPath $SourceRoot
New-Item -ItemType Directory -Path $TempOutput,$EvidenceRoot | Out-Null
~~~

Reject runtime .env/.env.local files. scripts/k6/runPreD2Command.cjs removes inherited MONGO,
ATLAS, RAILWAY, AWS, S3, REDIS, RABBITMQ, GHCR, token, secret, password, credential, cookie,
Firebase, Google, SMTP, URL/CORS, and Vite values without printing them. It admits only a random
process-owned DEMO_SEED_PASSWORD and the guide-created loopback Mongo URI. Install CandidateRoot
and SourceRoot root/client/server lockfiles with npm ci --offline --no-audit --no-fund. Cache miss
or lock mismatch is BLOCKED.

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory $CandidateRoot -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $CandidateRoot 'client') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $CandidateRoot 'server') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory $SourceRoot -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $SourceRoot 'client') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $SourceRoot 'server') -- npm ci --offline --no-audit --no-fund
~~~

scripts/k6/preD2NetworkGuard.cjs intercepts Node DNS/net/tls, HTTP(S), fetch/undici, Mongo connect,
AWS, Redis, RabbitMQ, and Railway/provider adapters. It allows only the exact random loopback Mongo
port. NET-GUARD-01 deliberately requests example.invalid and must be denied/counted. Remote parsing
tests use strings only and no connect. Candidate code cannot author guard counters.

## Disposable Mongo lifecycle

Start by immutable digest with loopback-only random port, guide ownership labels, tmpfs data, no
volume/bind mount, no pull, and a 512-MiB bound:

~~~powershell
docker run --detach --pull=never --name $MongoName --label kittachat.guide=k6-116-demo-seed-v2 --label kittachat.run=$Nonce --publish 127.0.0.1::27017 --tmpfs /data/db:rw,noexec,nosuid,size=536870912 $MongoImage mongod --bind_ip_all
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: disposable Mongo start failed' }
$Deadline = [DateTimeOffset]::UtcNow.AddSeconds(20)
do {
  docker exec $MongoName mongosh --quiet --eval "quit(db.adminCommand({ping:1}).ok===1?0:1)" | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Milliseconds 250
} while ([DateTimeOffset]::UtcNow -lt $Deadline)
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: disposable Mongo readiness timeout' }
$MongoPortLine = docker port $MongoName 27017/tcp
if ($MongoPortLine -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'BLOCKED: Mongo is not loopback-only' }
$MongoPort = [int]$Matches[1]
$LocalMongoUri = "mongodb://127.0.0.1:$MongoPort/shot-chat"
$DemoSeedPassword = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
~~~

Before use, inspect exact RepoDigest/Id, labels, HostConfig.Binds, Mounts, port binding, and tmpfs.
Require the approved digest, matching labels, no bind/volume, loopback only, and empty K6
collections. Evidence retains only digest, labels digest, booleans, port-class=ephemeral-loopback,
and zero counts; never URI/host/port value.

## Closed observations and source oracle

Run source/candidate/local scenarios, then validator:

~~~powershell
$env:K6_ACCEPTANCE_MONGO_URI = $LocalMongoUri
$env:DEMO_SEED_PASSWORD = $DemoSeedPassword
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree --allow-loopback-port $MongoPort -- node scripts/k6/issue116Acceptance.cjs --source-root $SourceRoot --candidate-root $CandidateRoot --output $TempOutput --run-id $Nonce
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree --allow-loopback-port $MongoPort -- node scripts/k6/validateIssue116Acceptance.cjs --input $TempOutput --scope-input $ScopeOutput --evidence-root $EvidenceRoot --source-base $SourceBase --source-tree $SourceBaseTree --candidate-tree $CandidateTree --guide-revision k6-116-demo-seed-v2 --run-id $Nonce
Remove-Item Env:K6_ACCEPTANCE_MONGO_URI -ErrorAction SilentlyContinue
Remove-Item Env:DEMO_SEED_PASSWORD -ErrorAction SilentlyContinue
$LocalMongoUri = $null
$DemoSeedPassword = $null
~~~

The loopback URI and password are injected through the scrubbed child environment and never command
arguments. Runner is observation-only; validator derives outcomes. Every observation JSON contains
exactly schemaVersion=1, guideRevision, runId, sourceBase, sourceTree, candidateTree, scenario,
cases[{id,observations}]. Unknown/missing/duplicate/extra fields or stale binding are BLOCKED.

Set-equal scenario inventories:

| Scenario | Required IDs/count | Exact oracle |
| --- | --- | --- |
| canonical | DATA-01..DATA-06 = 6 | source and candidate both yield 19/6/60/244/24/60; sanitized source manifest SHA-256 is immutable baseline; candidate equals it twice; password/hash excluded |
| credential/target | TARGET-V01..V02 and TARGET-R01..R12 = 14 | approved local and pure remote-contract fixture pass; malformed/missing/wrong/arbitrary/mode/fingerprint/authority/destructive mismatches reject before connect/model |
| collision | COLLISION-01..COLLISION-08 = 8 | exact email+ID+seeded marker reuse; unmarked/self-signup/foreign/wrong ID/ID rebound/duplicate/ambiguous cases have totalWrites=0 |
| ownership | OWN-01..OWN-14 = 14 | every named collection/reference covered; wrong version, .test-only, mixed, legacy mismatch, S3-backed, foreign reference, and observed-sensitive labels yield uncertain and zero writes |
| dry-run/apply | RESET-01..RESET-08 = 8 | same manifest/selectors, dry-run writes=0, apply only manifest, exact empty owned end state, second apply no-op, reseed separate |
| partial failure | FAIL-01..FAIL-08 and RERUN-01..RERUN-08 = 16 | failure after each exact stage ownership-preflight, callHistories, participants, conversations, messages, files, groups, users; nonzero exit/no false completion; corresponding rerun converges |
| startup/public | START-01..START-05 and CONTRACT-01..CONTRACT-05 = 10 | backend/four worker entries do not import/invoke seed/reset; commands explicit; marker absent from User registration/login/profile, message, group, and Socket.IO shapes |

SourceRoot's current demo dataset is loaded in a separate child with a deterministic placeholder
hash removed before canonicalization. The validator computes sourceManifestSha256 from the immutable
SourceBaseTree and requires both candidate builds to equal it. Candidate output cannot choose the
baseline.

Ownership automation uses only marker namespace/version/kind, expected deterministic IDs, model
relations, and legacy conversation identity. Explicitly observed sensitive-content fixture is a
fixed operator-escalation label; no content is retained and no PII classifier/source dependency may
exist. Any uncertain count blocks apply before first write.

Traceability: MA-116-01=canonical+credential; 02=target; 03=collision; 04=ownership;
05=dry-run/apply; 06=failure/rerun; 07=startup/public; 08=full gate, guard, scans, retention,
cleanup. Remote/live risks remain D2 and #118.

## Full gate, evidence, and scan

Use scripts/k6/runPreD2Command.cjs to capture bounded command names/exits/duration classes:

- npm run test:k6-demo-seed; npm run test:ci; npm run ci:validate; npm run lint:ci;
- npm --prefix client test and build; npm --prefix server test;
- server and edge Docker builds with --pull=false --network=none, nonce tags, and labels
  kittachat.guide=k6-116-demo-seed-v2 and kittachat.run=$Nonce.

Tags are kittachat-k6-116-server:$Nonce and kittachat-k6-116-edge:$Nonce; collision/cache miss is
BLOCKED. Create git diff --binary from SourceBase to CandidateTree and run git diff --check.

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase guarded --name focused --working-directory $CandidateRoot -- npm run test:k6-demo-seed
node scripts/k6/runPreD2Command.cjs --phase guarded --name root-ci --working-directory $CandidateRoot -- npm run test:ci
node scripts/k6/runPreD2Command.cjs --phase guarded --name ci-validate --working-directory $CandidateRoot -- npm run ci:validate
node scripts/k6/runPreD2Command.cjs --phase guarded --name lint --working-directory $CandidateRoot -- npm run lint:ci
node scripts/k6/runPreD2Command.cjs --phase guarded --name client-test --working-directory (Join-Path $CandidateRoot 'client') -- npm test
node scripts/k6/runPreD2Command.cjs --phase guarded --name client-build --working-directory (Join-Path $CandidateRoot 'client') -- npm run build
node scripts/k6/runPreD2Command.cjs --phase guarded --name server-test --working-directory (Join-Path $CandidateRoot 'server') -- npm test
docker build --pull=false --network=none --label kittachat.guide=k6-116-demo-seed-v2 --label "kittachat.run=$Nonce" --target prod --tag "kittachat-k6-116-server:$Nonce" (Join-Path $CandidateRoot 'server')
docker build --pull=false --network=none --label kittachat.guide=k6-116-demo-seed-v2 --label "kittachat.run=$Nonce" --build-arg VITE_TARGET=public-demo --tag "kittachat-k6-116-edge:$Nonce" --file (Join-Path $CandidateRoot 'nginx\Dockerfile') $CandidateRoot
~~~

Use cached Gitleaks only:
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f,
docker --pull=never, candidate .gitleaks.toml, redact=100. Scan candidate diff, dist, every JSON,
safe command summaries, and manifest. Missing image is BLOCKED; finding is FAIL.

~~~powershell
git diff --binary --output=$CandidateDiff $SourceBase $CandidateTree -- .
if ($LASTEXITCODE -ne 0) { throw 'FAILED: candidate diff failed' }
git diff --check $SourceBase $CandidateTree -- .
if ($LASTEXITCODE -ne 0) { throw 'FAILED: diff check failed' }
$Gitleaks = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
docker image inspect $Gitleaks | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: pinned Gitleaks image missing' }
Get-Content -Raw $CandidateDiff | docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" $Gitleaks detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
if ($LASTEXITCODE -ne 0) { throw 'FAILED: diff secret scan failed' }
docker run --pull=never --rm -v "$($CandidateRoot):/repo:ro" $Gitleaks detect --source /repo/client/dist --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
if ($LASTEXITCODE -ne 0) { throw 'FAILED: dist secret scan failed' }
Get-ChildItem -LiteralPath $EvidenceRoot -File -Recurse | ForEach-Object {
  Get-Content -Raw -LiteralPath $_.FullName | docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" $Gitleaks detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
  if ($LASTEXITCODE -ne 0) { throw 'FAILED: retained evidence secret scan failed' }
}
~~~

Validator atomically copies closed-schema sanitized evidence to EvidenceRoot. Manifest exact fields:
guide/source/candidate/run bindings; sourceManifestSha256; artifact SHA-256s; command exits;
changed-path digest; pinned Mongo digest and structural fixture booleans; guardPositiveControl=1;
externalProviderRequestCount=0; providerMutationCount=0; remoteMutationCount=0;
secretOccurrenceCount=0; cleanup identity; D2_MUTATIONS=0. TempOutput is never retained authority.

## Unconditional cleanup

All setup and cases execute inside try/finally. Finally runs after PASS, FAIL, BLOCKED, interrupt,
or recorder error. It first stops child processes, then inspects Mongo labels/digest before
docker rm --force of only $MongoName; verifies container absent and no volume/bind exists; inspects
labels before removing only the two nonce build tags; and requires zero owned ports/processes.
Cleanup failure is BLOCKED and must be Evaluation evidence.

Resolve CandidateZip, CandidateRoot, SourceZip, SourceRoot, TempOutput, CandidateDiff, and ScopeOutput and prove
each is a unique child of TempRoot before removal. EvidenceRoot is retained. After cleanup, rerun
candidate helper with --expected-tree $CandidateTree and require retained manifest/digests exist,
container/tag/process/port/temp inventory is zero, and canonical checkout was never used.

## Append-only Evaluation

Validator writes pending-evaluation.json with schema_version=2, run_id, observed_at, executor=Codex,
artifact binding, exactly MA-116-01..08, verdict=BLOCKED, human_approval=pending,
accepted_run_id=null, approval_sha256=null. FAIL yields FAILED/pending; unrunnable, validator,
cleanup, or append error yields BLOCKED/pending; later cases after first terminal are NOT_RUN.

~~~powershell
$PendingEvaluation = Join-Path $EvidenceRoot 'pending-evaluation.json'
python scripts/record_evaluation.py --history .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.evaluations.jsonl --evaluation $PendingEvaluation --repository $SourceWorktree --guide .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.md --guide-revision k6-116-demo-seed-v2 --source-base $SourceBase --candidate-tree $CandidateTree
~~~

When all eight pass, stop for maintainer acceptance. Sidecar
issue-116-demo-seed-v2.acceptance.json contains exactly: schema_version=1,
approval_type=manual-acceptance-run, guide_revision, guide_sha256, source_base, candidate_tree,
accepted_run_id, approved_at, approver=maintainer, approval_reference, and
human_approval=approved. It binds guide hash, SourceBase, CandidateTree, and accepted pending run.

After approval, write approved-evaluation.json with new run ID, byte-identical eight results,
PASSED/approved, accepted_run_id, and sidecar SHA-256, then:

~~~powershell
$ApprovedEvaluation = Join-Path $EvidenceRoot 'approved-evaluation.json'
python scripts/record_evaluation.py --history .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.evaluations.jsonl --evaluation $ApprovedEvaluation --repository $SourceWorktree --guide .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.md --guide-revision k6-116-demo-seed-v2 --source-base $SourceBase --candidate-tree $CandidateTree --acceptance-approval .agents/manual-tests/k6-public-demo/issue-116-demo-seed-v2.acceptance.json
~~~

Never edit/truncate/delete history. Duplicate run, stale binding, schema error, or append failure is
BLOCKED. A semantic guide change requires v3 and fresh review/approval.
