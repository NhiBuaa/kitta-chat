# K6 End-to-End Execution Plan

## Status and authority

- Status: approved for pre-D2 execution on 2026-08-22.
- Initial base: `72a9828579f34c0b88c9c8a1c51c2c4f8225c1ca`.
- Integration authority: `nhibuaa/k6-public-demo` until the final PR merges into `main`.
- Parent specification: GitHub Issue #110.
- Delivery graph: GitHub Issues #111–#118.
- Cadence: `high`, with external ticket and guide reviews, human acceptance, and final whole-scope review.
- D2 status: not authorized. The agent must stop at the D2 Authorization Request.

This file is the durable execution authority for K6. The feature-delivery ledger records actual
transitions and evidence. A validated external Resume Contract records the current resumable
checkpoint. If this file and a later ledger checkpoint differ, use the latest valid ledger evidence
without broadening this plan or crossing the D2 boundary.

## Workflow ownership

- `feature-delivery` owns the ledger, graph, frontier, integration, and completion.
- `test-craft` and `manual-acceptance` own Test Cases, locked guides, and append-only Evaluations.
- `implement` and `tdd` own RED → GREEN → cleanup within one approved ticket.
- `code-review` owns each child fixed-point review and the final feature review.
- `deployment` owns the D2 preflight, rollout, health, and rollback guardrails.
- `session-continuity` and `handoff` own resumable checkpoints.
- `resolving-merge-conflicts` is used only when reconciliation preserves approved behavior.

## Authorization boundaries

### Pre-D2 autonomous authority

The approved plan permits:

- Bootstrap B0 and durable state updates.
- Implementation, tests, reviews, remediation, and candidate build validation.
- K6-owned branch/worktree creation, commits, pushes, child PR creation and merge into the
  integration branch, Issue closure, and safe post-merge cleanup.
- Preparation of the #117 candidate/CI package.
- Preparation and locking of the #118 manual guide and evidence schema.

Human guide approval and human acceptance remain separate `human_required` checkpoints.

### Actions forbidden before D2 approval

- Create or rotate D2-owned runtime credentials.
- Bind Railway secrets.
- Publish authoritative GHCR deployment images or obtain deployment digests.
- Deploy Railway workloads.
- Finalize live Railway hostname, CORS, or private-host bindings.
- Run deployed-target acceptance or claim live provider compatibility.
- Perform a rollback.
- Enable Issue #61 measurement.

### D2 gate

After Issues #111–#118 converge, the agent creates a secret-safe D2 Authorization Request and
stops. Approval must reference its exact hash and reviewed candidate SHA. Candidate drift invalidates
the approval.

### Post-D2 authority

Only an explicit approval of the exact D2 request permits the listed credential, publication,
binding, rollout, live-validation, seed, acceptance, and conditional rollback actions.

## Bootstrap B0

1. Preserve unrelated root `mongoose` work in the external patch:
   `C:\Users\Nhi\AppData\Local\Temp\agent-handoffs\k6-preexisting-root-mongoose.patch`.
2. Record its SHA-256, verify reverse-apply while the WIP exists, restore only `package.json` and
   `package-lock.json`, and verify forward-apply against HEAD.
3. Keep the patch outside Git as an intentional exclusion.
4. Write this execution plan and synchronize the feature-delivery ledger, current session, next
   session, and Resume Contract.
5. Run the baseline:
   - `npm run test:ci`
   - `npm run ci:validate`
   - `npm run lint:ci`
   - `npm --prefix client test`
   - `npm --prefix client run build`
   - `npm --prefix server test`
   - production server Docker build
   - nginx Docker build
   - `git diff --check`
   - secret-safe scan
6. Commit only K6 planning/governance artifacts as
   `docs(k6): lock public-demo execution baseline`.
7. Push `nhibuaa/k6-public-demo` and record the exact bootstrap SHA as `B0`.
8. Return the canonical checkout to clean `main`.
9. Create the dedicated integration worktree:
   `D:\Developer\Projects\shotter\shot-chat-worktrees\k6-integration`.
10. Obtain a fresh external spec/design review of Issue #110, the Phase 2 design, and ADR-016 before
    Issue #111 acceptance preparation.

## Waves and dependency invariants

