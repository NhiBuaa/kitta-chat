# Manual Test Guide: K6 Issue #114 — Private S3 Upload Boundary

## Immutable authority

- Specification snapshot: issue-114-spec-snapshot.md
- Specification SHA-256: 6710e05afb678cd15e36cdb9e7e97754e0dbdf373c66ff71a4eccb07c8e2f3cb
- Ticket review SHA-256: 5d9317e5291cb17a8012466dd76839ad7179b335f81eb56573944454b82bbc49
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-114-s3-upload-v5
- Catalog: issue-114-s3-upload-v5.catalog.json
- Evaluation history: issue-114-s3-upload-v5.evaluations.jsonl

V1–v4 and their reviews remain immutable historical evidence. V4 supersedes their executable,
catalog, identity, and Evaluation-transition statements. No per-Issue code review runs.

This is pre-D2 local acceptance. Fake/in-memory Mongo, storage, queue, emitter, clock, and UUID
adapters are mandatory. Browser PUT, ETag, exact-origin CORS, AWS, Railway, live image processing,
provider credentials, deployment, rollback, and Issue #61 are forbidden. Required result:
D2_MUTATIONS=0.

## Approval and candidate contracts

Guide approval has exactly:

schema_version, approval_type=manual-guide, guide_revision, guide_sha256, source_base,
catalog_sha256, approved_at, approver=maintainer, approval_reference, human_approval=approved.

Execution approval is created only after TDD and green focused tests. It has exactly:

schema_version, approval_type=manual-guide-execution, guide_revision, guide_sha256, source_base,
candidate_tree, full_index_tree, changed_paths, changed_paths_sha256, control_blobs, approved_at,
approver=maintainer, approval_reference, human_approval=approved.

changed_paths is the sorted exact diff from SourceExecutionProjection to candidate_tree.
full_index_tree separately binds all staged implementation, tests, guides, reviews, and workflow
evidence. The execution-approval sidecar stays unstaged. Prefixes never authorize paths.

The exact control inventory is:

1. scripts/k6/issue114/bootstrap.ps1
2. scripts/k6/issue114/catalogValidator.cjs
3. scripts/k6/issue114/commandWrapper.cjs
4. scripts/k6/issue114/finalizer.cjs
5. scripts/k6/issue114/networkGuard.cjs
6. scripts/k6/issue114/observer.cjs
7. scripts/k6/issue114/preliminaryValidator.cjs
8. scripts/k6/issue114/runGuide.ps1
9. scripts/k6/issue114/scenarios.cjs
10. scripts/k6/issue114/transitionEvaluation.cjs

Execution approval control_blobs must be set-equal to this list. JSON property order is
non-authoritative because names are canonically sorted. Every value is the exact CandidateTree Git
blob. Missing, extra, non-blob, tampered, stale, or wrong-tree material is BLOCKED before the first
candidate process.

## Copy-run trust loader

Paste this function from the approved guide into PowerShell. It executes only Git, the SourceBase
candidate helper, and an exact CandidateTree bootstrap blob. Git blob identity, not platform line
endings, is authority.

