# Manual Test Guide: K6 Issue #116 — Demo Seed and Reset Boundary

## Immutable authority

- Specification snapshot: issue-116-spec-snapshot.md
- Specification SHA-256: 8d73c59a15d24d4938538a81edf596f5c215892c7d8a77df0f6e77809aa5f452
- Ticket review SHA-256: 97d435297f26a6ab519309b3a25c7503637256749c224b1b3060d0c5e598f12e
- SourceBase: 79a2653464d0bf798b95222ec7434ce8722a696b
- SourceCommitTree: 8e0dc6143540018ba0008f42d31b3398ca138ee5
- SourceExecutionProjection: d9de20b5fac1da34c143d96fa26ae22843df042c
- Guide revision: k6-116-demo-seed-v12
- Catalog: issue-116-demo-seed-v12.catalog.json
- Evaluation history: issue-116-demo-seed-v12.evaluations.jsonl

V1–v11 and their reviews remain immutable historical evidence. V12 supersedes their executable,
catalog, identity, finalization, and Evaluation-transition statements. No per-Issue code review runs.

This is pre-D2 local acceptance. In-memory adapters plus one nonce-owned disposable local Mongo
container are mandatory. Atlas, Railway, S3, Redis, RabbitMQ, provider credentials, remote
seed/reset, deployment, rollback, and Issue #61 are forbidden. Required result: D2_MUTATIONS=0.

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

1. scripts/k6/issue116/bootstrap.ps1
2. scripts/k6/issue116/loaderSelfTest.ps1
3. scripts/k6/issue116/loaderRuntime.ps1
4. scripts/k6/issue116/catalogValidator.cjs
5. scripts/k6/issue116/commandWrapper.cjs
6. scripts/k6/issue116/finalizer.cjs
7. scripts/k6/issue116/mongoFixture.ps1
8. scripts/k6/issue116/networkGuard.cjs
9. scripts/k6/issue116/observer.cjs
10. scripts/k6/issue116/preliminaryValidator.cjs
11. scripts/k6/issue116/runGuide.ps1
12. scripts/k6/issue116/scenarios.cjs
13. scripts/k6/issue116/transitionEvaluation.cjs

Execution approval control_blobs must be set-equal to this list. JSON property order is
non-authoritative because names are canonically sorted. Every value is the exact CandidateTree Git
blob. Missing, extra, non-blob, tampered, stale, or wrong-tree material is BLOCKED before the first
candidate process.

### Shared loader runtime seam

