# K3/K3.1 Completion and K4 Active Checkpoint

## K4 Current Frontier Override

Issues #85, #86, #87, and #88 are complete and integrated. Issue #89 is the only open K4
frontier, a child of locked Issue #80. This worktree is reserved for #89 on branch
`codex/k4-issue89`, with integration branch `codex/k4-integration`.

Issue #89 manual-acceptance guides `k4-issue-89-r1` and `k4-issue-89-r2` remain immutable and
unapproved. Revision `k4-issue-89-r3` is now locked and human-approved at
`.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r3.md`
(`2026-08-16T11:52:30+07:00`, approved by `user`). Revision `k4-issue-89-r4` is also locked and
human-approved at `.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.md`
(`2026-08-16T13:30:07+07:00`, approved by `user`). Issue #89 implementation and r4 execution are complete.

Issue #89 delegated implementation is complete in this worktree. Focused tests pass 13/13;
full K4 plus server attribution passes 193/193; `npm run test:ci` passes 132/132; and
`npm run ci:validate` passes. Locked r3 manual execution observed TC-89-01 through TC-89-04 as
PASS. The r3 append-only Evaluation history retains its original `BLOCKED`/pending record and
approved append-only record `tc89-r3-baseline-20260816-approved`. The r4 Evaluation history now
ends with `tc89-r4-treatment-comparison-20260816-approved` (`PASSED`/`approved`) after the prior
`BLOCKED`/pending observation. The valid comparison artifact is
`.k4-results/k4issue89r4-20260816-optimization-comparison.json`; the treated run completed the
full lifecycle and was cleaned to zero owned resources. The next valid transition is integration;
no final feature review, commit, merge, or publication was performed.

## K4 Current Frontier Override

Issue #84 is closed after the accepted K4 measurement-observation delivery. Issue #85 is
implemented and manually accepted. Issue #87 is fully integrated after implementation, bounded
remediation, manual acceptance, final review, and PR #99 publication. Issue #86 implementation
and locked-r2 acceptance are complete on branch `codex/k4-issue86`; Issue #88 remains an
independent K4 child in its own worktree.

- Issue #87 implementation and bounded TC-87-03 remediation are complete in this worktree.
- Automated evidence is green: Issue #87 focused K4 136/136; combined post-reconcile K4 143/143;
  `npm run test:ci` 132/132; server 476 passed/5 skipped/0 failed.
- Locked guide `k4-issue-87-r2` remains immutable. Its append-only Evaluation history now records
  the four allowlisted measurement-phase fault fixtures; all TC-87-01 through TC-87-05 observations
  pass; Evaluation `tc87-r2-acceptance-20260814` is now `PASSED` with explicit human approval.
- Image set `k4issue87r3` is retained separately from `k4issue87r2`; fixture runs were torn down
  with zero owned containers, networks, volumes, and result-directory cleanup targets.
- Issue #85 implementation and manual acceptance are complete. Guide `k4-issue-85-r3` is locked
  and human-approved at `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.md`;
  its append-only Evaluation history records `tc85r3-human-approved-20260814` as `PASSED`.
  Review cadence and the three required high-tier external reviews are recorded in the Issue #85
  acceptance artifacts; final K4 review remains governed by the complete feature fixed point.

## Issue #88 Closeout Override

This worktree contains the delegated Issue #88 Socket.IO concurrency implementation on branch
`codex/k4-issue88`. Guide `k4-issue-88-r3` is locked and human-approved; Evaluation
`tc88r3-acceptance-20260816-approved` is `PASSED` with explicit human approval. Final code review
is intentionally deferred until all K4 Issues reach the complete feature fixed point.

- Issue #86 manual-acceptance guide `k4-issue-86-r1` remains immutable and unapproved. Revision
  `k4-issue-86-r2` is locked and human-approved at
  `.agents/manual-tests/k4-performance-evidence/issue-86-sidebar-scenario-r2.md`. The parent
  artifact boundary and hardware provenance fixes are implemented; focused attribution/observation
  tests pass 11/11, the full K4 suite passes 129/129, and `npm run test:ci` passes 42/42.
- Fresh manual acceptance execution `issue86-r2-attribution-20260816` is appended to
  `.agents/manual-tests/k4-performance-evidence/issue-86-sidebar-scenario-r2.evaluations.jsonl`
  with an observed `BLOCKED`/`human_approval=pending` record followed by the approved append-only
  record `issue86-r2-attribution-20260816-approved` (`PASSED`/`approved`). TC-86-01 through
  TC-86-04 all pass, including the explicit full topology-equivalence matrix, complete one-replica
  `TOPOLOGY_NOT_EXERCISED` semantics, and complete three-replica attribution. Final review is
  intentionally pending per user instruction and was not performed.

## Status

