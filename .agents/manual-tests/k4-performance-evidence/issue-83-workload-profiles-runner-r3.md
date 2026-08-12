# Manual Test Guide: K4 declarative workload profiles and test runner

## Metadata

- Feature: k4-performance-evidence
- Slice: issue-83-workload-profiles-runner
- Authoritative specification: https://github.com/NhiBuaa/kitta-chat/issues/80 and https://github.com/NhiBuaa/kitta-chat/issues/83
- Architecture authority: `docs/adr/015-k4-performance-evidence-boundary.md`
- Guide revision: `k4-issue-83-r3`
- Supersedes: `k4-issue-83-r2` (immutable)
- Status: LOCKED — human-approved
- Approved by: user
- Approved at: 2026-08-12

## Prerequisites

- Environment: independent Issue #83 worktree `D:\Developer\Projects\shotter\shot-chat-worktrees\issue-83`, branch `codex/k4-issue83`.
- Data and state: use a fresh K4-owned run/result directory and the deterministic dataset/actors/preflight contract accepted by Issue #82. Do not reuse Issue #61 resources or prior K4 run state.
- Credentials and permissions: access to run the repository's K4 CLI/test commands; no Docker-management socket or host-runner workload is permitted.
- Evidence hygiene: retain the resolved profile snapshot, the exact representation/bytes hashed for its SHA-256, digest, phase records, runner output, and manifest; do not publish setup or warm-up values as benchmark measurements.

## Locked Test Cases

### TC-83-01: Resolve scenario-specific schemas and topology-independent workloads

- Purpose: Verify that the resolver accepts exactly the three approved scenarios, validates each against its own schema and explicit load model, rejects cross-schema payloads, and keeps workload identity independent of topology.
- Steps:
  1. Resolve a valid `sidebar` profile, a valid `message` profile, and a valid `socket-concurrency` profile using their documented scenario-specific fields and load models.
  2. For each valid scenario, resolve the same `scenario:version` once for `single-replica` and once for `multi-replica`.
  3. Submit cross-schema negatives: a `sidebar` payload containing only `message` fields, a `message` payload containing only `socket-concurrency` fields, and a `socket-concurrency` payload containing only `sidebar` fields. Also submit a generic/superset payload containing the union of fields from all three schemas.
  4. Inspect the resolved workload snapshot, digest, and separately recorded topology for every accepted resolution.
- Expected results:
  - Each approved scenario passes only its own schema and has an explicit scenario-appropriate load model; positive results expose no generic/superset schema acceptance.
  - Every cross-schema payload and the generic/superset payload is rejected as invalid for the selected scenario before warm-up or measurement.
  - For the same `scenario:version`, `single-replica` and `multi-replica` produce byte-for-byte identical workload snapshots and identical workload digests.
  - Topology and replica count are recorded in separate manifest fields and are absent from workload identity, workload snapshot, and workload digest. A topology-only change must not alter workload identity or digest.
- Evidence to capture:
  - Positive resolver responses and schema/load-model excerpts for all three scenarios.
  - Rejection output for all cross-schema and generic/superset attempts.
  - Paired topology manifests, snapshots, and digests proving equality and separate topology fields.

### TC-83-02: Retain a digest over the authoritative profile representation

- Purpose: Verify that the profile digest is reproducible from the exact authoritative representation/bytes selected by the Issue #83 implementation, without imposing a new canonicalization architecture requirement.
- Steps:
  1. Resolve one valid profile and identify the representation that the implementation declares authoritative for the profile digest (for example, a retained serialized snapshot or another retained byte artifact).
  2. Capture the exact bytes hashed, including the stated encoding and the complete representation boundaries (serialization form, ordering, whitespace/newline policy, and trailing-newline handling where applicable). If the implementation chooses to expose canonicalization or versioning metadata, record and verify it as part of that implementation's contract; it is not required by this guide unless the implementation declares it authoritative.
  3. Recompute SHA-256 directly over the retained authoritative bytes and compare it with the manifest digest/profile digest reference.
  4. Resolve the same workload again and compare its authoritative representation and digest. Apply one workload-changing edit and repeat the comparison.
- Expected results:
  - The authoritative representation/bytes are unambiguously identified and retained well enough for an independent SHA-256 recomputation; if the implementation cannot identify or retain them, this case is `BLOCKED`.
  - The recomputed SHA-256 equals the recorded digest for the resolved workload.
  - Re-resolving the same workload produces the same authoritative representation and digest. A workload-changing edit produces a different authoritative representation and digest and is rejected or recorded as a distinct workload.
  - No expectation is made that differently ordered but semantically equivalent inputs normalize to the same digest unless an authority explicitly defines that normalization.
