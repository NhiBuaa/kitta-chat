# Manual Test Guide: K4 black-box sidebar scenario evidence

## Metadata

- Feature: k4-performance-evidence
- Slice: issue-86-sidebar-scenario
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/80 and https://github.com/NhiBuaa/kitta-chat/issues/86
- Architecture authority: `docs/adr/015-k4-performance-evidence-boundary.md`
- Guide revision: `k4-issue-86-r2`
- Supersedes: `k4-issue-86-r1` (immutable)
- Status: LOCKED — human-approved
- Approved by: user
- Approved at: 2026-08-14

## Revision delta from r1

- TC-86-02 now locks the topology-equivalence contract to the same commit SHA and the same
  test-machine hardware, in addition to the existing workload, dataset, runner, and configuration
  equivalence.
- TC-86-03 now distinguishes complete observation with zero exercised replicas from the valid
  one-replica `TOPOLOGY_NOT_EXERCISED` condition and uses the existing status/qualification
  semantics without adding a taxonomy value.
- TC-86-01 and TC-86-03 consume the existing runner/measurement-bound nginx attribution seam;
  they do not introduce a new per-request correlation contract or event.

## Scope and acceptance boundary

This guide accepts only the black-box sidebar scenario evidence. It does not create a report,
redefine provenance, change the workload profile, or exercise message/socket workload. The
scenario must use the established K4 runner and observation interfaces and must send measured
business traffic through nginx. Observation-plane records may attribute requests to replicas,
but they must not create or route workload.

## Prerequisites

- Environment: dedicated Issue #86 worktree `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-86`, branch `codex/k4-issue86`, with the K4 production runner and observation composition available.
- Data and state: use a fresh K4-owned run/result directory for each profile; create, migrate, deterministically seed, and verify the declared logical dataset before warm-up. Never reuse Issue #61 resources, foreign resources, or a prior run's data volume.
- Profiles: resolve the approved production-executable `sidebar:2` profile without ad-hoc workload overrides. Retain the resolved snapshot and digest. The snapshot must carry the sidebar request and pagination fields, the explicit open-loop load model, warm-up/measurement durations, actor allocation, and connection-reuse rule.
- Topologies: execute the same resolved sidebar workload once as `single-replica` and once as `multi-replica` when the latter topology is available. Keep dataset identity, workload snapshot/digest, commit SHA, test-machine hardware, image set, nginx configuration, runner placement, and all non-topology configuration equivalent.
- Comparison manifest: retain the exact commit SHA and test-machine hardware evidence for each run, including the manifest's declared CPU/RAM and any applicable machine or runner limits. A topology comparison is valid only when these values match exactly; only topology/replica count may differ.
- Credentials and permissions: use only the public authentication flow through nginx with K4-owned disposable actors. Credentials, tokens, and cookies remain memory-only and must not appear in manifests, logs, reports, or raw artifacts. The runner must have no Docker-management socket or observer-helper route/credential.
- Evidence: retain raw runner phase output, measurement-bound request/error records, resolved profile/digest, dataset verification, manifest, attribution source records, qualification flags, and teardown/ownership evidence. Do not treat setup or warm-up values as measurements.

## Locked Test Cases

### TC-86-01: Authenticated sidebar request and pagination travel through nginx

- Purpose: Verify Issue #86's authenticated black-box sidebar workload and Issue #80's nginx-only ingress and sidebar measurement contract.
- Steps:
  1. Resolve `sidebar:2` for a fresh run and save the exact resolved snapshot, representation, and digest. Do not pass raw workload JSON or ad-hoc request/rate/duration/pagination overrides.
  2. Start the selected K4 topology and run setup/seed plus authentication preflight through nginx. Confirm the deterministic dataset is verified and warm-up is admitted before workload starts.
  3. Run the sidebar warm-up and measurement phases with the resolved profile. Inspect the runner command/evidence and the measurement-bound nginx access records.
  4. Confirm each measured request uses the resolved sidebar method/path and pagination pattern, reaches nginx as the workload target, and carries an authenticated K4 actor. Use the existing runner measurement output consumed by the measurement-bound nginx attribution interface; do not require a new event, payload field, or separate correlation protocol.
  5. Inspect the phase records and result inventory after teardown.
