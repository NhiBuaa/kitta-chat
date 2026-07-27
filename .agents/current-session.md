# K2 GitHub Actions CI/CD — Current Session

## Status

- Phase 1 PRD: completed.
- Phase 2 architecture stress-review: completed with Claude/Codex consensus on `2026-07-27`.
- Phase 3 issues/manual tests: **provisional and must be rebuilt**; existing #14–#18 predate final governance.
- Phase 4 implementation: not started.

## Sources Of Truth

- PRD: `specs/active/github-actions-ci-cd.md`
- ADR index: `docs/adr/README.md`
- ADRs: `docs/adr/007-*.md` through `docs/adr/011-*.md`

## Approved Delivery Sequence

1. Shared Node setup plus Tests/Build readiness.
2. Quality readiness: Client Lint plus versioned Required `CI Policy v1` trust anchor.
3. Docker readiness: server and nginx Buildx checks.
4. Advisory Security workflow; sequencing among readiness PRs is flexible.
5. Dedicated lint remediation verified by the already-running Client Lint check.
6. Create the verification branch before the final readiness merge.
7. One atomic direct-Active Ruleset activation with seven Required checks, followed by the approved behavior verification and bounded rollback policy.

## Required Checks

`Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)`, `CI Policy v1`.

## Next Work

Re-run Phase 3: replace or rewrite issues #14–#18, regenerate dependency order and manual acceptance guides, then obtain Developer approval before implementation.

## Guardrails

- No implementation until Phase 3 and locked manual tests are approved.
- No commit, push, merge or Ruleset change without explicit Developer authorization.
- Security jobs remain Advisory; CI Policy is Required.
- No `continue-on-error`, `pull_request_target`, mutable external Action refs or hidden bypasses.
