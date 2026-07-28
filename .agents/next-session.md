# Next Session — K2 Slice 5 Client Lint Remediation

## Completed Slice

Issue #17 — Add truthful Advisory Security workflow.

Status: `IN_PROGRESS`; implementation, hosted PR evidence and hosted main evidence are complete. TC-18 remains pending until the real scheduled Security run at Monday `03:00 UTC`.

Current main SHA: `5a3b9dc073703e0985a83455bd08c36d25c361b6`

Manual guide:

`.agents/manual-tests/github-actions-ci-cd/slice-04-advisory-security-readiness.md`

## Target Slice

Issue #18 — Remediate client lint baseline under the live check.

Status: `TODO-NEXT`; development may proceed on a separate branch while Issue #17 waits for scheduled evidence.

## Context

- Required `Client Lint` exists from Slice #15 but currently fails on the Issue #18 baseline.
- Issue #18 is independently unblocked by completed Slice #15.
- Issue #17 must not be marked `DONE` until scheduled Security evidence is observed.
- Issue #18 may be developed and opened as a draft PR, but must not merge into `main` before Issue #17 TC-18 passes.

## Objectives

1. Create and obtain approval for the Slice 5 manual guide before coding.
2. Reproduce the live `Client Lint` baseline.
3. Preserve the `.vite-cache/**` exclusion contract.
4. Fix the 17 real lint errors with TDD, especially hook defects.
5. Preserve the warning budget at exactly `13`.
6. Run local lint, server/client tests, build and CI Contract validation.
7. Obtain hosted PR evidence for `Client Lint`.
8. Do not merge Issue #18 before the Issue #17 scheduled Security run is observed.

## Verification Checklist

Expected manual guide:

`.agents/manual-tests/github-actions-ci-cd/slice-05-client-lint-remediation.md`

- `Client Lint` is green on the hosted PR.
- `Server Tests`, `Client Tests`, `Client Build`, Docker checks and `CI Policy v1` contracts remain unchanged.
- CI Contract and full regression are green.
- Issue #17 scheduled checkpoint remains preserved.

## Guardrails

- Branch Issue #18 from `main` SHA `5a3b9dc0`.
- Do not change `security.yml`, Security Advisory semantics, Ruleset or Settings.
- Do not remediate dependency, license, secret or CodeQL findings.
- Do not change the seven Required check names.
- Do not increase or bypass warning budget `13`.
- Do not use broad lint disables or `continue-on-error`.
- Do not modify outside the 17 lint errors and `.vite-cache/**` scope.
- Do not merge into `main` before Issue #17 TC-18 is `PASS`.
