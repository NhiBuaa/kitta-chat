# Issue #61 Sanitized Gitleaks Triage

## Scope and evidence boundary

This matrix uses only sanitized Code Scanning metadata uploaded by the `Gitleaks Sanitized Results` tool: stable alert number, rule type, safe path/line, current tracked/existence state, and safe git-history metadata. No secret value, raw SARIF payload, raw Gitleaks log, credential-bearing file content, or retained auth/recovery log was opened.

GitHub Secret Scanning API is disabled for this repository (`404`); that source is unavailable and does not replace the uploaded sanitized Gitleaks findings. The alert number below is the stable reference because sanitized SARIF does not expose a safe raw secret fingerprint.

| Stable reference | Rule / safe location | Current and history context | Classification | Exposure / action disposition | Closure impact |
| --- | --- | --- | --- | --- | --- |
| Gitleaks-sanitized #1 | `private-key`; `server/src/config/firebase-service.json:5` | Not present or tracked now; path has 3 historical commits. Maintainer confirms the historical service-account key was deleted. | `REAL / REVOKED` | Historical service-account key exposure is confirmed; deletion is the recorded revocation. If the provider owner/resource is re-identified, verify deletion and rotate any replacement still needed by the consumer. | Accounted; #1–#3 no longer block Row 8. |
| Gitleaks-sanitized #2 | `private-key`; same safe location as #1. | Not present or tracked now; same 3 historical commits. Maintainer confirms the historical service-account key was deleted. | `REAL / REVOKED` | Same service-account key class; deletion is the recorded revocation. If owner/resource is re-identified, verify deletion and rotate any replacement still needed by the consumer. | Accounted; #1–#3 no longer block Row 8. |
| Gitleaks-sanitized #3 | `private-key`; same safe location as #1. | Not present or tracked now; same 3 historical commits. Maintainer confirms the historical service-account key was deleted. | `REAL / REVOKED` | Same service-account key class; deletion is the recorded revocation. If owner/resource is re-identified, verify deletion and rotate any replacement still needed by the consumer. | Accounted; #1–#3 no longer block Row 8. |
| Gitleaks-sanitized #4 | `private-key`; `nginx/ssl/server.key:1–28` | Not present or tracked now; path has 2 historical commits. Maintainer confirms the historical TLS key/certificate is no longer used. | `HISTORICAL / NO LONGER USED` | No current consumer/reuse is reported. Reopen if a matching TLS key/certificate or consumer is identified. | Accounted; #4 no longer blocks Row 8. |
| Gitleaks-sanitized #5 | `gcp-api-key`; `client/src/firebase.js:4` | Not present or tracked now; path has 2 historical commits. Maintainer confirms the historical Firebase/API key was deleted and has no remaining project consumer. | `REAL / REVOKED` | Historical key exposure is confirmed; deletion is the recorded revocation. No `ROTATED` claim is made because replacement-key evidence was not supplied. Reopen if a matching active key or consumer is identified. | Accounted; #1–#5 no longer block Row 8. |
| Gitleaks-sanitized #102 | `generic-api-key`; `server/test/observability/issue52EndToEnd.test.js:192` | Current tracked server observability test; test-only path is executed by `node --test`, has no production import/reachability, and its current safety commit is `dbaf852a` (`test(observability): avoid secret-like fixture values`). Value not inspected. | `SYNTHETIC / TEST-ONLY — NO ROTATION REQUIRED` | Test fixture purpose and non-production reachability are evidence-backed. This is a narrow per-alert disposition, not a scanner exception. Reopen only if a provider/resource link or production reachability is evidenced. | Accounted. |
| Gitleaks-sanitized #103 | `generic-api-key`; `server/test/observability/issue52EndToEnd.test.js:222` | Current tracked server observability test; test-only path is executed by `node --test`, has no production import/reachability, and its current safety commit is `dbaf852a` (`test(observability): avoid secret-like fixture values`). Value not inspected. | `SYNTHETIC / TEST-ONLY — NO ROTATION REQUIRED` | Test fixture purpose and non-production reachability are evidence-backed. This is a narrow per-alert disposition, not a scanner exception. Reopen only if a provider/resource link or production reachability is evidenced. | Accounted. |

## Classification counts

| Classification | Count | Alerts |
| --- | ---: | --- |
| `SYNTHETIC / TEST-ONLY — NO ROTATION REQUIRED` | 2 | #102, #103 |
| `PLACEHOLDER/EXAMPLE` | 0 | — |
| `LOCAL-ONLY NON-CREDENTIAL` | 0 | — |
| `REAL CREDENTIAL` | 0 | — |
| `REAL / REVOKED` | 3 | #1–#3 |
| `HISTORICAL / NO LONGER USED` | 1 | #4 |
| `REAL / REVOKED` | 4 | #1–#3, #5 |

## Rotation boundary

No credential is rotated or revoked in this triage. Only #1–#5 may enter a future credential human decision gate, because they are `UNCERTAIN`. The test-path candidates #102–#103 still require narrow evidence-backed disposition, but do not automatically require rotation.

## G5 maintainer decision — owner evidence pending

G5 is satisfied for #1–#5 by maintainer owner/status facts. This is not a risk acceptance or scanner dismissal.

- #1–#3: if the provider owner/key is identified, revoke or rotate the service-account key.
- #4: if a TLS-key consumer is identified and the key was or is used, rotate the key and certificate.
- #5: the historical Firebase/API key is confirmed deleted with no remaining project consumer. Reopen if matching active-resource evidence appears.

No additional repository mining is authorized. Row 8 and Issue #61 remain blocked until owner evidence exists or a separate named human-approved risk acceptance is recorded.

## Prepared, not authorized, credential gates

### G1 — Secret-safe credential context classification

G1 may inspect only non-secret context: safe path/line, variable or key name, scanner rule, committed/history status, owner/purpose/environment evidence, and surrounding code only with any literal redacted. It must classify each outstanding row as `SYNTHETIC/TEST — EVIDENCE-BACKED`, `REAL CREDENTIAL`, or `UNCERTAIN`; it must not print or otherwise disclose a raw secret value, rotate/revoke a credential, or create a broad scanner exception.

### G2 — Rotation/revocation decision

Only a row that remains `REAL CREDENTIAL` or `UNCERTAIN` after G1 may enter G2. G2 is a separate maintainer decision covering owner/system identification and rotation or revocation without exposing the value; it does not follow automatically from G1 and does not authorize raw-secret inspection by default.
