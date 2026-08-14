# Manual Test Guide: K4 evidence provenance, report derivation, and comparison validation

## Metadata

- Feature: k4-performance-evidence
- Slice: issue-85-provenance-report-validator
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/80 and https://github.com/NhiBuaa/kitta-chat/issues/85
- Architecture authority: `docs/adr/015-k4-performance-evidence-boundary.md`
- Review cadence: `.agents/manual-tests/k4-performance-evidence/issue-85-review-cadence.json` (`effective_risk_level: high`)
- Guide revision: `k4-issue-85-r1`
- Supersedes: none
- Status: DRAFT — awaiting explicit human approval; do not execute or implement from this guide until approved
- Approved by: pending
- Approved at: pending
- Evaluation history (after approval): `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r1.evaluations.jsonl`

## Prerequisites

- Environment: dedicated Issue #85 worktree `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-85`, branch `codex/k4-issue85`, with the repository-owned K4 provenance/report/validation entry point available after implementation.
- Data and state: use fresh K4-owned result directories and finalized source-artifact fixtures. Fixtures must include the environment manifest, source artifacts, a completed measured run, an interrupted pre-completion run, an existing run-ID collision, valid and invalid optimization/topology comparison pairs, and completed measured runs carrying each approved qualification flag.
- Credentials and permissions: access to invoke the repository-owned K4 command and inspect retained artifacts; no host-runner business workload, Docker socket, raw Docker Engine API credential, or helper access is permitted for the operator.
- Isolation: do not use Issue #61 resources, volumes, databases, Redis, RabbitMQ, result directories, or prior-run state. Every fixture must carry K4 run ownership and a unique run ID.
- Evidence hygiene: retain exact source bytes, relative paths, byte sizes, digests, manifests, reports, derived artifacts, inventories, completion markers, validator output, and immutable before/after hashes. Do not print or retain credentials or tokens.
- Approval gate: this guide is not executable until a human approves this exact revision. Any semantic change after approval requires a new revision; Evaluation history is append-only.

## Locked Test Cases

### TC-85-01: Build a reproducible source inventory from exact bytes

- Purpose: Verify that finalized source artifacts and the environment manifest produce an auditable source inventory and reproducible `source_inventory_sha256`.
- Seam: end-to-end repository-owned provenance command plus independent filesystem SHA-256 verification.
- Steps:
  1. Run the provenance flow against a fresh finalized measured-run fixture and record the run ID, resolved topology/profile identity, and result directory before deriving any report.
  2. Locate the declared `source-inventory` and enumerate every source artifact it names, including the environment manifest and any finalized raw evidence required by the run contract.
  3. For each inventory entry, inspect the relative path, artifact type, exact byte size, and SHA-256 digest; hash the exact retained bytes independently without normalizing line endings, whitespace, ordering, or encoding.
  4. Independently recompute the SHA-256 of the exact source-inventory bytes according to the implementation's declared byte boundary and compare it with `source_inventory_sha256` recorded by the run.
  5. Inspect the environment manifest fields required by the K4 authority: commit SHA, profile, dataset identity and size, replica count, Node and k6 versions, dependency topology, test-machine CPU/RAM, test-runner placement, and relevant runtime configuration.
  6. Re-run inventory verification without changing any source artifact and compare the inventory bytes, entry set, per-artifact digests, and inventory digest with the first verification.
- Expected results:
  - Every finalized source artifact required by the run and the environment manifest is represented exactly once with its relative path, artifact type, byte size, and exact-byte SHA-256; no report, bundle inventory, or completion marker is silently treated as a source artifact.
  - Independent per-file hashes and byte sizes equal the retained inventory values. Any missing, extra, unreadable, duplicate, or changed source artifact fails verification before a publishable derived report is produced.
  - The independently recomputed `source_inventory_sha256` equals the recorded digest, and repeating verification on unchanged bytes produces the same inventory and digest.
  - The inventory retains run identity and provenance needed to bind the source set to the measured run; no credential or secret value is exposed in the inventory.
  - The environment manifest contains every required minimum field and binds those fields to the same run/profile/topology identity; missing or ambiguous manifest values make the source set ineligible for the affected claim rather than being filled with local defaults.
- Evidence to capture:
  - Source-inventory artifact and its recorded digest.
  - Inventory entry listing with paths, types, byte sizes, and SHA-256 values.
  - Independent hashing command/output and a second unchanged verification result.
  - Environment manifest and run/topology/profile identity references without secret values.

### TC-85-02: Derive a report from locked source digests without mutating sources

