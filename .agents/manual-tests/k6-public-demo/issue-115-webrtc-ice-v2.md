# Manual Test Guide: K6 Issue #115 — WebRTC ICE and Media Readiness

## Metadata and authority

- Feature/slice: K6 Railway Public Demo, GitHub Issue #115
- Specification: .agents/manual-tests/k6-public-demo/issue-115-spec-snapshot.md
- Specification SHA-256: e10bd1d270927973e0bbfa749586cc50a9cfecf0f75b9e54c0e177327ac6771f
- Ticket review: .agents/manual-tests/k6-public-demo/issue-115-ticket-review.json
- Ticket review SHA-256: 3f5f2a7cb50026b408bf0145dcd71807b27791c046b3bb74daacd9284ea5303f
- Source base/tree: 79a2653464d0bf798b95222ec7434ce8722a696b /
  d9de20b5fac1da34c143d96fa26ae22843df042c
- Branch/worktree: nhibuaa/k6-issue-115-webrtc-ice at
  D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-115
- Guide revision: k6-115-webrtc-ice-v2
- Prior v1: immutable REQUEST_CHANGES; never executable
- Evaluation history: .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.evaluations.jsonl

This is pre-D2 local acceptance, not code review. No public STUN/TURN, provider credential, Railway,
GHCR, deployment, or Issue #61 action is allowed. The local real-browser case uses a guide-owned
loopback STUN responder and browser-local synthetic media. Required: externalProviderRequestCount=0
and D2_MUTATIONS=0. Public STUN/network-matrix execution remains #118 after D2.

After implementation, execute only:

~~~powershell
& scripts/k6/runIssue115Guide.ps1 -Repository (Resolve-Path '.').Path -GuideApproval .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.approval.json -ExecutionApproval .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.execution-approval.json
~~~

Guide approval binds revision/hash/SourceBase; later execution approval binds the same guide hash
and exact CandidateTree. The runner validates both and wraps every command below in one registered
try/finally. Missing/stale approval or direct subcommand execution is BLOCKED.

## Exact candidate/bootstrap

~~~powershell
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-115'
$ExpectedBranch = 'nhibuaa/k6-issue-115-webrtc-ice'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
$SourceBaseTree = 'd9de20b5fac1da34c143d96fa26ae22843df042c'
$Nonce = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$CandidateZip = Join-Path $TempRoot "k6-115-v2-$Nonce-candidate.zip"
$CandidateRoot = Join-Path $TempRoot "k6-115-v2-$Nonce-candidate"
$SourceZip = Join-Path $TempRoot "k6-115-v2-$Nonce-source.zip"
$SourceRoot = Join-Path $TempRoot "k6-115-v2-$Nonce-source"
$TempOutput = Join-Path $TempRoot "k6-115-v2-$Nonce-output"
$BrowserProfile = Join-Path $TempRoot "k6-115-v2-$Nonce-browser"
$CandidateDiff = Join-Path $TempRoot "k6-115-v2-$Nonce.diff"
$ScopeOutput = Join-Path $TempRoot "k6-115-v2-$Nonce-scope.json"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-115-webrtc-ice-v2-evidence\$Nonce"
foreach ($Path in @($CandidateZip,$CandidateRoot,$SourceZip,$SourceRoot,$TempOutput,$BrowserProfile,$CandidateDiff,$ScopeOutput,$EvidenceRoot)) {
  if (Test-Path -LiteralPath $Path) { throw 'BLOCKED: path collision' }
}
if ($SourceWorktree -ne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -ne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }
if ((git rev-parse "$SourceBase^{tree}").Trim() -ne $SourceBaseTree) { throw 'BLOCKED: source tree mismatch' }
~~~

Allowed staged non-manual paths are package manifests and only: client/public/runtime-config.json;
client/src/config/; client/src/features/calls/context/; client/src/features/calls/fixtures/;
client/test/; scripts/k6/; scripts/test/k6/; and server/test/call*, server/test/socket/call*,
server/test/callHistory*. Manual artifacts are excluded from execution. Run:

