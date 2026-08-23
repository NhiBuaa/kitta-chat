# Manual Test Guide: K6 Issue #114 — Private S3 Upload Boundary

## Metadata and authority

- Feature: K6 Railway Public Demo
- Slice: GitHub Issue #114
- Specification: .agents/manual-tests/k6-public-demo/issue-114-spec-snapshot.md
- Specification SHA-256: 6710e05afb678cd15e36cdb9e7e97754e0dbdf373c66ff71a4eccb07c8e2f3cb
- Ticket review: .agents/manual-tests/k6-public-demo/issue-114-ticket-review.json
- Ticket review SHA-256: 5d9317e5291cb17a8012466dd76839ad7179b335f81eb56573944454b82bbc49
- Source base: 79a2653464d0bf798b95222ec7434ce8722a696b
- Source-base tree: d9de20b5fac1da34c143d96fa26ae22843df042c
- Branch/worktree: nhibuaa/k6-issue-114-s3-upload at
  D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-114
- Guide revision: k6-114-s3-upload-v2
- Prior guide: v1 is immutable, REQUEST_CHANGES, and must never execute
- Guide approval: exact SHA-256 and later execution tree require maintainer approval
- Evaluation history: .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.evaluations.jsonl

This is local/mock pre-D2 acceptance, not code review. AWS credentials, AWS calls, S3 CORS changes,
Railway/GHCR mutation, deployment, and Issue #61 measurement are forbidden. Required invariant:
externalProviderRequestCount=0, providerMutationCount=0, D2_MUTATIONS=0.

After implementation, the sole execution entrypoint is:

~~~powershell
& scripts/k6/runIssue114Guide.ps1 -Repository (Resolve-Path '.').Path -GuideApproval .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.approval.json -ExecutionApproval .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.execution-approval.json
~~~

The first sidecar binds maintainer approval of guide revision/hash and SourceBase. The second,
requested only after implementation tests pass, binds the same guide hash plus exact CandidateTree.
The runner validates both and owns one registered try/finally around every detailed command below.
Missing/stale approval or direct subcommand execution is BLOCKED.

## Exact bootstrap and immutable candidate

The execution operator must use the following identities and unique paths:

~~~powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-114'
$ExpectedBranch = 'nhibuaa/k6-issue-114-s3-upload'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
$SourceBaseTree = 'd9de20b5fac1da34c143d96fa26ae22843df042c'
$Nonce = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$CandidateZip = Join-Path $TempRoot "k6-114-v2-$Nonce-candidate.zip"
$CandidateRoot = Join-Path $TempRoot "k6-114-v2-$Nonce-candidate"
$SourceZip = Join-Path $TempRoot "k6-114-v2-$Nonce-source.zip"
$SourceRoot = Join-Path $TempRoot "k6-114-v2-$Nonce-source"
$TempOutput = Join-Path $TempRoot "k6-114-v2-$Nonce-output"
$CandidateDiff = Join-Path $TempRoot "k6-114-v2-$Nonce.diff"
$ScopeOutput = Join-Path $TempRoot "k6-114-v2-$Nonce-scope.json"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-114-s3-upload-v2-evidence\$Nonce"
foreach ($Path in @($CandidateZip,$CandidateRoot,$SourceZip,$SourceRoot,$TempOutput,$CandidateDiff,$ScopeOutput,$EvidenceRoot)) {
  if (Test-Path -LiteralPath $Path) { throw "BLOCKED: path collision" }
}
if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }
if ((git rev-parse "$SourceBase^{tree}").Trim() -ne $SourceBaseTree) { throw 'BLOCKED: source tree mismatch' }
~~~

Allowed staged non-manual paths are package manifests plus these exact prefixes/files only:

- scripts/k6/, scripts/test/k6/, server/test/, client/test/;
- server/src/storage/, server/src/models/MultipartUploadSession.js;
- server/src/services/s3.service.js, server/src/services/privateObjectProjectionService.js,
  server/src/services/avatarQueueService.js, server/src/services/profileAvatarQueueService.js;
- server/src/controllers/, server/src/queues/imageJobs.js, server/src/workers/imageWorker.js;
- server/src/models/File.js, server/src/models/User.js, server/src/config/k6PublicDemoEnvironment.js;
- server/src/capabilities/, client/src/config/, client/public/runtime-config.json;
- client/src/hooks/useUpload.js, client/src/hooks/useUploader.js, client/src/services/api/fileApi.js.

