# Manual Test Guide: K6 Issue #115 — WebRTC ICE and Media Readiness

## Immutable authority

- Specification snapshot: issue-115-spec-snapshot.md
- Specification SHA-256: e10bd1d270927973e0bbfa749586cc50a9cfecf0f75b9e54c0e177327ac6771f
- Ticket review SHA-256: 3f5f2a7cb50026b408bf0145dcd71807b27791c046b3bb74daacd9284ea5303f
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-115-webrtc-ice-v6
- Catalog: issue-115-webrtc-ice-v6.catalog.json
- Evaluation history: issue-115-webrtc-ice-v6.evaluations.jsonl

V1–v5 and their reviews remain immutable historical evidence. V6 supersedes their executable,
catalog, identity, and Evaluation-transition statements. No per-Issue code review runs.

This is pre-D2 local acceptance. Two separately isolated pinned Edge processes, two synthetic
authenticated principals, generated audio/video, one registered loopback STUN responder, and
in-memory signaling/history adapters are mandatory. Public STUN/TURN, provider credentials,
Railway, deployment, rollback, and Issue #61 are forbidden. Required result: D2_MUTATIONS=0.

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

1. scripts/k6/issue115/bootstrap.ps1
2. scripts/k6/issue115/browserBroker.cjs
3. scripts/k6/issue115/browserFixture.cjs
4. scripts/k6/issue115/catalogValidator.cjs
5. scripts/k6/issue115/commandWrapper.cjs
6. scripts/k6/issue115/finalizer.cjs
7. scripts/k6/issue115/networkGuard.cjs
8. scripts/k6/issue115/observer.cjs
9. scripts/k6/issue115/preliminaryValidator.cjs
10. scripts/k6/issue115/processMonitor.cjs
11. scripts/k6/issue115/runGuide.ps1
12. scripts/k6/issue115/scenarios.cjs
13. scripts/k6/issue115/stunResponder.cjs
14. scripts/k6/issue115/transitionEvaluation.cjs

Execution approval control_blobs must be set-equal to this list. JSON property order is
non-authoritative because names are canonically sorted. Every value is the exact CandidateTree Git
blob. Missing, extra, non-blob, tampered, stale, or wrong-tree material is BLOCKED before the first
candidate process.

## Copy-run trust loader

Paste this function from the approved guide into PowerShell. It executes only Git, the SourceBase
candidate helper, and an exact CandidateTree bootstrap blob. Git blob identity, not platform line
endings, is authority.