| Wave | Issues | Start condition |
| --- | --- | --- |
| 1 | #111 | B0 and fresh spec/design review complete |
| 2 | #112, #113 | #111 merged into integration |
| 3 | #114, #115, #116 | #112 and #113 merged into integration |
| 4 | #117 | #114–#116 and all published blockers merged |
| 5 | #118 | #117 merged |

The following invariants apply:

- A child branch starts from the current integration head after all its blockers merge.
- A downstream Issue must not start from a stale integration head.
- Parallel Issues use isolated worktrees and the same exact wave base.
- Parallel merges are sequential by Issue number: #112 → #113 and #114 → #115 → #116.
- After the first parallel PR merges, each remaining child merges the updated integration branch,
  reruns affected tests and the full merge gate, reevaluates acceptance invalidation, and refreshes
  fixed-point review evidence before merge.
- Do not force-push after review evidence is recorded.
- Do not silently resolve architecture conflicts or expand ticket scope.
- Critical/Major findings and failed required acceptance stop or remediate under the delivery
  contract.

## Per-Issue execution matrix

| Issue | Branch | Worktree | Source base | Bounded scope |
| --- | --- | --- | --- | --- |
| #111 | `nhibuaa/k6-issue-111-target-config` | `...\k6-issue-111` | exact `B0` | Validated target configuration, same-origin Vite contract, runtime capability document, and fail-closed loading. |
| #112 | `nhibuaa/k6-issue-112-edge` | `...\k6-issue-112` | post-#111 integration head | Configurable `BACKEND_UPSTREAM`, API/Socket.IO proxy, edge liveness, readiness projection, and public-route exclusion. |
| #113 | `nhibuaa/k6-issue-113-capability-gates` | `...\k6-issue-113` | same exact Wave 2 base as #112 | Backend capability gates, `.test` signup enforcement, and least-privilege environment validation. |
| #114 | `nhibuaa/k6-issue-114-s3-upload` | `...\k6-issue-114` | post-#112/#113 integration head | Approved S3 prefixes, private delivery, presigned/multipart boundary, and image-worker storage path. |
| #115 | `nhibuaa/k6-issue-115-webrtc-ice` | `...\k6-issue-115` | same exact Wave 3 base | Target ICE configuration, credential-leak prevention, and media-readiness fixture. |
| #116 | `nhibuaa/k6-issue-116-demo-seed` | `...\k6-issue-116` | same exact Wave 3 base | Deterministic `.test` seed, guarded remote seed, dry-run cleanup, and no-startup behavior. |
| #117 | `nhibuaa/k6-issue-117-candidate-ci` | `...\k6-issue-117` | post-Wave 3 integration head | Candidate builds, packaging, service commands, Railway descriptors, and GHCR workflow preparation without publication. |
| #118 | `nhibuaa/k6-issue-118-d2-guide` | `...\k6-issue-118` | post-#117 integration head | Locked D2 live guide, evidence schema, and validators; no deployed-target execution. |

The worktree prefix is
`D:\Developer\Projects\shotter\shot-chat-worktrees`. Every child PR targets
`nhibuaa/k6-public-demo`, never `main`.

## Per-Issue protocol

### Preparation and acceptance

For each Issue:

1. Record `source_base`, branch, worktree owner, and expected integration head in the ledger.
2. Verify a clean, non-stale worktree and a green baseline.
3. Obtain a fresh external ticket review with `APPROVE`.
4. Use `test-craft` to create cases and `manual-acceptance` to create a guide revision.
5. Obtain a fresh external guide review with `APPROVE`.
6. Obtain maintainer guide approval before implementation.
7. Use `implement` and `tdd` for each behavior: correct RED, minimal GREEN, then cleanup.
8. Run focused tests and applicable package suites.
9. Run the locked local/pre-D2 guide and append an Evaluation. Ticket acceptance requires
   `PASSED` and `human_approval=approved`.
10. Commit per slice. Add remediation commits; do not rewrite accepted history.
11. Push and open a PR to `nhibuaa/k6-public-demo`.
12. Run pinned Standards and Spec `code-review` on the exact PR fixed point.
13. Merge only with zero Critical/Major findings, valid acceptance, a mergeable PR, and the latest
    integration head reconciled.

### Verification gates