- K3 Observability is complete. Issue #44 and implementation Issues #45–#52 are closed.
- K3.1 Local Observability Demo is complete. Implementation Issues #70–#72 are closed.
- The K3.1 parent specification, Issue #69, remains open for tracker history. It is not an implementation frontier.
- Local `main` and `github/main` were previously synchronized at `0cb0dc2afe63bd5858772bfdd738043bafc03a98`; K4 Issue #81 was published by PR #91 merge commit `3015031dacea7f1624f989d1cb9b9c2f14c6e9ce`.
- No deployment or destructive K3.1 reset was performed.
- K4 Reproducible Performance Evidence is active under locked specification Issue #80 and ADR-015.
- Issues #81–#89 are published. Issues #81–#85 and #87 have completed implementation, acceptance,
  review, and integration milestones. Issues #86 and #88 remain independent pending frontiers, and
  later dependent issues remain blocked by the approved ticket graph.
- K4 is leader-coordinated: the leader does not implement issues. Guide revisions `k4-issue-81-r1` through `k4-issue-81-r3` remain immutable; `k4-issue-81-r4` is locked and approved. Issue #81 implementation and mandatory acceptance TC-81-01 through TC-81-04 are complete and accepted; TC-81-05 was not run because it remains conditional.
- Issue #81 final remediation fixed point has append-only Evaluation `tc81digest-v1`; mandatory TC-81-01 through TC-81-04 pass, TC-81-05 remains conditional/non-blocking.
- Final review of the remediation fixed point is `APPROVE` with zero Critical and zero Major findings. Issue #81 is closed.
- Issue #82 manual-acceptance guide `k4-issue-82-r4` is locked and human-approved; r1 through r3 remain immutable. The deterministic-seed timestamp and disposable credential remediations are implemented: fresh K4 setup/preflight verifies the declared and observed canonical fingerprint as equal, admits warm-up, completes nginx login and Socket.IO authentication, and scans the complete retained-evidence inventory clear. Two independently verified fresh runs produced the same canonical fingerprint and the acceptance-only oracle returned `EQUIVALENT`; all disposable runs were cleaned to empty target inventories.
- TC-82-03 is complete: nginx-mediated public-login failure returns `FAILED_SETUP` at `login`, with owner marker only and no admission/measurement; cleanup inventory is empty. Internal `migrate:k4` and `seed:demo` non-zero command propagation is proven through the actual generic CLI command-execution path without a production-configurable failure injection. TC-82-05 runtime evidence proves prior-run, foreign-K4, and non-K4 resources were neither adopted nor mutated. Append-only Evaluation `tc82r4-acceptance-20260812` is `PASSED` with explicit human approval.
- Issue #82 final review is `APPROVE` with zero Critical and zero Major findings, against repository standards, Issue #82, locked r4, and ADR-015. K4 regression is 47/47 and related server regression is 21/21. It was delivered by PR #92, merge commit `af9daaacd1ec6c347f0c7fef74603c908e652608`, and GitHub Issue #82 is closed.
- Issue #83 delivered approved immutable `scenario:version` workload profiles for `sidebar`, `message`, and `socket-concurrency`; exact-byte SHA-256 profile evidence; an operational CLI boundary that rejects raw workload channels; and injectable phase orchestration with ownership-safe teardown and independent artifact, execution, qualification, and teardown evidence. Locked guide `k4-issue-83-r3` and its append-only Evaluation history record final PASSED acceptance. Deterministic closure review resolved all seven Major findings with zero Critical/Major remaining; targeted Issue #83 tests passed 14/14 and `npm run test:ci` passed 122/122. It was delivered by PR #95, merge commit `ce1adcd091fb00814e03c0021ab801a67621c168`, and GitHub Issue #83 is closed.

- Issue #87 delivered the message persistence and recipient-delivery evidence slice. Its locked r2
  guide and append-only Evaluation history end with `tc87-r2-acceptance-20260814` (`PASSED`,
  explicit approval). The evidence preserves the exact temporal boundary, `{ success, realId }`
  acknowledgement gate, legacy conversation identity, sample/run topology distinction, and four
  allowlisted measurement-phase fault fixtures. No public REST/Socket.IO contract changed.

## Delivered Outcome

- K3 provides bounded Prometheus application metrics, structured correlation logging, a repository-owned Grafana dashboard and scrape contract, queue alert/runbook artifacts, and operator validation guidance.
- Metrics remain disabled by default. `/metrics` stays internal and is not proxied through nginx.
- K3.1 provides an opt-in local Prometheus/Grafana stack through `npm run demo:observability`.
- Grafana is the only published K3.1 host surface at `http://127.0.0.1:3001`.
- Browser evidence, automated checks, locked manual guides, and append-only Evaluation histories are accepted.
- The K3.1 stop rule has been reached. Any new observability scope requires a new approved issue or specification.

## Sources of Truth