- Evidence to capture:
  - Authority/reference for the retained representation and its exact byte boundaries/encoding.
  - Retained representation or checksum evidence sufficient to reproduce the SHA-256 without secrets.
  - Manifest/profile digest, recomputation command/output, same-workload comparison, and changed-input result.

### TC-83-03: Enforce a closed operational-metadata allowlist

- Purpose: Ensure only explicitly allowlisted operational metadata can vary and that no direct, nested, or side-channel override changes the effective workload.
- Steps:
  1. Enumerate the implementation's closed allowlist of operational metadata keys and run a valid profile with one allowlisted key changed at a time.
  2. Attempt unknown top-level keys, unknown nested keys, and workload-changing keys (scenario, version, schema fields, load model, request mix, duration, rate, or concurrency), including equivalent values supplied through environment, config nesting, or CLI aliases.
  3. Compare the effective resolved workload snapshot/digest and manifest for accepted and rejected attempts.
- Expected results:
  - Only keys in the published closed allowlist are accepted as operational metadata and are recorded as metadata-only changes.
  - Unknown, nested unknown, alias, environment/config, and workload-changing overrides are rejected before warm-up/measurement; they cannot alter effective workload through a side channel.
  - Accepted metadata changes leave the effective workload snapshot and digest unchanged; rejected attempts create no publishable measurement artifacts.
- Evidence to capture:
  - The closed allowlist and accepted metadata-only manifest diff.
  - Rejection output for unknown/nested/alias/environment/config/workload override attempts.
  - Effective-workload comparison and result inventory for every attempt.

### TC-83-04: Enforce setup/seed, warm-up, measurement, teardown ordering

- Purpose: Verify explicit phase orchestration and that only the measurement phase contributes published numbers.
- Steps:
  1. Execute a valid profile through a complete run.
  2. Inspect phase records and runner logs in chronological order.
  3. Compare counters/latency artifacts emitted during setup/seed and warm-up with the published report inputs.
  4. Inspect teardown completion and final run inventory.
- Expected results:
  - Phases occur exactly in order: `setup/seed` → `warm-up` → `measurement` → `teardown`.
  - Measurement is not entered until setup/seed and warm-up succeed.
  - Setup/seed and warm-up traffic may be logged for diagnostics but contributes no published benchmark numbers.
  - Teardown runs after measurement, records completion, and leaves only the declared retained evidence.
- Evidence to capture:
  - Phase timeline/records and runner log excerpts.
  - Report input manifest showing measurement-window boundaries.
  - Final retained-evidence inventory and teardown marker.

### TC-83-05: Fail safely before and during measurement

- Purpose: Verify that setup/warm-up failures and an injected measurement-phase failure cannot be presented as a completed, qualified publishable benchmark result, while teardown and ownership safety remain intact.
- Steps:
  1. Trigger a profile/setup validation failure.
  2. Trigger a warm-up failure after setup succeeds, using an existing safe test seam.
  3. Trigger a failure after the measurement phase has begun, using a safe test seam that does not alter production contracts.
  4. Inspect the recorded phase/outcome, measurement completion/qualification fields, retained raw artifacts, teardown attempt, and cleanup inventory for each run.
- Expected results:
  - Each run records the concrete failed or incomplete phase using the implementation's existing status vocabulary; this guide does not require a new post-boundary failure taxonomy.
  - The measurement-injected failure is not presented as `completed` or as a qualified publishable benchmark result. Setup/warm-up failures likewise do not enter or publish measurement.
  - Partial/raw measurement artifacts may remain retained for audit, but they are not promoted to a completed/qualified benchmark result.
  - Teardown is attempted according to the safety contract even after measurement has begun, and cleanup touches only K4-owned resources; Issue #61 and foreign resources remain untouched.
- Evidence to capture:
  - Failure/incomplete phase records and logs for setup, warm-up, and measurement injections.
  - Manifest/report status proving no completed/qualified publishable result for the injected measurement failure.
  - Retained partial/raw artifacts, teardown-attempt evidence, and ownership-scoped cleanup inventory.

## Omitted boundary axes

- Sidebar/message/socket payload semantics beyond profile selection are covered by their dedicated Issue #84+ slices and are not re-tested here.
- MongoDB, Redis, RabbitMQ ownership and topology isolation are acceptance authorities from Issues #81/#82 and ADR-015; this guide checks only that orchestration does not bypass them.
- Human approval and append-only Evaluation recording occur after this draft is reviewed; no execution evidence is valid before approval.

This guide becomes immutable after human approval. Create a new guide revision when the specification or expected behavior changes. Store run observations separately as JSONL Evaluation records.