- Expected results:
  - The resolved workload is `scenario=sidebar`, production-executable version `2`, and its retained snapshot explicitly defines the request and pagination pattern; the digest is stable for the run.
  - Authentication, seed verification, and warm-up complete before measurement. A setup/preflight failure does not enter measurement.
  - Measured traffic has the black-box path `runner -> nginx -> SUT -> nginx -> runner`; no measured request targets a backend replica directly and no benchmark-only route or affinity is introduced.
  - The scenario's existing measurement output is sufficient for the already approved nginx attribution interface to bind measurement records. This guide adds no new per-request identity contract; any request binding field used is the field already produced and consumed by that interface.
  - Raw measurement evidence separates successful latency records from request errors/timeouts. Only measurement-phase evidence is eligible for the sidebar latency distribution; error outcomes remain retained and visible.
  - Teardown completes within the K4 ownership boundary and leaves the declared raw artifacts and completion/status markers without credentials or tokens.
- Evidence to capture:
  - Resolved sidebar snapshot, exact representation bytes/digest, profile/topology manifest, and dataset verification record.
  - Runner phase records and raw sidebar request records, including the existing measurement-attribution input, statuses/error outcomes, timestamps, and measurement window.
  - Nginx access records proving the request path, upstream attribution source, and nginx-only ingress; sanitized command/log excerpts proving no direct backend target.
  - Final artifact/source inventories, completion/status marker, and K4-only teardown inventory.

### TC-86-02: Single- and multi-replica profiles share the full topology-equivalence contract

- Purpose: Verify Issue #80's topology comparison contract: workload, dataset, commit, hardware, runner placement, and all non-topology configuration are equivalent; only topology/replica count may differ.
- Steps:
  1. Resolve the approved `sidebar:2` workload independently for fresh `single-replica` and `multi-replica` run IDs.
  2. Compare the retained workload snapshots, exact representations, and digests before execution. Compare the declared dataset identity and size after each setup/seed verification.
  3. Execute both profiles through setup/seed, warm-up, measurement, and teardown using separate K4-owned run/result directories.
  4. Compare the two manifests for commit SHA, test-machine hardware, dataset identity/size, image set, nginx configuration, runner placement, actor allocation, request/pagination fields, load model, phase settings, and every other non-topology configuration value.
  5. Record an explicit equivalence/difference matrix. If commit SHA, test-machine hardware, runner placement, workload, dataset, or any non-topology configuration differs, classify the comparison using the existing non-comparable/qualification semantics and do not publish a topology claim.
- Expected results:
  - The two profiles have byte-equivalent resolved workload snapshots/representations and identical workload digests. Topology and replica count are separate manifest dimensions and do not alter workload identity.
  - Both runs start from a clean, verified logical dataset with the same declared dataset identity and size; no prior-run or Issue #61 volume is adopted or mutated.
  - Both profiles record exactly the same commit SHA and the same test-machine hardware evidence, including the declared CPU/RAM and applicable machine or runner limits. Hardware or commit drift is a comparison failure, not an implicit normalization.
  - Both profiles use the same nginx-only workload target, runner placement, image/configuration set, actor allocation, request/pagination pattern, and phase semantics. The only permitted comparison difference is topology/replica count.
  - If multi-replica execution is unavailable, its raw evidence records `NOT_RUN` with a concrete reason and does not infer a result from the single-replica run.
  - If multi-replica execution is available, its measurement evidence is evaluated by TC-86-03; a topology inventory alone is never treated as exercised traffic.
- Evidence to capture:
  - Paired resolved snapshots/representations/digests and paired dataset declaration/verification records.
  - Paired commit SHAs, test-machine hardware/CPU/RAM records, runner placement, image/configuration manifests, and an explicit equivalence/difference matrix.
  - Phase timelines, raw measurement artifacts, run IDs/result directories, and cleanup ownership inventories for both profiles.
  - Existing non-comparable/qualification output when any permitted-equivalence field differs.
  - `NOT_RUN` status and concrete reason if the multi-replica topology cannot be started.

### TC-86-03: Multi-replica sidebar attribution is measurement-bound

- Purpose: Verify Issue #86's multi-replica qualification rule and ADR-015's distinction between topology inventory and measured traffic attribution.
- Steps:
  1. For an available multi-replica run, retain the measurement start/end UTC instants and the existing runner measurement-attribution input from the measurement output.
  2. Collect the observation-plane nginx access records bound to that measurement window and map each measurement-bound record through the existing attribution interface to its unique `upstream_addr` and backend replica. Retain parser/schema version, source identity/digest, window binding, and completeness diagnostics.
  3. Count the distinct backend replicas returned by the attribution interface for measurement-phase sidebar activity. Do not count setup, warm-up, teardown, unbound logs, or mere container membership.
  4. Inspect the existing derived status/qualification/claim-eligibility output and compare it with the raw attribution result. Do not introduce a new flag or status for an unhandled replica count.