- K3 specification: https://github.com/NhiBuaa/kitta-chat/issues/44
- K3.1 parent specification: https://github.com/NhiBuaa/kitta-chat/issues/69
- K3 metrics boundary: `docs/adr/012-k3-observability-metrics-boundary.md`
- K3.1 local demo seam: `docs/adr/013-k3-1-local-observability-demo-seam.md`
- Observability documentation index: `docs/observability/README.md`
- K3 delivery ledger: `.agents/workflows/k3-observability-feature-delivery.md`
- K3.1 delivery ledger: `.agents/workflows/k3-1-local-observability-feature-delivery.md`
- Locked acceptance guides and Evaluation histories: `.agents/manual-tests/k3-observability/` and `.agents/manual-tests/k3-1-local-observability/`
- K4 locked specification: https://github.com/NhiBuaa/kitta-chat/issues/80
- K4 issue graph: https://github.com/NhiBuaa/kitta-chat/issues/81 through https://github.com/NhiBuaa/kitta-chat/issues/89
- K4 architecture authority: `docs/adr/015-k4-performance-evidence-boundary.md`
- Issue #85 delivery package: `docs/reviews/issue-85-delivery-package.md`
- Issue #85 acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.md` (locked; r1 and r2 remain immutable)
- Issue #85 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-85-provenance-report-validator-r3.evaluations.jsonl` (latest PASSED run `tc85r3-human-approved-20260814`)
- K4 current acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.md` (locked; r1 through r3 remain immutable)
- K4 Issue #81 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-81-topology-lifecycle-r4.evaluations.jsonl` (latest PASSED run `tc81digest-v1`)
- K4 Issue #82 acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.md` (locked and approved; r1 through r3 remain immutable)
- K4 Issue #82 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-82-dataset-actors-preflight-r4.evaluations.jsonl` (PASSED run `tc82r4-acceptance-20260812`)
- K4 Issue #82 publication: PR #92, merge commit `af9daaacd1ec6c347f0c7fef74603c908e652608`
- K4 Issue #83 acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-83-workload-profiles-runner-r3.md` (locked and approved)
- K4 Issue #83 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-83-workload-profiles-runner-r3.evaluations.jsonl` (latest PASSED run `tc83r3-runner-closure-20260812`)
- K4 Issue #83 publication: PR #95, merge commit `ce1adcd091fb00814e03c0021ab801a67621c168`
- K4 Issue #87 delivery summary: `docs/k4-performance-evidence.md`
- K4 Issue #87 acceptance guide: `.agents/manual-tests/k4-performance-evidence/issue-87-message-persistence-recipient-delivery-r2.md` (locked and approved)
- K4 Issue #87 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-87-message-persistence-recipient-delivery-r2.evaluations.jsonl` (latest PASSED run `tc87-r2-acceptance-20260814`)
- K4 Issue #89 r4 treatment guide: `.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.md` (locked and approved; r1–r3 immutable)
- K4 Issue #89 r4 Evaluation: `.agents/manual-tests/k4-performance-evidence/issue-89-baseline-evidence-bottleneck-dossier-r4.evaluations.jsonl` (latest `tc89-r4-treatment-comparison-20260816-approved`, PASSED/approved)
- K4 Issue #89 comparison artifact: `.k4-results/k4issue89r4-20260816-optimization-comparison.json`

## Publication History

- K3 terminal publication: PR #67, merge commit `0b28b9ad`.
- K3.1 design checkpoint: PR #73, merged after the implementation absorbed the approved design.
- K3.1 implementations: PR #74 for Issue #70, PR #75 for Issue #71, and PR #76 for Issue #72.
- K3.1 closure-ledger synchronization: PR #77, merge commit `0cb0dc2a`.
- Issue #87 acceptance fixed point: `tc87-r2-acceptance-20260814` is `PASSED`; branch reconciliation
  merge `e69932c` is green; fixed-point review is `APPROVE` with zero Critical/Major findings on
  both Standards and Spec axes; PR #99 is merged at `cfd1bf90c490dfcfe3349107f841269d1b6aa720`,
  and GitHub Issue #87 is closed.

## Guardrails

- MongoDB remains the durable source of truth. Redis remains cache/coordination only. RabbitMQ remains background-only.
- Do not rewrite locked manual guides or append-only Evaluation histories.
- Do not add Alertmanager, cAdvisor, Loki, Tempo, OpenTelemetry, hosted monitoring, production deployment, benchmarks, or open-ended dashboard tuning under the completed K3/K3.1 scope.
- Safe stop must not pass `--volumes`. Destructive reset requires the separate two-phase confirmation flow and explicit approval.
- K4 benchmark work is a separate approved milestone, not an expansion of K3/K3.1. K4 resources must remain K4-owned and must never share target resources with Issue #61.
- K4 semantics are locked by Issue #80 and ADR-015. Any ambiguity affecting benchmark meaning returns to those authorities before implementation.
- Do not implement an issue from the leader session. After manual-acceptance approval, delegate the issue to an execution agent.
- Do not run a per-issue code review for K4. Perform one high-cadence final feature review after the complete K4 feature reaches its fixed point.
