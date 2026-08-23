# Manual Test Guide: K6 Issue #114 — Private S3 Upload Boundary

## Immutable authority

- Specification snapshot: issue-114-spec-snapshot.md
- Specification SHA-256: 6710e05afb678cd15e36cdb9e7e97754e0dbdf373c66ff71a4eccb07c8e2f3cb
- Ticket review SHA-256: 5d9317e5291cb17a8012466dd76839ad7179b335f81eb56573944454b82bbc49
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-114-s3-upload-v10
- Catalog: issue-114-s3-upload-v10.catalog.json
- Evaluation history: issue-114-s3-upload-v10.evaluations.jsonl

V1–v9 and their reviews remain immutable historical evidence. V10 supersedes their executable,
catalog, identity, finalization, and Evaluation-transition statements. No per-Issue code review runs.

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
2. scripts/k6/issue114/loaderSelfTest.ps1
3. scripts/k6/issue114/loaderRuntime.ps1
4. scripts/k6/issue114/catalogValidator.cjs
5. scripts/k6/issue114/commandWrapper.cjs
6. scripts/k6/issue114/finalizer.cjs
7. scripts/k6/issue114/networkGuard.cjs
8. scripts/k6/issue114/observer.cjs
9. scripts/k6/issue114/preliminaryValidator.cjs
10. scripts/k6/issue114/rawKeyEvidenceValidator.cjs
11. scripts/k6/issue114/runGuide.ps1
12. scripts/k6/issue114/scenarios.cjs
13. scripts/k6/issue114/transitionEvaluation.cjs

Execution approval control_blobs must be set-equal to this list. JSON property order is
non-authoritative because names are canonically sorted. Every value is the exact CandidateTree Git
blob. Missing, extra, non-blob, tampered, stale, or wrong-tree material is BLOCKED before the first
candidate process.

### Shared loader runtime seam

