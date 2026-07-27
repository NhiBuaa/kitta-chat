# Next Session — K2 Slice 1 Tests/Build Readiness

## Target Slice

Issue #14 — [Establish shared Node setup and Tests/Build readiness](https://github.com/NhiBuaa/kitta-chat/issues/14).

Status: `IN_PROGRESS`; local TDD implementation and regression checks are green. GitHub-hosted/manual acceptance remains pending.

## Context

K2 Phase 3 was rebuilt after architecture review superseded the provisional six-check plan. Slice 1 now establishes only the shared Node runtime/setup, Tests/Build readiness, initial candidate CI Contract and truthful Tests/Build badges. Later slices own Client Lint, Required `CI Policy v1`, Docker, Advisory Security, lint remediation, verification-branch preparation and Ruleset activation.

## Objectives

1. Establish canonical Node major `22` and lockfile-aware shared host setup.
2. Expose stable `Server Tests`, `Client Tests` and `Client Build` checks for pull requests targeting `main` and pushes to `main`.
3. Establish public `test:ci` and `ci:validate` commands with positive and negative contract coverage for Slice 1.
4. Preserve read-only permissions, approved concurrency and immutable external Action refs.
5. Make Tests and Build README badges point truthfully to real workflows on `main`.
6. Obtain local and GitHub-hosted readiness evidence without secrets or stateful application services.

## Slice Verification Checklist

- Manual guide: [`.agents/manual-tests/github-actions-ci-cd/slice-01-ci-contract-and-readme-badges.md`](manual-tests/github-actions-ci-cd/slice-01-ci-contract-and-readme-badges.md)
- [x] Developer approved all test cases in `## [KHÓA] Kịch bản Kiểm thử` on `2026-07-27`.
- [x] `npm run test:ci` passes 21 fixture-based positive/negative contract tests under canonical Node 22.
- [x] `npm run ci:validate` passes against the repository state.
- [x] Server tests (`321/321`), client tests (`232/232`) and client production build pass locally.
- [ ] GitHub observes green `Server Tests`, `Client Tests` and `Client Build` checks on the approved PR/main evidence path.
- [ ] Manual guide reaches `Trạng thái mới nhất: PASSED` before Slice 1 is marked done.

## Guardrails

- Follow TDD RED → GREEN → REFACTOR after locked-test approval.
- Do not implement Client Lint, `CI Policy v1`, Docker or Security in Slice 1.
- Do not configure repository Settings or Ruleset.
- Do not create branches, commit, push or merge without explicit Developer authorization.
- Do not require local `.env`, GitHub secrets, MongoDB, Redis, RabbitMQ, registry credentials or provider credentials.
- Do not use `continue-on-error`, `pull_request_target`, mutable external Action refs, repository write permissions or hidden bypasses.
- Do not claim branch enforcement or staging/CD capability.

## Non-Goals

- Client lint readiness or lint remediation.
- Docker image build validation.
- Dependency, CodeQL, secret or license scanning.
- `CI Policy v1` trust-anchor implementation or policy migration.
- Verification branch creation, Ruleset activation, merge-policy changes or staging deployment.