\`loaderRuntime.ps1\` is the sole implementation of loader resource creation, process/stream
termination and disposal, reparse-safe path ownership, history protection, evidence promotion,
finalization-state transitions, and bounded recorder invocation. Its exact shared exports are
\`Assert-K6NoReparsePath\`, \`Assert-K6OwnedRootLease\`, \`Get-K6FileBinding\`,
\`Write-K6GitBlob\`,
\`Test-K6HistoryRecord\`, \`Protect-K6HistoryPath\`, \`Release-K6HistoryPath\`,
\`New-K6LoaderAdapters\`, \`New-K6OwnedRoot\`, \`Invoke-K6LoaderRun\`,
\`Invoke-K6LoaderCleanup\`, \`Invoke-K6EvidencePromotion\`,
\`Invoke-K6FinalizationTransaction\`, \`Invoke-K6FinalizationRecovery\`,
\`Invoke-K6BoundedRecorder\`, and
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
explicit stream/process disposal. Before dot-sourcing it requires an exact declaration-only AST:
no using/param/begin/process/clean/dynamic block, no script requirements or top-level traps, no
filter/workflow/non-function statement, and exactly the sixteen named ordinary functions. It
binds the LF-normalized SHA-256 of every function and the canonical manifest digest. Before load,
every expected Function: binding must be absent. After dot-source, all sixteen local functions are
resolved and their exact AST identity/body digest is reverified before runtime authority is set.
Partial load removes only newly loaded expected bindings. No nonce or loader child path is
constructed or probed before this transition.

After shared authority loads, \`New-K6OwnedRoot\` performs atomically exclusive root creation,
immediate non-reparse validation, and identity pinning through the injected shared adapters. It
returns an exact ownership lease with parent/root handles opened without delete sharing for the
complete lease lifetime. \`Assert-K6OwnedRootLease\` binds expected role, parent, path, both open
handles, lock mode, and live directory identities before the first child write and again before
launch/finalization. Collision, parent replacement, or post-create replacement returns no lease.
Child paths are derived only from leased roots. \`Invoke-K6LoaderRun\` and cleanup receive both
leases and revalidate them; \`Invoke-K6LoaderCleanup\` accepts
leases, never bare root paths, and cannot traverse or delete a colliding/unowned root. A
post-admission or post-lease replacement, invalid/closed handle, load failure, cleanup failure, or
owned residue is
BLOCKED before any candidate child, recorder, promotion, or history append.

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
acknowledgement-loss-after-append result is terminal-confirmed. On successful candidate completion,
\`Invoke-K6FinalizationTransaction\` is a pre-resolved, single-untyped-context, total/no-throw
entry and is the only operation allowed to promote evidence. It owns one
state machine spanning ownership-leased promotion, loader/run cleanup, all guide/recorder/artifact/
history/sidecar/run-ID validations, bounded recording, exact append detection, and confirmation
write. Every confirmed no-append failure removes and verifies the exact promoted root before
returning retry-safe failure. Once one exact append exists, evidence is retained and the state is
terminal/non-retryable; confirmation-write failure returns
\`append-confirmed-confirmation-failed\` and cannot be rerun. The outer guard remains armed until
the exact result union is fully validated. Entry/result-validation exceptions route through the
pre-resolved total/no-throw \`Invoke-K6FinalizationRecovery\`, which classifies exact history,
retains appended evidence, removes unappended promoted evidence, and closes owned handles and
processes. A cleanup-failed exact append has a distinct terminal/manual-cleanup disposition. No
parent operation may occur between promotion and terminal classification. \`Invoke-K6LoaderCleanup\` handles failed candidates
using only ownership leases and returns typed errors.

## Copy-run trust loader

Paste this function from the approved guide into PowerShell. It executes only Git, the SourceBase
candidate helper, and an exact CandidateTree bootstrap blob. Git blob identity, not platform line
endings, is authority.

~~~powershell
function Invoke-K6Issue116Guide {
  [CmdletBinding()]
  param(
    [ValidateSet('observe','approve')][string]$Mode = 'observe',
    [string]$AcceptanceApprovalPath,
    [string]$AcceptedRunId
  )
  $ErrorActionPreference = 'Stop'
  $Repository = (Resolve-Path '.').Path
  $ExpectedRepository = 'D:\Developer\Projects\shotter\shot-chat-worktrees\k6-issue-116'
  $ExpectedBranch = 'nhibuaa/k6-issue-116-demo-seed'
  $SourceBase = '79a2653464d0bf798b95222ec7434ce8722a696b'
  $SourceCommitTree = '8e0dc6143540018ba0008f42d31b3398ca138ee5'
  $SourceProjection = 'd9de20b5fac1da34c143d96fa26ae22843df042c'
  $ManualRoot = '.agents/manual-tests/k6-public-demo'
  $GuideRel = "$ManualRoot/issue-116-demo-seed-v12.md"
  $CatalogRel = "$ManualRoot/issue-116-demo-seed-v12.catalog.json"
  $GuideApprovalRel = "$ManualRoot/issue-116-demo-seed-v12.approval.json"
  $HistoryRel = "$ManualRoot/issue-116-demo-seed-v12.evaluations.jsonl"
  [string[]]$ExpectedControls = @(
    'scripts/k6/issue116/bootstrap.ps1',
    'scripts/k6/issue116/loaderSelfTest.ps1',
    'scripts/k6/issue116/loaderRuntime.ps1',
    'scripts/k6/issue116/catalogValidator.cjs',
    'scripts/k6/issue116/commandWrapper.cjs',
    'scripts/k6/issue116/finalizer.cjs',
    'scripts/k6/issue116/mongoFixture.ps1',
    'scripts/k6/issue116/networkGuard.cjs',
    'scripts/k6/issue116/observer.cjs',
    'scripts/k6/issue116/preliminaryValidator.cjs',
    'scripts/k6/issue116/runGuide.ps1',
    'scripts/k6/issue116/scenarios.cjs',
    'scripts/k6/issue116/transitionEvaluation.cjs'
  )
  $ExpectedControls = @($ExpectedControls | Sort-Object -CaseSensitive)

  [string[]]$ExpectedSharedExports = @(
    'Assert-K6NoReparsePath',
    'Assert-K6OwnedRootLease',
    'Get-K6FileBinding',
    'Invoke-K6BoundedRecorder',
    'Invoke-K6EvidencePromotion',
    'Invoke-K6FinalizationTransaction',
    'Invoke-K6FinalizationRecovery',
    'Invoke-K6LoaderCleanup',
    'Invoke-K6LoaderRun',
    'New-K6LoaderAdapters',
    'New-K6OwnedRoot',
    'Protect-K6HistoryPath',
    'Release-K6HistoryPath',
    'Test-K6HistoryRecord',
    'Write-K6AppendConfirmation',
    'Write-K6GitBlob'
  )
  $ExpectedSharedExports = @($ExpectedSharedExports | Sort-Object -CaseSensitive)

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
  function Get-K6FinalizationDisposition([object]$Result,[string]$ExpectedRunId) {
    Assert-ExactFields $Result @(
      'schema_version','status','terminal','retry_allowed','run_id','expected_run_id',
      'history_append_count','evidence_retained','confirmation_written',
      'cleanup_verified','remaining_loader_roots','remaining_run_roots',
      'remaining_processes','entry_exception_classified'
    ) 'finalization result'
    if ($Result.schema_version -isnot [int] -or
        $Result.status -isnot [string] -or $Result.run_id -isnot [string] -or
        $Result.expected_run_id -isnot [string] -or
        $Result.terminal -isnot [bool] -or $Result.retry_allowed -isnot [bool] -or
        $Result.evidence_retained -isnot [bool] -or
        $Result.confirmation_written -isnot [bool] -or
        $Result.cleanup_verified -isnot [bool] -or
        $Result.entry_exception_classified -isnot [bool] -or
        $Result.history_append_count -isnot [int] -or
        $Result.remaining_loader_roots -isnot [int] -or
        $Result.remaining_run_roots -isnot [int] -or
        $Result.remaining_processes -isnot [int] -or
        $Result.schema_version -ne 1 -or
        [string]$Result.run_id -cne $ExpectedRunId -or
        [string]$Result.expected_run_id -cne $ExpectedRunId -or
        [int]$Result.history_append_count -notin @(0,1) -or
        [int]$Result.remaining_loader_roots -lt 0 -or
        [int]$Result.remaining_run_roots -lt 0 -or
        [int]$Result.remaining_processes -lt 0) {
      throw 'BLOCKED: finalization result identity or counters are invalid'
    }
    $ZeroResidue = (
      [int]$Result.remaining_loader_roots -eq 0 -and
      [int]$Result.remaining_run_roots -eq 0 -and
      [int]$Result.remaining_processes -eq 0
    )
    switch -CaseSensitive ([string]$Result.status) {
      'append-confirmed' {
        if (-not [bool]$Result.terminal -or [bool]$Result.retry_allowed -or
            [int]$Result.history_append_count -ne 1 -or
            -not [bool]$Result.evidence_retained -or
            -not [bool]$Result.confirmation_written -or
            -not [bool]$Result.cleanup_verified -or -not $ZeroResidue) {
          throw 'BLOCKED: successful finalization result is not exact'
        }
        return 'success'
      }
      'append-confirmed-confirmation-failed' {
        if (-not [bool]$Result.terminal -or [bool]$Result.retry_allowed -or
            [int]$Result.history_append_count -ne 1 -or
            -not [bool]$Result.evidence_retained -or
            [bool]$Result.confirmation_written -or
            -not [bool]$Result.cleanup_verified -or -not $ZeroResidue) {
          throw 'BLOCKED: confirmation-failure finalization result is not exact'
        }
        return 'terminal-confirmation-failed'
      }
      'append-confirmed-entry-failed' {
        if (-not [bool]$Result.terminal -or [bool]$Result.retry_allowed -or
            [int]$Result.history_append_count -ne 1 -or
            -not [bool]$Result.evidence_retained -or
            [bool]$Result.confirmation_written -or
            -not [bool]$Result.cleanup_verified -or -not $ZeroResidue -or
            -not [bool]$Result.entry_exception_classified) {
          throw 'BLOCKED: entry-failure finalization result is not exact'
        }
        return 'terminal-entry-failed'
      }
      'append-confirmed-cleanup-failed' {
        if (-not [bool]$Result.terminal -or [bool]$Result.retry_allowed -or
            [int]$Result.history_append_count -ne 1 -or
            -not [bool]$Result.evidence_retained -or
            [bool]$Result.confirmation_written -or
            [bool]$Result.cleanup_verified -or $ZeroResidue) {
          throw 'BLOCKED: cleanup-failure finalization result is not exact'
        }
        return 'terminal-cleanup-failed'
      }
      'no-append-cleaned-failed' {
        if ([bool]$Result.terminal -or -not [bool]$Result.retry_allowed -or
            [int]$Result.history_append_count -ne 0 -or
            [bool]$Result.evidence_retained -or
            [bool]$Result.confirmation_written -or
            -not [bool]$Result.cleanup_verified -or -not $ZeroResidue) {
          throw 'BLOCKED: no-append failure result is not exact'
        }
        return 'no-append-failed'
      }
      default {
        throw 'BLOCKED: unknown finalization result status'
      }
    }
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
  function Get-K6RuntimeDeclarationManifest {
    param(
      [string]$RuntimeText,
      [string[]]$ExpectedExports
    )
    $Tokens = $null
    $Errors = $null
    $Ast = [Management.Automation.Language.Parser]::ParseInput(
      $RuntimeText,[ref]$Tokens,[ref]$Errors
    )
    if (@($Errors).Count -ne 0 -or $null -eq $Ast.EndBlock -or
        $null -ne $Ast.BeginBlock -or $null -ne $Ast.ProcessBlock -or
        $null -ne $Ast.CleanBlock -or $null -ne $Ast.DynamicParamBlock -or
        $null -ne $Ast.ParamBlock -or @($Ast.UsingStatements).Count -ne 0 -or
        $null -ne $Ast.ScriptRequirements -or $null -ne $Ast.EndBlock.Traps) {
      throw 'BLOCKED: shared loader runtime is not a declaration-only script'
    }
    [object[]]$Statements = @($Ast.EndBlock.Statements)
    foreach ($Statement in $Statements) {
      if ($Statement -isnot [Management.Automation.Language.FunctionDefinitionAst] -or
          [bool]$Statement.IsFilter -or [bool]$Statement.IsWorkflow) {
        throw 'BLOCKED: shared loader runtime contains executable top-level material'
      }
    }
    if ($Statements.Count -ne $ExpectedExports.Count) {
      throw 'BLOCKED: shared loader runtime declaration count mismatch'
    }
    [string[]]$ActualExports = @(
      $Statements | ForEach-Object Name | Sort-Object -CaseSensitive
    )
    [string[]]$WantedExports = @($ExpectedExports | Sort-Object -CaseSensitive)
    if ((Get-ArrayJson $ActualExports) -cne (Get-ArrayJson $WantedExports) -or
        @($ActualExports | Group-Object | Where-Object Count -ne 1).Count -ne 0) {
      throw 'BLOCKED: shared loader runtime export set mismatch'
    }
    $DigestMap = [ordered]@{}
    foreach ($Name in $ActualExports) {
      $Definition = $Statements | Where-Object Name -CEQ $Name
      $Normalized = $Definition.Extent.Text.Replace(
        ([string][char]13)+([string][char]10),[string][char]10
      ).Replace([string][char]13,[string][char]10)
      $Hasher = [Security.Cryptography.SHA256]::Create()
      try {
        $DigestMap[$Name] = (
          [BitConverter]::ToString(
            $Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Normalized))
          )
        ).Replace('-','').ToLowerInvariant()
      } finally {
        $Hasher.Dispose()
      }
    }
    $ManifestText = (
      $ActualExports | ForEach-Object { $_ + '=' + [string]$DigestMap[$_] }
    ) -join [char]10
    $ManifestHasher = [Security.Cryptography.SHA256]::Create()
    try {
      $ManifestSha256 = (
        [BitConverter]::ToString(
          $ManifestHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($ManifestText))
        )
      ).Replace('-','').ToLowerInvariant()
    } finally {
      $ManifestHasher.Dispose()
    }
    return [pscustomobject]@{
      export_names = $ActualExports
      function_digests = [pscustomobject]$DigestMap
      manifest_sha256 = $ManifestSha256
    }
  }
  function Invoke-K6PreRuntimeMaterializer {
    param(
      [object]$Adapters,
      [string]$RepositoryPath,
      [string]$Blob,
      [string[]]$ExpectedExports,
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
      $Stage = 'runtime-declaration-validation'
      $Utf8 = [Text.UTF8Encoding]::new($false,$true)
      $RuntimeText = $Utf8.GetString($Bytes)
      $Manifest = Get-K6RuntimeDeclarationManifest -RuntimeText $RuntimeText `
        -ExpectedExports $ExpectedExports
      $RuntimeScript = [scriptblock]::Create($RuntimeText)
      return [pscustomobject]@{
        status = 'materialized'
        blob = $Materialized
        runtime_script = $RuntimeScript
        export_names = $Manifest.export_names
        function_digests = $Manifest.function_digests
        manifest_sha256 = $Manifest.manifest_sha256
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
    param(
      [scriptblock]$RuntimeScript,
      [string[]]$ExportNames,
      [object]$FunctionDigests,
      [string]$ManifestSha256,
      [string[]]$ExpectedExports
    )
    [string[]]$WantedExports = @($ExpectedExports | Sort-Object -CaseSensitive)
    [string[]]$DigestNames = @(
      $FunctionDigests.PSObject.Properties.Name | Sort-Object -CaseSensitive
    )
    $DigestValuesValid = $true
    foreach ($Name in $DigestNames) {
      if ([string]$FunctionDigests.PSObject.Properties[$Name].Value -notmatch
          '^[0-9a-f]{64}$') {
        $DigestValuesValid = $false
      }
    }
    $ManifestText = (
      $DigestNames | ForEach-Object {
        $_ + '=' + [string]$FunctionDigests.PSObject.Properties[$_].Value
      }
    ) -join [char]10
    $ManifestHasher = [Security.Cryptography.SHA256]::Create()
    try {
      $ActualManifestSha256 = (
        [BitConverter]::ToString(
          $ManifestHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($ManifestText))
        )
      ).Replace('-','').ToLowerInvariant()
    } finally {
      $ManifestHasher.Dispose()
    }
    if ((Get-ArrayJson @($ExportNames)) -cne
          (Get-ArrayJson $WantedExports) -or
        (Get-ArrayJson $DigestNames) -cne (Get-ArrayJson $WantedExports) -or
        -not $DigestValuesValid -or $ManifestSha256 -cne $ActualManifestSha256) {
      throw 'BLOCKED: shared loader runtime declaration manifest drift'
    }
    foreach ($Name in $WantedExports) {
      if (Test-Path -LiteralPath ('Function:\' + $Name)) {
        throw "BLOCKED: shared loader runtime function collision: $Name"
      }
    }
    try {
      . $RuntimeScript
      foreach ($Name in $WantedExports) {
        $Function = Get-Item -LiteralPath ('Function:\' + $Name)
        if ($Function -isnot [Management.Automation.FunctionInfo] -or
            $Function.ScriptBlock.Ast -isnot
              [Management.Automation.Language.FunctionDefinitionAst] -or
            [string]$Function.ScriptBlock.Ast.Name -cne $Name -or
            [bool]$Function.ScriptBlock.Ast.IsFilter -or
            [bool]$Function.ScriptBlock.Ast.IsWorkflow) {
          throw "BLOCKED: loaded shared function identity mismatch: $Name"
        }
        $Normalized = $Function.ScriptBlock.Ast.Extent.Text.Replace(
          ([string][char]13)+([string][char]10),[string][char]10
        ).Replace([string][char]13,[string][char]10)
        $Hasher = [Security.Cryptography.SHA256]::Create()
        try {
          $LoadedDigest = (
            [BitConverter]::ToString(
              $Hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Normalized))
            )
          ).Replace('-','').ToLowerInvariant()
        } finally {
          $Hasher.Dispose()
        }
        if ($LoadedDigest -cne
            [string]$FunctionDigests.PSObject.Properties[$Name].Value) {
          throw "BLOCKED: loaded shared function digest mismatch: $Name"
        }
      }
      return [pscustomobject]@{
        status = 'loaded-and-verified'
        manifest_sha256 = $ManifestSha256
        export_count = $WantedExports.Count
      }
    } catch {
      foreach ($Name in $WantedExports) {
        if (Test-Path -LiteralPath ('Function:\' + $Name)) {
          $Loaded = Get-Item -LiteralPath ('Function:\' + $Name)
          if ($Loaded -is [Management.Automation.FunctionInfo]) {
            Remove-Item -LiteralPath ('Function:\' + $Name)
          }
        }
      }
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
  foreach ($File in Get-ChildItem (Join-Path $Repository $ManualRoot) -File -Filter 'issue-116-demo-seed-v12.execution-approval*.json') {
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
      $GuideApproval.guide_revision -cne 'k6-116-demo-seed-v12' -or
      $GuideApproval.source_base -cne $SourceBase -or $GuideApproval.approver -cne 'maintainer' -or
      $GuideApproval.human_approval -cne 'approved' -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approved_at) -or
      [string]::IsNullOrWhiteSpace([string]$GuideApproval.approval_reference) -or
      $ExecutionApproval.schema_version -ne 1 -or
      $ExecutionApproval.approval_type -cne 'manual-guide-execution' -or
      $ExecutionApproval.guide_revision -cne 'k6-116-demo-seed-v12' -or
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

  $BootstrapProcess = $null
  $CandidateCompleted = $false
  $HistoryLease = $null
  $LoaderLease = $null
  $RunLease = $null
  $FinalizationContext = $null
  $FinalizationResult = $null
  $FinalizationDisposition = $null
  $FinalizationGuardArmed = $false
  $SharedRuntimeLoaded = $false
  $AcceptanceApprovalForRecorder = $null
  $AcceptanceApprovalSha256 = $null
  $PreRuntimeStage = 'adapter-construction'
  try {
    try {
      $PreRuntimeAdapters = New-K6PreRuntimeAdapters -Mode real
      $PreRuntimeStage = 'materialization'
      $PreRuntimeResult = Invoke-K6PreRuntimeMaterializer $PreRuntimeAdapters $Repository `
        ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/loaderRuntime.ps1') `
        $ExpectedSharedExports
      Assert-ExactFields $PreRuntimeResult @(
        'status','blob','runtime_script','export_names','function_digests','manifest_sha256'
      ) 'pre-runtime result'
      if ([string]$PreRuntimeResult.status -cne 'materialized' -or
          [string]$PreRuntimeResult.blob -cne
            [string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/loaderRuntime.ps1' -or
          $PreRuntimeResult.runtime_script -isnot [scriptblock]) {
        throw 'BLOCKED: shared loader runtime materialization result mismatch'
      }
      $PreRuntimeStage = 'runtime-load'
      $LoadResult = . $K6PreRuntimeLoadTransaction $PreRuntimeResult.runtime_script `
        $PreRuntimeResult.export_names $PreRuntimeResult.function_digests `
        $PreRuntimeResult.manifest_sha256 $ExpectedSharedExports
      Assert-ExactFields $LoadResult @(
        'status','manifest_sha256','export_count'
      ) 'shared runtime load result'
      if ($LoadResult.status -cne 'loaded-and-verified' -or
          $LoadResult.manifest_sha256 -cne $PreRuntimeResult.manifest_sha256 -or
          [int]$LoadResult.export_count -ne $ExpectedSharedExports.Count) {
        throw 'BLOCKED: shared loader runtime post-load verification mismatch'
      }
      $FinalizationEntry = (
        Get-Item -LiteralPath 'Function:\Invoke-K6FinalizationTransaction'
      ).ScriptBlock
      $FinalizationRecoveryEntry = (
        Get-Item -LiteralPath 'Function:\Invoke-K6FinalizationRecovery'
      ).ScriptBlock
      $SharedRuntimeLoaded = $true
    } catch {
      $PreRuntimeFailure = if ($_.Exception.Message.StartsWith('BLOCKED:')) {
        [string]$_.Exception.Message
      } else {
        "BLOCKED: pre-runtime lifecycle failed at $PreRuntimeStage"
      }
      throw $PreRuntimeFailure
    }
    $Nonce = [Guid]::NewGuid().ToString('N')
    $LoaderAdapters = New-K6LoaderAdapters -Mode real
    $LoaderLease = New-K6OwnedRoot -ParentPath ([IO.Path]::GetTempPath()) `
      -LeafName "k6-116-loader-$Nonce" -Role loader -Adapters $LoaderAdapters
    Assert-ExactFields $LoaderLease @(
      'schema_version','lease_type','lease_id','role','parent_path','path',
      'parent_binding','root_binding','parent_handle','root_handle','lock_mode','created'
    ) 'loader ownership lease'
    $LoaderParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    $ExpectedLoaderRoot = [IO.Path]::GetFullPath(
      (Join-Path $LoaderParent "k6-116-loader-$Nonce")
    )
    if ($LoaderLease.schema_version -ne 1 -or
        $LoaderLease.lease_type -cne 'owned-root' -or
        $LoaderLease.role -cne 'loader' -or
        [IO.Path]::GetFullPath([string]$LoaderLease.parent_path) -cne $LoaderParent -or
        [IO.Path]::GetFullPath([string]$LoaderLease.path) -cne $ExpectedLoaderRoot -or
        $LoaderLease.lock_mode -cne 'parent-and-root-no-delete-sharing' -or
        $null -eq $LoaderLease.parent_handle -or $LoaderLease.parent_handle.IsInvalid -or
        $LoaderLease.parent_handle.IsClosed -or $null -eq $LoaderLease.root_handle -or
        $LoaderLease.root_handle.IsInvalid -or $LoaderLease.root_handle.IsClosed -or
        -not [bool]$LoaderLease.created) {
      throw 'BLOCKED: loader ownership lease is invalid'
    }
    Assert-K6OwnedRootLease -Lease $LoaderLease -ExpectedParent $LoaderParent `
      -ExpectedPath $ExpectedLoaderRoot -ExpectedRole loader -Adapters $LoaderAdapters
    $LoaderRoot = [string]$LoaderLease.path
    $ManualAbsolute = Join-Path $Repository $ManualRoot
    Assert-K6NoReparsePath $Repository
    Assert-K6NoReparsePath $ManualAbsolute
    $RunLease = New-K6OwnedRoot -ParentPath $ManualAbsolute `
      -LeafName ".issue-116-demo-seed-v12-run-$Nonce" -Role run -Adapters $LoaderAdapters
    Assert-ExactFields $RunLease @(
      'schema_version','lease_type','lease_id','role','parent_path','path',
      'parent_binding','root_binding','parent_handle','root_handle','lock_mode','created'
    ) 'run ownership lease'
    $ExpectedRunRoot = [IO.Path]::GetFullPath(
      (Join-Path $ManualAbsolute ".issue-116-demo-seed-v12-run-$Nonce")
    )
    if ($RunLease.schema_version -ne 1 -or
        $RunLease.lease_type -cne 'owned-root' -or
        $RunLease.role -cne 'run' -or
        [IO.Path]::GetFullPath([string]$RunLease.parent_path) -cne
          [IO.Path]::GetFullPath($ManualAbsolute) -or
        [IO.Path]::GetFullPath([string]$RunLease.path) -cne $ExpectedRunRoot -or
        $RunLease.lock_mode -cne 'parent-and-root-no-delete-sharing' -or
        $null -eq $RunLease.parent_handle -or $RunLease.parent_handle.IsInvalid -or
        $RunLease.parent_handle.IsClosed -or $null -eq $RunLease.root_handle -or
        $RunLease.root_handle.IsInvalid -or $RunLease.root_handle.IsClosed -or
        -not [bool]$RunLease.created) {
      throw 'BLOCKED: run ownership lease is invalid'
    }
    Assert-K6OwnedRootLease -Lease $RunLease `
      -ExpectedParent ([IO.Path]::GetFullPath($ManualAbsolute)) `
      -ExpectedPath $ExpectedRunRoot -ExpectedRole run -Adapters $LoaderAdapters
    $RunRoot = [string]$RunLease.path
    $BootstrapPath = Join-Path $LoaderRoot 'bootstrap.ps1'
    $LoaderSelfTestPath = Join-Path $LoaderRoot 'loaderSelfTest.ps1'
    $LoaderRuntimePath = Join-Path $LoaderRoot 'loaderRuntime.ps1'
    $SealedGuide = Join-Path $LoaderRoot 'guide.md'
    $SealedCatalog = Join-Path $LoaderRoot 'catalog.json'
    $SealedGuideApproval = Join-Path $LoaderRoot 'guide-approval.json'
    $SealedExecutionApproval = Join-Path $LoaderRoot 'execution-approval.json'
    $SealedAcceptanceApproval = Join-Path $LoaderRoot 'acceptance-approval.json'
    $WorkingEvidenceRoot = Join-Path $RunRoot 'completed-evidence'
    $DurableEvidenceParent = Join-Path $ManualAbsolute 'issue-116-demo-seed-v12-evidence'
    $DurableEvidenceRoot = Join-Path $DurableEvidenceParent $Nonce
    $HistoryPath = Join-Path $Repository $HistoryRel
    $HistorySnapshotPath = Join-Path $RunRoot 'history.snapshot.jsonl'
    $HistoryBindingPath = Join-Path $RunRoot 'history.binding.json'
    Assert-K6OwnedRootLease -Lease $RunLease `
      -ExpectedParent ([IO.Path]::GetFullPath($ManualAbsolute)) `
      -ExpectedPath $ExpectedRunRoot -ExpectedRole run -Adapters $LoaderAdapters
    $HistoryBefore = Get-K6FileBinding $HistoryPath
    if ($HistoryBefore.present) { Copy-Item -LiteralPath $HistoryPath -Destination $HistorySnapshotPath }
    else { [IO.File]::WriteAllText($HistorySnapshotPath,'') }
    $HistoryBefore | ConvertTo-Json -Compress | Set-Content -LiteralPath $HistoryBindingPath -NoNewline
    $HistoryLease = Protect-K6HistoryPath -CanonicalPath $HistoryPath -SnapshotPath $HistorySnapshotPath -Binding $HistoryBefore -RepositoryRoot $Repository
    Assert-K6OwnedRootLease -Lease $LoaderLease -ExpectedParent $LoaderParent `
      -ExpectedPath $ExpectedLoaderRoot -ExpectedRole loader -Adapters $LoaderAdapters
    Write-K6GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/loaderRuntime.ps1') $LoaderRuntimePath
    Write-K6GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/bootstrap.ps1') $BootstrapPath
    Write-K6GitBlob ([string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/loaderSelfTest.ps1') $LoaderSelfTestPath
    Write-K6GitBlob $GuideBlob $SealedGuide
    Write-K6GitBlob $CatalogBlob $SealedCatalog
    Write-K6GitBlob $GuideApprovalBlob $SealedGuideApproval
    [IO.File]::Copy($ExecutionApprovalPath,$SealedExecutionApproval,$false)
    Assert-K6OwnedRootLease -Lease $LoaderLease -ExpectedParent $LoaderParent `
      -ExpectedPath $ExpectedLoaderRoot -ExpectedRole loader -Adapters $LoaderAdapters
    if ((git hash-object --no-filters $BootstrapPath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/bootstrap.ps1') {
      throw 'BLOCKED: materialized bootstrap mismatch'
    }
    if ((git hash-object --no-filters $LoaderSelfTestPath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/loaderSelfTest.ps1') {
      throw 'BLOCKED: materialized loader self-test mismatch'
    }
    if ((git hash-object --no-filters $LoaderRuntimePath).Trim() -cne
        [string]$ExecutionApproval.control_blobs.'scripts/k6/issue116/loaderRuntime.ps1') {
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
    Assert-K6OwnedRootLease -Lease $LoaderLease -ExpectedParent $LoaderParent `
      -ExpectedPath $ExpectedLoaderRoot -ExpectedRole loader -Adapters $LoaderAdapters
    Assert-K6OwnedRootLease -Lease $RunLease `
      -ExpectedParent ([IO.Path]::GetFullPath($ManualAbsolute)) `
      -ExpectedPath $ExpectedRunRoot -ExpectedRole run -Adapters $LoaderAdapters
    $RunResult = Invoke-K6LoaderRun -FilePath (Get-Command pwsh).Source -Arguments $BootstrapArguments `
      -Environment $AllowedEnvironment -TimeoutMs 2700000 -TerminationTimeoutMs 10000 `
      -LoaderLease $LoaderLease -RunLease $RunLease `
      -EvidenceRoot $WorkingEvidenceRoot -HistoryLease $HistoryLease
    if ([string]$RunResult.status -cne 'completed') {
      throw "BLOCKED: verified bootstrap status $($RunResult.status)"
    }
    Assert-K6OwnedRootLease -Lease $LoaderLease -ExpectedParent $LoaderParent `
      -ExpectedPath $ExpectedLoaderRoot -ExpectedRole loader -Adapters $LoaderAdapters
    Assert-K6OwnedRootLease -Lease $RunLease `
      -ExpectedParent ([IO.Path]::GetFullPath($ManualAbsolute)) `
      -ExpectedPath $ExpectedRunRoot -ExpectedRole run -Adapters $LoaderAdapters
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
    $RepositoryGuide = Join-Path $Repository $GuideRel
    $RepositoryRecorder = Join-Path $Repository 'scripts/record_evaluation.py'
    $FinalizationContract = [pscustomobject][ordered]@{
      schema_version = 1
      guide_revision = 'k6-116-demo-seed-v12'
      guide_path = $RepositoryGuide
      guide_blob = $GuideBlob
      recorder_path = $RepositoryRecorder
      recorder_blob = '42b8a0d216bd218954a46a49dc912e349d759f19'
      evaluation_relative_path = 'evaluation-to-append.json'
      evaluation_sha256 = [string]$CompletionMarker.evaluation_sha256
      final_manifest_relative_path = 'final-manifest.json'
      final_manifest_sha256 = [string]$CompletionMarker.final_manifest_sha256
      evidence_inventory_relative_path = 'evidence-inventory.json'
      evidence_inventory_sha256 = [string]$CompletionMarker.evidence_inventory_sha256
      expected_run_id = [string]$CompletionMarker.run_id
      history_path = $HistoryPath
      history_before = $HistoryBefore
      source_base = $SourceBase
      candidate_tree = $CandidateTree
      mode = $Mode
      acceptance_approval_path = [string]$AcceptanceApprovalForRecorder
      acceptance_approval_sha256 = [string]$AcceptanceApprovalSha256
      append_confirmation_path = Join-Path $DurableEvidenceParent ($Nonce + '.append-confirmed.json')
      recorder_timeout_ms = 120000
      termination_timeout_ms = 10000
    }
    $FinalizationContext = [pscustomobject][ordered]@{
      schema_version = 1
      working_evidence_root = $WorkingEvidenceRoot
      durable_evidence_parent = $DurableEvidenceParent
      durable_evidence_root = $DurableEvidenceRoot
      nonce = $Nonce
      history_before = $HistoryBefore
      loader_lease = $LoaderLease
      run_lease = $RunLease
      bootstrap_process = $BootstrapProcess
      history_lease = $HistoryLease
      contract = $FinalizationContract
      adapters = $LoaderAdapters
      recovery_reason = $null
    }
    Assert-K6OwnedRootLease -Lease $LoaderLease -ExpectedParent $LoaderParent `
      -ExpectedPath $ExpectedLoaderRoot -ExpectedRole loader -Adapters $LoaderAdapters
    Assert-K6OwnedRootLease -Lease $RunLease `
      -ExpectedParent ([IO.Path]::GetFullPath($ManualAbsolute)) `
      -ExpectedPath $ExpectedRunRoot -ExpectedRole run -Adapters $LoaderAdapters
    $FinalizationGuardArmed = $true
    $CandidateCompleted = $true
    try {
      $FinalizationResult = & $FinalizationEntry $FinalizationContext
      $FinalizationDisposition = Get-K6FinalizationDisposition `
        $FinalizationResult ([string]$FinalizationContract.expected_run_id)
      $FinalizationGuardArmed = $false
    } catch {
      $FinalizationContext.recovery_reason = 'entry-or-result-validation'
    }
  } finally {
    if ($SharedRuntimeLoaded -and $FinalizationGuardArmed -and
        $null -ne $FinalizationContext) {
      $FinalizationResult = & $FinalizationRecoveryEntry $FinalizationContext
      $FinalizationDisposition = Get-K6FinalizationDisposition `
        $FinalizationResult ([string]$FinalizationContract.expected_run_id)
      $FinalizationGuardArmed = $false
    } elseif ($SharedRuntimeLoaded -and -not $CandidateCompleted) {
      $CleanupResult = Invoke-K6LoaderCleanup -LoaderLease $LoaderLease -RunLease $RunLease `
        -BootstrapProcess $BootstrapProcess -CandidateCompleted $CandidateCompleted -HistoryLease $HistoryLease
      if (@($CleanupResult.errors).Count -ne 0) {
        throw 'BLOCKED: loader process or path cleanup failed'
      }
    }
  }
  switch -CaseSensitive ([string]$FinalizationDisposition) {
    'success' { return }
    'terminal-confirmation-failed' {
      throw 'BLOCKED_TERMINAL_NO_RETRY: exact Evaluation append and cleanup confirmed; confirmation write failed'
    }
    'terminal-entry-failed' {
      throw 'BLOCKED_TERMINAL_NO_RETRY: exact Evaluation append recovered after finalization entry failure'
    }
    'terminal-cleanup-failed' {
      throw 'BLOCKED_TERMINAL_MANUAL_CLEANUP: exact Evaluation append confirmed; owned cleanup failed'
    }
    'no-append-failed' {
      throw 'BLOCKED: finalization failed before append and removed all owned evidence'
    }
    default {
      throw 'BLOCKED: finalization disposition is missing or invalid'
    }
  }
}
~~~

After implementation and exact execution approval:

~~~powershell
Invoke-K6Issue116Guide -Mode observe
~~~

After explicit maintainer acceptance of the exact pending run:

~~~powershell
Invoke-K6Issue116Guide -Mode approve -AcceptanceApprovalPath '.agents/manual-tests/k6-public-demo/issue-116-demo-seed-v12.acceptance-approval.json' -AcceptedRunId '<exact-pending-run-id>'
~~~

## Verified bootstrap and runner obligations

The verified bootstrap owns one outer try/finally beginning before candidate/source archive
creation. Before any scenario, it independently derives the filtered baseline from SourceCommitTree
by removing only the three workflow paths and manual-evidence prefix encoded by the pinned helper,
then requires exact equality with SourceExecutionProjection. Every candidate/source archive,
extraction root, dependency tree, diff, output, profile, fixture resource, and provisional
evidence path must resolve beneath the ownership-leased RunRoot; escaping it is BLOCKED. The
bootstrap registers each nested owned path before creation. It materializes CandidateTree and the full SourceBase
commit separately, verifies
SourceCommitTree, and verifies every extracted control
against CandidateTree plus the exact control map before invoking runGuide.ps1. On every exit it
stops registered children and removes only owned archive/root/dependency/diff/output paths, then
verifies their absence. It writes completion-marker.json last only after all gates, a sealed
unappended Evaluation, child cleanup, and provisional-evidence closure pass. The parent then calls
the shared finalization transaction with no intervening operation. That transaction exclusively
promotes completed evidence, disposes the bootstrap, removes ownership-leased RunRoot/LoaderRoot,
performs every post-promotion validation, invokes the bounded recorder, classifies exact append,
and writes append confirmation. A confirmed no-append failure removes the promoted lease root;
an exact append is terminal and retained even if confirmation writing fails.
Unsuccessful or cleanup-failed candidate runs remove only ownership-leased provisional roots and
append nothing.
Fault injection covers both archives, both expansions, control
verification, runner launch, loader blob-stream/process/disposal failures, loader interruption,
path-removal failure, and a hung bootstrap child with a grandchild. The bootstrap invokes
loaderSelfTest.ps1 before any candidate process. It extracts the exact 14-field pre-runtime
process/memory adapter set, declaration validator, materializer, cleanup function, and load
transaction from the sealed guide and verifies their LF-normalized digests. Five malicious AST
forms—ordinary statement, activatable trap, script requirement, filter, and workflow—plus function
collision and post-load digest drift are rejected before path construction or mutation. The
self-test separately verifies the exact sixteen shared loaderRuntime exports and function manifest
from the sealed CandidateTree blob and drives their production bodies with injected adapters.
Closed fault sets are twelve pre-runtime lifecycle/admission faults, fourteen shared bootstrap/
cleanup faults, eight owned-root creation/lifetime-replacement faults, five recorder outcomes, and
four finalization entry/validation/confirmation/cleanup outcomes. Real
execution uses the same control flow; a missing fault, source/digest mismatch, unowned path action,
unexpected/ambiguous append, or owned residue is BLOCKED before candidate observations.

The loader-supplied allowlist is the complete parent environment for the bootstrap. Candidate
controls may add only fixed non-secret guide metadata. The guard activates before six
npm ci --offline operations and lifecycle children. External DNS/HTTP, unregistered loopback,
Atlas, AWS, Redis, RabbitMQ, Railway, and runtime env files are denied. Cache miss is BLOCKED; no
online fallback exists. No application Docker build runs; Issue #117 owns image builds. Cached
Gitleaks alone runs with --pull=never --network=none --rm. Its exact image authority is
ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f;
the runner inspects the local RepoDigest and fails before scan if that digest is absent.

Mongo identity is
mongo@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703.
mongoFixture.ps1 uses --pull=never, nonce labels/name, loopback random port, 512-MiB tmpfs, no
volume/bind, a bounded readiness check, and exact image/label/network/mount inspection. The guard
permits only that registered Mongo port. A random password and URI exist only in a child environment
map passed directly to the guarded seed/reset child; they are never assigned to parent environment,
printed, persisted, or retained. Nested finally blocks destroy the map, null local buffers, stop the
container after exact identity verification, and prove parent/child key absence.

## Catalog, observations, gates, and cleanup

The v12 catalog is sole case authority. Its eight MA cases contain exact typed vectors and complete
expected objects. catalogValidator.cjs independently enforces all exact field sets, ordering,
unique IDs, types, values, and D2 dispositions. Mutation fixtures cover missing, extra, duplicate,
reordered, mistyped, unequal, and unobservable material. Candidate output cannot supply expected
values or verdicts.

The 19 emails and deterministic 64a-family ObjectIds are exact SourceBase
server/src/demo/demoDataset.js identities. SourceRoot derives that catalog independently and the
catalog validator requires set/order/value equality before seed tests. Target vectors cover
malformed URI, missing/wrong database, missing/wrong K6_TARGET, mode mismatch, production-like and
unknown hosts, fingerprint failures, seed/reset authorities, and every destructive confirmation
state. Rejected-command evidence must retain zero URI, host, credential, query, or provider-detail
occurrences. Collision vectors distinguish absent, missing-namespace, foreign-namespace,
self-signup, wrong-version, wrong-ID, and duplicate records.

SourceRoot and CandidateRoot contract observers run in separate child processes. Registration,
login, profile, friend, message, group, and Socket.IO shapes remain exact and expose no ownership
marker.

Observe mode executes the catalog, focused tests, npm run test:ci, npm run ci:validate,
npm run lint:ci, client tests/build, server tests, and git diff --check. Preliminary validation
retains only schema-closed counts, booleans, fixed .test identities, and digests. The disposable
Mongo cases seed twice, compare exact persisted cardinalities/stable IDs/legacy conversation
identities/digest, and authenticate all 19 accounts without retaining a password or hash. Cleanup
proves zero container, mount, volume, port, child, temp, secret-key, provider, remote-mutation, and
D2 counters.

The finalizer runs only after gates and cleanup. It writes a closed evidence inventory. Pinned
Gitleaks covers candidate diff, client dist, observations, summaries, and inventory. The finalizer
then writes final-manifest.json and pending-evaluation.json using fixed enumerations, booleans,
integers, nulls, and SHA-256 values only. A separate closed safe-text validator covers those two
terminal files. In approve mode it also covers the sealed acceptance sidecar and generated approved
Evaluation. Per-surface scanner identity and zero findings are retained without claiming Gitleaks
for post-Gitleaks files. The safe-text validator rejects Mongo URIs/hosts, credentials, password
hashes, unapproved identities, personal fields, provider text, control characters, and unknown
strings before append. There is no self-hash claim.

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

Any semantic change requires v13 plus fresh external review and maintainer approval. Atlas
fingerprint read-back, remote seed, conditional remote reset, and S3 cleanup remain pending D2.
D2_MUTATIONS=0.
