# K4 Performance Evidence

K4 is the separate, reproducible performance-evidence milestone. It uses a K4-owned dataset,
an approved `scenario:version` workload, an isolated Compose project, and a containerized runner
that sends measured traffic through nginx. The observation plane collects evidence; it does not
create workload or grant Docker-management access to the runner.

## K4 completion — final Issue #89 fixed point (2026-08-18)

K4 is complete under locked Issue #80 and ADR-015. The final Issue #89 remediation fixed point is
captured by `C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-remediation-fixed-point-descriptor-20260818-final11g.json`
with exact fixed-point diff SHA-256
`sha256:8e441c6d64147a675aca8dbe77c0c540fcc362ded7acf524d131aa7042e26903`. It was published by
[PR #106](https://github.com/NhiBuaa/kitta-chat/pull/106), merged into `main` at
`ef42b99cee93c0dfd5d6c770e5f3698f38c55599`; GitHub Issues #80–#89 are `CLOSED`. No new scenario,
topology, workload, measurement, routing, treatment, or authority decision was added.

The final Standards and Spec review axes and their aggregate feature review are `APPROVE` with
zero Critical, Major, or Minor findings. Review cadence validation is `ready`. The final11g
acceptance artifact
`C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k4-remediation-final11g-evaluation.json`
records `PASSED` with explicit `human_approval=approved`; locked guides, prior append-only
Evaluations, and raw measurement artifacts remain immutable.

### Final retained evidence

| Artifact | SHA-256 | Validation |
| --- | --- | --- |
| `.k4-results/k4r5-20260818-final11-baseline-matrix.json` | `sha256:61167554c38bbe41a98b1243b8349c9e3176884c94c05ddca615cc237c944ea2` | `VALID` |
| `.k4-results/k4r5-20260818-final11-baseline-report.json` | `sha256:63f36b60a13b1e81264f50acd45fd9c9460b31b5f78c744ec0a236911f0338c4` | `VALID` |
| `.k4-results/k4r5-20260818-final11-bottleneck-dossier.json` | `sha256:7f9b23755dea508e54456a6d6fde7bc31f9f65099126ab2e4553b095624329f8` | `READY_FOR_HUMAN_GATE` |
| `.k4-results/k4r5-20260818-final11-optimization-comparison.json` | `sha256:58dee8c4097912e235996a54ebc87ee660264be688c5b8057f9e57b2e2d17882` | `ACCEPTED`, zero differences/diagnostics |

All seven retained final11 runs are `COMPLETED + MEASURED/PUBLISHABLE`. Qualification remains
claim-specific: the sidebar single-replica cell is `TOPOLOGY_NOT_EXERCISED`; the message
single-replica cell and both socket-concurrency cells retain `OBSERVATION_INCOMPLETE`. These flags
do not become an overall failure and continue to restrict only the claims defined by Issue #80.
The one approved targeted treatment remains `profile-and-optimize-sidebar-query-plan`, with
implementation digest
`sha256:4d090905bac048576ac311572f90c85ebdd52997d1b273a52a27cf9992258ff1`.

Final verification is focused lifecycle/cleanup `30/30`, full K4 `252/252`, repository CI
`132/132`, `npm run ci:validate` exit `0`, and `git diff --check` exit `0`. The K4 implementation
fixed point is `ef42b99`; no K4 implementation frontier remains.

## Issue #87: Message persistence and recipient delivery

Issue #87 was accepted from branch `codex/k4-issue87` and delivered through [PR #99](https://github.com/NhiBuaa/kitta-chat/pull/99),
merged into `main` at `cfd1bf90c490dfcfe3349107f841269d1b6aa720`. GitHub Issue #87 is now
`CLOSED`. The locked manual guide is `k4-issue-87-r2`; its append-only Evaluation history ends
with `tc87-r2-acceptance-20260814` and records `PASSED` with explicit human approval. The
fixed-point review over base `dcdd64d` and head `f2f9a10` is `APPROVE` on both Standards and Spec
axes with zero Critical/Major findings, and post-merge integration verification remains green.

### Delivered evidence boundary

- Persistence evidence is derived from acknowledged-Mongo success histogram snapshots taken
  before and after the measurement window. Bucket, count, and sum deltas are retained, and derived
  quantiles are labeled `histogram-derived`.
- Recipient-delivery timing starts immediately before the `sendMessage` emit and ends when the
  recipient receives the matched `getMessage`. Duration is derived from those two runner-clock
  timestamps.
- The acknowledgement remains the existing `{ success, realId }` validity gate. It does not gain
  idempotency, sender, recipient, or conversation fields, and the public Socket.IO contract is
  unchanged.
- A complete correlation binds idempotency key, message identity, sender, recipient, and legacy
  `Message.conversationId`. Failed or mismatched opportunities are retained as failure evidence,
  not latency samples.
- Sample-level same-replica ineligibility is separate from run-level `TOPOLOGY_NOT_EXERCISED`.
  The run-level flag requires complete measurement-phase observation that all measured activity
  used one replica.
- TC-87-03 uses only the allowlisted runner fixtures in
  `scripts/k4/runner/faultFixtures.js`. Fixtures are measurement-phase-only and do not alter the
  workload snapshot or any public runtime contract.

## Acceptance evidence

| Artifact | Purpose |
| --- | --- |
| `.agents/manual-tests/k4-performance-evidence/issue-87-message-persistence-recipient-delivery-r2.md` | Locked manual guide |
| `.agents/manual-tests/k4-performance-evidence/issue-87-message-persistence-recipient-delivery-r2.evaluations.jsonl` | Append-only acceptance history |
| `.agents/feature-delivery-events/events.jsonl` | Transition ledger |
| `.agents/feature-delivery-events/k4-performance-evidence-integration-completed-20260814.json` | Integration/publication completion event |
| `.k4-image-sets/k4issue87r3.json` | Immutable image-set identities and nginx config fingerprint |
| `.k4-results/issue87-single-20260814` | Fresh single-replica evidence |
| `.k4-results/issue87-multi-20260814` | Fresh multi-replica evidence |
| `.k4-results/issue87-fault-*` | Four isolated TC-87-03 fixture runs |

The four fixture runs each retained 30 failed measurement opportunities with zero successful
correlations and zero delivery samples. Warm-up remained normal, and teardown left zero owned
containers, networks, volumes, or result-directory cleanup targets.

## Verification

- Issue #87 focused K4 tests: `136/136` passed (including overlapping-delivery and attribution
  fail-closed regressions). After reconciling the latest main (Issue #85), the combined K4 suite is
  `143/143` passed.
- Repository CI tests: `npm run test:ci` — `132/132` passed.
- Server suite: `476` passed, `5` skipped, `0` failed.
- `node --check` on modified JavaScript and `git diff --check`: exit `0`.

These results verify the evidence boundary and retained artifacts. They do not turn incomplete
resource coverage into a publishable end-to-end or cross-replica performance claim.

## Issue #89: Baseline evidence chain and bottleneck dossier

Issue #89 adds the repository-owned baseline interpretation seam in
`scripts/k4/baselineEvidence.js` and `scripts/k4/bottleneckDossier.js`. The baseline matrix is
closed to the six required cells: `sidebar:2`, `message:2`, and `socket-concurrency:2`, each at
`single-replica` and `multi-replica`. Each cell receives an attempt identity before execution and
must retain `MEASURED`, `FAILED_SETUP`, or `NOT_RUN`; there is no selected-profile or implicit
topology skip.

Measured cells must retain `setup/seed` → `warm-up` → `measurement` → `teardown`, a measurement
window, and measurement evidence. `FAILED_SETUP` stops at the actual setup/warm-up failure and
retains its reason plus cleanup evidence. `NOT_RUN` retains its cell/attempt identity and concrete
reason and cannot contribute a measurement claim. Topology pairs compare exact profile/workload,
dataset, commit, hardware, runner placement, and non-topology configuration identities; only the
declared topology/replica count may differ.

The chain emits a baseline report with per-cell claim eligibility and limitations. Prerequisite
negative-state evidence is reusable only after its guide/Evaluation/implementation identity,
claim-eligibility/report-validator contract, source digests, and Issue #89 HEAD lineage pass the
freshness gate; a changed relevant path requires a passed regression. The dossier is fail-closed:
it names one eligible primary bottleneck candidate and exactly one proposed treatment, or returns
`FAIL`/`BLOCKED` with the optimization gate closed. The locked r4 guide was approved, the single
approved treatment is the targeted sidebar query-plan index, and one bounded
post-treatment/optimization-comparison rerun is retained at
`.k4-results/k4issue89r4-20260816-optimization-comparison.json`. Its append-only Evaluation ends
with `tc89-r4-treatment-comparison-20260816-approved` (`PASSED`/`approved`); no
production-capacity, scalability, or topology claim is emitted. The implementation was integrated
at `codex/k4-integration` head `4609fcf`; verification is green, and selective invalidation
preserved the accepted r3/r4 Evaluations because no inputs, environment, or approved behavior
changed. The final remediation was subsequently published through
[PR #106](https://github.com/NhiBuaa/kitta-chat/pull/106), merged into `main` at
`ef42b99cee93c0dfd5d6c770e5f3698f38c55599`; GitHub Issue #89 is `CLOSED`. The final K4 feature
review is recorded as `APPROVE` with zero Critical/Major/Minor findings above.

The CLI seams are `baseline-matrix`, `execute-baseline`, `validate-baseline`, `baseline-report`,
`prerequisite-freshness`, `prerequisite-set`, and `bottleneck-dossier`. Every run also retains `run-status.json` and lifecycle details in the
manifest so setup failure and unavailable attempts remain auditable without turning marker
presence into claim eligibility.

## Authorities

- [K4 specification — Issue #80](https://github.com/NhiBuaa/kitta-chat/issues/80)
- [Issue #87](https://github.com/NhiBuaa/kitta-chat/issues/87)
- [ADR-015: K4 performance evidence boundary](adr/015-k4-performance-evidence-boundary.md)
