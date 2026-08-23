# Manual Test Guide: K6 Issue #116 — Demo Seed and Reset Boundary

## Immutable authority

- Specification snapshot SHA-256: 8d73c59a15d24d4938538a81edf596f5c215892c7d8a77df0f6e77809aa5f452
- Ticket review SHA-256: 97d435297f26a6ab519309b3a25c7503637256749c224b1b3060d0c5e598f12e
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-116-demo-seed-v3
- Closed case catalog/SHA-256: issue-116-demo-seed-v3.catalog.json /
  6c89c847879a9be74587c0e0e2e78855d1651c11d1d57243428ba49fa8a6244d
- Evaluation history: issue-116-demo-seed-v3.evaluations.jsonl

V1/v2 remain immutable history. V3 supersedes their execution, identity, catalog, environment, and
chronology statements. Ticket snapshot plus v3 catalog are behavioral authority. No per-Issue code
review runs.

This is pre-D2 local acceptance. Only one nonce-owned disposable local Mongo container may receive
writes. No Atlas, Railway, S3, Redis, RabbitMQ, provider credential, remote seed/reset, deployment,
or Issue #61 action is permitted.

## Approval schemas and exact changed scope

Guide approval contains exactly: schema_version=1, approval_type=manual-guide, guide_revision,
guide_sha256, source_base, catalog_sha256, approved_at, approver=maintainer, approval_reference,
human_approval=approved.

Later execution approval contains exactly: schema_version=1,
approval_type=manual-guide-execution, guide_revision, guide_sha256, source_base, candidate_tree,
full_index_tree, changed_paths (sorted exact file array), changed_paths_sha256, control_blobs
(exact path-to-Git-blob map), approved_at, approver=maintainer, approval_reference,
human_approval=approved. This exact array is the only changed-scope allowlist; no directory prefix
authorizes files.

Package manifests/locks, candidate helper, Evaluation recorder, nginx/Docker files, and prior K6
harnesses cannot change. Missing/extra/stale approval field, path, digest, tree, catalog, guide,
blob, or approver is BLOCKED.

## Source-pinned bootstrap

Before CandidateRoot, execute only Git, Python, and SourceBase
scripts/k6/issue111_candidate.py: blob cbcbc592bf4d4e4ee7b44396b6ac32ae189b6c2d, SHA-256
8d8182d193d38f275bd27b91a50ecd4f7b6128d45a39961cbe9cb57e3468b397.
record_evaluation.py remains blob 42b8a0d216bd218954a46a49dc912e349d759f19, SHA-256
6813e382d8c6442561f69732e80d55fc31307b94e0f374bf08cd9231ee9075dc.

All non-manual source/test/control changes are staged. There is no relevant unstaged or untracked
executable drift. Commits after SourceBase change manual/workflow paths only. Verify trusted helper/
recorder worktree and index bytes against SourceBase. Bootstrap derives CandidateTree/full index,
compares exact changed_paths and digest with execution approval, archives CandidateTree, and
separately archives SourceBase full commit. SourceRoot binds SourceCommitTree;
SourceExecutionProjection is a separately named filtered baseline only.

Run this block from the Issue #116 worktree after the exact execution approval exists. The
execution-approval sidecar stays unstaged so its own bytes cannot change the approved
full_index_tree. Untracked files are permitted only below the manual-evidence root.

~~~powershell
$ErrorActionPreference = 'Stop'
$SourceWorktree = (Resolve-Path '.').Path
$ExpectedWorktree = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-116'
$ExpectedBranch = 'nhibuaa/k6-issue-116-demo-seed'
$SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
$ExpectedSourceTree = '8e0dc6143540018ba0008f42d31b3398ca138ee5'
$GuidePath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-116-demo-seed-v3.md'
$CatalogPath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-116-demo-seed-v3.catalog.json'
$GuideApprovalPath = Join-Path $SourceWorktree '.agents\manual-tests\k6-public-demo\issue-116-demo-seed-v3.approval.json'

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
    $GuideApproval.guide_revision -cne 'k6-116-demo-seed-v3' -or
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

$ApprovalPattern = 'issue-116-demo-seed-v3.execution-approval*.json'
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
    $ExecutionApproval.guide_revision -cne 'k6-116-demo-seed-v3' -or
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
if (-not $ExecutionApproval.control_blobs.PSObject.Properties['scripts/k6/runIssue116Guide.ps1']) {
  throw 'BLOCKED: runner is absent from control-blob authority'
}

$Nonce = [Guid]::NewGuid().ToString('N')
$TempRoot = [IO.Path]::GetTempPath()
$CandidateArchive = Join-Path $TempRoot "k6-116-candidate-$Nonce.zip"
$CandidateRoot = Join-Path $TempRoot "k6-116-candidate-$Nonce"
$SourceArchive = Join-Path $TempRoot "k6-116-source-$Nonce.zip"
$SourceRoot = Join-Path $TempRoot "k6-116-source-$Nonce"
$EvidenceRoot = Join-Path $SourceWorktree ".agents\manual-tests\k6-public-demo\issue-116-demo-seed-v3-evidence\$Nonce"
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

Execute only:

~~~powershell
& "$CandidateRoot\scripts\k6\runIssue116Guide.ps1" -Repository $SourceWorktree -CandidateRoot $CandidateRoot -SourceRoot $SourceRoot -GuideApproval $GuideApproval -ExecutionApproval $ExecutionApproval -EvidenceRoot $EvidenceRoot -RunId $Nonce
~~~

Runner verifies itself and every wrapper/guard/observer/preliminary-validator/cleanup/finalizer blob
against execution approval. No mutable SourceWorktree control runs without exact CandidateTree blob
verification after temp cleanup.

