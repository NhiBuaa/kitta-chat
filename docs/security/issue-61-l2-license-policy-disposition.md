# Issue #61 L2 — Row 16 Package-Level License Policy Disposition

## Scope and decision boundary

This is a package-level decision record for the **23 third-party package/expression groups** reported by the current root, client, and server license inventories, plus one separate client project-metadata item. It deliberately does **not** change the allowlist, checker, dependency graph, manifest, lockfile, or production artifact. It also does not reopen Row 15.

`ACCEPT`, `REJECT`, and `NEEDS LEGAL REVIEW` are package-level policy dispositions, not checker exceptions. Every package group below is therefore accounted for, but Row 16 remains `UNRESOLVED` and the existing checks must continue to fail until an authorized enforcement slice follows the recorded decisions.

The exact SPDX expression is preserved verbatim. An `AND` expression is not simplified. The sole compliance-basis election recorded in this matrix is for `spark-md5`: `(WTFPL OR MIT)` remains the reported expression and the legal/policy owner selects `MIT` as its compliance basis.

Default owner for this initial review record: `NhiBuaa` (maintainer/legal-decision coordinator). Review date: `2026-11-11`.

## L2.1 decision rule

The maintainer accepts the narrow package groups marked `ACCEPT` only at their recorded reachability. For any future distribution of an accepted package or its covered material, the release owner must first verify the package license material and retain the required license/notice text. This does not authorize a broad license-family exception, does not certify present distribution compliance, and must be re-reviewed if the recorded reachability changes. The primary-source basis is recorded in `docs/security/issue-61-l2-1-license-decision-primary-source-evidence.md`.

L2.2 records the legal/policy-owner resolution of all rows that had remained `NEEDS LEGAL REVIEW`. Its per-row obligations and reopen triggers appear in the matrix; it does not modify scanner configuration or create an enforcement exception.

## Third-party package disposition matrix

| Surface | Exact SPDX expression | Package group (exact versions) | Reachability | Applicable obligation / policy rationale to be reviewed | Disposition | Owner | Review date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Root | `BlueOak-1.0.0` | `jackspeak@3.4.3`, `minipass@7.1.3`, `package-json-from-dist@1.0.1`, `path-scurry@1.11.1` | Dev-only root license-tooling dependency path; not shipped by client/server runtime artifacts. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Root | `CC-BY-3.0` | `spdx-exceptions@2.5.0` | Dev-only root license tooling; not shipped. | Accepted. If licensed material is redistributed, retain required attribution and license/warranty notices. Reopen on any redistribution. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Root | `CC0-1.0` | `spdx-license-ids@3.0.23` | Dev-only root license tooling; not shipped. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Root | `(MIT AND CC-BY-3.0)` | `spdx-ranges@2.1.1` | Dev-only root license tooling; not shipped. | Accepted without simplifying `AND`; comply with MIT notice retention and CC-BY-3.0 attribution/license obligations if licensed material is redistributed. Reopen on redistribution. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `Python-2.0` | `argparse@2.0.1` | ESLint → eslintrc → js-yaml dev-only path; absent from production bundle. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `CC-BY-4.0` | `caniuse-lite@1.0.30001760` | Autoprefixer/Babel build-only path; not shipped as a client runtime module. | Accepted. Attribute Caniuse and retain/license-reference obligations if licensed material is redistributed. Reopen if the build output or material is determined to redistribute licensed Caniuse material. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `BlueOak-1.0.0` | `jackspeak@3.4.3`, `minipass@7.1.3`, `package-json-from-dist@1.0.1`, `path-scurry@1.11.1` | Client tooling/dev-only; not shipped. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `MPL-2.0` | `lightningcss@1.30.2`, `lightningcss-win32-x64-msvc@1.30.2` | Vite/Tailwind build-only; the Windows binary is optional and not a production runtime artifact. | Accepted for current build-only use. Reopen before any LightningCSS code or binary is distributed; then assess MPL covered-file, notice, and source obligations. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `(MIT AND Zlib)` | `pako@1.0.11` | D10 node-stdlib/Browserify development-build chain; not present in production bundle. | Accepted as a non-shipped build dependency; retain obligations of both components if future distribution changes this reachability. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `(MIT AND BSD-3-Clause)` | `sha.js@2.4.12` | D10 crypto/Browserify development-build chain; not present in production bundle. | Accepted as a non-shipped build dependency; retain obligations of both components if future distribution changes this reachability. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `(WTFPL OR MIT)` | `spark-md5@3.0.2` | Direct browser runtime dependency; shipped/reachable in the client runtime. | Accepted with `MIT` explicitly selected as the compliance basis; retain the MIT license/notice obligation for distributed client artifacts. The reported SPDX expression remains unchanged. Reopen if the package license expression or distribution model changes. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `CC-BY-3.0` | `spdx-exceptions@2.5.0` | Client dev tooling; not shipped. | Accepted. If licensed material is redistributed, retain required attribution and license/warranty notices. Reopen on any redistribution. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `CC0-1.0` | `spdx-license-ids@3.0.23` | Client dev tooling; not shipped. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Client | `(MIT AND CC-BY-3.0)` | `spdx-ranges@2.1.1` | Client dev tooling; not shipped. | Accepted without simplifying `AND`; comply with MIT notice retention and CC-BY-3.0 attribution/license obligations if licensed material is redistributed. Reopen on redistribution. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `(Apache-2.0 AND LGPL-3.0-or-later AND MIT)` | `@img/sharp-wasm32@0.35.3` | Optional Sharp platform artifact; not selected by the `node:22-alpine` Linux-musl production target. | Accepted only for the current Linux-musl production target, which does not ship this WASM artifact. Reopen before the first WASM distribution and assess all Apache-2.0, LGPL-3.0-or-later, and MIT obligations without simplifying `AND`. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `(Apache-2.0 AND LGPL-3.0-or-later)` | `@img/sharp-win32-x64@0.35.3` | Optional Windows Sharp artifact; not selected by the current production target. | Accepted only for the current Linux-musl production target, which does not ship this Windows artifact. Reopen before the first Windows distribution and assess all Apache-2.0 and LGPL-3.0-or-later obligations without simplifying `AND`. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `BlueOak-1.0.0` | `lru-cache@11.5.2` | Indirect Firebase Admin Auth runtime dependency; production-reachable when that accepted service path is used. | Accepted subject to the L2.1 notice-retention rule for any distributed server artifact. This is a license review only; it does not reopen Firebase security disposition. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `BlueOak-1.0.0` | `minimatch@10.2.3` | Nodemon dev-only path; absent from `--omit=dev` production install. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `BlueOak-1.0.0` | `jackspeak@3.4.3`, `minipass@7.1.3`, `package-json-from-dist@1.0.1`, `path-scurry@1.11.1` | License tooling and/or optional Firebase Storage/Firestore branch paths; not part of the current deployed server runtime target. | Accepted under the L2.1 notice-retention rule at this non-target reachability. This does not reopen the accepted Firebase service-reachability disposition. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `MIT-0` | `nodemailer@9.0.5` | Direct server runtime dependency; production-reachable for reset-email delivery. | Accepted subject to verification of package license material before distribution; MIT-0 itself has no attribution condition. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `CC-BY-3.0` | `spdx-exceptions@2.5.0` | Server dev tooling; absent from `--omit=dev` production install. | Accepted. If licensed material is redistributed, retain required attribution and license/warranty notices. Reopen on any redistribution. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `CC0-1.0` | `spdx-license-ids@3.0.23` | Server dev tooling; absent from `--omit=dev` production install. | Accepted as non-shipped development tooling under the L2.1 notice-retention rule. | `ACCEPT` | NhiBuaa | 2026-11-11 |
| Server | `(MIT AND CC-BY-3.0)` | `spdx-ranges@2.1.1` | Server dev tooling; absent from `--omit=dev` production install. | Accepted without simplifying `AND`; comply with MIT notice retention and CC-BY-3.0 attribution/license obligations if licensed material is redistributed. Reopen on redistribution. | `ACCEPT` | NhiBuaa | 2026-11-11 |

