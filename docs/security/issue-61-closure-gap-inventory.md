# Issue #61 Closure-Gap Inventory

## Scope and status

Planning-only inventory. Public-demo/deployment is a separate parked workstream. `B = 0` does not make Issue #61 globally blocked; it only prevents use of retained/runtime evidence where that evidence is genuinely required.

States are: `DONE`, `FOLLOW-UP`, `FOLLOW-UP REQUIRED`, `BLOCKED`, and `UNRESOLVED`. The approved rate-limit implementation is now recorded as `DONE`; this is source/test completion, not Issue #61 closure. The closure-requirement column prevents planning candidates from silently becoming closure requirements.

| # | Requirement or material finding group | State | Closure requirement | Completed evidence | Remaining action | Runtime evidence | Closure blocker |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Scanner truthfulness | DONE | REQUIRED FOR ISSUE #61 CLOSURE | Workflow retains audit, CodeQL and redacted-Gitleaks failure semantics | Preserve through later work | No | No |
| 2 | Rate-limit architecture/class, identity and algorithm planning | DONE | REQUIRED FOR ISSUE #61 CLOSURE | Policy, key, failure-mode and atomicity artifacts approved | Select closure-minimum enforcement subset | No | No |
| 3 | Level 1 measurement design and retained-evidence stop | DONE | OPTIONAL / FUTURE HARDENING | Privacy design and `B = 0` record complete | Keep evidence boundary | No | No |
| 4 | Level 2A call-only code/test implementation | DONE | OPTIONAL / FUTURE HARDENING | 397 manifest maximum, 493 outer ceiling, tests accepted | Keep disabled/inert | No | No |
| 5 | Per-alert CodeQL disposition | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Current inventory is 99 open alerts; Tranche 1 source fixes are test-verified but not scanner-confirmed | Evidence-backed disposition for every alert and CodeQL rerun for Tranche 1 | No | Yes |
| 6 | Sanitized Gitleaks disposition | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Seven rows are triaged from sanitized alert metadata: 2 test-path candidates and 5 uncertain historical credential-path findings | Narrow per-alert disposition; no broad exception | No | Yes |
| 7 | Credential classification | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Sanitized triage records #1–#5 as `UNCERTAIN — credential review authorization required`; no value was inspected | Human credential-review/rotation gate only for uncertain findings | No | Yes |
| 8 | Credential rotation/revocation | BLOCKED | CONDITIONAL ON MAINTAINER RISK DECISION | No credential has been classified real/uncertain yet | Open rotation gate only for real/uncertain findings | No | Conditional |
| 9 | Backend polynomial ReDoS | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Deterministic 254-character validation and focused/regression tests implemented for CodeQL #97 | CodeQL rerun/alert confirmation | No | Yes |
| 10 | Client overly-large regex range | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Intentional disjoint Latin/Vietnamese range and focused client tests implemented for CodeQL #26 | CodeQL rerun/alert confirmation | No | Yes |
| 11 | Tainted log formats | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Fixed structured logger events and adversarial data-position tests implemented for CodeQL #7–#9 | CodeQL rerun/alert confirmation | No | Yes |
| 12 | Stack/error exposure | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Fixed `INTERNAL_ERROR` boundaries and controller failure tests implemented for CodeQL #27–#28 | CodeQL rerun/alert confirmation | No | Yes |
| 13 | CORS origin policy | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Shared exact-origin policy, fail-safe config, HTTP/Socket tests implemented for CodeQL #6 | CodeQL rerun/alert confirmation | No | Yes |
| 14 | GitHub Dependabot advisory source | UNRESOLVED — source unavailable / not applicable under current authorization | OPTIONAL / FUTURE HARDENING | Endpoint reports disabled/insufficient access; npm audit remains applicable | Do not request access; use package-manager evidence | No | **No** |
| 15 | Dependency vulnerability baseline | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | D2 minimal dependency/manifest tranche is verified/accepted; D4 verifies `uuid@13.0.2`, `mongoose@9.7.2`, `sharp@0.35.3`, and `nodemailer@9.0.5` remediation. D5/D6/D8 dev/build and AWS XML remediations are verified/accepted: root audit is clean; client has 17 residuals (2 critical, 2 high, 5 moderate, 8 low); server has 15 residuals (2 critical, 3 high, 9 moderate, 1 low), with 14 under omit-dev (2 critical, 2 high, 9 moderate, 1 low). | Complete separately authorized dispositions/remediation for residual direct/runtime and dev/build paths; do not treat Firebase non-Auth service-unreached dispositions as a fix for runtime-reachable `firebase-admin` Auth. | No | Yes |
| 16 | License baseline | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Root/client/server license checks exit 1 | Package-by-package policy disposition | No | Yes |
| 17 | Query/input validation alerts | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Nine no-remediation candidates (#12–#17, #21–#23); Q2-A/Q2-D source/test remediations with scanner pending (#10–#11, #18–#20, #24–#25). Q2-D preserves Model A virtual direct pairs and adds a canonical direct-ID boundary before permission/overview/presence work; Redis structural injection and cache bypass are disproved. | Obtain CodeQL/scanner confirmation for #10–#11, #18–#20, #24–#25 | No | Yes |
| 18 | Distributed rate-limit enforcement | DONE | REQUIRED FOR ISSUE #61 CLOSURE | Exact 27-point R1 baseline is implemented with Redis-shared Lua/EVAL admission, same-slot key proof, no in-memory fallback, and approved HTTP/Socket failure contracts; retained R2 command executes the four mandatory Redis tests plus real-Redis two-client concurrency proof against standalone and native three-primary Redis OSS 7.0.0 with no skips | Preserve through coordinated deployment and final scanner/closure accounting; no deployment is authorized by this slice | No | No |
| 19 | Rate-limit numeric candidates | DONE | REQUIRED FOR ISSUE #61 CLOSURE | Maintainer selected R1 baseline `A`; all 27 exact intentional-security values/contracts are approved and `B = 0` remains | Preserve values; do not alter them during implementation | No | No |
| 20 | Level 2A enablement/collection/analysis | BLOCKED | OPTIONAL / FUTURE HARDENING | Code/test implementation is accepted | D2/C1/A1 only if later useful | Yes | No |
| 21 | Level 2B identity/linkage | BLOCKED | OPTIONAL / FUTURE HARDENING | Explicitly excluded from Level 2A | Separate purpose authorization | Yes | No |
| 22 | Target-wide buckets, reset subject and actor-callee secondary | BLOCKED | OPTIONAL / FUTURE HARDENING | Fairness/lockout risks documented | Explicit threat/fairness decision if ever needed | Possibly | No |
| 23 | `read_bounded` | DONE | NOT ENFORCED BY DESIGN | Taxonomy-only/no application bucket disposition | Preserve unless later explicitly changed | No | No |
| 24 | M1 message write access control | FOLLOW-UP REQUIRED | CONDITIONAL ON MAINTAINER RISK DECISION | Dedicated follow-up assigned in planning; no ID | Choose closure option A/B/C and, for B, create stable ID | No | Conditional |
| 25 | M2 message-history authorization/data disclosure | FOLLOW-UP REQUIRED | CONDITIONAL ON MAINTAINER RISK DECISION | Dedicated follow-up assigned in planning; no ID | Choose closure option A/B/C and, for B, create stable ID | No | Conditional |
| 26 | Reset-token credential-in-URL/log exposure | FOLLOW-UP REQUIRED | CONDITIONAL ON MAINTAINER RISK DECISION | Dedicated follow-up assigned; historical occurrence unverified | Choose closure option A/B/C and, for B, create stable ID/risk owner | No | Conditional |
| 27 | Operational endpoint exposure | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Current source exposes `/ops` without application authentication; repository configuration may proxy it | Separate operational-endpoint closure gate: source/topology disposition or explicit risk decision | No | Yes |
| 28 | Final scanner/dependency/license verification | UNRESOLVED | REQUIRED FOR ISSUE #61 CLOSURE | Current baseline remains unclean | Rerun after approved remediations | No | Yes |
| 29 | Final remaining-risk/closure record | BLOCKED | REQUIRED FOR ISSUE #61 CLOSURE | Deferred risks preserved in rules | Maintainer closure decision with owners/dispositions | No | Yes |

Counts: **DONE 7; FOLLOW-UP 0; FOLLOW-UP REQUIRED 3; BLOCKED 4; UNRESOLVED 15; total 29.**

## Tranche 1 remediation overlay

The five Tranche 1 rows (#9–#13) cover eight CodeQL alerts and are **remediation complete at source/test level; scanner confirmation pending**. They remain `UNRESOLVED` in the primary 29-row state count because the required per-alert CodeQL disposition is not yet scanner-confirmed. This overlay is not a sixth primary state and does not increase `DONE`.

- Source/test remediation complete: **5 finding groups / 8 alerts**.
- CodeQL-confirmed final dispositions: **0 of those 8 alerts**.
- `/ops`, M1/M2/reset, query alerts, Gitleaks, dependency/license, rate-limit minimum and all other closure rows are unchanged.

## Dependabot clarification

Issue #61 requires dependency inventory from root/client/server package surfaces; it does not name GitHub Dependabot as the required source. Package-manager audits and lockfile review are applicable evidence. Therefore row 14 is `UNRESOLVED — source unavailable / not applicable under current authorization`, not a closure blocker. This does not establish that dependencies are safe: row 15 remains unresolved.

## Mandatory versus future boundary

- Required closure work: evidence-backed alert dispositions; credential triage; high-confidence CodeQL remediation; dependency/license disposition; query matrix; approved closure-minimum rate-limit implementation (now source/test complete); operational endpoint disposition; final verification/risk record.
- Optional/future work: Level 2A collection, Level 2B, target-wide buckets, actor-callee controls, optional reset-subject control and measurement-dependent tuning.
- Conditional work: rotation only after credential triage; M1/M2/reset closure outcome only after an A/B/C maintainer decision. The R1 numeric baseline is no longer conditional; implementation is separately gated.

`measurement-required in a planning proposal != automatically required for Issue #61 closure`. A maintainer may approve intentional baseline hardening with known compatibility risk, or remove optional candidates from closure scope; neither action is made by this inventory.

## D4 accepted remediation overlay

- Client `uuid@13.0.2`: `REMEDIATED / VERIFIED BY SOURCE-TEST-AUDIT EVIDENCE`.
- Server `mongoose@9.7.2`: `REMEDIATED / VERIFIED BY SOURCE-TEST-AUDIT EVIDENCE`.
- Server `sharp@0.35.3`: `REMEDIATED / VERIFIED BY NATIVE-SOURCE-TEST-AUDIT EVIDENCE`. Native worker-contract tests decode representative PNG/JPEG fixtures, retain the chat `width: 1920` / `withoutEnlargement: true` behavior, retain avatar `256x256` / `fit: cover`, validate real WebP output/metadata, and reject malformed input before output upload. The production `node:22-alpine` image fresh-installs Sharp and its `@img/sharp-linuxmusl-x64@0.35.3` prebuilt dependency.
- This overlay does not grant a license disposition. Row 16 remains `UNRESOLVED`.
- The Sharp conclusion covers repository-represented server and image-worker containers only. External worker deployments not represented by repository evidence remain outside it.

## D4 accepted Nodemailer remediation overlay

- `nodemailer@9.0.5`: `REMEDIATED / VERIFIED BY SOURCE-TEST-AUDIT EVIDENCE`. The service-based transport, basic user/password configuration, reset-email `sendMail({ from, to, subject, html })` payload, success result, failure propagation, queue behavior and full server regression are covered without sending real SMTP mail.
- Runtime-owner fact: there are currently no deployed environments; the project runs locally only. Therefore the prior blocker is `DEPLOYED SMTP TLS CONTRACT — NOT APPLICABLE / NO DEPLOYED ENVIRONMENT`. This is not evidence that any future production SMTP TLS contract is valid.
- Before the first deployment that can send email, the deployment owner must verify the SMTP endpoint/port/TLS certificate and confirm there is no invalid, self-signed, expired, hostname-mismatched TLS dependency or verification bypass.
- This overlay does not grant a license disposition. Row 16 remains `UNRESOLVED`.

## D5 accepted dev/build remediation overlay

- `D5 SAFE DEV/BUILD REMEDIATION — VERIFIED / ACCEPTED`: root license-tooling `brace-expansion@2.1.4`; client Vite `7.3.5`, direct PostCSS `8.5.26`, Rollup `4.62.4`, Picomatch `4.0.5`, ESLint-chain safe resolutions, and server test-only `engine.io-client@6.6.6` are fresh-install, graph, build/test, Docker, audit, lint and diff-verified.
- The shared `nanoid@3.3.18` resolution is accepted under the D5 amendment: it satisfies direct PostCSS `^3.3.17` and `styled-components -> postcss@8.4.49` `^3.3.7`. This does not authorize a direct Nanoid dependency or a Styled Components upgrade.
- Server `nodemon@3.1.14 -> minimatch@10.2.3 -> brace-expansion@5.0.9`: `REMEDIATED / VERIFIED BY GRAPH-TEST-AUDIT EVIDENCE`. Nodemon remains dev-only. At acceptance time, this resolved `5.0.9` entry was outside the live npm-audit vulnerable range; this is dev-tool evidence, not production-runtime remediation, and the production omit-dev graph was already unaffected.
- Server `license-checker-rseidelsohn@4.4.2 -> read-installed-packages -> read-package-json -> glob@10.5.0 -> minimatch@9.0.9 -> brace-expansion@2.1.4`: `REMEDIATED / VERIFIED BY GRAPH-TEST-AUDIT EVIDENCE`. The nested chain remains dev-only. At acceptance time, this resolved `2.1.4` entry was outside the live npm-audit vulnerable range; this is dev-tool evidence, not production-runtime remediation, and the production omit-dev graph was already unaffected.
- Server `@aws-sdk/client-s3@3.1021.0 -> @aws-sdk/core@3.973.26 -> @aws-sdk/xml-builder@3.972.19 -> fast-xml-parser@5.7.1 -> fast-xml-builder@1.1.7`: `REMEDIATED / VERIFIED BY GRAPH-SOURCE-TEST-AUDIT EVIDENCE`. The parser node is also consumed by optional Firebase Storage metadata, without activating that service or changing its accepted service-unreached disposition. Package-owned closure is `@smithy/types@4.16.1`, `path-expression-matcher@1.6.2`, `strnum@2.4.1`, `@nodable/entities@2.2.0`, and `anynum@1.0.1`; no exploit reproduction is claimed.
- Current Row 15 accounting remains `UNRESOLVED`: root audit clean; client has 17 residuals (2 critical, 2 high, 5 moderate, 8 low); server full tree has 15 residuals (2 critical, 3 high, 9 moderate, 1 low) and omit-dev has 14 (2 critical, 2 high, 9 moderate, 1 low).
- Current Critical/High inventory is: client `protobufjs`/`websocket-driver` (critical, accepted not-shipped Firebase branches), `@grpc/grpc-js` (high, accepted not-shipped Firestore branch), and `styled-components -> postcss` (high, accepted installed-only/not-shipped disposition); server `protobufjs`/`websocket-driver` (critical, accepted Firebase service-unreached), `@grpc/grpc-js`/`form-data` (high, accepted Firebase service-unreached), and `picomatch` (high, dev-only). Root has no findings. `fast-xml-parser`, `fast-xml-builder`, and `nodemailer` are absent from the current server audit after their accepted remediations.
- D7 decision `B`: client `styled-components@6.3.12 -> postcss@8.4.49` is retained as `INSTALLED ONLY / NOT SHIPPED` with `NO CURRENT RUNTIME REMEDIATION REQUIRED`. The production bundle contains Styled Components runtime but not the nested PostCSS module; a future parent upgrade remains a separate compatibility decision.
- Remaining D5-adjacent findings include the current Vite-owned `esbuild` path and the explicitly excluded Vite-polyfill/build-browserify chain. They require separate decisions; this overlay does not remediate them.

## Read-only triage references

- Query/input source-to-sink matrix: `docs/security/issue-61-query-alert-source-to-sink-matrix.md`.
- Sanitized Gitleaks matrix: `docs/security/issue-61-gitleaks-sanitized-triage.md`.
- Primary state counts remain unchanged after this triage: neither source-to-sink classification nor sanitized credential classification is remediation, scanner confirmation, rotation, a dismissal, or a final disposition.