~~~powershell
function Invoke-K6Issue115Guide {
  [CmdletBinding()]
  param(
    [ValidateSet('observe','approve')][string]$Mode = 'observe',
    [string]$AcceptanceApprovalPath,
    [string]$AcceptedRunId
  )
  $ErrorActionPreference = 'Stop'
  $Repository = (Resolve-Path '.').Path
  $ExpectedRepository = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-115'
  $ExpectedBranch = 'nhibuaa/k6-issue-115-webrtc-ice'
  $SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
  $SourceCommitTree = '8e0dc6143540018ba0008f42d31b3398ca138ee5'
  $SourceProjection = 'd9de20b5fac1da34c143d96fa26ae22843df042c'
  $ManualRoot = '.agents/manual-tests/k6-public-demo'
  $GuideRel = "$ManualRoot/issue-115-webrtc-ice-v6.md"
  $CatalogRel = "$ManualRoot/issue-115-webrtc-ice-v6.catalog.json"
  $GuideApprovalRel = "$ManualRoot/issue-115-webrtc-ice-v6.approval.json"
  $HistoryRel = "$ManualRoot/issue-115-webrtc-ice-v6.evaluations.jsonl"
  [string[]]$ExpectedControls = @(
    'scripts/k6/issue115/bootstrap.ps1',
    'scripts/k6/issue115/browserBroker.cjs',
    'scripts/k6/issue115/browserFixture.cjs',
    'scripts/k6/issue115/catalogValidator.cjs',
    'scripts/k6/issue115/commandWrapper.cjs',
    'scripts/k6/issue115/finalizer.cjs',
    'scripts/k6/issue115/networkGuard.cjs',
    'scripts/k6/issue115/observer.cjs',
    'scripts/k6/issue115/preliminaryValidator.cjs',
    'scripts/k6/issue115/processMonitor.cjs',
    'scripts/k6/issue115/runGuide.ps1',
    'scripts/k6/issue115/scenarios.cjs',
    'scripts/k6/issue115/stunResponder.cjs',
    'scripts/k6/issue115/transitionEvaluation.cjs'
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
      $GitCleanupErrors = [Collections.Generic.List[string]]::new()
      if ($null -ne $Stream) {
        try { $Stream.Dispose() } catch { $GitCleanupErrors.Add('stream-dispose') }
      }
      if ($null -ne $GitProcess) {
        try {
          if (-not $GitProcess.HasExited) {
            $GitProcess.Kill($true)
            if (-not $GitProcess.WaitForExit(10000)) {
              $GitCleanupErrors.Add('process-timeout')
            }
          }
        } catch {
          $GitCleanupErrors.Add('process-termination')
        }
        try { $GitProcess.Dispose() } catch { $GitCleanupErrors.Add('process-dispose') }
      }
      if ($GitCleanupErrors.Count -ne 0) {
        throw 'BLOCKED: Git blob process cleanup failed'
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
  foreach ($File in Get-ChildItem (Join-Path $Repository $ManualRoot) -File -Filter 'issue-115-webrtc-ice-v6.execution-approval*.json') {
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
      $GuideApproval.guide_revision -cne 'k6-115-webrtc-ice-v6' -or
      $GuideApproval.source_base -cne $SourceBase -or $GuideApproval.approver -cne 'maintainer' -or
      $GuideApproval.human_approval -cne 'approved' -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approved_at) -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approval_reference) -or
      $ExecutionApproval.schema_version -ne 1 -or
      $ExecutionApproval.approval_type -cne 'manual-guide-execution' -or
      $ExecutionApproval.guide_revision -cne 'k6-115-webrtc-ice-v6' -or
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
  $LoaderRoot = Join-Path ([IO.Path]::GetTempPath()) "k6-115-loader-$Nonce"
  $BootstrapPath = Join-Path $LoaderRoot 'bootstrap.ps1'
  $SealedGuide = Join-Path $LoaderRoot 'guide.md'
  $SealedCatalog = Join-Path $LoaderRoot 'catalog.json'
  $SealedGuideApproval = Join-Path $LoaderRoot 'guide-approval.json'
  $SealedExecutionApproval = Join-Path $LoaderRoot 'execution-approval.json'
  $SealedAcceptanceApproval = Join-Path $LoaderRoot 'acceptance-approval.json'
  $RunRoot = Join-Path $Repository "$ManualRoot/.issue-115-webrtc-ice-v6-run-$Nonce"
  $WorkingEvidenceRoot = Join-Path $RunRoot 'completed-evidence'
  $DurableEvidenceRoot = Join-Path $Repository "$ManualRoot/issue-115-webrtc-ice-v6-evidence/$Nonce"
  if ((Test-Path -LiteralPath $LoaderRoot) -or (Test-Path -LiteralPath $RunRoot) -or
      (Test-Path -LiteralPath $DurableEvidenceRoot)) {
    throw 'BLOCKED: nonce path collision'
  }
  $BootstrapProcess = $null
  $CandidateCompleted = $false
  try {
    [void](New-Item -ItemType Directory -Path $LoaderRoot)
    [void](New-Item -ItemType Directory -Path $RunRoot)
    Write-GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue115/bootstrap.ps1') $BootstrapPath
    Write-GitBlob $GuideBlob $SealedGuide
    Write-GitBlob $CatalogBlob $SealedCatalog
    Write-GitBlob $GuideApprovalBlob $SealedGuideApproval
    [IO.File]::Copy($ExecutionApprovalPath,$SealedExecutionApproval,$false)
    if ((git hash-object --no-filters $BootstrapPath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue115/bootstrap.ps1') {
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
      '-History',(Join-Path $Repository $HistoryRel),'-RunRoot',$RunRoot,
      '-EvidenceRoot',$WorkingEvidenceRoot,
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
    $CompletionMarkerPath = Join-Path $WorkingEvidenceRoot 'completion-marker.json'
    $CompletionMarker = Get-Content -Raw -LiteralPath $CompletionMarkerPath | ConvertFrom-Json
    Assert-ExactFields $CompletionMarker @('schema_version','status') 'completion marker'
    if ($CompletionMarker.schema_version -ne 1 -or $CompletionMarker.status -cne 'complete') {
      throw 'BLOCKED: completion marker is invalid'
    }
    [IO.Directory]::Move($WorkingEvidenceRoot,$DurableEvidenceRoot)
    $CandidateCompleted = $true
  } finally {
    $CleanupErrors = [Collections.Generic.List[string]]::new()
    if ($null -ne $BootstrapProcess) {
      try {
        if (-not $BootstrapProcess.HasExited) {
          $BootstrapProcess.Kill($true)
          if (-not $BootstrapProcess.WaitForExit(10000)) {
            $CleanupErrors.Add('bootstrap-timeout')
          }
        }
      } catch {
        $CleanupErrors.Add('bootstrap-termination')
      }
      try { $BootstrapProcess.Dispose() } catch { $CleanupErrors.Add('bootstrap-dispose') }
    }
    foreach ($OwnedPath in @($RunRoot,$LoaderRoot)) {
      if (-not (Test-Path -LiteralPath $OwnedPath)) { continue }
      foreach ($Attempt in 1..2) {
        if (-not (Test-Path -LiteralPath $OwnedPath)) { break }
        try {
          Remove-Item -LiteralPath $OwnedPath -Recurse -Force
        } catch {
          if ($Attempt -eq 2) { $CleanupErrors.Add('path-remove') }
        }
      }
      if (Test-Path -LiteralPath $OwnedPath) { $CleanupErrors.Add('path-retained') }
    }
    if (-not $CandidateCompleted -or $CleanupErrors.Count -ne 0) {
      if (Test-Path -LiteralPath $DurableEvidenceRoot) {
        foreach ($Attempt in 1..2) {
          if (-not (Test-Path -LiteralPath $DurableEvidenceRoot)) { break }
          try {
            Remove-Item -LiteralPath $DurableEvidenceRoot -Recurse -Force
          } catch {
            if ($Attempt -eq 2) { $CleanupErrors.Add('incomplete-evidence-remove') }
          }
        }
      }
      if (Test-Path -LiteralPath $DurableEvidenceRoot) {
        $CleanupErrors.Add('incomplete-evidence-retained')
      }
    }
    if ($CleanupErrors.Count -ne 0) {
      throw 'BLOCKED: loader process or path cleanup failed'
    }
  }
}
~~~

After implementation and exact execution approval:

~~~powershell
Invoke-K6Issue115Guide -Mode observe
~~~

After explicit maintainer acceptance of the exact pending run:

~~~powershell
Invoke-K6Issue115Guide -Mode approve -AcceptanceApprovalPath '.agents/manual-tests/k6-public-demo/issue-115-webrtc-ice-v6.acceptance-approval.json' -AcceptedRunId '<exact-pending-run-id>'
~~~

## Verified bootstrap and runner obligations

The verified bootstrap owns one outer try/finally beginning before candidate/source archive
creation. Before any scenario, it independently derives the filtered baseline from SourceCommitTree
by removing only the three workflow paths and manual-evidence prefix encoded by the pinned helper,
then requires exact equality with SourceExecutionProjection. It registers each nonce archive/root
before creation. Every candidate/source archive, extraction root, dependency tree, diff, output,
profile, fixture resource, and provisional evidence path must resolve beneath the parent-created
RunRoot; escaping it is BLOCKED. The bootstrap materializes CandidateTree and the full SourceBase
commit separately, verifies
SourceCommitTree, and verifies every extracted control
against CandidateTree plus the exact control map before invoking runGuide.ps1. On every exit it
stops registered children and removes only owned archive/root/dependency/diff/output paths, then
verifies their absence. It writes completion-marker.json last, only after all gates, recorder
transition, child cleanup, and provisional-evidence closure pass. The parent promotes that completed
evidence directory and independently removes RunRoot; unsuccessful or cleanup-failed runs remove
all provisional/durable evidence. Fault injection covers both archives, both expansions, control
verification, runner launch, loader blob-stream/process/disposal failures, loader interruption,
path-removal failure, and a hung bootstrap child with a grandchild.

The loader-supplied allowlist is the complete parent environment for the bootstrap. Candidate
controls may add only fixed non-secret guide metadata. The guard activates before six
npm ci --offline operations and lifecycle children. Cache miss is BLOCKED; no online fallback
exists. No application Docker build runs; Issue #117 owns image builds. Cached Gitleaks alone runs
with --pull=never --network=none --rm.

Edge identity is version 151.0.4129.101 with SHA-256
24f626e48dae3574b4d59adc8f23722f890fd0a64f78c772384b783b96bcf1a0. Two Edge processes use
different empty profiles and synthetic principals alice@kittachat.test and bob@kittachat.test.
Before navigation, CDP installs and freezes the broker around the native RTCPeerConnection
constructor. It rewrites the two approved public-demo STUN authorities to the registered loopback
responder for this fixture only and rejects every other ICE authority before native construction.
The external-STUN positive control is counted at this preventive broker and creates no native peer.

The complete endpoint registry is deny-proxy TCP, fixture HTTP TCP, Alice CDP TCP, Bob CDP TCP, and
loopback STUN UDP. The deny proxy, host-resolver policy, disabled browser background networking,
CDP interception, and broker form the preventive boundary. processMonitor.cjs observes the Alice
Edge, Bob Edge, browser-harness, and deny-proxy process trees plus every descendant at 100-ms
cadence from the pre-start barrier through descendant-zero. Attribution is exact: Alice Edge and
Bob Edge each own deny-proxy TCP and loopback STUN UDP; browser harness owns both CDP TCP
connections; deny proxy owns fixture HTTP TCP. All seven owner/endpoint tuples must be observed:
five TCP and two UDP. One Edge cannot satisfy the other Edge tuple. External DNS/HTTP, literal
external ICE, public STUN, unregistered TCP/UDP, Mongo 27017, Redis 6379, and RabbitMQ 5672 are
blocked and counted. Any external, missing-positive-control, cross-owned, or unattributed endpoint
is FAILED.

## Catalog, observations, gates, and cleanup

The v6 catalog is sole case authority. Its eight MA cases contain exact typed vectors and complete
expected objects. catalogValidator.cjs independently enforces all exact field sets, ordering,
unique IDs, types, values, and D2 dispositions. Mutation fixtures cover missing, extra, duplicate,
reordered, mistyped, unequal, and unobservable material. Candidate output cannot supply expected
values or verdicts.

Valid IPv4/IPv6 fixtures are generated in memory from exact catalog octet/hextet arrays immediately
before parser invocation. The joined address is never retained. The parser still receives an
ordinary entry containing exactly urls; the generator object is test-control input, not runtime
configuration.

SourceRoot and CandidateRoot contract observers run in separate child processes. Socket event
names/payloads/ACKs/rooms, authenticated socket.userId, glare behavior, REST call history,
CallHistory fields, call logs, product CALL_STATES, and legacy-local two-STUN behavior remain exact.

Observe mode executes the catalog, focused tests, npm run test:ci, npm run ci:validate,
npm run lint:ci, client tests/build, server tests, and git diff --check. Preliminary validation
retains only schema-closed classifications, counts, booleans, synthetic labels, and digests. Raw
SDP, ICE candidates, IP addresses, device labels, credentials, tokens, and provider text are
forbidden. Cleanup closes peers, tracks, timers, listeners, pages, both Edge process trees,
profiles, proxy, fixture, CDP, STUN, monitors, and temp roots before proving zero provider/D2
counters.

The finalizer runs only after gates and cleanup. It writes a closed evidence inventory. Pinned
Gitleaks covers candidate diff, client dist, observations, summaries, and inventory. The finalizer
then writes final-manifest.json and pending-evaluation.json using fixed enumerations, booleans,
integers, nulls, and SHA-256 values only. A separate closed safe-text validator covers those two
terminal files. In approve mode it also covers the sealed acceptance sidecar and generated approved
Evaluation. Per-surface scanner identity and zero findings are retained without claiming Gitleaks
for post-Gitleaks files. The safe-text validator rejects raw SDP, ICE candidates, IP addresses,
device labels, credentials, tokens, provider text, control characters, and unknown strings before
append. There is no self-hash claim.

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

Any semantic change requires v7 plus fresh external review and maintainer approval. Public STUN
network-matrix, deployed bidirectional media, and the STUN-only/TURN gap remain pending D2.
D2_MUTATIONS=0.