## Project metadata — separate from third-party findings

| Surface | Exact reported value | Subject | Reachability | Disposition | Owner | Review date | Required decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Client | `UNLICENSED` | `client@0.0.0` private project metadata | Project package metadata; not a third-party dependency or package-license finding. | `ACCEPT` | NhiBuaa | 2026-11-11 | Accepted as intentional private-package metadata. Re-review before package publication or a project-license change; do not implement a manifest change in L2.1. |

## Accounting and future enforcement gate

All **23** current third-party non-allowlisted package/expression groups and the separate client metadata item now have an explicit L2.2 disposition: **23 third-party `ACCEPT`**, **0 `REJECT`**, **0 `NEEDS LEGAL REVIEW`**, and the project-metadata item is `ACCEPT`. No policy exception has been created. Therefore **Row 16 remains `UNRESOLVED`** pending a separately authorized enforcement gate.

The next permissible work is the following separately authorized enforcement gate:

> `L3 — Row 16 approved license-decision enforcement`

L3 must be a separate, narrowly approved CI-enforcement gate. It must (1) freeze the reviewed package/version/exact-expression evidence and the `spark-md5` MIT compliance-basis selection; (2) preserve every reported SPDX expression verbatim in the decision record; (3) introduce a repository-owned machine-readable package-policy manifest keyed by `surface`, `package@version`, and exact reported expression, rather than broadening the current global `--onlyAllow` license-family list; (4) have CI compare fresh root/client/server scanner JSON against that manifest and fail on any new, removed, version-changed, expression-changed, or undispositioned row; (5) encode the current-target condition and mandatory reopen triggers for the two Sharp optional artifacts and LightningCSS; (6) retain the client `UNLICENSED` metadata decision as a separate project-policy entry; and (7) run fresh root, client, and server checks plus production/`--omit=dev` reachability evidence before changing Row 16. No dependency change is in scope because there are no `REJECT` rows.