- Expected results:
  - Attribution is derived only from complete, measurement-bound nginx records with unique upstream mapping; ambiguous, truncated, or incomplete sources set the affected claim to the existing `OBSERVATION_INCOMPLETE` semantics and do not produce a topology claim.
  - When at least two backend replicas process measurement-phase sidebar requests, raw evidence qualifies the multi-replica sidebar claim and identifies those replicas. This is the only condition under which multi-replica sidebar evidence is exercised.
  - When the multi-replica topology starts but all measurement-phase sidebar activity reaches exactly one replica, raw evidence retains the existing one-replica result and records `TOPOLOGY_NOT_EXERCISED`. It is not reported as a successful multi-replica comparison and is not mislabeled `NOT_RUN`.
  - If the attribution interface reports complete observation with zero exercised replicas, preserve its existing result and parent status/qualification semantics: the multi-replica claim is not eligible, `TOPOLOGY_NOT_EXERCISED` is not set, and no new zero-replica taxonomy or flag is invented. If the interface instead reports incomplete binding, preserve the existing `OBSERVATION_INCOMPLETE` semantics.
  - A topology inventory with two replicas, or traffic seen only outside measurement, cannot qualify the claim.
- Evidence to capture:
  - Measurement window and the existing runner measurement-attribution input from the runner artifact.
  - Raw measurement-bound nginx attribution records, upstream-to-replica map, source digests/identities, parser/schema version, and completeness diagnostics.
  - Existing derived status/qualification/claim-eligibility output showing the distinct-replica count and the resulting exercised, `TOPOLOGY_NOT_EXERCISED`, or incomplete semantics. For zero exercised replicas, retain the output proving no new taxonomy was added.

### TC-86-04: Raw measurement evidence preserves latency/error scope

- Purpose: Verify that the scenario emits raw measurement-phase evidence for the established K4 report/observation pipeline without creating its own report or provenance format.
- Steps:
  1. Inspect the sidebar scenario's retained warm-up and measurement runner artifacts for a completed run, including every opportunity/request record and phase boundary.
  2. Reconcile the measurement records against the declared measurement window. Partition successful responses from errors, timeouts, and not-started/deadline-missed opportunities.
  3. Inspect the scenario output and result inventory for any derived percentile/report/provenance artifact created specifically by the sidebar scenario.
  4. Reconcile the scenario's raw output with the observation-plane attribution and the parent runner's status/qualification axes.
- Expected results:
  - Every measurement opportunity is retained with its phase, measurement-attribution input, timestamps, success/error/not-started classification, and response status or bounded error outcome where applicable.
  - Only valid measurement-phase successes contribute latency samples to the established downstream report; errors and missed opportunities remain separate outcomes and do not become latency samples. Warm-up records never contribute published numbers.
  - The sidebar scenario emits raw scenario evidence only. It does not invent a second report format, provenance schema, or claim taxonomy; the parent K4 runner/observation pipeline owns derivation and qualification.
  - Any incomplete observation is represented through the existing qualification/status axes while valid raw latency and error evidence remains retained.
- Evidence to capture:
  - Raw warm-up and measurement runner artifacts, phase boundaries, opportunity counts, and status/error partition.
  - A reproducible count reconciliation from raw records to measurement-window outcomes.
  - Result/source inventories and a scan showing no scenario-owned duplicate report/provenance artifact.
  - Parent runner status, `artifact_status`, `execution_outcome`, qualification flags, and claim-eligibility evidence.

## Omitted boundary axes

- Message persistence, recipient delivery, and Socket.IO concurrency are outside Issue #86 and are covered by their dedicated K4 slices.
- Histogram snapshots, resource-series coverage, and observer-helper behavior are observation-plane responsibilities; this guide consumes their existing interfaces only and does not redefine them.
- Comparison-validator implementation details and optimization experiments are outside this slice.
- Human approval and append-only Evaluation recording occur after this draft is reviewed; no execution evidence is valid before approval.

This guide becomes immutable after explicit human approval. Create a new guide revision when the
specification or expected behavior changes. Store each accepted run as a separate append-only
Evaluation record at `.agents/manual-tests/k4-performance-evidence/issue-86-sidebar-scenario-r2.evaluations.jsonl`.