Manual artifacts under .agents/manual-tests/k6-public-demo are allowed but excluded from the
execution tree. Any other staged path is BLOCKED. Record the sorted changed-path list and SHA-256;
do not retain diff contents.

Run the closed allowlist check before candidate creation:

~~~powershell
node scripts/k6/validateIssue114StagedScope.cjs --repository $SourceWorktree --source-base $SourceBase --output $ScopeOutput
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: staged scope is not Issue #114 only' }
~~~

Compute the candidate once, then archive it with expected-tree revalidation:

~~~powershell
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

Reject candidate runtime .env/.env.local files; .env.example is documentation only. Before child
commands, scripts/k6/runPreD2Command.cjs removes inherited keys whose names match AWS, S3, MONGO,
REDIS, RABBITMQ, RAILWAY, GHCR, TOKEN, SECRET, PASSWORD, CREDENTIAL, COOKIE, FIREBASE, GOOGLE, SMTP,
TURN, URL_FRONTEND, CORS_ALLOWED_ORIGINS, or VITE except explicit test-owned values. It prints names
and counts only. It installs dependencies before network guard activation:

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory $CandidateRoot -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $CandidateRoot 'client') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $CandidateRoot 'server') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory $SourceRoot -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $SourceRoot 'client') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $SourceRoot 'server') -- npm ci --offline --no-audit --no-fund
~~~

A cache miss or lockfile mismatch is BLOCKED. Execution then uses
scripts/k6/preD2NetworkGuard.cjs through NODE_OPTIONS. The guard intercepts DNS, net/tls, HTTP(S),
fetch/undici, and AWS SDK request handlers; loopback only is allowed. Positive control
NET-GUARD-01 deliberately requests example.invalid and must be denied and counted. Any other
non-loopback attempt is FAIL. Candidate business code cannot author guard counts.

## Closed scenario contract and validator

Run from SourceWorktree, passing absolute SourceRoot/CandidateRoot/TempOutput/EvidenceRoot,
SourceBase, SourceBaseTree, CandidateTree, guide revision, and Nonce:

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree -- node scripts/k6/issue114Acceptance.cjs --source-root $SourceRoot --candidate-root $CandidateRoot --output $TempOutput --run-id $Nonce
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree -- node scripts/k6/validateIssue114Acceptance.cjs --input $TempOutput --scope-input $ScopeOutput --evidence-root $EvidenceRoot --source-base $SourceBase --source-tree $SourceBaseTree --candidate-tree $CandidateTree --guide-revision k6-114-s3-upload-v2 --run-id $Nonce
~~~

The runner is observation-only. The separate validator is sole case-verdict authority. Missing,
unknown, duplicate, stale, or extra cases/fields are BLOCKED. Each scenario JSON contains exactly:
schemaVersion=1, guideRevision, runId, sourceBase, sourceTree, candidateTree, scenario,
cases[{id,observations}], with no outcome/verdict field. The validator writes validated-results.json
with exactly eight MA case outcomes.

Required observation inventories are set-equal:

| Scenario | Required IDs and count | Locked oracle |
| --- | --- | --- |
| keys | KEY-V01..V04 plus KEY-R01..R10 = 14 | four exact key classes pass; every R case has sdkCalls=0 and queueCalls=0 |
| MIME/size | 20 locked MIME types x MINUS/EXACT/PLUS = 60; MIME-R01..R04 = 4 | MINUS/EXACT pass, PLUS rejects; blank/wildcard/unsupported/octet-stream reject |
| parts | PART-V01..V10 and PART-R01..R08 = 18 | expected contiguous count/length/ETags pass; zero/duplicate/gap/order/count/size/ETag reject before SDK |
| lifecycle | LIFE-01..LIFE-12 = 12 | owner/reload/replay pass; foreign/mismatch/expired/aborted reject; simultaneous complete-complete yields one provider complete/File; complete-abort yields one atomic terminal owner |
| projections | PROJ-01..PROJ-12 = 12 | document, completion, fileProcessed, direct history, group history, resources, profile, friends, group members, sidebar, call participant, avatarUpdated all authorize before sign and expose no raw URL |
| worker | WORK-01..WORK-10 = 10 | chat/avatar success, forged/outside/unsupported rejection, duplicate, insert race, processing/cleanup fault, and legacy-local loopback remote-avatar compatibility |
| activation/errors | ACT-01..ACT-08 and ERR-01..ERR-05 = 13 | only disabled/false and source-fixture validated/true pass; mismatches fail; exact status/code table and zero side effects |
| public contract | CONTRACT-01..CONTRACT-09 = 9 | source/candidate init, part, complete, single, download, fileProcessed, avatarUpdated, message attachment, avatar shapes match; only init request fileSize addition allowed |