The universal local merge gate is:

- `npm run test:ci`
- `npm run ci:validate`
- `git diff --check`
- secret-value scan
- full test suite for each affected package

Additional gates:

- Client changes: client tests, `lint:ci`, and production build.
- Server/worker changes: full server tests.
- nginx/Docker changes: production server and nginx image builds.
- CI/dependency-manifest changes: security baseline, license checks, and full build matrix.
- Wave barriers and #117: the complete matrix.

Child PRs currently have no GitHub Actions because workflows target `main`. PR bodies must record
exact local command/results; missing hosted checks are not a PASS. The final PR to `main` must pass
the real ruleset.

### Merge, reachability, cleanup, and frontier

- Use merge commits; do not use squash or rebase merge.
- Do not use a closing keyword as Issue authority because the child PR base is not the default
  branch.
- After merge, fetch remote and fast-forward the integration worktree.
- Verify the child head and PR merge commit are reachable from the integration head.
- Run post-merge integration verification and selective acceptance invalidation.
- Record the merge SHA, tests, acceptance impact, and new frontier.
- Close the Issue manually with an evidence comment.
- Only after clean-worktree and reachability checks: remove the worktree without `--force`, delete
  the local branch with `git branch -d`, delete the remote child branch, and prune.
- Recompute the frontier from authoritative Issue and merge state. Accepted but unmerged work does
  not unlock downstream Issues.

## Remediation and escalation

- TDD: at most three attempts for one acceptance criterion.
- Design: at most two revisions per ticket.
- Review remediation: at most two cycles per ticket and two final-feature cycles.
- Critical means `BLOCK`; Major means `REQUEST_CHANGES`.
- Failed or blocked acceptance appends a new Evaluation; never rewrite history.
- A changed behavior expectation requires a new guide revision and new guide approval.
- An architecture conflict, public-contract change, or scope expansion requires a maintainer
  decision.
- Post-D2 remediation that changes the candidate SHA invalidates existing deployment authority and
  requires a new D2 Authorization Request.

## Pre-D2 convergence and stop condition

After #118 merges:

1. Verify #111–#118 are merged and closed and all child resources are clean.
2. Run full integrated tests, Docker candidate builds, and security/license/baseline checks.
3. Capture the initial base, merge-base, integration head, ordered child merge commits, exact diff
   command, and reviewed candidate SHA.
4. Run the whole-scope pre-deployment review. Zero Critical/Major findings is required.
5. Create the D2 Authorization Request as a secret-safe Issue #110 checkpoint and an environment-
   owned JSON copy with a hash.

The request must satisfy the complete `A01`–`A15` field matrix and `M01`–`M10` mutation list in
[k6-d2-authorization-execution-contract.md](k6-d2-authorization-execution-contract.md). This plan
does not own a duplicate checklist. It must contain no secret or execution-only output. The agent
stops and requests explicit human approval of the exact request hash and candidate SHA.

## Post-D2 rollout sequence

After approval of the exact request:

1. Revalidate request hash, candidate SHA, target IDs, permissions, and no-migration marker.
2. Create or rotate only the required credentials without printing values.
3. Publish the reviewed SHA through the approved workflow to:
   - `ghcr.io/nhibuaa/kitta-chat-server`
   - `ghcr.io/nhibuaa/kitta-chat-edge`
4. Capture immutable digests; never use `latest` as deployment authority.
5. Read back the edge public hostname and Railway private hostnames.
6. Bind configuration and secrets by least privilege while upload remains false.
7. Configure backend `/readyz`, deploy the backend digest, and wait for MongoDB/Redis readiness.
8. Deploy image-worker and audit-worker; leave notification-worker undeployed.
9. Validate declaration and use of the nine CloudAMQP queues; do not create them manually.
10. Deploy edge and validate `/healthz`, any retained sanitized public readiness projection, SPA,
    API, and Socket.IO upgrade; verbose backend health remains non-public.
11. Validate Atlas, Upstash, CloudAMQP, and S3 compatibility under the approved live contract.
12. While upload is false, complete internal S3 checks, then set exact-origin S3 CORS.
13. Enable upload through capability/config state and run browser upload acceptance.
14. Run the one-off idempotent `.test` seed using secret-safe injection.
15. Execute the locked #118 deployed-target guide, including WebRTC ICE-connected bidirectional
    media acceptance.