\`loaderRuntime.ps1\` is the sole implementation of loader resource creation, process/stream
termination and disposal, reparse-safe path ownership, history protection, evidence promotion,
finalization-state transitions, and bounded recorder invocation. Its exact shared exports are
\`Assert-K6NoReparsePath\`, \`Get-K6FileBinding\`, \`Write-K6GitBlob\`,
\`Test-K6HistoryRecord\`, \`Protect-K6HistoryPath\`, \`Release-K6HistoryPath\`,
\`New-K6LoaderAdapters\`, \`Invoke-K6LoaderRun\`, \`Invoke-K6LoaderCleanup\`,
\`Invoke-K6EvidencePromotion\`, \`Invoke-K6BoundedRecorder\`, and
\`Write-K6AppendConfirmation\`. Each accepts explicit real or
injected adapters. The parent guide, production bootstrap, and \`loaderSelfTest.ps1\` dot-source
the same CandidateTree blob and retain its exact blob ID and normalized exported-function digest;
none may copy or reimplement a shared lifecycle function. Pure JSON/hash assertions in this guide
are validation-only and cannot create processes, touch history, promote evidence, or perform
cleanup. Missing shared identity, source-digest mismatch, or local lifecycle reimplementation is
BLOCKED before candidate observations.

The one pre-shared exception is a digest-bound, memory-only materializer. Before shared functions
load there is no LoaderRoot, runtime path, filesystem adapter, or delete primitive. Real and
injected modes provide the same exact 14-field process/memory-stream adapter set and cannot replace
materialization, termination, disposal, identity, decoding, or parsing control flow. The algorithm
uses a 30-second process bound, a 10-second kill/exit bound, independent 10-second stdout/stderr
drain bounds, direct memory-stream copy, Git-object SHA-1 verification, strict UTF-8 decoding, and
explicit stream/process disposal. The digest-bound load transaction dot-sources only the verified
in-memory ScriptBlock in the parent scope. LoaderRoot is created only after shared runtime
authority exists; the shared reparse-safe functions validate its parent and root before writing
the exact loaderRuntime blob. Materializer failure, load failure, any pre-shared loader child-path
access or mutation, cleanup failure, or owned resource residue is BLOCKED before any candidate
child, recorder, promotion, history append, or shared-runtime path action.

Before child launch the parent calls \`Protect-K6HistoryPath\`. The lease captures exact attribute
and logical-presence state, marks the RunRoot snapshot read-only, and holds the canonical history
through a parent-owned handle opened with read-only sharing and no write/delete sharing. For a
logically absent history it creates and locks a zero-byte sentinel, then restores absence before the
recorder. This blocks write/append/delete/rename of only the canonical history while leaving RunRoot
writable. The child receives repository read access plus only the RunRoot snapshot/binding for
history; it cannot derive a writable canonical history authority. \`Release-K6HistoryPath\` closes
the handle and restores the exact captured logical-presence/attribute state after child cleanup,
failing closed if byte or state restoration is not exact.
\`Test-K6HistoryRecord\` binds the pre-launch byte length/digest and requires the post-state to be
exactly the unchanged pre-state plus one exact serialized Evaluation line; a pre-existing match,
duplicate, write-then-restore, or ambiguous append is not confirmation. The parent alone invokes
the recorder. \`Invoke-K6BoundedRecorder\` bounds process wait, descendant termination, stream drain,
and disposal independently; it never calls an unbounded task/result wait after timeout. Its
acknowledgement-loss-after-append result is terminal-confirmed, while every unappended failure is
removed by the shared bounded cleanup. \`Invoke-K6EvidencePromotion\` revalidates directory
handles/reparse state immediately before and during the atomic promotion; \`Invoke-K6LoaderCleanup\`
owns all process, lease, temporary-root, and incomplete-evidence cleanup and returns typed errors.

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
  $GuideRel = "$ManualRoot/issue-114-s3-upload-v10.md"
  $CatalogRel = "$ManualRoot/issue-114-s3-upload-v10.catalog.json"
  $GuideApprovalRel = "$ManualRoot/issue-114-s3-upload-v10.approval.json"
  $HistoryRel = "$ManualRoot/issue-114-s3-upload-v10.evaluations.jsonl"
  [string[]]$ExpectedControls = @(
    'scripts/k6/issue114/bootstrap.ps1',
    'scripts/k6/issue114/loaderSelfTest.ps1',
    'scripts/k6/issue114/loaderRuntime.ps1',
    'scripts/k6/issue114/catalogValidator.cjs',
    'scripts/k6/issue114/commandWrapper.cjs',
    'scripts/k6/issue114/finalizer.cjs',
    'scripts/k6/issue114/networkGuard.cjs',
    'scripts/k6/issue114/observer.cjs',
    'scripts/k6/issue114/preliminaryValidator.cjs',
    'scripts/k6/issue114/rawKeyEvidenceValidator.cjs',
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
  function New-K6PreRuntimeAdapters {
    param(
      [ValidateSet('real','injected')][string]$Mode,
      [object]$InjectedPrimitives
    )
    [string[]]$Expected = @(
      'dispose_process','dispose_stream','flush_stream','get_exit_code','get_stream_bytes',
      'open_memory_stream','process_has_exited','read_stderr_async','resolve_git',
      'start_copy_async','start_process','terminate_process','wait_process','wait_task'
    )
    if ($Mode -eq 'injected') {
      if ($null -eq $InjectedPrimitives) {
        throw 'BLOCKED: injected pre-runtime primitives are missing'
      }
      Assert-ExactFields $InjectedPrimitives $Expected 'injected pre-runtime primitives'
      foreach ($Name in $Expected) {
        if ($InjectedPrimitives.PSObject.Properties[$Name].Value -isnot [scriptblock]) {
          throw "BLOCKED: injected pre-runtime primitive is not executable: $Name"
        }
      }
      return $InjectedPrimitives
    }
    if ($null -ne $InjectedPrimitives) {
      throw 'BLOCKED: real pre-runtime mode cannot receive injected primitives'
    }
    return [pscustomobject][ordered]@{
      dispose_process = { param($Process) $Process.Dispose() }
      dispose_stream = { param($Stream) $Stream.Dispose() }
      flush_stream = { param($Stream) $Stream.Flush() }
      get_exit_code = { param($Process) $Process.ExitCode }
      get_stream_bytes = { param($Stream) $Stream.ToArray() }
      open_memory_stream = { [IO.MemoryStream]::new() }
      process_has_exited = { param($Process) $Process.HasExited }
      read_stderr_async = { param($Process) $Process.StandardError.ReadToEndAsync() }
      resolve_git = { (Get-Command git).Source }
      start_copy_async = {
        param($Process,$Stream)
        $Process.StandardOutput.BaseStream.CopyToAsync($Stream)
      }
      start_process = { param($Info) [Diagnostics.Process]::Start($Info) }
      terminate_process = { param($Process) $Process.Kill($true) }
      wait_process = { param($Process,$TimeoutMs) $Process.WaitForExit($TimeoutMs) }
      wait_task = { param($Task,$TimeoutMs) $Task.Wait($TimeoutMs) }
    }
  }
  function Invoke-K6PreRuntimeCleanup {
    param(
      [object]$Adapters,
      [object]$Process,
      [object]$Stream,
      [int]$TerminationTimeoutMs
    )
    $Errors = [Collections.Generic.List[string]]::new()
    if ($null -ne $Stream) {
      try { & ([scriptblock]$Adapters.dispose_stream) $Stream }
      catch { $Errors.Add('stream-dispose') }
    }
    if ($null -ne $Process) {
      $NeedsTermination = $true
      try {
        $NeedsTermination = -not [bool](& ([scriptblock]$Adapters.process_has_exited) $Process)
      } catch {
        $Errors.Add('process-state')
      }
      if ($NeedsTermination) {
        try { & ([scriptblock]$Adapters.terminate_process) $Process }
        catch { $Errors.Add('process-termination') }
        try {
          if (-not [bool](& ([scriptblock]$Adapters.wait_process) $Process $TerminationTimeoutMs)) {
            $Errors.Add('process-timeout')
          }
        } catch {
          $Errors.Add('process-wait')
        }
      }
      try { & ([scriptblock]$Adapters.dispose_process) $Process }
      catch { $Errors.Add('process-dispose') }
    }
    return [pscustomobject]@{
      errors = @($Errors | Sort-Object -Unique)
    }
  }
  function Invoke-K6PreRuntimeMaterializer {
    param(
      [object]$Adapters,
      [string]$RepositoryPath,
      [string]$Blob,
      [int]$ProcessTimeoutMs = 30000,
      [int]$TerminationTimeoutMs = 10000,
      [int]$StdoutDrainTimeoutMs = 10000,
      [int]$StderrDrainTimeoutMs = 10000
    )
    # Real and injected primitive adapters traverse this exact memory-only lifecycle. Before the
    # shared runtime loads there is no LoaderRoot, runtime path, filesystem adapter, or delete
    # primitive. This function, its cleanup function, adapter field set, and load transaction below
    # are LF-normalized and digest-bound by the catalog validator and loaderSelfTest.ps1.
    $Process = $null
    $Stream = $null
    $Stage = 'process-start'
    try {
      $Info = [Diagnostics.ProcessStartInfo]::new()
      $Info.FileName = [string](& ([scriptblock]$Adapters.resolve_git))
      foreach ($Argument in @('-C',$RepositoryPath,'cat-file','blob',$Blob)) {
        [void]$Info.ArgumentList.Add([string]$Argument)
      }
      $Info.UseShellExecute = $false
      $Info.CreateNoWindow = $true
      $Info.RedirectStandardOutput = $true
      $Info.RedirectStandardError = $true
      $Process = & ([scriptblock]$Adapters.start_process) $Info
      $Stage = 'memory-stream-open'
      $Stream = & ([scriptblock]$Adapters.open_memory_stream)
      $CopyTask = & ([scriptblock]$Adapters.start_copy_async) $Process $Stream
      $ErrorTask = & ([scriptblock]$Adapters.read_stderr_async) $Process
      $Stage = 'process-wait'
      if (-not [bool](& ([scriptblock]$Adapters.wait_process) $Process $ProcessTimeoutMs)) {
        $Stage = 'process-timeout'
        throw [InvalidOperationException]::new('process-timeout')
      }
      $Stage = 'stdout-drain'
      if (-not [bool](& ([scriptblock]$Adapters.wait_task) $CopyTask $StdoutDrainTimeoutMs)) {
        throw [InvalidOperationException]::new('stdout-drain')
      }
      $Stage = 'stderr-drain'
      if (-not [bool](& ([scriptblock]$Adapters.wait_task) $ErrorTask $StderrDrainTimeoutMs)) {
        throw [InvalidOperationException]::new('stderr-drain')
      }
      $ExitCode = [int](& ([scriptblock]$Adapters.get_exit_code) $Process)
      $Stage = 'stream-flush'
      & ([scriptblock]$Adapters.flush_stream) $Stream
      $Stage = 'memory-read'
      [byte[]]$Bytes = & ([scriptblock]$Adapters.get_stream_bytes) $Stream
      $Stage = 'stream-dispose'
      & ([scriptblock]$Adapters.dispose_stream) $Stream
      $Stream = $null
      $HeaderText = [Text.Encoding]::ASCII.GetBytes("blob $($Bytes.Length)")
      $Header = [byte[]]::new($HeaderText.Length + 1)
      [Buffer]::BlockCopy($HeaderText,0,$Header,0,$HeaderText.Length)
      $Object = [byte[]]::new($Header.Length + $Bytes.Length)
      [Buffer]::BlockCopy($Header,0,$Object,0,$Header.Length)
      [Buffer]::BlockCopy($Bytes,0,$Object,$Header.Length,$Bytes.Length)
      $Sha1 = [Security.Cryptography.SHA1]::Create()
      try {
        $Materialized = ([BitConverter]::ToString($Sha1.ComputeHash($Object))).Replace('-','').ToLowerInvariant()
      } finally {
        $Sha1.Dispose()
      }
      $Stage = 'identity-verify'
      if ($ExitCode -ne 0 -or $Materialized -cne $Blob) {
        throw [InvalidOperationException]::new('identity-mismatch')
      }
      $Stage = 'process-dispose'
      & ([scriptblock]$Adapters.dispose_process) $Process
      $Process = $null
      $Stage = 'runtime-parse'
      $Utf8 = [Text.UTF8Encoding]::new($false,$true)
      $RuntimeText = $Utf8.GetString($Bytes)
      $RuntimeScript = [scriptblock]::Create($RuntimeText)
      return [pscustomobject]@{
        status = 'materialized'
        blob = $Materialized
        runtime_script = $RuntimeScript
      }
    } catch {
      $Cleanup = Invoke-K6PreRuntimeCleanup -Adapters $Adapters -Process $Process -Stream $Stream -TerminationTimeoutMs $TerminationTimeoutMs
      [string[]]$CleanupErrors = @($Cleanup.errors)
      if ($CleanupErrors.Count -ne 0) {
        throw "BLOCKED: pre-runtime materializer failed at $Stage; cleanup failed: $($CleanupErrors -join ',')"
      }
      throw "BLOCKED: pre-runtime materializer failed at $Stage; cleanup=complete"
    }
  }
  $K6PreRuntimeLoadTransaction = {
    param([scriptblock]$RuntimeScript)
    try {
      . $RuntimeScript
    } catch {
      throw 'BLOCKED: shared loader runtime load failed; memory-only pre-runtime cleanup=complete'
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
  foreach ($File in Get-ChildItem (Join-Path $Repository $ManualRoot) -File -Filter 'issue-114-s3-upload-v10.execution-approval*.json') {
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
      $GuideApproval.guide_revision -cne 'k6-114-s3-upload-v10' -or
      $GuideApproval.source_base -cne $SourceBase -or $GuideApproval.approver -cne 'maintainer' -or
      $GuideApproval.human_approval -cne 'approved' -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approved_at) -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approval_reference) -or
      $ExecutionApproval.schema_version -ne 1 -or
      $ExecutionApproval.approval_type -cne 'manual-guide-execution' -or
      $ExecutionApproval.guide_revision -cne 'k6-114-s3-upload-v10' -or
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
  $LoaderSelfTestPath = Join-Path $LoaderRoot 'loaderSelfTest.ps1'
  $LoaderRuntimePath = Join-Path $LoaderRoot 'loaderRuntime.ps1'
  $SealedGuide = Join-Path $LoaderRoot 'guide.md'
  $SealedCatalog = Join-Path $LoaderRoot 'catalog.json'
  $SealedGuideApproval = Join-Path $LoaderRoot 'guide-approval.json'
  $SealedExecutionApproval = Join-Path $LoaderRoot 'execution-approval.json'
  $SealedAcceptanceApproval = Join-Path $LoaderRoot 'acceptance-approval.json'
  $RunRoot = Join-Path $Repository "$ManualRoot/.issue-114-s3-upload-v10-run-$Nonce"
  $WorkingEvidenceRoot = Join-Path $RunRoot 'completed-evidence'
  $DurableEvidenceParent = Join-Path $Repository "$ManualRoot/issue-114-s3-upload-v10-evidence"
  $DurableEvidenceRoot = Join-Path $DurableEvidenceParent $Nonce
  $HistoryPath = Join-Path $Repository $HistoryRel
  $HistorySnapshotPath = Join-Path $RunRoot 'history.snapshot.jsonl'
  $HistoryBindingPath = Join-Path $RunRoot 'history.binding.json'
  if ((Test-Path -LiteralPath $LoaderRoot) -or (Test-Path -LiteralPath $RunRoot) -or
      (Test-Path -LiteralPath $DurableEvidenceRoot)) {
    throw 'BLOCKED: nonce path collision'
  }
  $BootstrapProcess = $null
  $CandidateCompleted = $false
  $HistoryLease = $null
  $SharedRuntimeLoaded = $false
  $AcceptanceApprovalForRecorder = $null
  $AcceptanceApprovalSha256 = $null
  $PreRuntimeStage = 'adapter-construction'
  try {
    try {
      $PreRuntimeAdapters = New-K6PreRuntimeAdapters -Mode real
      $PreRuntimeStage = 'materialization'
      $PreRuntimeResult = Invoke-K6PreRuntimeMaterializer $PreRuntimeAdapters $Repository `
        ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/loaderRuntime.ps1')
      Assert-ExactFields $PreRuntimeResult @('status','blob','runtime_script') 'pre-runtime result'
      if ([string]$PreRuntimeResult.status -cne 'materialized' -or
          [string]$PreRuntimeResult.blob -cne
            [string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/loaderRuntime.ps1' -or
          $PreRuntimeResult.runtime_script -isnot [scriptblock]) {
        throw 'BLOCKED: shared loader runtime materialization result mismatch'
      }
      $PreRuntimeStage = 'runtime-load'
      . $K6PreRuntimeLoadTransaction $PreRuntimeResult.runtime_script
      $SharedRuntimeLoaded = $true
    } catch {
      $PreRuntimeFailure = if ($_.Exception.Message.StartsWith('BLOCKED:')) {
        [string]$_.Exception.Message
      } else {
        "BLOCKED: pre-runtime lifecycle failed at $PreRuntimeStage"
      }
      throw $PreRuntimeFailure
    }
    $LoaderParent = [IO.Path]::GetDirectoryName($LoaderRoot)
    Assert-K6NoReparsePath $LoaderParent
    [void](New-Item -ItemType Directory -Path $LoaderRoot)
    Assert-K6NoReparsePath $LoaderRoot
    Assert-K6NoReparsePath $Repository
    Assert-K6NoReparsePath $ManualRoot
    [void](New-Item -ItemType Directory -Path $RunRoot)
    Assert-K6NoReparsePath $RunRoot
    if (Test-Path -LiteralPath $DurableEvidenceParent) {
      if (-not (Get-Item -LiteralPath $DurableEvidenceParent -Force).PSIsContainer) {
        throw 'BLOCKED: durable evidence parent is not a directory'
      }
    } else {
      [void](New-Item -ItemType Directory -Path $DurableEvidenceParent)
    }
    Assert-K6NoReparsePath $DurableEvidenceParent
    $HistoryBefore = Get-K6FileBinding $HistoryPath
    if ($HistoryBefore.present) { Copy-Item -LiteralPath $HistoryPath -Destination $HistorySnapshotPath }
    else { [IO.File]::WriteAllText($HistorySnapshotPath,'') }
    $HistoryBefore | ConvertTo-Json -Compress | Set-Content -LiteralPath $HistoryBindingPath -NoNewline
    $HistoryLease = Protect-K6HistoryPath -CanonicalPath $HistoryPath -SnapshotPath $HistorySnapshotPath -Binding $HistoryBefore -RepositoryRoot $Repository
    Write-K6GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/loaderRuntime.ps1') $LoaderRuntimePath
    Write-K6GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/bootstrap.ps1') $BootstrapPath
    Write-K6GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/loaderSelfTest.ps1') $LoaderSelfTestPath
    Write-K6GitBlob $GuideBlob $SealedGuide
    Write-K6GitBlob $CatalogBlob $SealedCatalog
    Write-K6GitBlob $GuideApprovalBlob $SealedGuideApproval
    [IO.File]::Copy($ExecutionApprovalPath,$SealedExecutionApproval,$false)
    if ((git hash-object --no-filters $BootstrapPath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/bootstrap.ps1') {
      throw 'BLOCKED: materialized bootstrap mismatch'
    }
    if ((git hash-object --no-filters $LoaderSelfTestPath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/loaderSelfTest.ps1') {
      throw 'BLOCKED: materialized loader self-test mismatch'
    }
    if ((git hash-object --no-filters $LoaderRuntimePath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue114/loaderRuntime.ps1') {
      throw 'BLOCKED: materialized loader runtime mismatch'
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
      $AcceptanceApprovalForRecorder = (Resolve-Path $AcceptanceApprovalPath).Path
      [IO.File]::Copy($AcceptanceApprovalForRecorder,$SealedAcceptanceApproval,$false)
      $AcceptanceApprovalSha256 = Get-Sha256 $SealedAcceptanceApproval
    } elseif ($AcceptanceApprovalPath -or $AcceptedRunId) {
      throw 'BLOCKED: observe mode cannot receive acceptance authority'
    }

    $AcceptanceArgument = if ($Mode -eq 'approve') { $SealedAcceptanceApproval } else { '' }
    [string[]]$BootstrapArguments = @(
      '-NoLogo','-NoProfile','-NonInteractive','-File',$BootstrapPath,
      '-Repository',$Repository,'-SourceBase',$SourceBase,'-SourceCommitTree',$SourceCommitTree,
      '-SourceExecutionProjection',$SourceProjection,'-CandidateTree',$CandidateTree,
      '-FullIndexTree',$FullIndexTree,'-Guide',$SealedGuide,'-Catalog',$SealedCatalog,
      '-LoaderSelfTest',$LoaderSelfTestPath,'-LoaderRuntime',$LoaderRuntimePath,
      '-RepositoryGuide',(Join-Path $Repository $GuideRel),
      '-GuideApproval',$SealedGuideApproval,'-ExecutionApproval',$SealedExecutionApproval,
      '-HistorySnapshot',$HistorySnapshotPath,'-HistoryBinding',$HistoryBindingPath,
      '-EvaluationOutput',(Join-Path $WorkingEvidenceRoot 'evaluation-to-append.json'),'-RunRoot',$RunRoot,
      '-EvidenceRoot',$WorkingEvidenceRoot,
      '-Mode',$Mode,'-AcceptedRunId',([string]$AcceptedRunId),
      '-AcceptanceApproval',$AcceptanceArgument
    )
    $AllowedEnvironment = @{}
    foreach ($Name in @('PATH','SystemRoot','TEMP','TMP','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)')) {
      $Value = [Environment]::GetEnvironmentVariable($Name)
      if ($null -ne $Value) { $AllowedEnvironment[$Name] = $Value }
    }
    $RunResult = Invoke-K6LoaderRun -FilePath (Get-Command pwsh).Source -Arguments $BootstrapArguments `
      -Environment $AllowedEnvironment -TimeoutMs 2700000 -TerminationTimeoutMs 10000 `
      -RunRoot $RunRoot -EvidenceRoot $WorkingEvidenceRoot -HistoryLease $HistoryLease
    if ([string]$RunResult.status -cne 'completed') {
      throw "BLOCKED: verified bootstrap status $($RunResult.status)"
    }
    $CompletionMarkerPath = Join-Path $WorkingEvidenceRoot 'completion-marker.json'
    $CompletionMarker = Get-Content -Raw -LiteralPath $CompletionMarkerPath | ConvertFrom-Json
    Assert-ExactFields $CompletionMarker @('schema_version','status','run_id','evaluation_sha256','final_manifest_sha256','evidence_inventory_sha256','history_before') 'completion marker'
    Assert-ExactFields $CompletionMarker.history_before @('present','length','sha256') 'completion history_before'
    if ($CompletionMarker.schema_version -ne 1 -or $CompletionMarker.status -cne 'complete' -or
        [string]::IsNullOrWhiteSpace([string]$CompletionMarker.evaluation_sha256) -or
        [string]::IsNullOrWhiteSpace([string]$CompletionMarker.final_manifest_sha256) -or
        [string]::IsNullOrWhiteSpace([string]$CompletionMarker.evidence_inventory_sha256)) {
      throw 'BLOCKED: completion marker is invalid'
    }
    if ([bool]$CompletionMarker.history_before.present -ne [bool]$HistoryBefore.present -or
        [int64]$CompletionMarker.history_before.length -ne [int64]$HistoryBefore.length -or
        [string]$CompletionMarker.history_before.sha256 -cne [string]$HistoryBefore.sha256) {
      throw 'BLOCKED: completion history_before does not match pre-launch binding'
    }
    if ((Get-K6FileBinding $HistoryPath | ConvertTo-Json -Compress) -cne
        ($HistoryBefore | ConvertTo-Json -Compress)) {
      throw 'BLOCKED: live Evaluation history changed by child'
    }
    Invoke-K6EvidencePromotion -WorkingEvidenceRoot $WorkingEvidenceRoot -DurableEvidenceParent $DurableEvidenceParent -DurableEvidenceRoot $DurableEvidenceRoot -Nonce $Nonce -HistoryBefore $HistoryBefore
    $CandidateCompleted = $true
  } finally {
    if ($SharedRuntimeLoaded) {
      $CleanupResult = Invoke-K6LoaderCleanup -LoaderRoot $LoaderRoot -RunRoot $RunRoot `
        -DurableEvidenceParent $DurableEvidenceParent -DurableEvidenceRoot $DurableEvidenceRoot `
        -BootstrapProcess $BootstrapProcess -CandidateCompleted $CandidateCompleted -HistoryLease $HistoryLease
      if (@($CleanupResult.errors).Count -ne 0) {
        throw 'BLOCKED: loader process or path cleanup failed'
      }
    } elseif (Test-Path -LiteralPath $LoaderRoot) {
      throw 'BLOCKED: pre-shared lifecycle created LoaderRoot before shared runtime authority'
    }
  }

  $RepositoryGuide = Join-Path $Repository $GuideRel
  $RepositoryRecorder = Join-Path $Repository 'scripts/record_evaluation.py'
  if ((git rev-parse (':' + $GuideRel)).Trim() -cne $GuideBlob -or
      (git hash-object ('--path=' + $GuideRel) -- $GuideRel).Trim() -cne $GuideBlob -or
      (git rev-parse ':scripts/record_evaluation.py').Trim() -cne
        '42b8a0d216bd218954a46a49dc912e349d759f19' -or
      (git hash-object --no-filters $RepositoryRecorder).Trim() -cne
        '42b8a0d216bd218954a46a49dc912e349d759f19') {
    throw 'BLOCKED: guide or recorder drift before append'
  }
  $EvaluationToAppend = Join-Path $DurableEvidenceRoot 'evaluation-to-append.json'
  if (-not (Test-Path -LiteralPath $EvaluationToAppend)) {
    throw 'BLOCKED: sealed Evaluation is missing after cleanup'
  }
  $CompletionMarker = Get-Content -Raw -LiteralPath (Join-Path $DurableEvidenceRoot 'completion-marker.json') | ConvertFrom-Json
  if ((Get-Sha256 $EvaluationToAppend) -cne [string]$CompletionMarker.evaluation_sha256) {
    throw 'BLOCKED: Evaluation digest changed during promotion'
  }
  foreach ($Artifact in @(
    @{ name='final manifest'; path=(Join-Path $DurableEvidenceRoot 'final-manifest.json'); digest=[string]$CompletionMarker.final_manifest_sha256 },
    @{ name='evidence inventory'; path=(Join-Path $DurableEvidenceRoot 'evidence-inventory.json'); digest=[string]$CompletionMarker.evidence_inventory_sha256 }
  )) {
    if (-not (Test-Path -LiteralPath $Artifact.path) -or (Get-Sha256 $Artifact.path) -cne $Artifact.digest) {
      throw "BLOCKED: $($Artifact.name) digest changed during promotion"
    }
  }
  Assert-K6NoReparsePath $DurableEvidenceParent
  Assert-K6NoReparsePath $DurableEvidenceRoot
  if ((Get-K6FileBinding $HistoryPath | ConvertTo-Json -Compress) -cne
      ($HistoryBefore | ConvertTo-Json -Compress)) {
    throw 'BLOCKED: live Evaluation history changed before recorder'
  }
  [string[]]$RecorderArguments = @(
    $RepositoryRecorder,'--history',(Join-Path $Repository $HistoryRel),
    '--evaluation',$EvaluationToAppend,'--repository',$Repository,'--guide',$RepositoryGuide,
    '--guide-revision','k6-114-s3-upload-v10','--source-base',$SourceBase,
    '--candidate-tree',$CandidateTree
  )
  if ($Mode -eq 'approve') {
    if ((Get-Sha256 $AcceptanceApprovalForRecorder) -cne $AcceptanceApprovalSha256) {
      throw 'BLOCKED: acceptance sidecar drift before append'
    }
    $RecorderArguments += @('--acceptance-approval',$AcceptanceApprovalForRecorder)
  }
  $EvaluationValue = Get-Content -Raw -LiteralPath $EvaluationToAppend | ConvertFrom-Json
  if ([string]$CompletionMarker.run_id -cne [string]$EvaluationValue.run_id) {
    throw 'BLOCKED: completion marker and sealed Evaluation run IDs differ'
  }
  $RecorderResult = Invoke-K6BoundedRecorder -Arguments $RecorderArguments -HistoryPath $HistoryPath `
    -EvaluationPath $EvaluationToAppend -HistoryBefore $HistoryBefore -ExpectedRunId ([string]$EvaluationValue.run_id) `
    -TimeoutMs 120000 -TerminationTimeoutMs 10000 -DurableEvidenceRoot $DurableEvidenceRoot
  if ([string]$RecorderResult.status -cne 'append_confirmed') {
    throw "BLOCKED: recorder status $($RecorderResult.status)"
  }
  Write-K6AppendConfirmation -Path (Join-Path $DurableEvidenceParent ($Nonce + '.append-confirmed.json')) `
    -RunId ([string]$EvaluationValue.run_id) -DurableEvidenceRoot $DurableEvidenceRoot
}
~~~

After implementation and exact execution approval:

~~~powershell
Invoke-K6Issue114Guide -Mode observe
~~~

After explicit maintainer acceptance of the exact pending run:

~~~powershell
Invoke-K6Issue114Guide -Mode approve -AcceptanceApprovalPath '.agents/manual-tests/k6-public-demo/issue-114-s3-upload-v10.acceptance-approval.json' -AcceptedRunId '<exact-pending-run-id>'
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
verifies their absence. It writes completion-marker.json last only after all gates, a sealed
unappended Evaluation, child cleanup, and provisional-evidence closure pass. The shared loader
creates the exact durable evidence parent, promotes the completed evidence directory, disposes the
bootstrap, and removes RunRoot and LoaderRoot through its bounded cleanup contract. Only after that
cleanup succeeds does the parent reverify the tracked guide and pinned SourceBase recorder and
append the sealed Evaluation.
Unsuccessful or cleanup-failed runs remove all provisional/durable evidence and append nothing.
Fault injection covers both archives, both expansions, control
verification, runner launch, loader blob-stream/process/disposal failures, loader interruption,
path-removal failure, and a hung bootstrap child with a grandchild. The bootstrap invokes
loaderSelfTest.ps1 before any candidate process. It extracts the exact 14-field pre-runtime
process/memory adapter set, materializer, cleanup function, and load transaction from the sealed
guide, verifies their LF-normalized digests, rejects every pre-shared filesystem/path/delete
primitive, and drives the production control flow through injected primitive adapters.
It separately verifies the exact shared loaderRuntime exports from the sealed CandidateTree blob
and executes those functions through injected process, stream, history-lease, promotion, and
recorder adapters. The closed 20-fault total is six pre-runtime lifecycle faults, including
materialization-success/runtime-load-failure and a pre-shared LoaderRoot/reparse attempt, plus
fourteen shared-runtime faults, including history-write-attempt and reparse-parent. Real execution
uses the same control flow with real primitives; a missing fault, source/digest mismatch,
pre-shared loader child-path call, unexpected append, or owned residue is BLOCKED before candidate
observations.

The loader-supplied allowlist is the complete parent environment for the bootstrap. Candidate
controls may add only fixed non-secret guide metadata. Fake adapters are mandatory. The network
guard activates before all six npm ci --offline operations and lifecycle children. External
DNS/HTTP, unregistered loopback, AWS SDK, Redis, RabbitMQ, and runtime env files are denied. Cache
miss is BLOCKED; no online fallback exists. No application Docker build runs; Issue #117 owns image
builds. Cached Gitleaks alone runs with --pull=never --network=none --rm. Its exact image authority
is ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f;
the runner inspects the local RepoDigest and fails before scan if that digest is absent.

## Catalog, observations, gates, and cleanup

The v10 catalog is sole case authority. Its eight MA cases contain exact typed vectors and complete
expected objects. catalogValidator.cjs independently enforces all exact field sets, ordering,
unique IDs, types, values, and D2 dispositions. Mutation fixtures cover missing, extra, duplicate,
reordered, mistyped, unequal, and unobservable material. Candidate output cannot supply expected
values or verdicts.

SourceRoot and CandidateRoot contract observers run in separate child processes. Only the approved
public-demo init-request fileSize delta may differ. Every response, event, identifier, attachment,
avatar, success field, and legacy-local shape remains exact. The observer also binds the exact
SourceRoot public file-route inventory: no public abort route and no anonymous key-refresh signer
may appear.

The multipart observer requires the exact Mongo-owned record field set, server-owned tuple,
finite server-chosen expiry, and allowed lifecycle union. A closed three-operation by four-mutation
matrix proves part-sign, complete, and internal-abort all reject owner, session, provider-upload-ID,
or server-key substitution before provider calls. Post-completion cleanup retains only classified
key segments and digests, proving deletion of the session-owned unpersisted object and no deletion
after a durable File owns it.

Fake storage constructs joined object keys only inside the in-memory adapter while executing an
operation. Put/multipart-init commands must use one approved staging/durable key class with zero
ACL/public-read/public-URL authority. Catalog vectors retain only separated key fixtures. Worker
observations retain only the operation, key class, segment-equality result, and SHA-256 key digest
for read, write, staging-delete, current-attempt-output-delete, and prior-durable-delete operations.
No joined object key may be retained in observations, command summaries, evidence inventory,
manifest, Evaluation, approval sidecars, logs, or any other evidence surface. Raw provider URLs are
also forbidden. Signing failure uses the existing root-relative same-origin
/demo-assets/avatars/green.svg fallback.

Observe mode executes the catalog, focused tests, npm run test:ci, npm run ci:validate,
npm run lint:ci, client tests/build, server tests, and git diff --check. Preliminary validation
retains only schema-closed observations. Cleanup then proves zero child/process/port/socket/temp/
provider/D2 counters.

The finalizer runs only after gates and cleanup. It writes a closed evidence inventory. Pinned
Gitleaks covers candidate diff, client dist, observations, summaries, and inventory. The
approval-bound rawKeyEvidenceValidator.cjs independently applies its closed joined-key grammar to
all nine retained surfaces: candidate diff, client dist, observations, command summaries, evidence
inventory, final manifest, pending Evaluation, acceptance sidecar, and approved Evaluation. One
mutation per surface must be rejected. The finalizer
then writes final-manifest.json and pending-evaluation.json using fixed enumerations, booleans,
integers, nulls, and SHA-256 values only. A separate closed safe-text validator covers those two
terminal files. In approve mode it also covers the sealed acceptance sidecar and generated approved
Evaluation. Per-surface scanner identity and zero findings are retained without claiming Gitleaks
for post-Gitleaks files. The safe-text validator rejects raw keys, provider URLs/text, signed
queries, credentials, stacks, control characters, and unknown strings before append. There is no
self-hash claim.

## Append-only Evaluation

Immediately before each append, after parent-owned promotion, process disposal, and path cleanup,
the parent requires the repository guide worktree/index blob to equal the previously sealed
GuideBlob and invokes the pinned SourceBase recorder with that tracked RepositoryGuide path.
SealedGuide remains internal immutable validation input only. The bootstrap cannot write Evaluation
history; it receives history read-only and produces one closed evaluation-to-append.json.

Observe mode appends one schema-v2 record through the parent-invoked SourceBase-identical recorder.
A behavior/gate/scan failure is FAILED/pending. Unavailable authority or cleanup with no FAIL is
BLOCKED/pending. Eight PASS observations remain BLOCKED/pending solely because human approval is
absent, with null acceptance fields.

The manual-acceptance-run sidecar uses the recorder's exact schema:
schema_version, approval_type, guide_revision, guide_sha256, source_base, candidate_tree,
accepted_run_id, approved_at, approver, approval_reference, human_approval. Its accepted_run_id is
the exact pending record explicitly accepted by the maintainer.

Approve mode applies the same closed terminal safe-text validator to the sealed acceptance sidecar
and generated approved Evaluation before cleanup. It validates that sidecar against the exact guide,
SourceBase, CandidateTree, pending run
ID in append-only history, and eight PASS result bytes. transitionEvaluation.cjs writes a new run
ID with byte-identical results, accepted_run_id, and sidecar SHA-256. After outer cleanup, the parent
rechecks the original sidecar digest and the pinned recorder appends with every explicit argument
and --acceptance-approval. The shared recorder first binds the exact pre-append bytes/length/digest,
then requires exactly one new serialized Evaluation line after that unchanged prefix. A pre-existing
match, duplicate, write-then-restore, or ambiguous append is not confirmation. If acknowledgement
is lost after the exact append, the parent writes append-confirmed.json and treats the append as
terminal without retry; only no-append failures remove unappended evidence. It never edits,
truncates, replaces, or deletes history. The four no-append recorder faults have
history_append_count=0 and removed_unappended_evidence_count=1 each; the acknowledgement-loss-after-
append fault has exact_append_retained_count=1 and duplicate_retry_count=0.
The exact-schema append confirmation marker is written outside the closed evidence root by the
shared runtime and passes a post-append closed-safe-text validator before completion is returned.

Any semantic change requires v11 plus fresh external review and maintainer approval. Public AWS,
browser, CORS, ETag, worker, provider, and D2 compatibility remain pending. D2_MUTATIONS=0.
