# Manual Test Guide: K6 Issue #114 — Private S3 Upload Boundary

## Immutable authority

- Specification snapshot SHA-256: 6710e05afb678cd15e36cdb9e7e97754e0dbdf373c66ff71a4eccb07c8e2f3cb
- Ticket review SHA-256: 5d9317e5291cb17a8012466dd76839ad7179b335f81eb56573944454b82bbc49
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-114-s3-upload-v3
- Closed case catalog: issue-114-s3-upload-v3.catalog.json
- Catalog SHA-256: 27280af7f0ff95ea696e50e51da6f99c51ac93e541fc119af852dee7ff223195
- Evaluation history: issue-114-s3-upload-v3.evaluations.jsonl

Guides v1/v2 and their reviews remain immutable historical evidence. This v3 is self-contained and
supersedes every executable/identity/chronology statement in them. The ticket snapshot and v3
catalog define behavior. No per-Issue code review runs.

Pre-D2 uses fake/in-memory Mongo, storage, queue, emitter, clock, and UUID adapters only. There is no
browser case and no loopback service. Browser PUT, ETag, CORS, and live provider behavior remain
Issue #118 after D2. Every socket, DNS, provider request, provider mutation, and D2 mutation count
must be zero.

## Approval schemas

Guide approval contains exactly: schema_version=1, approval_type=manual-guide,
guide_revision, guide_sha256, source_base, catalog_sha256, approved_at, approver=maintainer,
approval_reference, human_approval=approved.

Execution approval is requested only after TDD implementation and green focused tests. It contains
exactly: schema_version=1, approval_type=manual-guide-execution, guide_revision, guide_sha256,
source_base, candidate_tree, full_index_tree, changed_paths (sorted exact string array),
changed_paths_sha256, control_blobs (exact path-to-Git-blob map), approved_at,
approver=maintainer, approval_reference, human_approval=approved. Prefixes never authorize a path;
the approved exact array is the sole changed-scope authority.

Both sidecars are under .agents/manual-tests/k6-public-demo. Missing, stale, extra-field, wrong
approver, hash, catalog, tree, path, or blob binding is BLOCKED.

## Source-pinned bootstrap and CandidateTree authority

Before CandidateRoot exists, only Git, Python, and the SourceBase copy of
scripts/k6/issue111_candidate.py may execute. Its SourceBase blob is
cbcbc592bf4d4e4ee7b44396b6ac32ae189b6c2d and SHA-256 is
8d8182d193d38f275bd27b91a50ecd4f7b6128d45a39961cbe9cb57e3468b397.
scripts/record_evaluation.py is also immutable from SourceBase, blob
42b8a0d216bd218954a46a49dc912e349d759f19, SHA-256
6813e382d8c6442561f69732e80d55fc31307b94e0f374bf08cd9231ee9075dc.
Package manifests/locks, these two scripts, and prior-Issue K6 harnesses may not change.

At execution, all non-manual implementation/test/control changes are staged. There are no unstaged
tracked changes and no untracked files outside the approved manual evidence root. Commits after
SourceBase may change only manual/workflow documents; executable committed drift is BLOCKED.
Verify the helper worktree bytes and index blob equal SourceBase before using it.

The bootstrap computes CandidateTree/full-index tree, compares the exact SourceBase-to-CandidateTree
path set and digest with execution approval, archives CandidateTree, and separately archives the
full SourceBase commit. SourceRoot is bound to SourceCommitTree. SourceExecutionProjection is a
named filtered baseline only and is never compared to SourceBase^{tree}.

Run this block from the Issue #114 worktree after the exact execution approval exists. The
execution-approval sidecar stays unstaged so its own bytes cannot change the approved
full_index_tree. Untracked files are permitted only below the manual-evidence root.

~~~powershell
$ErrorActionPreference = 'Stop'
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-114'
$ExpectedBranch = 'nhibuaa/k6-issue-114-s3-upload'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
$ExpectedSourceTree = '8e0dc6143540018ba0008f42d31b3398ca138ee5'
$GuidePath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-114-s3-upload-v3.md'
$CatalogPath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-114-s3-upload-v3.catalog.json'
$GuideApprovalPath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-114-s3-upload-v3.approval.json'

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
    $GuideApproval.guide_revision -cne 'k6-114-s3-upload-v3' -or
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

$ApprovalPattern = 'issue-114-s3-upload-v3.execution-approval*.json'
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
    $ExecutionApproval.guide_revision -cne 'k6-114-s3-upload-v3' -or
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
if (-not $ExecutionApproval.control_blobs.PSObject.Properties['scripts/k6/runIssue114Guide.ps1']) {
  throw 'BLOCKED: runner is absent from control-blob authority'
}

$Nonce = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetTempPath()
$CandidateArchive = Join-Path $TempRoot "k6-114-candidate-$Nonce.zip"
$CandidateRoot = Join-Path $TempRoot "k6-114-candidate-$Nonce"
$SourceArchive = Join-Path $TempRoot "k6-114-source-$Nonce.zip"
$SourceRoot = Join-Path $TempRoot "k6-114-source-$Nonce"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-114-s3-upload-v3-evidence\$Nonce"
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

After materialization, execute only:

~~~powershell
& "$CandidateRoot\scripts\k6\runIssue114Guide.ps1" -Repository $SourceWorktree -CandidateRoot $CandidateRoot -SourceRoot $SourceRoot -GuideApproval $GuideApproval -ExecutionApproval $ExecutionApproval -EvidenceRoot $EvidenceRoot -RunId $Nonce
~~~

