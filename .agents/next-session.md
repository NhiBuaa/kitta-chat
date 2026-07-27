# Next Session — Prepare K2 Slice 3 Docker Build Readiness

## Completed Slice

Issue #15 — [Establish Quality readiness with Client Lint and Required CI Policy v1](https://github.com/NhiBuaa/kitta-chat/issues/15).

Status: `DONE`; manual guide Run #2 is `PASSED`. Baseline, support, correction and final caller were delivered through PRs #22–#26. Final merge is `d0a106f239a4947e4741fec4fc14505d3ff8e26e`.

Hosted `main` evidence:

- Tests run `30261255617`: `success`.
- Build run `30261255664`: `success`.
- Quality run `30261255778`: exact `CI Policy v1` and trusted baseline succeeded.
- `Client Lint` failed truthfully with the approved 17-error/13-warning readiness baseline; Issue #18 owns remediation.
- Repository Ruleset remains unchanged and inactive.

## Target Slice

Issue #16 — [Establish production Docker build readiness](https://github.com/NhiBuaa/kitta-chat/issues/16).

Status: `TODO-NEXT`; Slice 3 manual guide must be created and approved before implementation.

## Slice 3 Context

Slice #14 established shared Node setup plus Tests/Build readiness. Slice #15 established Client Lint readiness and the fixed-SHA `CI Policy v1` trust chain.

Slice #16 adds stateless production Docker packaging verification through two independent Required check names. It must validate image construction and Node-major alignment without publishing images, deploying, starting Docker Compose, or requiring stateful services and credentials.

## Slice 3 Objectives

1. Create and approve the Slice 3 locked manual test guide before implementation.
2. Add stable `Docker Build (server)` and `Docker Build (nginx)` check names.
3. Build the server production target and nginx-owned production frontend image through Buildx.
4. Use `linux/amd64`, plain progress, `push: false` and `load: false`.
5. Validate `.nvmrc` Node major against `server/Dockerfile` and the Node build stage in `nginx/Dockerfile`.
6. Ensure each in-scope Node builder logs its resolved `node --version`.
7. Extend CI Contract positive and negative coverage for Docker ownership, check names, no-push semantics and Node-major drift.
8. Obtain hosted pull-request and `main` evidence for both Docker checks.

## Slice Verification Checklist

Expected manual guide path:

[`.agents/manual-tests/github-actions-ci-cd/slice-03-docker-build-readiness.md`](manual-tests/github-actions-ci-cd/slice-03-docker-build-readiness.md)

The guide must be created during Session Start through Phase 1 of `playbooks/manual-testing.md`, expanded through `/test-craft`, and approved before Docker implementation begins.

## Slice 3 Entry Checklist

- [x] Slice #15 manual guide reached `PASSED`.
- [x] Exact `CI Policy v1` appeared and succeeded on pull request and `main`.
- [x] Client Lint readiness failure remains visible for Issue #18.
- [ ] Create the Slice 3 manual guide during Session Start.
- [ ] Expand Slice 3 cases across Data Shape, State, Async, UI and Security axes.
- [ ] Developer approves all Slice 3 locked test cases.
- [ ] Only after approval, begin TDD RED → GREEN → REFACTOR for Issue #16.

## Slice 3 Guardrails

- Do not write Slice #16 implementation before locked-test approval.
- Follow TDD RED → GREEN → REFACTOR after approval.
- Preserve all Slice #14 and Slice #15 checks and contracts.
- Build only `server/Dockerfile` and `nginx/Dockerfile`.
- Keep `client/Dockerfile` outside production validation and Node drift scope.
- Do not push or load Docker images.
- Do not authenticate to a registry or consume Docker secrets.
- Do not start Docker Compose, MongoDB, Redis, RabbitMQ or provider-dependent services.
- Do not use host-side `.github/actions/setup-node-env` inside Docker build jobs.
- Do not remediate Client Lint errors; Issue #18 owns remediation.
- Do not add Security workflows; Issue #17 owns Advisory Security.
- Do not create or modify repository Ruleset/Settings.
- Do not create branches, commit, push or merge without explicit Developer authorization.
- Do not use `continue-on-error`, `pull_request_target`, mutable external Action refs, repository write permissions or hidden bypasses.

## Slice 3 Non-Goals

- Docker image publication or registry authentication.
- Docker Compose or runtime integration smoke testing.
- Development-only `client/Dockerfile` validation.
- Security, dependency, CodeQL, secret or license scanning.
- Client lint remediation or warning reduction.
- Verification branch preparation.
- Ruleset activation or merge-policy changes.
- Staging or production deployment.
