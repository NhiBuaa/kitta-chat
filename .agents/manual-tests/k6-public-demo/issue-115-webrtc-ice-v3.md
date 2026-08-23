# Manual Test Guide: K6 Issue #115 — WebRTC ICE and Media Readiness

## Immutable authority

- Specification snapshot SHA-256: e10bd1d270927973e0bbfa749586cc50a9cfecf0f75b9e54c0e177327ac6771f
- Ticket review SHA-256: 3f5f2a7cb50026b408bf0145dcd71807b27791c046b3bb74daacd9284ea5303f
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-115-webrtc-ice-v3
- Closed case catalog/SHA-256: issue-115-webrtc-ice-v3.catalog.json /
  e47d92d49dafda2d75bbd554c3efe0546fff8d650de2b4580f583bb46ad84c9f
- Evaluation history: issue-115-webrtc-ice-v3.evaluations.jsonl

V1/v2 remain immutable historical evidence. V3 supersedes every executable, identity, catalog, and
chronology statement in them. Ticket snapshot plus v3 catalog define behavior. No per-Issue code
review runs.

This local pre-D2 fixture never contacts public STUN/TURN or another provider. Actual public
STUN/network matrix/media proof remains #118 after D2. Browser observations use two sandboxed
synthetic principals, browser-generated audio/video, and one guide-owned loopback STUN responder.
No deployed-readiness claim is permitted.

## Approval schemas and exact scope

Guide approval contains exactly: schema_version=1, approval_type=manual-guide, guide_revision,
guide_sha256, source_base, catalog_sha256, approved_at, approver=maintainer, approval_reference,
human_approval=approved.

Later execution approval contains exactly: schema_version=1,
approval_type=manual-guide-execution, guide_revision, guide_sha256, source_base, candidate_tree,
full_index_tree, changed_paths (sorted exact file array), changed_paths_sha256, control_blobs
(exact path-to-Git-blob map), approved_at, approver=maintainer, approval_reference,
human_approval=approved. The exact approved array—not a directory prefix—is changed-scope authority.

Package manifests/locks, candidate helper, Evaluation recorder, nginx/Docker files, and prior K6
harnesses cannot change. Every implemented production/test/control file must be in changed_paths.
Missing/extra/stale field, wrong path digest, tree, catalog, guide hash, blob, or approver is BLOCKED.

## Source-pinned bootstrap

Before CandidateRoot, execute only Git, Python, and SourceBase
scripts/k6/issue111_candidate.py: blob cbcbc592bf4d4e4ee7b44396b6ac32ae189b6c2d, SHA-256
8d8182d193d38f275bd27b91a50ecd4f7b6128d45a39961cbe9cb57e3468b397.
record_evaluation.py stays SourceBase blob 42b8a0d216bd218954a46a49dc912e349d759f19,
SHA-256 6813e382d8c6442561f69732e80d55fc31307b94e0f374bf08cd9231ee9075dc.

All non-manual changes are staged; no relevant unstaged/untracked executable bytes exist. Commits
after SourceBase contain manual/workflow paths only. Verify both trusted files' worktree/index bytes
against SourceBase before deriving CandidateTree. Bootstrap compares the exact changed path array/
digest with execution approval, archives CandidateTree, and separately archives SourceBase full
commit tree. SourceExecutionProjection is a separately named filtered baseline, never
SourceBase^{tree}.

Run this block from the Issue #115 worktree after the exact execution approval exists. The
execution-approval sidecar stays unstaged so its own bytes cannot change the approved
full_index_tree. Untracked files are permitted only below the manual-evidence root.