~~~powershell
node scripts/k6/validateIssue115StagedScope.cjs --repository $SourceWorktree --source-base $SourceBase --output $ScopeOutput
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: staged scope is not Issue #115 only' }
$Candidate = python scripts/k6/issue111_candidate.py --repository $SourceWorktree --source-base $SourceBase | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
$CandidateTree = $Candidate.execution_tree
python scripts/k6/issue111_candidate.py --repository $SourceWorktree --source-base $SourceBase --expected-tree $CandidateTree --archive $CandidateZip
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate archive failed' }
git archive --format=zip --output=$SourceZip $SourceBase
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: source archive failed' }
Expand-Archive -LiteralPath $CandidateZip -DestinationPath $CandidateRoot
Expand-Archive -LiteralPath $SourceZip -DestinationPath $SourceRoot
New-Item -ItemType Directory -Path $TempOutput,$BrowserProfile,$EvidenceRoot | Out-Null
~~~

Reject runtime .env/.env.local files. scripts/k6/runPreD2Command.cjs strips inherited provider,
Railway, GHCR, token, secret, password, credential, cookie, TURN, URL/CORS, and Vite values without
printing them, then admits only test-owned variables. Install exact lockfiles offline in root,
client, and server for CandidateRoot and SourceRoot. Any cache miss is BLOCKED:

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory $CandidateRoot -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $CandidateRoot 'client') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $CandidateRoot 'server') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory $SourceRoot -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $SourceRoot 'client') -- npm ci --offline --no-audit --no-fund
node scripts/k6/runPreD2Command.cjs --phase bootstrap --working-directory (Join-Path $SourceRoot 'server') -- npm ci --offline --no-audit --no-fund
~~~

All execution uses scripts/k6/preD2NetworkGuard.cjs. It independently intercepts Node DNS/net/tls,
HTTP(S), fetch/undici, WebSocket client creation, and browser fixture requests. Only 127.0.0.1/::1
and the random loopback UDP STUN responder are allowed. NET-GUARD-01 deliberately requests
example.invalid and must be denied/counted. Any other non-loopback attempt is FAIL.

## Browser fixture identity

The browser runtime is the installed Microsoft Edge executable at
C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe, version 151.0.4129.101, SHA-256
24f626e48dae3574b4d59adc8f23722f890fd0a64f78c772384b783b96bcf1a0. A version/hash mismatch is
BLOCKED and requires a new guide revision; no browser download/update is allowed.

scripts/k6/issue115BrowserRunner.cjs is the locked CDP driver. It launches Edge headless with the
unique BrowserProfile, remote debugging port 0, no first run, no sync/default apps/component update,
background networking disabled, host resolver mapping all non-loopback names to loopback, and the
fixture loopback URL. CDP Network events, page request interception, and peer-config observation are
independent guard inputs. The runner never opens the maintainer's normal browser profile.

The page owns two sandboxed iframe contexts named alice.test and bob.test, each with memory-only
synthetic fixture auth. Media is one AudioContext oscillator and one canvas.captureStream track per
principal; no device/camera/microphone/reusable credential is requested. The guide-owned local UDP
STUN responder is the sole ICE URL.

The fixture starts HTTP and STUN on random loopback ports and reports ready only after both probes
pass within 15 seconds at 250-ms intervals. CDP navigates once, invokes the locked matrix once, and
waits at most 90 seconds for data-run-state=complete. It retains no DOM/media/SDP/candidate bytes.
The page posts sanitized observations to TempOutput only.

~~~powershell
$BrowserExe = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if ((Get-Item $BrowserExe).VersionInfo.FileVersion -ne '151.0.4129.101') { throw 'BLOCKED: browser version drift' }
if ((Get-FileHash -Algorithm SHA256 $BrowserExe).Hash.ToLower() -ne '24f626e48dae3574b4d59adc8f23722f890fd0a64f78c772384b783b96bcf1a0') { throw 'BLOCKED: browser digest drift' }
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree -- node scripts/k6/issue115BrowserRunner.cjs --browser $BrowserExe --candidate-root $CandidateRoot --profile $BrowserProfile --output $TempOutput --run-id $Nonce --network-policy loopback-only
if ($LASTEXITCODE -ne 0) { throw 'FAILED: locked browser matrix failed' }
~~~

## Closed observations and validator

Run deterministic/source-contract scenarios first:

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree -- node scripts/k6/issue115Acceptance.cjs --source-root $SourceRoot --candidate-root $CandidateRoot --output $TempOutput --run-id $Nonce
~~~

After the browser matrix posts completion, run:

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase guarded --working-directory $SourceWorktree -- node scripts/k6/validateIssue115Acceptance.cjs --input $TempOutput --scope-input $ScopeOutput --evidence-root $EvidenceRoot --source-base $SourceBase --source-tree $SourceBaseTree --candidate-tree $CandidateTree --guide-revision k6-115-webrtc-ice-v2 --run-id $Nonce
~~~