~~~powershell
function Invoke-K6Issue114Guide {
  [CmdletBinding()]
  param(
    [ValidateSet('observe','approve')][string]$Mode = 'observe',
    [string]$AcceptanceApprovalPath,
    [string]$AcceptedRunId
  )
  $ErrorActionPreference = 'Stop'
  $Repository = (Resolve-Path '.').Path
  $ExpectedRepository = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-114'
  $ExpectedBranch = 'nhibuaa/k6-issue-114-s3-upload'
  $SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
  $SourceCommitTree = '8e0dc6143540018ba0008f42d31b3398ca138ee5'
  $SourceProjection = 'd9de20b5fac1da34c143d96fa26ae22843df042c'
  $ManualRoot = '.agents/manual-tests/k6-public-demo'
  $GuideRel = "$ManualRoot/issue-114-s3-upload-v5.md"
  $CatalogRel = "$ManualRoot/issue-114-s3-upload-v5.catalog.json"
  $GuideApprovalRel = "$ManualRoot/issue-114-s3-upload-v5.approval.json"
  $HistoryRel = "$ManualRoot/issue-114-s3-upload-v5.evaluations.jsonl"
  [string[]]$ExpectedControls = @(
    'scripts/k6/issue114/bootstrap.ps1',
    'scripts/k6/issue114/catalogValidator.cjs',
    'scripts/k6/issue114/commandWrapper.cjs',
    'scripts/k6/issue114/finalizer.cjs',
    'scripts/k6/issue114/networkGuard.cjs',
    'scripts/k6/issue114/observer.cjs',
    'scripts/k6/issue114/preliminaryValidator.cjs',
    'scripts/k6/issue114/runGuide.ps1',
    'scripts/k6/issue114/scenarios.cjs',
    'scripts/k6/issue114/transitionEvaluation.cjs'
  )
  $ExpectedControls = @($ExpectedControls | Sort-Object -CaseSensitive)

  function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  function Get-ArrayJson([object[]]$Value) {
    return ConvertTo-Json -Compress -InputObject ([object[]]$Value)
  }
  function Assert-ExactFields([object]$Object,[string[]]$Expected,[string]$Label) {
    [string[]]$Actual = @($Object.PSObject.Properties.Name | Sort-Object -CaseSensitive)
    [string[]]$Wanted = @($Expected | Sort-Object -CaseSensitive)
    if ((Get-ArrayJson $Actual) -cne (Get-ArrayJson $Wanted)) {
      throw "BLOCKED: $Label fields are not exact"
    }
  }
  function Get-LfListSha256([string[]]$Paths) {
    $Canonical = if ($Paths.Count -eq 0) { '' } else { ($Paths -join [char]10) + [char]10 }
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
      $Bytes = [Text.Encoding]::UTF8.GetBytes($Canonical)
      return ([BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()
    } finally { $Hasher.Dispose() }
  }
  function Write-GitBlob([string]$Blob,[string]$Destination) {
    $Info = [Diagnostics.ProcessStartInfo]::new()
    $Info.FileName = (Get-Command git).Source
    foreach ($Argument in @('-C',$Repository,'cat-file','blob',$Blob)) {
      [void]$Info.ArgumentList.Add($Argument)
    }
    $Info.UseShellExecute = $false
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $GitProcess = $null
    $Stream = $null
    try {
      $GitProcess = [Diagnostics.Process]::Start($Info)
      $Stream = [IO.File]::Open($Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      $CopyTask = $GitProcess.StandardOutput.BaseStream.CopyToAsync($Stream)
      $ErrorTask = $GitProcess.StandardError.ReadToEndAsync()
      if (-not $CopyTask.Wait(30000)) { throw 'BLOCKED: Git blob stream timed out' }
      $Stream.Flush()
      if (-not $GitProcess.WaitForExit(30000)) { throw 'BLOCKED: Git blob process timed out' }
      [void]$ErrorTask.GetAwaiter().GetResult()
      if ($GitProcess.ExitCode -ne 0) { throw 'BLOCKED: Git blob materialization failed' }
    } finally {
      if ($null -ne $Stream) { $Stream.Dispose() }
      if ($null -ne $GitProcess) {
        $GitCleanupError = $null
        try {
          if (-not $GitProcess.HasExited) {
            $GitProcess.Kill($true)
            if (-not $GitProcess.WaitForExit(10000)) {
              $GitCleanupError = 'timeout'
            }
          }
        } catch {
          $GitCleanupError = 'termination-failed'
        } finally {
          $GitProcess.Dispose()
        }
        if ($null -ne $GitCleanupError) { throw 'BLOCKED: Git blob process cleanup failed' }
      }
    }
  }

  if ($Repository -cne $ExpectedRepository) { throw 'BLOCKED: unexpected worktree' }
  if ((git branch --show-current).Trim() -cne $ExpectedBranch) { throw 'BLOCKED: unexpected branch' }
  git merge-base --is-ancestor $SourceBase HEAD
  if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: stale source base' }
  if ((git rev-parse ($SourceBase + '^{tree}')).Trim() -cne $SourceCommitTree) {
    throw 'BLOCKED: SourceCommitTree mismatch'
  }
  if ((git cat-file -t $SourceProjection).Trim() -cne 'tree') {
    throw 'BLOCKED: SourceExecutionProjection is not a tree'
  }
  git diff --quiet
  if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: unstaged tracked changes exist' }
  [string[]]$Untracked = @(git ls-files --others --exclude-standard)
  foreach ($Path in $Untracked) {
    if (-not $Path.StartsWith(($ManualRoot + '/'),[StringComparison]::Ordinal)) {
      throw "BLOCKED: untracked file outside manual evidence root: $Path"
    }
  }

  foreach ($Trusted in @(
    @{ path='scripts/k6/issue111_candidate.py'; blob='cbcbc592bf4d4e4ee7b44396b6ac32ae189b6c2d' },
    @{ path='scripts/record_evaluation.py'; blob='42b8a0d216bd218954a46a49dc912e349d759f19' }
  )) {
    $SourceBlob = (git rev-parse ($SourceBase + ':' + $Trusted.path)).Trim()
    $IndexBlob = (git rev-parse (':' + $Trusted.path)).Trim()
    $WorktreeBlob = (git hash-object ('--path=' + $Trusted.path) -- $Trusted.path).Trim()
    if ($SourceBlob -cne $Trusted.blob -or $IndexBlob -cne $Trusted.blob -or
        $WorktreeBlob -cne $Trusted.blob) {
      throw "BLOCKED: trusted Git blob drift: $($Trusted.path)"
    }
  }

  $GuideBlob = (git rev-parse (':' + $GuideRel)).Trim()
  $CatalogBlob = (git rev-parse (':' + $CatalogRel)).Trim()
  $GuideApprovalBlob = (git rev-parse (':' + $GuideApprovalRel)).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: guide state is not in the index' }
  $GuideApproval = Get-Content -Raw -LiteralPath (Join-Path $Repository $GuideApprovalRel) | ConvertFrom-Json
  Assert-ExactFields $GuideApproval @(
    'schema_version','approval_type','guide_revision','guide_sha256','source_base',
    'catalog_sha256','approved_at','approver','approval_reference','human_approval'
  ) 'guide approval'

  $CandidateState = python (Join-Path $Repository 'scripts/k6/issue111_candidate.py') --repository $Repository --source-base $SourceBase | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'BLOCKED: candidate identity failed' }
  $CandidateTree = [string]$CandidateState.execution_tree
  $FullIndexTree = [string]$CandidateState.full_index_tree
  [string[]]$ChangedPaths = @(git diff --name-only --no-renames $SourceProjection $CandidateTree --)
  $ChangedPaths = @($ChangedPaths | Sort-Object -CaseSensitive)
  $ChangedPathsSha256 = Get-LfListSha256 $ChangedPaths

  $ExecutionMatches = @()
  foreach ($File in Get-ChildItem (Join-Path $Repository $ManualRoot) -File -Filter 'issue-114-s3-upload-v5.execution-approval*.json') {
    try {
      $Value = Get-Content -Raw -LiteralPath $File.FullName | ConvertFrom-Json
      Assert-ExactFields $Value @(
        'schema_version','approval_type','guide_revision','guide_sha256','source_base',
        'candidate_tree','full_index_tree','changed_paths','changed_paths_sha256',
        'control_blobs','approved_at','approver','approval_reference','human_approval'
      ) 'execution approval'
      if ($Value.candidate_tree -ceq $CandidateTree -and $Value.full_index_tree -ceq $FullIndexTree) {
        $ExecutionMatches += [pscustomobject]@{ path=$File.FullName; value=$Value }
      }
    } catch { continue }
  }
  if ($ExecutionMatches.Count -ne 1) {
    throw 'BLOCKED: expected exactly one execution approval for this candidate'
  }
  $ExecutionApprovalPath = $ExecutionMatches[0].path
  $ExecutionApproval = $ExecutionMatches[0].value
  [string[]]$ApprovedPaths = @($ExecutionApproval.changed_paths)
  [string[]]$ControlNames = @($ExecutionApproval.control_blobs.PSObject.Properties.Name | Sort-Object -CaseSensitive)
  if ($GuideApproval.schema_version -ne 1 -or $GuideApproval.approval_type -cne 'manual-guide' -or
      $GuideApproval.guide_revision -cne 'k6-114-s3-upload-v5' -or
      $GuideApproval.source_base -cne $SourceBase -or $GuideApproval.approver -cne 'maintainer' -or
      $GuideApproval.human_approval -cne 'approved' -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approved_at) -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approval_reference) -or
      $ExecutionApproval.schema_version -ne 1 -or
      $ExecutionApproval.approval_type -cne 'manual-guide-execution' -or
      $ExecutionApproval.guide_revision -cne 'k6-114-s3-upload-v5' -or
      $ExecutionApproval.source_base -cne $SourceBase -or
      $ExecutionApproval.changed_paths_sha256 -cne $ChangedPathsSha256 -or
      (Get-ArrayJson $ApprovedPaths) -cne (Get-ArrayJson $ChangedPaths) -or
      (Get-ArrayJson $ControlNames) -cne (Get-ArrayJson $ExpectedControls) -or
      $ExecutionApproval.approver -cne 'maintainer' -or
      $ExecutionApproval.human_approval -cne 'approved' -or
      [string]::IsNullOrWhiteSpace([string]$ExecutionApproval.approved_at) -or
      [string]::IsNullOrWhiteSpace([string]$ExecutionApproval.approval_reference)) {
    throw 'BLOCKED: approval binding mismatch'
  }
  foreach ($Property in $ExecutionApproval.control_blobs.PSObject.Properties) {
    $Entry = (git ls-tree $CandidateTree -- $Property.Name)
    if ($LASTEXITCODE -ne 0 -or $Entry -notmatch '^\d+ blob ([0-9a-f]{40})\t' -or
        $Matches[1] -cne [string]$Property.Value) {
      throw "BLOCKED: control blob mismatch: $($Property.Name)"
    }
  }

  $Nonce = [Guid]::NewGuid().ToString('N')
  $LoaderRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-114-loader-$Nonce"
  $BootstrapPath = Join-Path $LoaderRoot 'bootstrap.ps1'
  $SealedGuide = Join-Path $LoaderRoot 'guide.md'
  $SealedCatalog = Join-Path $LoaderRoot 'catalog.json'
  $SealedGuideApproval = Join-Path $LoaderRoot 'guide-approval.json'
  $SealedExecutionApproval = Join-Path $LoaderRoot 'execution-approval.json'
  $SealedAcceptanceApproval = Join-Path $LoaderRoot 'acceptance-approval.json'
  $EvidenceRoot = Join-Path $Repository "$ManualRoot/issue-114-s3-upload-v5-evidence/$Nonce"
  if ((Test-Path -LiteralPath $LoaderRoot) -or (Test-Path -LiteralPath $EvidenceRoot)) {
    throw 'BLOCKED: nonce path collision'
  }
  $BootstrapProcess = $null
  try {
    [void](New-Item -ItemType Directory -Path $LoaderRoot)
    Write-GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/bootstrap.ps1') $BootstrapPath
    Write-GitBlob $GuideBlob $SealedGuide
    Write-GitBlob $CatalogBlob $SealedCatalog
    Write-GitBlob $GuideApprovalBlob $SealedGuideApproval
    [IO.File]::Copy($ExecutionApprovalPath,$SealedExecutionApproval,$false)
    if ((git hash-object --no-filters $BootstrapPath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/bootstrap.ps1') {
      throw 'BLOCKED: materialized bootstrap mismatch'
    }
    if ($GuideApproval.guide_sha256 -cne (Get-Sha256 $SealedGuide) -or
        $GuideApproval.catalog_sha256 -cne (Get-Sha256 $SealedCatalog) -or
        $ExecutionApproval.guide_sha256 -cne (Get-Sha256 $SealedGuide)) {
      throw 'BLOCKED: approved guide/catalog hash mismatch'
    }
    if ($Mode -eq 'approve') {
      if ([string]::IsNullOrWhiteSpace($AcceptanceApprovalPath) -or
          [string]::IsNullOrWhiteSpace($AcceptedRunId)) {
        throw 'BLOCKED: approval mode requires acceptance sidecar and accepted run id'
      }
      [IO.File]::Copy((Resolve-Path $AcceptanceApprovalPath),$SealedAcceptanceApproval,$false)
    } elseif ($AcceptanceApprovalPath -or $AcceptedRunId) {
      throw 'BLOCKED: observe mode cannot receive acceptance authority'
    }

    $Info = [Diagnostics.ProcessStartInfo]::new()
    $Info.FileName = (Get-Command pwsh).Source
    $AcceptanceArgument = if ($Mode -eq 'approve') { $SealedAcceptanceApproval } else { '' }
    foreach ($Argument in @(
      '-NoLogo','-NoProfile','-NonInteractive','-File',$BootstrapPath,
      '-Repository',$Repository,'-SourceBase',$SourceBase,'-SourceCommitTree',$SourceCommitTree,
      '-SourceExecutionProjection',$SourceProjection,'-CandidateTree',$CandidateTree,
      '-FullIndexTree',$FullIndexTree,'-Guide',$SealedGuide,'-Catalog',$SealedCatalog,
      '-RepositoryGuide',(Join-Path $Repository $GuideRel),
      '-GuideApproval',$SealedGuideApproval,'-ExecutionApproval',$SealedExecutionApproval,
      '-History',(Join-Path $Repository $HistoryRel),'-EvidenceRoot',$EvidenceRoot,
      '-Mode',$Mode,'-AcceptedRunId',([string]$AcceptedRunId),
      '-AcceptanceApproval',$AcceptanceArgument
    )) { [void]$Info.ArgumentList.Add([string]$Argument) }
    $Info.UseShellExecute = $false
    $Info.RedirectStandardOutput = $true
    $Info.RedirectStandardError = $true
    $Info.Environment.Clear()
    foreach ($Name in @('PATH','SystemRoot','TEMP','TMP','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)')) {
      $Value = [Environment]::GetEnvironmentVariable($Name)
      if ($null -ne $Value) { $Info.Environment[$Name] = $Value }
    }
    $BootstrapProcess = [Diagnostics.Process]::Start($Info)
    $Stdout = $BootstrapProcess.StandardOutput.ReadToEndAsync()
    $Stderr = $BootstrapProcess.StandardError.ReadToEndAsync()
    if (-not $BootstrapProcess.WaitForExit(2700000)) {
      throw 'BLOCKED: verified bootstrap timed out'
    }
    [void]$Stdout.GetAwaiter().GetResult()
    [void]$Stderr.GetAwaiter().GetResult()
    if ($BootstrapProcess.ExitCode -ne 0) {
      throw "BLOCKED: verified bootstrap exited $($BootstrapProcess.ExitCode)"
    }
  } finally {
    $BootstrapCleanupError = $null
    if ($null -ne $BootstrapProcess) {
      try {
        if (-not $BootstrapProcess.HasExited) {
          $BootstrapProcess.Kill($true)
          if (-not $BootstrapProcess.WaitForExit(10000)) {
            $BootstrapCleanupError = 'timeout'
          }
        }
      } catch {
        $BootstrapCleanupError = 'termination-failed'
      } finally {
        $BootstrapProcess.Dispose()
      }
    }
    $LoaderCleanupError = $null
    if (Test-Path -LiteralPath $LoaderRoot) {
      try {
        Remove-Item -LiteralPath $LoaderRoot -Recurse -Force
      } catch {
        $LoaderCleanupError = 'remove-failed'
      }
    }
    if (Test-Path -LiteralPath $LoaderRoot) { $LoaderCleanupError = 'retained-root' }
    if ($null -ne $BootstrapCleanupError -or $null -ne $LoaderCleanupError) {
      throw 'BLOCKED: loader process or path cleanup failed'
    }
  }
}
~~~