The runner verifies every control file in CandidateRoot against execution-approval control_blobs.
Observer, guard, command wrapper, preliminary validator, cleanup, finalizer, and runner never execute
from mutable SourceWorktree. The only post-cleanup SourceWorktree control invocation is allowed
after git hash-object proves its bytes equal the approved CandidateTree blob.

## Sealed bootstrap and network policy

Package/lock bytes equal SourceBase. CandidateRoot's stdlib-only command wrapper activates
NODE_OPTIONS with the CandidateTree network guard before all six npm ci --offline operations,
including lifecycle subprocesses. Policy is deny-all: DNS, net/tls, HTTP(S), fetch/undici, AWS SDK,
and every loopback destination are blocked. External and unregistered-loopback positive controls in
the catalog must be blocked and counted. Cache miss is BLOCKED; no install fallback/network retry.

No Docker application build is part of this ticket because nginx/Docker bytes are unchanged. The
later Wave/#117 barrier owns image builds. Gitleaks is the only Docker execution and uses the
already-cached immutable digest with --pull=never --network=none and --rm. Docker/provider
environment keys are stripped without values.

All scenarios must inject the fake adapters above. Importing a real Mongoose connection, S3 client
transport, RabbitMQ/Redis client, axios/fetch remote transport, or process runtime .env is FAIL.
Browser identity is recorded as NOT_APPLICABLE_PRE_D2.

## Closed catalog and source oracle

The v3 catalog is validated against its exact SHA-256 before scenarios. Its case object is the
required ordered/set-equal inventory. Each tuple assigns an exact fixture, code, counters, and MA
case. Each scenario's observations object must contain exactly the catalog fields/types; unknown,
missing, duplicate, reordered, stale, or extra case/field is BLOCKED.

Observer runs SourceRoot and CandidateRoot contracts in separate child processes. Source contract
authority is SourceCommitTree. Candidate may differ only by the catalog's explicit init-request
fileSize delta; all response/event/identifier shapes remain exact. Candidate output cannot author a
verdict. Preliminary validator from CandidateRoot checks catalog, schemas, source/candidate
provenance, and copies sanitized observations atomically to EvidenceRoot/observations with an
observation-attestation. It does not write a manifest or Evaluation.

MA mapping is fixed by catalog: 01 keys; 02 MIME/size/parts; 03 multipart state/concurrency;
04 private projections; 05 worker ownership/races; 06 faults/errors; 07 activation/contracts;
08 gates, guards, scans, retention, and cleanup.

## Acyclic execution and finalization

The runner executes these phases in one registered outer try/finally:

1. Materialize and verify approvals/catalog/control blobs.
2. Install exact lockfiles under deny-all egress.
3. Run observer and preliminary observation validator.
4. Run focused Issue #114 tests, root test:ci, ci:validate, lint:ci, client tests/build, server full
   tests, and git diff --check. Every command has an explicit checked exit and safe summary.
5. Materialize candidate diff; scan diff, client dist, sanitized observations, and command summaries
   with cached Gitleaks digest
   c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f,
   --pull=never, --network=none, redact=100.
6. Finally terminates registered children/adapters and removes all unique OS-temp source/candidate/
   dependency/diff/output paths. It verifies zero process, port, container, tag, temp path, socket,
   provider request/mutation, and D2 mutation, then writes only a closed cleanup observation to
   EvidenceRoot. Cleanup failure is BLOCKED.
7. Recompute CandidateTree from the index and require the approved value; verify retained artifacts
   unchanged.
8. Run the CandidateTree-bound finalizer after all cleanup. It validates observations, command
   summaries, scans, cleanup, approvals, and zero counters, derives MA-114-01..08, and atomically
   writes evidence-inventory.json. FAILED is derived for any behavioral/gate/scan failure; BLOCKED
   is derived only when no case failed but execution/cleanup/authority was unavailable.
9. Scan every file listed in evidence-inventory.json plus that inventory with pinned Gitleaks. Write
   a closed final-scan-attestation containing only listed digests, exit zero, and zero findings.
10. Finalizer seal mode validates the scan attestation and writes final-manifest.json plus
    pending-evaluation.json. Final manifest contains only schema-constrained digests/booleans and
    has no self-hash/self-scan claim. record_evaluation.py validates pending text before append.

The finalizer never runs before full gates and cleanup. Temp output is never Evaluation authority.
EvidenceRoot is durable and is not modified after pending append except by separately approved
acceptance sidecar/approved Evaluation additions.

## Evaluation transition

pending-evaluation.json uses schema v2 and exactly eight MA results. Behavioral FAIL produces
FAILED/pending. Authority/unrunnable/cleanup BLOCKED with no FAIL produces BLOCKED/pending. When all
eight observations pass, it is BLOCKED/pending only because human approval is absent, with
accepted_run_id=null and approval_sha256=null. Later MA cases are NOT_RUN only after the first
terminal failure/block.

Append using SourceWorktree record_evaluation.py only after its worktree/index blob is reverified
against the pinned SourceBase blob/hash, with exact guide/source/candidate bindings. Recorder failure stops with a Resume
Contract and never claims acceptance.

When all eight pass, stop for maintainer acceptance of the exact pending run. The acceptance sidecar
uses the repository's exact manual-acceptance-run schema. Then create a new PASSED/approved
Evaluation with byte-identical results, accepted_run_id, and sidecar SHA-256, and append with
--acceptance-approval. Never edit, truncate, replace, or delete history.

A semantic change requires v4 and fresh external review/maintainer approval. D2_MUTATIONS remains 0.