The runner/page are observation-only; the repository validator derives outcomes. Each observation
file has exactly schemaVersion=1, guideRevision, runId, sourceBase, sourceTree, candidateTree,
scenario, cases[{id,observations}]. Unknown/missing/duplicate/extra fields or stale identity are
BLOCKED. No candidate boolean named pass/outcome/verdict is authority.

Required set-equal inventories:

| Scenario | IDs/count | Oracle |
| --- | --- | --- |
| runtime ICE | ICE-V01..V08, ICE-R01..R16 = 24 | exact scalar/array STUN/STUNS bounds, normalization, two initial URLs; empty/mismatch/duplicate/oversize/whitespace/userinfo/path/fragment/query/port/scheme/credential reject with peerCount=0 |
| peer paths | PEER-01..PEER-06 = 6 | caller, answerer, glare winner/loser use immutable same snapshot; calls false no peer; legacy local exact two STUN |
| classifier | MEDIA-01..MEDIA-12 = 12 | signaling, ICE, stream, outbound, one-way do not pass; two-way audio and audio+video pass only required call type; exact 500-ms/two-sample rule |
| lifecycle | LIFE-01..LIFE-10 = 10 | failed/disconnected grace/deadline/partial/replacement/end/cancel/repeat/late events produce one terminal and cleanup once |
| product contract | CONTRACT-01..CONTRACT-12 = 12 | event, ACK, room/auth, outgoing/answer/reject/timeout/glare roles/end, REST, participant history, status/timestamps/duration, call-log, CALL_STATES exact source/candidate match |
| browser | BROWSER-01..BROWSER-03 = 3 | audio ready, video ready, withheld inbound non-ready; two synthetic principals, idle recovery, zero external request |
| artifact safety | SAFE-01..SAFE-10 = 10 | credential/SDP/candidate/IP/device/token/provider sentinels absent; no call-config endpoint/event/binding; dist/runtime evidence clean |

Allowed terminal values are exactly ready, signaling_only, ice_failed, media_timeout, cancelled.
SourceRoot and CandidateRoot contract observers run in separate child processes. Exact source and
candidate sanitized shape digests must match for all CONTRACT IDs; no classifier may mutate product
state or Mongo/Redis/RabbitMQ. Browser ICE metadata is the test-only loopback STUN URL; public-demo
artifact still contains exactly the two approved non-secret public STUN URLs, which are never
contacted pre-D2.

Traceability: MA-115-01=ICE; 02=PEER; 03=SAFE; 04=MEDIA; 05=LIFE; 06=CONTRACT;
07=BROWSER; 08=full gate, scans, guard, retention, cleanup. STUN-only deployed risk remains #118.

## Full gate, evidence, and secret scan

Use scripts/k6/runPreD2Command.cjs for safe command name/exit/duration summaries:

- npm run test:k6-webrtc-ice; npm run test:ci; npm run ci:validate; npm run lint:ci;
- npm --prefix client test; npm --prefix client run build; npm --prefix server test;
- server and edge Docker builds with --pull=false --network=none, nonce tags, and labels
  kittachat.guide=k6-115-webrtc-ice-v2 plus kittachat.run=$Nonce.

Use tags kittachat-k6-115-server:$Nonce and kittachat-k6-115-edge:$Nonce; collision is BLOCKED.
Cache/network miss is BLOCKED. Materialize git diff --binary from SourceBase to CandidateTree and
run git diff --check.