The 20 MIME values and limits are copied exactly from the spec. Projection signing failure is fixed:
document/file/media HTTP projection returns generic 503 PRIVATE_OBJECT_UNAVAILABLE; fileProcessed
is suppressed with a fixed identifier-free warning; avatar projections use the same-origin
DEFAULT_AVATAR. No PutObject/CreateMultipart command may contain ACL, public-read, website, or raw
provider URL fields. Signed URLs exist only in ephemeral in-memory observations; evidence records
only ttlSeconds=300, shape digest, and rawProviderUrlCount=0.

Source-base contract observations execute modules from SourceRoot in a separate child process.
Candidate observations execute CandidateRoot in another process. CONTRACT IDs, sanitized key/type
shapes, and allowed fileSize delta are defined by the guide validator, not runner output.

Traceability is exact: MA-114-01=keys; 02=MIME/size+parts; 03=lifecycle; 04=projections;
05=worker; 06=worker fault+errors; 07=activation+public contract; 08=all commands, guard, scans,
retention, and cleanup. Retained D2 risks are excluded and remain Issue #118 cases.

## Full gate, scans, and durable evidence

scripts/k6/runPreD2Command.cjs captures command name, exit code, duration class, and safe summary,
never raw stdout/stderr. Run candidate commands:

- npm run test:k6-s3-upload
- npm run test:ci and npm run ci:validate
- npm run lint:ci
- npm --prefix client test and npm --prefix client run build
- npm --prefix server test
- Docker server/edge builds with --pull=false --network=none, nonce tags, and labels
  kittachat.guide=k6-114-s3-upload-v2 and kittachat.run=$Nonce.

Docker tags are kittachat-k6-114-server:$Nonce and kittachat-k6-114-edge:$Nonce. A pre-existing tag
collision is BLOCKED. Cached layers only; a network/cache miss is BLOCKED.

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase guarded --name focused --working-directory $CandidateRoot -- npm run test:k6-s3-upload
node scripts/k6/runPreD2Command.cjs --phase guarded --name root-ci --working-directory $CandidateRoot -- npm run test:ci
node scripts/k6/runPreD2Command.cjs --phase guarded --name ci-validate --working-directory $CandidateRoot -- npm run ci:validate
node scripts/k6/runPreD2Command.cjs --phase guarded --name lint --working-directory $CandidateRoot -- npm run lint:ci
node scripts/k6/runPreD2Command.cjs --phase guarded --name client-test --working-directory (Join-Path $CandidateRoot 'client') -- npm test
node scripts/k6/runPreD2Command.cjs --phase guarded --name client-build --working-directory (Join-Path $CandidateRoot 'client') -- npm run build
node scripts/k6/runPreD2Command.cjs --phase guarded --name server-test --working-directory (Join-Path $CandidateRoot 'server') -- npm test
docker build --pull=false --network=none --label kittachat.guide=k6-114-s3-upload-v2 --label "kittachat.run=$Nonce" --target prod --tag "kittachat-k6-114-server:$Nonce" (Join-Path $CandidateRoot 'server')
docker build --pull=false --network=none --label kittachat.guide=k6-114-s3-upload-v2 --label "kittachat.run=$Nonce" --build-arg VITE_TARGET=public-demo --tag "kittachat-k6-114-edge:$Nonce" --file (Join-Path $CandidateRoot 'nginx\Dockerfile') $CandidateRoot
~~~

Materialize the candidate diff with git diff --binary from SourceBase to CandidateTree and run
git diff --check. Use only cached:
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
with docker --pull=never against the candidate diff, client dist, every sanitized JSON, and final
manifest using /repo/.gitleaks.toml. Any finding is FAIL.