16. Append the Evaluation and obtain explicit human acceptance.
17. Record commit → image digests → Railway revisions, capability transitions, and stable marker.

For the first deployment, do not claim a prior-revision rollback. Roll back only when a prior
known-good immutable revision exists, no migration marker exists, the approved D2 request includes
rollback authority, and one rollback plus one health check is sufficient. Otherwise stop for a
maintainer decision.

After acceptance, create `nhibuaa/k6-d2-execution-evidence` in
`...\k6-d2-execution-evidence`, target its PR at the integration branch, and commit only redacted
Execution Evidence, Evaluation, README/demo URL, and limitations. Merge and clean it with the child
protocol.

## Final integration and merge

1. Fetch remote `main`.
2. If `main` advanced, create `nhibuaa/k6-main-reconcile` in `...\k6-main-reconcile`, merge-update
   latest `github/main`, stop on semantic conflict, rerun invalidated tests/acceptance, merge its PR
   into integration, and clean it.
3. Capture the final integration fixed point.
4. Run final whole-feature Standards/Spec review.
5. Require cadence validator `ready`, zero Critical/Major findings, and live Evaluation `PASSED`
   with human approval.
6. Open `nhibuaa/k6-public-demo` → `main`.
7. Require the seven hosted checks: Server Tests, Client Tests, Client Build, Client Lint, Docker
   Build server/nginx, and CI Policy v1.
8. Resolve every review thread. If strict update changes the fixed point, rerun affected evidence.
9. Merge using one merge commit.
10. Verify the integration head and reviewed candidate commit are reachable from remote `main`.
11. Fast-forward local `main` to the exact remote merge commit and verify it is clean.
12. Close parent Issue #110 with final URL, lineage, and limitations.

## K6-only cleanup

After reachability verification:

- Remove all remaining K6 child, evidence, and reconciliation worktrees.
- Safely delete merged local and remote K6 child/evidence branches.
- Remove the dedicated integration worktree.
- Delete local and remote `nhibuaa/k6-public-demo`.
- Prune stale remote refs.
- Verify `git worktree list` contains no K6 worktree.
- Verify no local or remote branch starts with `nhibuaa/k6-`.
- Verify the canonical checkout is on `main`, local `main == github/main`, and
  `git status --porcelain` is empty.
- Delete active K6 Resume Contract and temporary D2 copies only after retained evidence is merged.
- Keep the external root-mongoose patch and its SHA as the single intentional exclusion.

Do not remove pre-existing K3/K4/Gemini/Codex worktrees or branches. Inventory them as legacy
exclusions. Final reporting may claim only that no stale K6 execution state remains.

## Resume checkpoints

At B0, every ticket preparation/fixed point/merge, each wave barrier, pre-D2 convergence, D2
authorization, each rollout transition, live acceptance, final merge, and cleanup fixed point:

- update the feature-delivery ledger, `.agents/current-session.md`, and `.agents/next-session.md`;
- write and validate the canonical external Resume Contract through the handoff script;
- record exact branch, worktree, HEAD, source base, frontier, tests, reviews, acceptance, authority,
  blockers, and next valid action;
- do not infer state from a stale or invalid handoff file.

## Final fixed-point criteria

K6 is complete only when:

- Issues #111–#118 and #110 are closed with evidence.
- Every child has branch/worktree/PR/merge/reachability/cleanup records.
- The dependency graph and wave order were followed.
- All high-cadence guide, review, Evaluation, and cadence evidence is valid.
- The public URL and required auth/chat/group/sidebar/WebSocket/call/media/upload flows pass.
- Recovery, Google login, `/ops`, `/metrics`, and Issue #61 measurement remain disabled or inert.
- Live provider compatibility is proven, not inferred from S1 metadata.
- Commit, GHCR digest, and Railway revision lineage is complete.
- Stable-revision and first-deployment/rollback disposition is explicit.
- The final PR merge is reachable from synchronized, clean local `main`.
- No K6 worktree, local/remote branch, or active Resume Contract remains.
- No secret appears in Git, PRs, logs, evidence, or chat.
- The external package patch is the only intentional K6 exclusion.