- Purpose: Verify that report derivation is constrained to a verified source inventory, references the locked source digests supporting each claim, and never mutates source artifacts.
- Seam: end-to-end report derivation with before/after exact-byte and digest comparison.
- Steps:
  1. Snapshot exact bytes, sizes, and SHA-256 digests for the complete source-artifact set and source inventory of a valid completed measured run.
  2. Generate the derived report using that locked source inventory and inspect the report's run ID, `source_inventory_sha256`, and per-claim source-digest references.
  3. Compare every source artifact and the source inventory with the pre-derivation snapshot.
  4. Modify one retained source artifact in a disposable copy, leaving the original fixture untouched, and invoke report derivation against the stale source inventory.
  5. Compare the disposable source set and output directory after the rejected attempt.
- Expected results:
  - A valid report is derived only after source digests verify; it records the run ID, the exact source-inventory digest, and the source digests that support each published claim.
  - No source artifact or source inventory changes during successful report generation; exact bytes, sizes, and SHA-256 values remain identical.
  - The tampered source set is rejected with a digest/integrity failure before a publishable report is emitted. The stale source inventory is not silently rewritten, and the rejected flow does not mutate source artifacts or merge the tampered bytes into the original run.
  - A report never presents derived numbers as independent source evidence and does not expose internal secrets or identifiers outside the declared artifact contract.
- Evidence to capture:
  - Pre/post source digest manifest proving no mutation.
  - Valid report with run ID, source-inventory digest, and claim-support digest references.
  - Tamper rejection output and disposable directory inventory proving no source rewrite or publishable output.

### TC-85-03: Produce a non-self-hashing bundle and complete marker with all status axes

- Purpose: Verify the two-layer bundle inventory and the non-inventoried completion marker required for publication.
- Seam: end-to-end finalization plus independent inventory closure checks.
- Steps:
  1. Finalize a completed measured-run fixture after measurement and teardown and inspect the retained result directory.
  2. Enumerate the `bundle-inventory` entries and independently hash the source inventory, report, and every declared derived artifact using exact bytes.
  3. Verify whether the bundle inventory includes itself or the `COMPLETED` marker, and recompute the bundle-inventory digest over its exact bytes.
  4. Inspect the `COMPLETED` marker and compare its `artifact_status`, `execution_outcome`, `qualification_flags`, `source_inventory_sha256`, and `bundle_inventory_sha256` with the finalized artifacts.
  5. Remove or alter one bundle member in a disposable copy and run the repository-owned validation action against that copy.
- Expected results:
  - The bundle inventory hashes the source inventory, report, and all declared derived artifacts exactly once; it does not hash itself and does not include the non-inventoried `COMPLETED` marker.
  - The completion marker exists only after finalization and records all three independent status axes plus both inventory digests. `artifact_status` and `execution_outcome` use their exclusive approved values, while `qualification_flags` may contain the approved non-exclusive set.
  - Independent member hashes and the recorded bundle digest agree. Removing or altering a bundled member invalidates verification and cannot leave a publishable completed result with the old digest.
  - The marker's existence is not treated as proof that every claim is eligible; eligibility remains claim-type-specific and is checked separately.
- Evidence to capture:
  - Bundle-inventory entry set and independent exact-byte hashes.
  - Proof that bundle inventory excludes itself and `COMPLETED`.
  - Completion marker with all status axes and both inventory digests.
  - Disposable tamper-validation result and resulting qualification/publication state.

### TC-85-04: Preserve incomplete runs and reject existing run IDs without overwrite or merge

- Purpose: Verify collision safety and crash-before-completion semantics.
- Seam: end-to-end run finalization with filesystem snapshot and restart checks.
- Steps:
  1. Prepare a result directory containing a finalized source artifact and a chosen run ID, then record exact bytes, file list, and ownership markers.
  2. Invoke the K4 provenance/run action again with the same run ID and result location.
  3. Compare the original directory after the collision attempt, including all source, inventory, report, derived, and marker bytes.
  4. In a fresh K4-owned run, interrupt execution after source finalization or during report/bundle finalization but before `COMPLETED` is written, using the existing safe interruption seam.
  5. Restart validation against the interrupted directory and inspect its artifact status, execution outcome, qualification flags, and publication eligibility.
- Expected results:
  - An existing run ID/result directory is a hard failure. The second invocation does not overwrite, merge, append, or silently adopt any original artifact, and the original exact-byte snapshot remains unchanged.
  - A crash or interruption before `COMPLETED` leaves the directory retained as `INCOMPLETE`; it is not publishable and is not upgraded to completed merely because partial artifacts are present.
  - Partial source/report/inventory evidence remains available for audit without being presented as a completed bundle. Any retry uses a new run ID/result directory or fails closed under the collision rule.
  - Cleanup and ownership checks touch only the current K4 run namespace; Issue #61 and foreign resources are not read, reset, or mutated.
- Evidence to capture:
  - Pre/post file inventory and exact hashes for the collision case.
  - Collision error and exit status.
  - Interrupted run directory, absence of `COMPLETED`, `INCOMPLETE` status evidence, and validator publication decision.
  - Ownership-scoped cleanup/result inventory.