After implementation and exact execution approval:

~~~powershell
Invoke-K6Issue114Guide -Mode observe
~~~

After explicit maintainer acceptance of the exact pending run:

~~~powershell
Invoke-K6Issue114Guide -Mode approve -AcceptanceApprovalPath '.agents/manual-tests/k6-public-demo/issue-114-s3-upload-v5.acceptance-approval.json' -AcceptedRunId '<exact-pending-run-id>'
~~~

## Verified bootstrap and runner obligations

The verified bootstrap owns one outer try/finally beginning before candidate/source archive
creation. Before any scenario, it independently derives the filtered baseline from SourceCommitTree
by removing only the three workflow paths and manual-evidence prefix encoded by the pinned helper,
then requires exact equality with SourceExecutionProjection. It registers each nonce archive/root
before creation, materializes CandidateTree and the full SourceBase commit separately, verifies
SourceCommitTree, and verifies every extracted control
against CandidateTree plus the exact control map before invoking runGuide.ps1. On every exit it
stops registered children and removes only owned archive/root/dependency/diff/output paths, then
verifies their absence. Fault injection covers both archives, both expansions, control verification,
runner launch, loader blob-stream failure, loader interruption, and a hung bootstrap child.

The loader-supplied allowlist is the complete parent environment for the bootstrap. Candidate
controls may add only fixed non-secret guide metadata. Fake adapters are mandatory. The network
guard activates before all six npm ci --offline operations and lifecycle children. External
DNS/HTTP, unregistered loopback, AWS SDK, Redis, RabbitMQ, and runtime env files are denied. Cache
miss is BLOCKED; no online fallback exists. No application Docker build runs; Issue #117 owns image
builds. Cached Gitleaks alone runs with --pull=never --network=none --rm.

