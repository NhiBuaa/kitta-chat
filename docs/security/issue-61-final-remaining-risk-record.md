# Issue #61 Final Remaining-Risk Record

## Proposed closure disposition

`ISSUE #61 — READY TO CLOSE: ALL MANDATORY CLOSURE REQUIREMENTS ARE ACCOUNTED; ACCEPTED RESIDUAL RISKS AND EVIDENCE LIMITATIONS RETAINED.`

This record is an approved closure record. It does not close Issue #61, dismiss any scanner alert, change a dependency, or grant future deployment/measurement authorization.

## Mandatory closure result

All mandatory closure rows are complete: scanner truthfulness, alert dispositions, credential facts, dependency/license accounting, rate-limit enforcement, message access control, reset-token transport/logging remediation, `/ops` boundary, and final verification.

Row 29 is complete. Rows 20–22 are future hardening and are not Issue #61 closure blockers.

## Accepted residual risks and dispositions

| Area | Retained disposition / obligation |
| --- | --- |
| Dependency residuals | Root audit is `0`; client `16` and server `7` residuals are individually accounted. Firebase/Styled Components and node-stdlib/browserify paths retain their approved installed/not-shipped or service-unreached dispositions. Babel/Ajv remains `INSTALLED / DEV-BUILD ONLY / NOT SHIPPED — NO CURRENT RUNTIME REMEDIATION REQUIRED`, maintainer-owned, review by `2026-11-11`. |
| License residuals | L3 package-level policy reconciles scanner output 1:1. Compound SPDX expressions remain intact; Spark MD5 retains MIT compliance basis; Sharp/LightningCSS scoped reopen triggers remain binding. `client@0.0.0 — UNLICENSED` remains separate project metadata, not a third-party finding. |
| CodeQL #173 | `SAFE BOUNDARY / NO-REMEDIATION — EXISTING CANONICAL RATE LIMIT`; reset completion is admitted by the existing `auth_recovery_complete` Redis policy before controller work. This is not described as fixed. |
| CodeQL #174–#177 | `SAFE BOUNDARY / NO-REMEDIATION — CODEQL CUSTOM-MIDDLEWARE VISIBILITY LIMITATION`; each message route has one verified-principal admission between auth and controller using the approved route-specific Redis policy pair. These alerts remain open and are not described as fixed or dismissed. |
| Gitleaks #1–#5 | #1–#3 and #5: `REAL / REVOKED`; #4: `HISTORICAL / NO LONGER USED`. Classification rests on maintainer-supplied provider/owner facts; no secret value was read, no blind rotation occurred, and no assertion is made about historic log access. |
| Gitleaks #102–#103 | `SYNTHETIC / TEST-ONLY — NO ROTATION REQUIRED`, based on tracked test ownership and fixture reachability. |
| Historical reset-token exposure | Source/config exposure was remediated. Historical occurrence, retention and access were not inspected; the record does not claim that a historic token was retained or accessed. |

## Evidence limitations retained at closure

- CodeQL evidence is merge-ref evidence, not direct analysis of the branch head: `MERGE-REF ANALYSIS / HEAD-SOURCE SUBSET WITH ADDITIVE MERGE-ONLY K4 DELTA`. Analysis `1605443353` indexed merge `5e4f881…` on `refs/pull/90/merge`; exact covered immutable source SHA: `54e902fcb6666c4ed03eb818fdff3ab10d4715e5`. Across 418 CodeQL-relevant blobs, the only delta was an additive K4 CLI/lifecycle/test set plus an opt-in `package.json` script; no dependency, lockfile, runtime, security-source, CodeQL workflow, or extraction/build configuration delta was found. Final closure-record commit SHA is recorded in the inventory after commit creation; its delta from the covered source is documentation/evidence only.
- The GitHub Security workflow's audit/license/Gitleaks jobs continue to fail for already-accounted advisory residuals. CodeQL engine success is independent evidence; workflow aggregate failure is not represented as a clean security workflow.
- Local current-source Gitleaks scan was sanitized and clean. The linked-worktree container could not run a full-history `git` scan because its Git administrative metadata was outside the read-only mount; historical classifications rely on the prior sanitized GitHub scan and maintained disposition record.
- A prior L3 server-suite failure was non-reproduced and not attributed to L3; the original failure output was truncated and unrecoverable. The retained final evidence is the durable successful serial rerun, not a claim that the original failure cause is known.
- Local nginx executable is unavailable; nginx validation used the production Compose/container `nginx -t` path.
- No deployed production environment, hosted-log inspection, or behavioral measurement evidence was established. `B = 0` and raw auth/recovery-log quarantine remain in force.

## Future hardening, non-blocking

| Rows | Status | Boundary |
| --- | --- | --- |
| 20 | Level 2A enablement/collection/analysis blocked | Implementation remains disabled/inert. D2/C1/A1 require future target binding and authorization. |
| 21 | Level 2B identity/linkage blocked | Requires separate privacy/purpose design and approval. |
| 22 | Target-wide buckets, reset subject, actor-callee secondary blocked | Requires separate threat, fairness and numeric-policy approval. |
| 14 | Dependabot source unavailable / not applicable | Package-manager audit remains the accepted dependency source. |

No future-hardening row may be implied by this closure proposal.