### TC-85-05: Preserve independent status axes and derive claim eligibility per claim type

- Purpose: Verify that the validator preserves usable evidence while prohibiting only claims unsupported by the run's independent qualification flags.
- Seam: contract-level validation over retained completed-run fixtures and derived reports.
- Steps:
  1. Validate a completed measured fixture with no qualification flags.
  2. Validate completed measured fixtures carrying each of `TARGET_NOT_REACHED`, `TOPOLOGY_NOT_EXERCISED`, `OBSERVATION_INCOMPLETE`, and `LOAD_GENERATOR_LIMITED`; retain the raw latency/error evidence for every fixture.
  3. Validate setup/unavailable fixtures representing `NOT_RUN` and `FAILED_SETUP`, and an interrupted fixture with `artifact_status: INCOMPLETE`.
  4. Inspect the report's status axes, claim-eligibility decisions, retained evidence references, and publication decision for every fixture.
- Expected results:
  - `artifact_status` is exactly one of `COMPLETED` or `INCOMPLETE`; `execution_outcome` is exactly one of `MEASURED`, `NOT_RUN`, or `FAILED_SETUP`; `qualification_flags` are independently non-exclusive and are not collapsed into one pass/fail status.
  - `TARGET_NOT_REACHED` prohibits a successful target-concurrency claim; `TOPOLOGY_NOT_EXERCISED` prohibits multi-replica and cross-replica claims; `OBSERVATION_INCOMPLETE` prohibits CPU/memory claims while preserving valid latency/error evidence; and `LOAD_GENERATOR_LIMITED` prohibits attributing a measured throughput/concurrency ceiling to the SUT.
  - A completed measured run with a qualification flag may retain and report eligible latency/error evidence, but it cannot be published with an unsupported target, topology, resource, or SUT-ceiling claim.
  - `NOT_RUN`, `FAILED_SETUP`, and `INCOMPLETE` outcomes are not presented as completed measured evidence; no flag is inferred merely because an environment was unavailable or a generic failure occurred.
- Evidence to capture:
  - One report/marker pair for each flag combination and each non-measured/incomplete fixture.
  - Claim-eligibility matrix emitted by the validator.
  - Proof that retained valid latency/error artifacts remain addressable when resource or topology claims are prohibited.
  - Publication decision and exact status-axis fields.

### TC-85-06: Derive resource and load-generator qualification flags from objective evidence

- Purpose: Verify the Issue #80 resource-coverage and load-generator-limitation amendment is applied without destroying valid latency/error evidence or attributing an unsupported ceiling to the SUT.
- Seam: contract/integration validator over retained measurement-window resource and runner-cgroup artifacts.
- Steps:
  1. Validate a fixture whose required nginx, backend-replica, or test-runner resource coverage has an error/missing slot or successful coverage below the declared threshold; retain the exact measurement window, cadence, expected count, and per-container counts.
  2. Validate a fixture with a model-specific requested-load shortfall and temporally overlapping runner cgroup-v2 evidence satisfying either positive `cpu.stat` throttling plus normalized runner CPU at or above 90% of its declared limit for at least 80% of the overlap, or a positive `memory.events` `oom`/`oom_kill` delta.
  3. Validate control fixtures with only a generic timeout, runner error string, host CPU signal, or SUT signal, and a fixture without the required requested-load shortfall.
  4. Inspect status axes, raw evidence references, derived flags, and claim eligibility for latency, CPU/memory, bottleneck, throughput, and SUT-ceiling claims.
- Expected results:
  - Insufficient required-resource coverage sets `OBSERVATION_INCOMPLETE`, retains missing/error samples and valid latency/error evidence, and prohibits CPU, memory, and bottleneck/SUT-ceiling claims.
  - `LOAD_GENERATOR_LIMITED` is set only when the model-specific shortfall and one objective runner-side cgroup condition overlap in time; the manifest retains cgroup version, source paths, CPU/cpuset/memory limits, shortfall evidence, and decision window.
  - Generic timeout/error strings, host CPU, SUT signals, or objective cgroup evidence without the required shortfall do not set `LOAD_GENERATOR_LIMITED`; absence of the flag does not itself attribute a ceiling to the SUT.
  - Qualification flags remain independent of `artifact_status` and `execution_outcome`; valid latency/error evidence is not discarded solely because resource or runner-limit claims are ineligible.
- Evidence to capture:
  - Measurement window/cadence formula inputs and per-container successful/error/missing counts.
  - Raw cgroup-v2 files/counters, runner limits, normalized utilization, requested-load model, shortfall, and overlap decision.
  - Derived flags, claim-eligibility output, and retained latency/error artifact references for both positive and control fixtures.