## Catalog, observations, gates, and cleanup

The v5 catalog is sole case authority. Its eight MA cases contain exact typed vectors and complete
expected objects. catalogValidator.cjs independently enforces all exact field sets, ordering,
unique IDs, types, values, and D2 dispositions. Mutation fixtures cover missing, extra, duplicate,
reordered, mistyped, unequal, and unobservable material. Candidate output cannot supply expected
values or verdicts.

SourceRoot and CandidateRoot contract observers run in separate child processes. Only the approved
public-demo init-request fileSize delta may differ. Every response, event, identifier, attachment,
avatar, success field, and legacy-local shape remains exact.

Fake storage records exact operation, key, ACL/public-read parameters, and whether a provider URL
was treated as authority. Put/multipart-init commands must use one approved staging/durable key
class with zero ACL/public-read/public-URL authority. Worker observations retain the exact read,
write, staging-delete, current-attempt-output-delete, and prior-durable-delete key classifications;
they never retain raw provider URLs. Signing failure uses the existing root-relative same-origin
/demo-assets/avatars/green.svg fallback.

Observe mode executes the catalog, focused tests, npm run test:ci, npm run ci:validate,
npm run lint:ci, client tests/build, server tests, and git diff --check. Preliminary validation
retains only schema-closed observations. Cleanup then proves zero child/process/port/socket/temp/
provider/D2 counters.