~~~powershell
git diff --binary --output=$CandidateDiff $SourceBase $CandidateTree -- .
if ($LASTEXITCODE -ne 0) { throw 'FAILED: candidate diff failed' }
git diff --check $SourceBase $CandidateTree -- .
if ($LASTEXITCODE -ne 0) { throw 'FAILED: diff check failed' }
$Gitleaks = 'ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
docker image inspect $Gitleaks | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: pinned Gitleaks image missing' }
Get-Content -Raw -LiteralPath $CandidateDiff | docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" $Gitleaks detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
if ($LASTEXITCODE -ne 0) { throw 'FAILED: candidate secret scan failed' }
docker run --pull=never --rm -v "$($CandidateRoot):/repo:ro" $Gitleaks detect --source /repo/client/dist --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
if ($LASTEXITCODE -ne 0) { throw 'FAILED: dist secret scan failed' }
Get-ChildItem -LiteralPath $EvidenceRoot -File -Recurse | ForEach-Object {
  Get-Content -Raw -LiteralPath $_.FullName | docker run --pull=never --rm -i -v "$($CandidateRoot):/repo:ro" $Gitleaks detect --pipe --config /repo/.gitleaks.toml --redact=100 --no-banner --no-color --log-level warn
  if ($LASTEXITCODE -ne 0) { throw 'FAILED: retained evidence secret scan failed' }
}
~~~

The validator copies schema-valid sanitized artifacts atomically into EvidenceRoot, then writes a
manifest with exact artifact SHA-256s, CandidateTree, command exits, changed-path digest, guard
positive-control=1, externalProviderRequestCount=0, providerMutationCount=0, rawProviderUrlCount=0,
cleanup identity, and D2_MUTATIONS=0. TempOutput is never an Evaluation reference.

## Unconditional cleanup

All setup and execution run inside try/finally. Finally runs after PASS, FAIL, BLOCKED, interruption,
or recorder error. It verifies Docker labels before deleting only the two nonce tags, terminates
only registered guide-owned child processes, and requires zero ports/listeners. Each disposable path
is resolved and must be a unique child of TempRoot before recursive removal. Remove CandidateZip,
CandidateRoot, SourceZip, SourceRoot, TempOutput, CandidateDiff, and ScopeOutput only. EvidenceRoot is retained.
Cleanup failure is BLOCKED and must still be recorded.

After cleanup, rerun candidate helper with --expected-tree $CandidateTree, verify EvidenceRoot and
manifest digests still exist, and require no guide-owned image/tag/process/temp path remains.

## Append-only Evaluation

The validator creates pending-evaluation.json with exactly schema_version=2, run_id, observed_at,
executor=Codex, artifact_binding{guide_revision,guide_sha256,source_base,candidate_tree}, eight
MA-114 test_results, verdict=BLOCKED, human_approval=pending, accepted_run_id=null, and
approval_sha256=null. PASS observations never include secrets or provider identities. FAILED uses
at least one FAIL; BLOCKED has no FAIL; after the first terminal case all later cases are NOT_RUN.

Append from SourceWorktree:

~~~powershell
$PendingEvaluation = Join-Path $EvidenceRoot 'pending-evaluation.json'
python scripts/record_evaluation.py --history .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.evaluations.jsonl --evaluation $PendingEvaluation --repository $SourceWorktree --guide .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.md --guide-revision k6-114-s3-upload-v2 --source-base $SourceBase --candidate-tree $CandidateTree
~~~

When all eight are PASS, stop for maintainer acceptance of the exact pending run. The acceptance
sidecar path is issue-114-s3-upload-v2.acceptance.json and contains exactly the repository schema:
schema_version=1, approval_type=manual-acceptance-run, guide_revision, guide_sha256, source_base,
candidate_tree, accepted_run_id, approved_at, approver=maintainer, approval_reference, and
human_approval=approved.

After approval, create approved-evaluation.json with schema_version=2, a new run_id, identical eight
test_results, verdict=PASSED, human_approval=approved, accepted_run_id equal to the pending run, and
approval_sha256 equal to the sidecar SHA-256. Append:

~~~powershell
$ApprovedEvaluation = Join-Path $EvidenceRoot 'approved-evaluation.json'
python scripts/record_evaluation.py --history .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.evaluations.jsonl --evaluation $ApprovedEvaluation --repository $SourceWorktree --guide .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.md --guide-revision k6-114-s3-upload-v2 --source-base $SourceBase --candidate-tree $CandidateTree --acceptance-approval .agents/manual-tests/k6-public-demo/issue-114-s3-upload-v2.acceptance.json
~~~

Duplicate run, schema/validator/append error is BLOCKED. Never edit, truncate, replace, or delete an
Evaluation line. Any semantic guide change requires v3 and fresh review/approval.