~~~powershell
$ErrorActionPreference = 'Stop'
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-115'
$ExpectedBranch = 'nhibuaa/k6-issue-115-webrtc-ice'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
$ExpectedSourceTree = '8e0dc6143540018ba0008f42d31b3398ca138ee5'
$GuidePath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-115-webrtc-ice-v3.md'
$CatalogPath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-115-webrtc-ice-v3.catalog.json'
$GuideApprovalPath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-115-webrtc-ice-v3.approval.json'

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Get-ArrayJson([object[]]$Value) {
  return ConvertTo-Json -Compress -InputObject ([object[]]$Value)
}
function Assert-ExactFields([object]$Object, [string[]]$Expected, [string]$Label) {
  [string[]]$Actual = @($Object.PSObject.Properties.Name)
  [Array]::Sort($Actual, [StringComparer]::Ordinal)
  [string[]]$SortedExpected = @($Expected)
  [Array]::Sort($SortedExpected, [StringComparer]::Ordinal)
  if ((Get-ArrayJson $Actual) -cne (Get-ArrayJson $SortedExpected)) {
    throw "BLOCKED: $Label fields are not exact"
  }
}
function Get-LfListSha256([string[]]$Paths) {
  $Canonical = if ($Paths.Count -eq 0) { '' } else { ($Paths -join [char]10) + [char]10 }
  $Hasher = [Security.Cryptography.SHA256]::Create()
  try {
    $Bytes = [Text.Encoding]::UTF8.GetBytes($Canonical)
    return ([BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
  } finally {
    $Hasher.Dispose()
  }
}

if ($SourceWorktree -cne $ExpectedWorktree) { throw 'BLOCKED: unexpected worktree' }
if ((git branch --show-current).Trim() -cne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
git merge-base --is-ancestor $SourceBase HEAD
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }
$ActualSourceTree = (git rev-parse ($SourceBase + '^{tree}')).Trim()
if ($LASTEXITCODE -ne 0 -or $ActualSourceTree -cne $ExpectedSourceTree) {
  throw 'BLOCKED: SourceCommitTree mismatch'
}

$AllowedCommitted = @(
  '.agents/current-session.md',
  '.agents/next-session.md',
  'docs/deployment/k6-public-demo-feature-delivery.md'
)
[string[]]$CommittedPaths = @(git diff --name-only --no-renames "$SourceBase..HEAD" --)
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: committed-drift inspection failed' }
foreach ($Path in $CommittedPaths) {
  if (-not $Path.StartsWith('.agents/manual-tests/k6-public-demo/', [StringComparison]::Ordinal) -and
      $AllowedCommitted -cnotcontains $Path) {
    throw "BLOCKED: executable committed drift after SourceBase: $Path"
  }
}
git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: unstaged tracked changes exist' }
[string[]]$Untracked = @(git ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: untracked-file inspection failed' }
foreach ($Path in $Untracked) {
  if (-not $Path.StartsWith('.agents/manual-tests/k6-public-demo/', [StringComparison]::Ordinal)) {
    throw "BLOCKED: untracked file outside manual evidence root: $Path"
  }
}

$TrustedFiles = @(
  @{ path = 'scripts/k6/issue111_candidate.py'; blob = 'cbcbc592bf4d4e4ee7b44396b6ac32ae189b6c2d'; sha256 = '8d8182d193d38f275bd27b91a50ecd4f7b6128d45a39961cbe9cb57e3468b397' },
  @{ path = 'scripts/record_evaluation.py'; blob = '42b8a0d216bd218954a46a49dc912e349d759f19'; sha256 = '6813e382d8c6442561f69732e80d55fc31307b94e0f374bf08cd9231ee9075dc' }
)
foreach ($Trusted in $TrustedFiles) {
  $WorktreePath = Join-Path $SourceWorktree $Trusted.path
  $SourceBlob = (git rev-parse ($SourceBase + ':' + $Trusted.path)).Trim()
  $IndexBlob = (git rev-parse ":$($Trusted.path)").Trim()
  $WorktreeBlob = (git hash-object -- $WorktreePath).Trim()
  if ($LASTEXITCODE -ne 0 -or $SourceBlob -cne $Trusted.blob -or
      $IndexBlob -cne $Trusted.blob -or $WorktreeBlob -cne $Trusted.blob -or
      (Get-Sha256 $WorktreePath) -cne $Trusted.sha256) {
    throw "BLOCKED: trusted file drift: $($Trusted.path)"
  }
}

$GuideApproval = Get-Content -Raw -LiteralPath $GuideApprovalPath | ConvertFrom-Json
Assert-ExactFields $GuideApproval @(
  'schema_version','approval_type','guide_revision','guide_sha256','source_base',
  'catalog_sha256','approved_at','approver','approval_reference','human_approval'
) 'guide approval'
if ($GuideApproval.schema_version -ne 1 -or
    $GuideApproval.approval_type -cne 'manual-guide' -or
    $GuideApproval.guide_revision -cne 'k6-115-webrtc-ice-v3' -or
    $GuideApproval.guide_sha256 -cne (Get-Sha256 $GuidePath) -or
    $GuideApproval.source_base -cne $SourceBase -or
    $GuideApproval.catalog_sha256 -cne (Get-Sha256 $CatalogPath) -or
    $GuideApproval.approver -cne 'maintainer' -or
    $GuideApproval.human_approval -cne 'approved' -or
    [string]::IsNullOrWhiteSpace([string]$GuideApproval.approved_at) -or
    [string]::IsNullOrWhiteSpace([string]$GuideApproval.approval_reference)) {
  throw 'BLOCKED: guide approval binding mismatch'
}

$CandidateState = python "$SourceWorktree\scripts\k6\issue111_candidate.py" --repository $SourceWorktree --source-base $SourceBase | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
$CandidateTree = [string]$CandidateState.execution_tree
$FullIndexTree = [string]$CandidateState.full_index_tree

[string[]]$ChangedPaths = @(git diff --name-only --no-renames $SourceBase $CandidateTree --)
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: changed-path derivation failed' }
[Array]::Sort($ChangedPaths, [StringComparer]::Ordinal)
$ChangedPathsSha256 = Get-LfListSha256 $ChangedPaths

$ApprovalPattern = 'issue-115-webrtc-ice-v3.execution-approval*.json'
$ExecutionMatches = @()
foreach ($File in Get-ChildItem (Split-Path $GuidePath) -File -Filter $ApprovalPattern) {
  try {
    $CandidateApproval = Get-Content -Raw -LiteralPath $File.FullName | ConvertFrom-Json
    Assert-ExactFields $CandidateApproval @(
      'schema_version','approval_type','guide_revision','guide_sha256','source_base',
      'candidate_tree','full_index_tree','changed_paths','changed_paths_sha256',
      'control_blobs','approved_at','approver','approval_reference','human_approval'
    ) 'execution approval'
    if ($CandidateApproval.candidate_tree -ceq $CandidateTree -and
        $CandidateApproval.full_index_tree -ceq $FullIndexTree) {
      $ExecutionMatches += [pscustomobject]@{ path = $File.FullName; value = $CandidateApproval }
    }
  } catch {
    continue
  }
}
if ($ExecutionMatches.Count -ne 1) {
  throw 'BLOCKED: expected exactly one execution approval for this candidate'
}
$ExecutionApproval = $ExecutionMatches[0].value
$ExecutionApprovalPath = $ExecutionMatches[0].path
[string[]]$ApprovedChangedPaths = @($ExecutionApproval.changed_paths)
if ((Get-ArrayJson $ApprovedChangedPaths) -cne (Get-ArrayJson $ChangedPaths) -or
    $ExecutionApproval.schema_version -ne 1 -or
    $ExecutionApproval.approval_type -cne 'manual-guide-execution' -or
    $ExecutionApproval.guide_revision -cne 'k6-115-webrtc-ice-v3' -or
    $ExecutionApproval.guide_sha256 -cne (Get-Sha256 $GuidePath) -or
    $ExecutionApproval.source_base -cne $SourceBase -or
    $ExecutionApproval.changed_paths_sha256 -cne $ChangedPathsSha256 -or
    $ExecutionApproval.approver -cne 'maintainer' -or
    $ExecutionApproval.human_approval -cne 'approved' -or
    [string]::IsNullOrWhiteSpace([string]$ExecutionApproval.approved_at) -or
    [string]::IsNullOrWhiteSpace([string]$ExecutionApproval.approval_reference)) {
  throw 'BLOCKED: execution approval binding mismatch'
}
if ($ExecutionApproval.control_blobs.PSObject.Properties.Count -eq 0) {
  throw 'BLOCKED: empty control-blob authority'
}
foreach ($Property in $ExecutionApproval.control_blobs.PSObject.Properties) {
  $ControlPath = [string]$Property.Name
  if ($ControlPath.Contains('\') -or $ControlPath.StartsWith('/') -or
      $ControlPath.Split('/') -contains '..') {
    throw "BLOCKED: invalid control path: $ControlPath"
  }
  $Entry = (git ls-tree $CandidateTree -- $ControlPath)
  if ($LASTEXITCODE -ne 0 -or $Entry -notmatch '^\d+ blob ([0-9a-f]{40})\t') {
    throw "BLOCKED: unresolved control blob: $ControlPath"
  }
  if ($Matches[1] -cne [string]$Property.Value) {
    throw "BLOCKED: control blob mismatch: $ControlPath"
  }
}
if (-not $ExecutionApproval.control_blobs.PSObject.Properties['scripts/k6/runIssue115Guide.ps1']) {
  throw 'BLOCKED: runner is absent from control-blob authority'
}

$Nonce = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetTempPath()
$CandidateArchive = Join-Path $TempRoot "k6-115-candidate-$Nonce.zip"
$CandidateRoot = Join-Path $TempRoot "k6-115-candidate-$Nonce"
$SourceArchive = Join-Path $TempRoot "k6-115-source-$Nonce.zip"
$SourceRoot = Join-Path $TempRoot "k6-115-source-$Nonce"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-115-webrtc-ice-v3-evidence\$Nonce"
foreach ($Path in @($CandidateArchive,$CandidateRoot,$SourceArchive,$SourceRoot,$EvidenceRoot)) {
  if (Test-Path -LiteralPath $Path) { throw "BLOCKED: path collision: $Path" }
}
python "$SourceWorktree\scripts\k6\issue111_candidate.py" --repository $SourceWorktree --source-base $SourceBase --expected-tree $CandidateTree --archive $CandidateArchive | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate archive failed' }
git archive --format=zip --output=$SourceArchive $SourceBase
if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: source archive failed' }
Expand-Archive -LiteralPath $CandidateArchive -DestinationPath $CandidateRoot
Expand-Archive -LiteralPath $SourceArchive -DestinationPath $SourceRoot
~~~

Execute only CandidateRoot's approved runner:

~~~powershell
& "$CandidateRoot\scripts\k6\runIssue115Guide.ps1" -Repository $SourceWorktree -CandidateRoot $CandidateRoot -SourceRoot $SourceRoot -GuideApproval $GuideApproval -ExecutionApproval $ExecutionApproval -EvidenceRoot $EvidenceRoot -RunId $Nonce
~~~

The runner verifies its own blob and every wrapper/guard/browser/observer/preliminary-validator/
cleanup/finalizer blob against execution approval. No mutable SourceWorktree control runs unless its
hash is first proven equal to the CandidateTree blob after temp cleanup.

## Sealed dependency and browser egress boundary

Package/lock bytes equal SourceBase. CandidateRoot's stdlib-only wrapper enables its network guard
before six npm ci --offline operations, including lifecycle children. Only npm cache filesystem
reads are allowed; cache miss is BLOCKED and no network retry exists.

No Docker application build runs because this ticket changes only client/call fixture code; #117
owns image validation. Gitleaks alone uses its cached immutable digest with --pull=never,
--network=none, and --rm. Docker/provider environment values are stripped without printing.

The browser is C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe, version
151.0.4129.101, SHA-256
24f626e48dae3574b4d59adc8f23722f890fd0a64f78c772384b783b96bcf1a0; drift is BLOCKED. The CandidateTree browser runner creates a
unique empty profile and launches Edge with background networking, sync, first-run, extensions,
component updates, and default apps disabled. All HTTP(S)/WebSocket traffic is forced through a
guide-owned deny proxy that allows only the registered fixture TCP port. Host resolver maps every
other name to NOTFOUND.

Before navigation, CDP installs and freezes a guard around the native RTCPeerConnection constructor.
It permits only the one registered loopback STUN authority and rejects public/literal external or
unregistered-loopback ICE URLs before native construction. No page reference to an unwrapped native
constructor remains. Every peer request first crosses the fixture-owned broker; the external-STUN
positive control must be rejected and counted by that broker before a native peer exists, so the
test never sends a packet to public STUN. CDP request interception and an Edge-PID TCP/UDP monitor
sample throughout the run; any remote or unregistered endpoint is FAIL. Positive controls cover
external DNS/HTTP, unregistered loopback TCP, literal external ICE, external STUN/UDP, and common
local Mongo/Redis/RabbitMQ ports. Candidate business code cannot author broker/CDP/PID-monitor
counts.

The only registered endpoints are fixture HTTP, CDP, and loopback STUN ports created under the run
registry. Two sandboxed iframe principals use memory-only labels and AudioContext/canvas tracks; no
camera, microphone, device label, token, cookie, or real account is used.

## Closed catalog and independent observations

Validate catalog hash before execution. Its exact ordered/set-equal IDs, tuple meanings, scenario
observation field sets/types, terminal values, and MA mappings are normative. Unknown, missing,
duplicate, reordered, stale, or extra ID/field is BLOCKED. Every ID has one exact fixture and oracle;
compressed ID ranges from v2 are retired.

SourceRoot and CandidateRoot product-contract observers run in separate child processes. Source
authority is SourceCommitTree. Candidate output cannot author PASS/outcome/verdict. Preliminary
validator from CandidateRoot validates catalog, provenance, observations, source/candidate contract
digests, browser broker/CDP/PID data, and copies sanitized observations to
EvidenceRoot/observations. It writes only observation-attestation, not final manifest/Evaluation.

MA mapping: 01 ICE; 02 peer paths; 03 evidence/credential safety; 04 media classifier;
05 lifecycle; 06 product contracts; 07 browser fixture; 08 gates, egress, scans, retention, cleanup.
Classifier never mutates CALL_STATES, signaling, CallHistory, Mongo, Redis, RabbitMQ, or call logs.

## Acyclic execution/finalization

One CandidateRoot runner owns a registered outer try/finally:

1. Verify approvals, catalog, exact path/blob inventory, source/candidate archives.
2. Install exact dependencies under deny-all bootstrap guard.
3. Start registered deny proxy, HTTP/CDP/loopback STUN, pinned Edge, empty profile, monitors, and
   execute the catalog browser matrix plus deterministic/source contract observers.
4. Preliminary-validate and retain sanitized observations only.
5. Run focused Issue #115 tests, root test:ci, ci:validate, lint:ci, client tests/build, server full
   tests, and git diff --check with explicit checked exits and safe summaries.
6. Scan candidate diff, client dist, observations, and summaries using cached Gitleaks digest
   c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f,
   --pull=never, --network=none, redact=100.
7. Finally closes peers/tracks/timers/listeners/pages, Edge, proxy, HTTP/CDP/STUN, and monitors;
   removes unique profile and all OS-temp roots; verifies zero registered/unregistered endpoints,
   process, page, peer, track, timer, listener, temp path, provider request/mutation, and D2 mutation.
   It writes a closed cleanup observation to EvidenceRoot. Cleanup failure is BLOCKED.
8. Recompute CandidateTree and retained digests. Run approved finalizer after cleanup to derive
   MA-115-01..08 from observations, commands, scans, and cleanup, then atomically write
   evidence-inventory.json. Behavioral/gate/scan failure is FAILED; non-failing unavailable/
   authority/cleanup is BLOCKED.
9. Scan every inventory-listed file plus evidence-inventory itself. Write a closed
   final-scan-attestation with only file digests, zero findings, and exit zero.
10. Finalizer seal mode validates that attestation and writes final-manifest.json and
    pending-evaluation.json. Final manifest contains schema-constrained digests/booleans and no
    self-hash/self-scan claim. record_evaluation.py validates pending safe text.

No authoritative manifest/Evaluation exists before full gate and cleanup. TempOutput is never
retained authority. If finalizer/recorder cannot append, workflow stops with a Resume Contract and
does not claim acceptance.

## Append-only Evaluation

Pending schema v2 has exactly MA-115-01..08. Behavioral failures derive FAILED/pending. With no FAIL,
unrunnable/authority/cleanup derives BLOCKED/pending. Eight PASS results derive BLOCKED/pending only
for missing human approval with null accepted_run_id/approval_sha256. NOT_RUN follows only the first
terminal case.

Append with SourceWorktree recorder only after its worktree/index blob is reverified against the
pinned SourceBase blob/hash, with repository/guide in SourceWorktree and
exact SourceBase/CandidateTree. Then stop for maintainer acceptance. The manual-acceptance sidecar
uses the exact repository schema and binds the pending run. A new PASSED/approved Evaluation must
use byte-identical results, accepted_run_id, sidecar SHA-256, and --acceptance-approval. Preserve
every line; no rewrite/truncate/delete.

Public STUN/TURN/network-matrix readiness remains D2/#118. D2_MUTATIONS=0. Semantic change requires
v4 plus fresh review and approval.