The finalizer runs only after gates and cleanup. It writes a closed evidence inventory. Pinned
Gitleaks covers candidate diff, client dist, observations, summaries, and inventory. The finalizer
then writes final-manifest.json and pending-evaluation.json using fixed enumerations, booleans,
integers, nulls, and SHA-256 values only. A separate closed safe-text validator covers those two
terminal files. In approve mode it also covers the sealed acceptance sidecar and generated approved
Evaluation. Per-surface scanner identity and zero findings are retained without claiming Gitleaks
for post-Gitleaks files. The safe-text validator rejects raw keys, provider URLs/text, signed
queries, credentials, stacks, control characters, and unknown strings before append. There is no
self-hash claim.

## Append-only Evaluation

Immediately before each append, the bootstrap requires the repository guide worktree/index blob to
equal the previously sealed GuideBlob and passes that tracked RepositoryGuide path to
record_evaluation.py --guide. SealedGuide remains internal immutable validation input only.

Observe mode appends one schema-v2 record through the CandidateRoot SourceBase-identical recorder.
A behavior/gate/scan failure is FAILED/pending. Unavailable authority or cleanup with no FAIL is
BLOCKED/pending. Eight PASS observations remain BLOCKED/pending solely because human approval is
absent, with null acceptance fields.

The manual-acceptance-run sidecar uses the recorder's exact schema:
schema_version, approval_type, guide_revision, guide_sha256, source_base, candidate_tree,
accepted_run_id, approved_at, approver, approval_reference, human_approval. Its accepted_run_id is
the exact pending record explicitly accepted by the maintainer.

Approve mode applies the same closed terminal safe-text validator to the sealed acceptance sidecar
and generated approved Evaluation before append. It validates that sidecar against the exact guide,
SourceBase, CandidateTree, pending run
ID in append-only history, and eight PASS result bytes. transitionEvaluation.cjs writes a new run
ID with byte-identical results,
accepted_run_id, and sidecar SHA-256. The pinned recorder appends it with every explicit argument
and --acceptance-approval. It never edits, truncates, replaces, or deletes history.

Any semantic change requires v5 plus fresh external review and maintainer approval. Public AWS,
browser, CORS, ETag, worker, provider, and D2 compatibility remain pending. D2_MUTATIONS=0.
