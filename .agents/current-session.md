# K2 GitHub Actions CI/CD — Current Session

## Status

- Phase 1 PRD: completed.
- Phase 2 architecture stress-review: completed with Claude/Codex consensus on `2026-07-27`.
- Phase 3 issue breakdown: approved and rebuilt around seven Required checks.
- Phase 3 Slice 1 manual guide: regenerated; TC-01 through TC-11 approved and locked on `2026-07-27`.
- Phase 3: completed.
- Phase 4 implementation: Slice #14, Slice #15 and Slice #16 completed with manual acceptance `PASSED`; Slice #17 implementation and hosted PR/main evidence completed, scheduled acceptance pending; Slice #18 is next on a separate branch.

## Sources Of Truth

- PRD: `specs/active/github-actions-ci-cd.md`
- ADR index: `docs/adr/README.md`
- ADRs: `docs/adr/007-*.md` through `docs/adr/011-*.md`
- Slice 1 manual guide: `.agents/manual-tests/github-actions-ci-cd/slice-01-ci-contract-and-readme-badges.md`
- Slice 2 manual guide: `.agents/manual-tests/github-actions-ci-cd/slice-02-quality-readiness.md`
- Slice 3 manual guide: `.agents/manual-tests/github-actions-ci-cd/slice-03-docker-build-readiness.md`
- Slice 4 manual guide: `.agents/manual-tests/github-actions-ci-cd/slice-04-advisory-security-readiness.md`

## Technical Roadmap

1. **DONE — #14 Establish shared Node setup and Tests/Build readiness**
   - Blocked by: none.
   - Delivers shared Node 22 setup, `Server Tests`, `Client Tests`, `Client Build`, initial CI Contract coverage and truthful Tests/Build badges.
2. **DONE — #15 Establish Quality readiness with Client Lint and Required CI Policy v1**
   - Blocked by: #14.
   - Delivers live `Client Lint`, fixed-SHA reusable `CI Policy v1`, versioned policy migration and the explicit same-repository residual-risk boundary.
   - Manual acceptance: Run #2 `PASSED`; final merge `d0a106f239a4947e4741fec4fc14505d3ff8e26e`.
3. **DONE — #16 Establish production Docker build readiness**
   - Blocked by: #14.
   - Delivers `Docker Build (server)` and `Docker Build (nginx)` with no push/deploy and contract-backed Node drift checks.
   - Manual acceptance: Run #2 `PASSED`; final merge `130931d4fc9d8baabec0d40f1434d5e26e8a8b8e`.
4. **IN_PROGRESS — #17 Add truthful Advisory Security workflow**
   - Blocked by: #14.
   - Delivers dependency audits, CodeQL, sanitized Gitleaks SARIF and license scans as truthful Advisory checks.
   - Implementation, hosted PR evidence and hosted main evidence completed.
   - Remaining: observe the real Monday `03:00 UTC` scheduled Security run and append TC-18 `PASS`.
5. **TODO-NEXT — #18 Remediate client lint baseline under the live check**
   - Blocked by: #15.
   - Delivers `.vite-cache/**` exclusion, fixes 17 real errors with TDD for hook defects and preserves warning budget `13`.
6. **TODO — #19 Prepare the Ruleset verification branch before final readiness merge**
   - Blocked by: #14; human-controlled checkpoint immediately before the final readiness merge.
   - Preserves a recorded behind branch for post-activation behavior verification without changing repository Settings.
7. **TODO — #20 Atomically activate and verify the seven-check main Ruleset**
   - Blocked by: #15, #16, #17, #18 and #19.
   - Performs one direct-Active activation, behind-branch verification and bounded one-correction rollback; human-controlled.

## Delivery Order

- Complete #14 first.
- After #14, #15, #16 and #17 may proceed as independent readiness slices; Security remains Advisory.
- While #17 waits for scheduled evidence, #18 may be developed on a separate branch but must not merge into `main` before TC-18 passes.
- Complete #18 only after the real `Client Lint` check from #15 exists.
- Create and preserve #19 at the approved checkpoint immediately before the final readiness merge.
- Begin #20 only after all seven Required check names have been observed, required readiness is green, lint remediation is verified and the behind branch exists.

## Required Checks

`Server Tests`, `Client Tests`, `Client Build`, `Client Lint`, `Docker Build (server)`, `Docker Build (nginx)`, `CI Policy v1`.

## Guardrails

- Slice #14 is complete; do not modify its locked acceptance criteria or history except append-only corrections.
- Slice #15 is complete; do not modify its locked acceptance criteria or history except append-only corrections.
- Slice #16 is complete; do not modify its locked acceptance criteria or history except append-only corrections.
- Slice #17 implementation and hosted PR/main evidence are complete; do not mark it DONE until scheduled TC-18 evidence passes.
- Slice #18 must use a separate branch from current `main` and a newly approved manual guide.
- Do not merge #18 into `main` before the Issue #17 scheduled Security run is observed.
- No commit, push, merge, branch creation or Ruleset change without explicit Developer authorization.
- Security jobs remain Advisory; `CI Policy v1` is Required.
- No `continue-on-error`, `pull_request_target`, mutable external Action refs, repository write permissions or hidden bypasses.
- Client lint remediation is separate from Quality readiness and must be verified by the live hosted check.
- Verification branch preparation is separate from atomic Ruleset activation.
- Optional staging remains **Deferred Capability — Pending Infrastructure Availability** and outside K2 completion.
