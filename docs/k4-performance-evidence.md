# K4 Performance Evidence

K4 is the separate, reproducible performance-evidence milestone. It uses a K4-owned dataset,
an approved `scenario:version` workload, an isolated Compose project, and a containerized runner
that sends measured traffic through nginx. The observation plane collects evidence; it does not
create workload or grant Docker-management access to the runner.

## Issue #87: Message persistence and recipient delivery

Issue #87 is accepted on branch `codex/k4-issue87`. The locked manual guide is `k4-issue-87-r2`.
The append-only Evaluation history ends with `tc87-r2-acceptance-20260814` and records
`PASSED` with explicit human approval. Final code review and integration remain separate workflow
transitions, so the GitHub Issue remains `OPEN` until those transitions complete.

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
| `.k4-image-sets/k4issue87r3.json` | Immutable image-set identities and nginx config fingerprint |
| `.k4-results/issue87-single-20260814` | Fresh single-replica evidence |
| `.k4-results/issue87-multi-20260814` | Fresh multi-replica evidence |
| `.k4-results/issue87-fault-*` | Four isolated TC-87-03 fixture runs |

The four fixture runs each retained 30 failed measurement opportunities with zero successful
correlations and zero delivery samples. Warm-up remained normal, and teardown left zero owned
containers, networks, volumes, or result-directory cleanup targets.

## Verification

- K4 tests: `136/136` passed (including overlapping-delivery and attribution fail-closed regressions).
- Repository CI tests: `npm run test:ci` — `132/132` passed.
- Server suite: `476` passed, `5` skipped, `0` failed.
- `node --check` on modified JavaScript and `git diff --check`: exit `0`.

These results verify the evidence boundary and retained artifacts. They do not turn incomplete
resource coverage into a publishable end-to-end or cross-replica performance claim.

## Authorities

- [K4 specification — Issue #80](https://github.com/NhiBuaa/kitta-chat/issues/80)
- [Issue #87](https://github.com/NhiBuaa/kitta-chat/issues/87)
- [ADR-015: K4 performance evidence boundary](adr/015-k4-performance-evidence-boundary.md)