### TC-85-07: Apply attribution-dependent topology qualification and preserve NOT_RUN semantics

- Purpose: Verify that topology and cross-replica claims are derived only from complete measurement-phase attribution and that unavailable multi-replica execution is recorded as `NOT_RUN` with a concrete reason.
- Seam: contract/integration validator over attribution artifacts and topology comparison inputs.
- Steps:
  1. Validate a complete attribution fixture proving measurement-phase activity exercised exactly one resolved backend replica.
  2. Validate an attribution fixture with ambiguous mapping, missing source segments, truncation/rotation gaps, parser failure, or unresolved measurement-window binding.
  3. Validate a complete multi-replica fixture where measured sidebar traffic reaches at least two replicas, authenticated measured sockets overlap on at least two replicas, and a correlated sender/recipient delivery proves distinct replicas.
  4. Validate a fixture where multi-replica setup is unavailable and inspect its recorded outcome and concrete reason; ensure no single-replica result is copied into a multi-replica result.
- Expected results:
  - `TOPOLOGY_NOT_EXERCISED` is emitted only for complete evidence proving exactly one resolved replica handled the relevant measured activity; it gates multi-replica and cross-replica claims without deleting unrelated eligible evidence.
  - Ambiguous, truncated, incomplete, or unmapped attribution sets `OBSERVATION_INCOMPLETE` for the affected claim and does not fall back to `TOPOLOGY_NOT_EXERCISED`.
  - Multi-replica and cross-replica eligibility requires measurement-bound sources, uniquely mapped replicas, and the approved correlation/actor conditions; topology inventory alone is insufficient.
  - An unavailable multi-replica environment is recorded as `NOT_RUN` with a concrete reason and no inferred multi-replica numbers or claims.
- Evidence to capture:
  - Raw attribution sources, parser/schema diagnostics, measurement window, source digests, and exact records supporting each derived mapping.
  - Derived topology flags and per-claim eligibility.
  - `NOT_RUN` outcome with concrete reason and proof that no single-replica result was reused.

### TC-85-08: Apply separate optimization and topology comparison contracts

- Purpose: Verify that comparison validation permits only the declared difference for the experiment type and rejects undeclared condition changes.
- Seam: contract-level comparison validator over paired immutable manifests/source inventories.
- Steps:
  1. Build an optimization comparison pair with equivalent profile, workload, dataset, topology/replica count, hardware, runner placement, and non-treatment configuration; vary only the baseline commit/config and the one declared targeted treatment.
  2. Validate the optimization pair and record the comparison decision and equivalent-condition diagnostics.
  3. Repeat with one undeclared optimization difference at a time: workload/profile, dataset, topology/replica count, hardware, runner placement, or a non-treatment runtime configuration change.
  4. Build a topology comparison pair with equivalent commit, workload, dataset, hardware, runner placement, and all remaining configuration; vary only topology/replica count as declared.
  5. Validate the topology pair and repeat with an undeclared commit, workload, dataset, hardware, runner-placement, or remaining-configuration difference.
  6. Inspect the comparison experiment type, source digests, manifest differences, rejection diagnostics, and resulting claim eligibility.
- Expected results:
  - The valid optimization pair is accepted under the optimization contract even though commit and targeted treatment differ; undeclared differences are rejected before a misleading comparison is published.
  - The valid topology pair is accepted under the topology contract even though replica count/topology differs; commit, workload, dataset, hardware, runner placement, and remaining configuration remain equivalent.
  - The validator does not apply one generic rule that rejects every commit or topology difference, and it never silently treats an undeclared change as the allowed treatment/topology difference.
  - Comparison outputs retain the source/bundle digest references and derive claims only from eligible component runs and the declared comparison contract.
- Evidence to capture:
  - Paired manifests/source inventories and exact digests for both valid comparisons.
  - Validator acceptance output for the valid optimization and topology pairs.
  - One rejection record per undeclared-difference category, with the differing field identified.
  - Final comparison claim-eligibility and provenance references.

## Omitted boundary axes

- UI/visual transition axes do not apply: Issue #85 produces filesystem/CLI/report artifacts, not a user-interface state.
- Business REST, Socket.IO, MongoDB, Redis, and RabbitMQ behavior is not re-tested here; those contracts are preserved by Issue #80/ADR-015 and covered by the preceding K4 slices. This guide verifies only that provenance/report validation consumes retained artifacts without generating or bypassing workload.
- Raw Docker/helper privilege and observation collection are not re-tested here; they belong to the Issue #84 acceptance boundary. This guide checks only that comparison/report validation uses declared source references and does not grant new authority.
- Human approval and append-only Evaluation recording occur after this draft is reviewed; no execution evidence is valid before approval.

This guide becomes immutable after human approval. Create a new guide revision when the specification or expected behavior changes. Store run observations separately as JSONL Evaluation records.
