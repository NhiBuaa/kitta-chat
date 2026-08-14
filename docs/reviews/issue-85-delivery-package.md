# Issue #85 Delivery Package

## Delivery state

- Issue #85 implementation is complete in the dedicated `codex/k4-issue85` worktree.
- Manual guide `k4-issue-85-r3` is locked and human-approved. Revisions r1 and r2 remain immutable.
- Manual acceptance is `PASSED` in the append-only Evaluation history, latest run
  `tc85r3-human-approved-20260814`.
- No per-issue code review was run. Per user direction, one final feature review will run only
  after the complete K4 feature reaches its fixed point.
- No commit, push, integration, or publication was performed for this slice.

## Delivered scope

- Exact whole-file SHA-256 provenance for the persisted source-inventory artifact, with an
  authority/schema guard only when a contract explicitly uses a different representation.
- Source and bundle inventory verification with a non-inventoried `COMPLETED` marker, collision
  protection, incomplete-run retention, and independent artifact/execution/qualification axes.
- Report derivation with hardware-limit and measured-scope fields, provenance-linked claim
  guardrails, and rejection of unsupported marketing claims or extrapolation beyond the measured
  workload/topology.
- Exact resource-coverage qualification, including the final partial cadence slot, the one-success
  minimum, and the `successful / expected >= 0.90` boundary.
- Attribution-dependent topology qualification, explicit `NOT_RUN` handling, and separate
  optimization versus topology comparison contracts.

## Fixed-point artifacts

- `scripts/k4/provenance.js`
- `scripts/k4/runArtifacts.js`
- `scripts/k4/experimentValidator.js`
- `scripts/k4/measurementCollectors.js`
- `scripts/k4/cli.js`
- `scripts/k4/lifecycle.js`
- `scripts/test/k4/provenance.test.cjs`
- `scripts/test/k4/measurementCollectors.test.cjs`
- `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.md`
- `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.evaluations.jsonl`

## Verification evidence

- Focused K4 tests: `node --test scripts/test/k4/provenance.test.cjs scripts/test/k4/measurementCollectors.test.cjs` — 12 passed, 0 failed.
- Repository CI suite: `npm run test:ci` — 132 passed, 0 failed.
- Manual blocker probe: `node .scratch/issue85-manual-acceptance-r3-probe.cjs` — exit 0; TC-85-05 and TC-85-07 fixtures passed.
- Syntax validation: `node --check` passed for all changed JavaScript files.
- Diff hygiene: `git diff --check` passed.

## Review and session boundary

Required high-cadence external reviews for the r3 guide, spec/design surface, and ticket all
returned `APPROVE` with zero Critical/Major/Minor findings. This Issue #85 session stops at the
accepted slice. Other K4 slices are handled in separate parallel worktrees and are not selected as
this session's next frontier.