~~~powershell
node scripts/k6/runPreD2Command.cjs --phase guarded --name focused --working-directory $CandidateRoot -- npm run test:k6-webrtc-ice
node scripts/k6/runPreD2Command.cjs --phase guarded --name root-ci --working-directory $CandidateRoot -- npm run test:ci
node scripts/k6/runPreD2Command.cjs --phase guarded --name ci-validate --working-directory $CandidateRoot -- npm run ci:validate
node scripts/k6/runPreD2Command.cjs --phase guarded --name lint --working-directory $CandidateRoot -- npm run lint:ci
node scripts/k6/runPreD2Command.cjs --phase guarded --name client-test --working-directory (Join-Path $CandidateRoot 'client') -- npm test
node scripts/k6/runPreD2Command.cjs --phase guarded --name client-build --working-directory (Join-Path $CandidateRoot 'client') -- npm run build
node scripts/k6/runPreD2Command.cjs --phase guarded --name server-test --working-directory (Join-Path $CandidateRoot 'server') -- npm test
docker build --pull=false --network=none --label kittachat.guide=k6-115-webrtc-ice-v2 --label "kittachat.run=$Nonce" --target prod --tag "kittachat-k6-115-server:$Nonce" (Join-Path $CandidateRoot 'server')
docker build --pull=false --network=none --label kittachat.guide=k6-115-webrtc-ice-v2 --label "kittachat.run=$Nonce" --build-arg VITE_TARGET=public-demo --tag "kittachat-k6-115-edge:$Nonce" --file (Join-Path $CandidateRoot 'nginx\Dockerfile') $CandidateRoot
~~~

Use cached Gitleaks only:
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f.
Run docker --pull=never with /repo/.gitleaks.toml, redact=100, against candidate diff, client dist,
every JSON, safe command summary, and final manifest. Missing image is BLOCKED; finding is FAIL.

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

The validator atomically copies only closed-schema sanitized artifacts to EvidenceRoot and writes
their SHA-256s. Manifest exact fields include guide/source/candidate/run bindings, browser family and
major version (evidence, not authority), contract digests, command exits, changed-path digest,
guardPositiveControl=1, externalProviderRequestCount=0, providerMutationCount=0,
prohibitedEvidenceCount=0, cleanup identity, and D2_MUTATIONS=0.

## Unconditional cleanup

The fixture launcher registers process, HTTP/UDP ports, iframe/peer/track/timer/listener counts,
browser page, nonce Docker tags, and temp paths before creation. A try/finally cleanup runs after
PASS, FAIL, BLOCKED, interruption, or recorder error. It closes only the registered browser tab and
fixture process, verifies zero pages/peers/tracks/timers/listeners/ports, inspects guide/run labels,
then deletes only the two nonce Docker tags.

Before recursive delete, resolve and require CandidateZip, CandidateRoot, SourceZip, SourceRoot,
TempOutput, BrowserProfile, CandidateDiff, and ScopeOutput to be unique children of TempRoot. EvidenceRoot is
not deleted. Cleanup failure is BLOCKED and is recorded. Re-run candidate helper with
--expected-tree $CandidateTree; require retained manifest/digests still exist and no owned
process/tag/temp path remains.

## Append-only Evaluation

The validator writes pending-evaluation.json with schema_version=2, new run_id, observed_at,
executor=Codex, exact artifact binding, eight MA-115 results, verdict=BLOCKED,
human_approval=pending, accepted_run_id=null, approval_sha256=null. FAIL yields FAILED/pending;
unrunnable/cleanup/validator failure yields BLOCKED/pending; after first terminal result later cases
are NOT_RUN.

~~~powershell
$PendingEvaluation = Join-Path $EvidenceRoot 'pending-evaluation.json'
python scripts/record_evaluation.py --history .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.evaluations.jsonl --evaluation $PendingEvaluation --repository $SourceWorktree --guide .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.md --guide-revision k6-115-webrtc-ice-v2 --source-base $SourceBase --candidate-tree $CandidateTree
~~~

When all observations pass, stop for maintainer acceptance. Sidecar
issue-115-webrtc-ice-v2.acceptance.json has exactly: schema_version=1,
approval_type=manual-acceptance-run, guide_revision, guide_sha256, source_base, candidate_tree,
accepted_run_id, approved_at, approver=maintainer, approval_reference, and
human_approval=approved. It binds the exact guide hash, SourceBase, CandidateTree, and pending run.

After approval, create approved-evaluation.json with a new run ID, byte-identical eight results,
PASSED/approved, accepted_run_id, and acceptance sidecar SHA-256; append:

~~~powershell
$ApprovedEvaluation = Join-Path $EvidenceRoot 'approved-evaluation.json'
python scripts/record_evaluation.py --history .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.evaluations.jsonl --evaluation $ApprovedEvaluation --repository $SourceWorktree --guide .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.md --guide-revision k6-115-webrtc-ice-v2 --source-base $SourceBase --candidate-tree $CandidateTree --acceptance-approval .agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v2.acceptance.json
~~~

Never edit/delete/truncate history. Duplicate run, schema error, stale artifact, or append failure is
BLOCKED. A semantic guide change requires v3 and fresh review/approval.
