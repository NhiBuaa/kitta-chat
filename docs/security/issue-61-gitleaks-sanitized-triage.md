# Issue #61 Sanitized Gitleaks Triage

## Scope and evidence boundary

This matrix uses only sanitized Code Scanning metadata uploaded by the `Gitleaks Sanitized Results` tool: stable alert number, rule type, safe path/line, current tracked/existence state, and safe git-history metadata. No secret value, raw SARIF payload, raw Gitleaks log, credential-bearing file content, or retained auth/recovery log was opened.

GitHub Secret Scanning API is disabled for this repository (`404`); that source is unavailable and does not replace the uploaded sanitized Gitleaks findings. The alert number below is the stable reference because sanitized SARIF does not expose a safe raw secret fingerprint.

| Stable reference | Rule / safe location | Current and history context | Classification | Exposure / action disposition | Closure impact |
| --- | --- | --- | --- | --- | --- |
| Gitleaks-sanitized #1 | `private-key`; `server/src/config/firebase-service.json:5` | Not present or tracked now; path has 3 historical commits. | `UNCERTAIN — credential review authorization required` | Committed/history exposure is possible. Rotation/revocation decision required before any resolved disposition. Current-source removal is not applicable; do not rewrite history. | Blocks final sanitized finding/credential disposition. |
| Gitleaks-sanitized #2 | `private-key`; same safe location as #1. | Not present or tracked now; same 3 historical commits. | `UNCERTAIN — credential review authorization required` | Same as #1; do not infer whether it is duplicate or a distinct credential without authorized safe evidence. | Blocks final disposition. |
| Gitleaks-sanitized #3 | `private-key`; same safe location as #1. | Not present or tracked now; same 3 historical commits. | `UNCERTAIN — credential review authorization required` | Same as #1; no rotation is performed. | Blocks final disposition. |
| Gitleaks-sanitized #4 | `private-key`; `nginx/ssl/server.key:1–28` | Not present or tracked now; path has 2 historical commits. | `UNCERTAIN — credential review authorization required` | Committed/history exposure is possible. Determine whether this was a local/test key or active credential before a rotation/revocation decision. Current-source removal is not applicable. | Blocks final disposition. |
| Gitleaks-sanitized #5 | `gcp-api-key`; `client/src/firebase.js:4` | Not present or tracked now; path has 2 historical commits. | `UNCERTAIN — credential review authorization required` | Committed/history exposure is possible. Potential key restriction/rotation decision requires authorized credential review. Current-source removal is not applicable. | Blocks final disposition. |
| Gitleaks-sanitized #102 | `generic-api-key`; `server/test/observability/issue52EndToEnd.test.js:192` | Current tracked test file; 2 historical commits. | `SYNTHETIC/TEST` candidate from test-only location; value not inspected. | Sanitized path and rule establish test context, but not enough to prove the literal has no live authority. Preserve candidate status; no rotation gate is proposed unless a future secret-safe context review contradicts it. | Still needs per-alert disposition; not eligible for broad scanner exception. |
| Gitleaks-sanitized #103 | `generic-api-key`; `server/test/observability/issue52EndToEnd.test.js:222` | Current tracked test file; 2 historical commits. | `SYNTHETIC/TEST` candidate from test-only location; value not inspected. | Same evidence limit as #102. No raw source, raw SARIF, or literal was inspected in Q1. | Still needs per-alert disposition; not eligible for broad scanner exception. |

## Classification counts

| Classification | Count | Alerts |
| --- | ---: | --- |
| `SYNTHETIC/TEST` candidate | 2 | #102, #103 |
| `PLACEHOLDER/EXAMPLE` | 0 | — |
| `LOCAL-ONLY NON-CREDENTIAL` | 0 | — |
| `REAL CREDENTIAL` | 0 | — |
| `UNCERTAIN — credential review authorization required` | 5 | #1–#5 |

## Rotation boundary

No credential is rotated or revoked in this triage. Only #1–#5 may enter a future credential human decision gate, because they are `UNCERTAIN`. The test-path candidates #102–#103 still require narrow evidence-backed disposition, but do not automatically require rotation.

## Prepared, not authorized, credential gates

### G1 — Secret-safe credential context classification

G1 may inspect only non-secret context: safe path/line, variable or key name, scanner rule, committed/history status, owner/purpose/environment evidence, and surrounding code only with any literal redacted. It must classify each outstanding row as `SYNTHETIC/TEST — EVIDENCE-BACKED`, `REAL CREDENTIAL`, or `UNCERTAIN`; it must not print or otherwise disclose a raw secret value, rotate/revoke a credential, or create a broad scanner exception.

### G2 — Rotation/revocation decision

Only a row that remains `REAL CREDENTIAL` or `UNCERTAIN` after G1 may enter G2. G2 is a separate maintainer decision covering owner/system identification and rotation or revocation without exposing the value; it does not follow automatically from G1 and does not authorize raw-secret inspection by default.
