# Issue #81 Review Package

## Fixed point

- Review base: `2860ccfe4a35d346a61cdc392f8cc7a8ca147324`.
- Review target: final remediation fixed point on 2026-08-12, before commit.
- Worktree state: implementation remains uncommitted in the dedicated K4 worktree; no unrelated changes were introduced.
- Immutable diff commands:

  ```powershell
  git diff HEAD -- .gitignore package.json .agents/CONTEXT.md .agents/current-session.md .agents/next-session.md docs/adr/README.md
  git diff --no-index -- NUL docker-compose.k4.yml
  git diff --no-index -- NUL scripts/k4/cli.js
  git diff --no-index -- NUL scripts/k4/lifecycle.js
  git diff --no-index -- NUL scripts/test/k4/lifecycle.test.cjs
  ```

## Pinned artifacts

| Artifact | SHA-256 |
| --- | --- |
| `.gitignore` | `5d128dece3f53fc9e20565c645ec277652a2b9bb9a28b777c0cd6538feab5c0b` |
| `package.json` | `a0e1c07ded9be791f1f29c41653d3423c74c8f478290b05833f34ab22efca09f` |
| `docker-compose.k4.yml` | `17ca818ae2fcb88ab5ebda1cfc5433ad3b28510f26c4a839c1ec7d9ba54f1d84` |
| `scripts/k4/cli.js` | `96b754b0d82198e57813b2fc3990094f8c4678ea69ccae0b54e33b6e9069dbd7` |
| `scripts/k4/lifecycle.js` | `419d8790fdf64fd44076f88e1c8bc079292db0900d84c691a59702fe1e8ae536` |
| `scripts/test/k4/lifecycle.test.cjs` | `6be00f1d9dbaa99987c68db68f3266b5a10a20e7496cc381a14bf71d10709797` |
| `docs/adr/015-k4-performance-evidence-boundary.md` | `600cacb2295e634b8b447b24bd09daee386cb1c0c19136ffc8fdfc3e667e6e8f` |
| Locked guide `k4-issue-81-r4` | `5308a210b2b19c38ba0aae8ab95ffea116d7a494b1f814d3678cc5f445a56b21` |
| r4 Evaluation history | `7debb1cf9ea8a19a5682bde3f1f57d34d408587a003c0cae71da724eff45e875` |

## Architecture and seams

- `scripts/k4/lifecycle.js` owns run-plan creation, exact project/run ownership labels, topology comparison, Docker target inspection, cleanup preview/digest, exact-target validation, and cleanup execution.
- `scripts/k4/cli.js` is the public thin adapter for `resolve`, `compare`, `diagnose-runner`, `start`, `cleanup-preview`, `validate-cleanup-target`, and `cleanup`.
- `docker-compose.k4.yml` defines an isolated K4 Compose project with run-labelled dependencies, named volumes, no host ports, a pinned-version Node runner, and an internal nginx workload target.
- `scripts/test/k4/lifecycle.test.cjs` covers plan labels, comparison allowlist, ownership selection, target validation, runner restrictions, dependency health gates, and correct Docker inspection commands.

The seam keeps K4 lifecycle concerns inside one cohesive module and presents a small CLI surface. The intended rationale is that every destructive target is re-resolved from exact K4 project/run labels and the confirmation digest binds the deletion set immediately before cleanup.

## Remediation evidence

- Compose canonicalization sorts object/map keys only; all arrays preserve order. Explicit run-scoped normalization covers only approved identity paths.
- Sensitive named values and credential-bearing URI user-info use domain-separated HMAC-SHA256 fingerprints; raw values and comparison key are not emitted.
- Baked nginx config is copied from `/etc/nginx/nginx.conf` in a temporary container created from the exact immutable image; the container image ID is checked before fingerprinting. Missing/stale attestation fails closed.
- Image identity validation requires exact `sha256:` plus 64 lowercase hexadecimal characters.

## Ownership and cleanup evidence

- `cleanupPreview` lists only resources with `io.kittachat.k4.project=kittachat-k4` and the exact requested `io.kittachat.k4.run_id`.
- `cleanup` recomputes the preview and requires its SHA-256 digest before removing containers, networks, volumes, and an owner-marked result directory.
- Strict-digest acceptance run `tc81digest-single` proved current-run removal after digest `f668d0d34d47d957d315efb4d47f21d11a6508d9e58af0211f5b3204cf225549`.
- Foreign-K4/different-run and non-K4 sentinels survived unchanged for all four destructive classes, including filesystem result-directory files. The unresolved earlier container-sentinel disappearance observation is retained without a causal claim.

## Topology-equivalence evidence

`k4 compare` returned `COMPARABLE` with only `backend_replica_count` and `backend_upstream_membership` allowlisted. The unit suite also exercises a runner-image mismatch as `NON-COMPARABLE`.

## Verification and acceptance

- `node --test scripts/test/k4/*.test.cjs` — 34 passed, 0 failed.
- `npm run test:ci` — 122 passed, 0 failed.
- `npm run ci:validate` — exit 0.
- The append-only Evaluation history now includes `tc81digest-v1`, recording `PASSED` for TC-81-01 through TC-81-04. TC-81-05 was not run because it is conditional/non-blocking.

## Review result and deviations

Machine verdict: `APPROVE` (`critical: 0`, `major: 0`). Standards and Spec axes found no remaining deviations from Issue #80, Issue #81, ADR-015, or locked r4.

Issue #81 remains open and Issue #82 remains blocked pending explicit tracker-state actions. No TC-81-05 execution is required.