## Sealed dependencies, secrets, and registered Mongo

Package/lock bytes equal SourceBase. CandidateRoot's stdlib-only wrapper activates its guard before
all six npm ci --offline operations and lifecycle children. Cache miss is BLOCKED; no network retry.
No application Docker build runs because this ticket does not change Docker/nginx; #117 owns image
validation.

Mongo identity is the immutable cached digest
mongo@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703.
Use --pull=never, a nonce name and guide/run labels, loopback random port, 512-MiB tmpfs, no volume/
bind, bounded 20-second readiness, and exact structural inspection. Gitleaks is the only other
Docker execution and uses its cached digest with --pull=never --network=none --rm.

The network guard allows only the registered Mongo port to the registered guide-owned container.
It denies DNS, external/literal IP, all other loopback, common Mongo/Redis/RabbitMQ ports, HTTP(S),
fetch, AWS, Redis, RabbitMQ, and Railway adapters. Catalog positive controls prove denied external,
unregistered local, and allowed registered Mongo behavior. Candidate business code cannot author
guard counters.

The runner generates a random password and loopback URI inside a child-only environment map passed
directly to guarded child spawn. It never assigns parent PowerShell Env keys, prints values, or
persists them. After each child and in outer finally, it destroys the map, nulls local buffers, and
verifies parent/child key-presence booleans are false. Evidence retains booleans only. Runtime .env
files are rejected.

## Closed per-ID catalog and source oracle

Validate catalog exact hash before scenarios. Every catalog ID individually fixes scenario,
fixture, expected code/counters, MA mapping, and one scenario-specific observations schema with
exact fields/types. Unknown, missing, duplicate, reordered, stale, or extra ID/field is BLOCKED.
Startup inventory is exactly backend, image-worker, audit-worker, notification-worker.

SourceRoot and CandidateRoot canonical dataset/public-contract observers run in separate child
processes. Source authority is SourceCommitTree. Validator removes credential-dependent hashes and
computes immutable source canonical digest; candidate builds twice must match. Candidate runner
cannot author verdicts.

Preliminary validator from CandidateRoot checks catalog/provenance/schema/source equality and copies
sanitized observations to EvidenceRoot/observations plus observation-attestation. It does not write
the final manifest or Evaluation.

MA mapping: 01 canonical/credential; 02 target; 03 collisions; 04 ownership; 05 dry-run/apply;
06 failure/rerun; 07 startup/public shape; 08 full gates, guard, scans, retention, cleanup. Every
retained D2 risk in catalog remains pending and cannot pass from local metadata.

## Acyclic execution/finalization

One registered outer try/finally owns:

1. Approval/catalog/path/blob/source/candidate verification.
2. Dependency bootstrap under deny-all guard.
3. Immutable disposable Mongo start/readiness/empty-state inspection.
4. Exact catalog observations against fake repositories and disposable Mongo; preliminary
   validation retains only sanitized observations.
5. Focused Issue #116 tests, root test:ci, ci:validate, lint:ci, client tests/build, server full
   tests, and git diff --check with explicit checked exits and safe summaries.
6. Scan candidate diff, client dist, observations, and summaries with cached Gitleaks digest
   c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f,
   --pull=never, --network=none, redact=100.
7. Finally destroys child-only secret env, processes, Mongo after exact label/digest check, and all
   unique OS-temp roots. Verify container/volume/bind/port/process/temp/secret-key inventory zero,
   registered/unregistered network counts, externalProviderRequestCount=0,
   providerMutationCount=0, remoteMutationCount=0, D2_MUTATIONS=0. Write a closed cleanup
   observation to EvidenceRoot. Cleanup failure is BLOCKED.
8. Recompute CandidateTree and retained digests. Run CandidateTree-bound finalizer after cleanup;
   it validates observations, commands, scans, cleanup, approvals, and zero counts, derives
   MA-116-01..08, and atomically writes evidence-inventory.json. Behavioral/gate/scan failure is
   FAILED; non-failing unavailable/authority/cleanup is BLOCKED.
9. Scan every inventory-listed file plus inventory. Write a closed final-scan-attestation with file
   digests, exit zero, zero findings.
10. Finalizer seal mode validates scan attestation and writes final-manifest.json and
    pending-evaluation.json. Final manifest has only schema-constrained digests/booleans and no
    self-hash/self-scan claim. Recorder validates pending safe text.

No manifest/Evaluation is authoritative before full gates and cleanup. Temp output is never
evidence authority. Finalizer or append failure creates a Resume Contract and cannot claim
acceptance.

## Append-only Evaluation

Pending schema v2 has exactly MA-116-01..08. Behavioral failure produces FAILED/pending. If no FAIL,
unrunnable/authority/cleanup produces BLOCKED/pending. Eight PASS observations produce
BLOCKED/pending only for absent human approval, accepted_run_id=null, approval_sha256=null.
NOT_RUN starts only after first terminal case.

Append with SourceWorktree recorder only after its worktree/index blob is reverified against the
pinned SourceBase blob/hash, with exact repository/guide/source/
candidate binding. Stop for maintainer acceptance when all pass. Manual-acceptance sidecar binds the
exact pending run. New PASSED/approved Evaluation uses byte-identical results, accepted_run_id,
sidecar SHA-256, and --acceptance-approval. Preserve every line; never rewrite/truncate/delete.

Remote fingerprint read-back, remote seed/reset, Atlas connectivity, and S3 cleanup remain D2.
D2_MUTATIONS=0. Semantic change requires v4 and fresh review/approval.
