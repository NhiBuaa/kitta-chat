# K5 Security-Readiness Package

## Status

**Accepted evidence package — human approval recorded 2026-08-19.**

This is a documentation-only evidence package. It consolidates the current Issue #61 closure
record, retained security evidence, current source/test evidence, and the boundaries for any
future public-demo or deployment decision.

This package does not:

- change runtime behavior, security policy, quota values, scanner configuration, or benchmark
  semantics;
- authorize a provider, secret, cost, public exposure, deployment, or rollback target;
- enable Issue #61 measurement, inspect hosted logs, or turn demo traffic into production
  evidence; or
- replace the separate authorization required for remediation, policy changes, measurement,
  deployment, or K6.

## Human acceptance record

The maintainer/security reviewer approved this package as an accurate record of the stated
evidence and limitations on 2026-08-19. That approval accepts the package boundary only. The stale
documentation question and the current 29-policy-ID versus historical 27-point interpretation
remain explicitly open evidence questions; this package does not turn either question into a new
policy approval or remediation authorization.

Issue #61 is closed. The package is not a deployment approval. K6 public deployment remains a
separate workstream requiring explicit authorization.

## Executive disposition

The final Issue #61 record states that all mandatory closure rows are complete. It retains
accepted residual risks and evidence limitations, including advisory scanner residuals, the lack
of a deployed environment, and `B = 0` for retained/runtime measurement evidence.

The current security position is therefore:

1. The reviewed message, reset-token, browser-origin, `/ops`, rate-limit, and scanner boundaries
   have source/test or retained acceptance evidence.
2. The evidence is bounded. It does not prove a hosted deployment, production behavior, historic
   log retention/access, or representative workload.
3. A public demo still needs a new deployment authorization and a target-specific runtime check.

Primary records:

- [Issue #61 closure-gap inventory](issue-61-closure-gap-inventory.md)
- [Issue #61 final remaining-risk record](issue-61-final-remaining-risk-record.md)
- [Issue #61 closure comment](https://github.com/NhiBuaa/kitta-chat/issues/61#issuecomment-5262050190)
- [K5 primary-source research note](k5-security-readiness-research.md)

## Readiness matrix

| Area | Current disposition | Evidence | Boundary that remains |
| --- | --- | --- | --- |
| REST message write and history access | **Established by current source and focused tests.** The message routes require verified authentication and route-specific Redis admission. The controller binds the sender/requester to the authenticated principal, checks direct/group authorization, rejects public system messages, and caps history reads at `200`. | `server/src/routes/messages.js`; `server/src/controllers/messageController.js`; `server/test/messageAccessControl.test.js`; closure inventory rows 24–25. K5 rerun: server focused suite `16/16` passed. | This is source/test evidence, not deployed-runtime exploitation or hosted behavior evidence. The legacy REST contract still needs documentation reconciliation; see [Documentation drift](#documentation-drift). |
| Reset-token transport and logging | **Established by current source/config and focused tests.** The browser takes the credential from the URL fragment, removes the fragment from history, sends it in the JSON body, and uses a token-free route path. Application and nginx logging tests cover body-token exclusion, reset-path redaction, safe referer logging, and `Referrer-Policy: no-referrer`. | `client/src/features/auth/resetTokenFragment.js`; `client/src/features/auth/resetTokenFragment.test.js`; `server/test/resetTokenTransport.test.js`; `server/test/resetTokenNginxPolicy.test.js`; closure inventory row 26. K5 rerun: client `2/2` and server reset tests passed. | Historical occurrence, retention, and access were not inspected. The package makes no claim that a historic credential was retained or accessed. Raw auth/recovery logs remain restricted/quarantined. |
| Browser origin policy | **Established by current source and focused tests.** Credentialed HTTP and Socket.IO use exact configured origins. Malformed origins and missing production configuration fail closed; development/test without an allowlist does not reflect the request origin. | `server/src/config/browserOriginPolicy.js`; `server/src/app.js`; `server/src/socket/index.js`; `server/test/browserOriginPolicy.test.js`; closure inventory row 13. K5 rerun: origin-policy tests passed. | A future deployment must set the actual public origin and verify the ingress path. Local policy tests do not prove a hosted proxy or provider configuration. |
| `/ops` operational boundary | **Established by repository configuration and retained acceptance evidence.** Express exposes lightweight diagnostics to the backend process, while the nginx exact `/ops` location is `internal`; the backend is not published by the base Compose topology. | `nginx/nginx.conf`; `server/src/app.js`; `docker-compose.yml`; closure inventory row 27; retained nginx validation in the closure record. | K5 did not rerun a containerized nginx check. Any deployment that changes ingress, backend port publication, or `/ops` routing requires a new boundary review. |
| Distributed rate-limit enforcement | **Established by current source/tests plus retained real-Redis acceptance.** Admission uses Redis-backed atomic evaluation, current policy IDs, verified actor identity, finite TTL state, and explicit `429` versus `503 RATE_LIMIT_UNAVAILABLE` semantics. The retained R2 run passed `8/8` tests with no skips across standalone Redis and a native three-primary Redis Cluster. | `server/src/rateLimit/httpAdmissionMiddleware.js`; `server/src/rateLimit/distributedRateLimiter.js`; `server/test/rateLimit/httpAdmission.test.js`; `server/test/rateLimit/policyCatalog.test.js`; `server/test/rateLimit/distributedAdmission.test.js`; [R2 acceptance record](issue-61-rate-limit-acceptance-evidence.md); closure inventory rows 18–19. K5 rerun: HTTP contract and policy tests passed. | K5 did not start Redis containers or change the approved 27-point closure baseline. The current source catalog contains 29 policy IDs, while older Issue #61 wording calls the approved baseline 27-point; approval coverage for the full current catalog is not established pending human reconciliation. K5 does not reinterpret that difference. The retained acceptance is not production deployment evidence and does not authorize new quota tuning or measurement. |
| Scanner, dependency, license, and credential residuals | **Accounted, not globally clean.** The closure record preserves per-finding dispositions and limitations. Root audit is `0`; client has `16` and server has `7` accepted/accounted residuals. CodeQL #173 and #174–#177 retain safe-boundary dispositions; the records do not describe them as fixed or dismissed. | [Final remaining-risk record](issue-61-final-remaining-risk-record.md); [closure-gap inventory](issue-61-closure-gap-inventory.md); [CI policy](../CI_POLICY.md); GitHub Issue #61 closure comment. | The Security workflow may still fail on accounted advisory residuals. CodeQL evidence is merge-ref evidence, not a direct analysis of this branch head. No secret value is reproduced here. Babel/Ajv remains owned risk acceptance with review due `2026-11-11`. |
| Public-demo, deployment, and measurement boundary | **Not authorized and not established.** The repository currently advertises local Docker Compose, not a hosted public environment. The Railway `public-demo` plan is a maintainer planning input only. | [README known limitations](../../README.md#known-limitations); [public-demo gate](issue-61-public-demo-security-readiness-gate.md); [deployment/smoke guide](../DEPLOYMENT_AND_SMOKE_TESTS.md); final-risk record limitation. | A new target-binding, secret-safe deployment, rollback, public-exposure, and human-approval package is required before K6. `B = 0` remains unchanged; no behavioral collection or production quota claim is authorized. |

## Evidence classes

Use these labels when reusing this package:

- **Current source/test evidence** — the repository source and focused tests in the current
  branch support the claim. This does not prove deployment behavior.
- **Retained acceptance evidence** — an earlier approved run or validation record remains valid
  for the stated inputs and scope. K5 does not silently convert it into a new run.
- **Accounted residual** — a finding or limitation has a documented disposition. This does not
  mean the scanner is clean or that the risk is absent.
- **Not established** — the available evidence cannot support the claim. Do not fill the gap with
  local assumptions.

## Documentation drift

Several older documents contain statements that are now superseded by the current source and the
final closure record. K5 records the drift so a reviewer can decide whether to reconcile it; K5
does not rewrite those documents:

| Document | Drift | Current authority used by K5 |
| --- | --- | --- |
| `docs/API.md` around `POST /api/messages` and `GET /api/messages/:userId1/:userId2` | It says auth is “currently not enforced by this route,” while the current route wiring applies `authMiddleware` and the focused authorization tests pass. | `server/src/routes/messages.js`, `server/src/controllers/messageController.js`, `server/test/messageAccessControl.test.js`, and closure inventory rows 24–25. |
| `docs/DEPLOYMENT_AND_SMOKE_TESTS.md` around the host-facing `/ops` example | It describes `/ops` as a public nginx-proxied check, while the current nginx exact location is `internal`; the direct backend-container check remains the valid local path. | `nginx/nginx.conf`, `docker-compose.yml`, and closure inventory row 27. |
| `docs/security/issue-61-public-demo-security-readiness-gate.md` classification table | The document is marked historical/superseded at the top, but its retained table still describes the pre-remediation M1/M2/reset/CORS/`/ops` blockers. | The final remaining-risk record, closure inventory, current source, and focused tests. |
| `docs/security/issue-61-rate-limit-acceptance-evidence.md` status line | Its retained R2 record says “NOT READY TO CLOSE,” while the later closure record and GitHub Issue #61 comment close the issue. | The technical R2 result remains valid; its old status line is not current closure state. |
| `docs/security/issue-61-rate-limit-acceptance-evidence.md` and closure inventory count wording | They retain a 27-point baseline description, while the current catalog and tests contain 29 policy IDs. | The approved historical values and retained R2 result remain evidence; the count difference needs explicit human interpretation before any policy or quota change. |

## Non-claims and stop conditions

This package must not be used to claim any of the following:

- a clean GitHub Security workflow or absence of vulnerabilities;
- that CodeQL #173 or #174–#177 were fixed or dismissed;
- that a historic reset token was retained, accessed, or leaked;
- that the application has been deployed to Railway or any other provider;
- that `/ops` is safe for a changed public ingress without a new review;
- that local or retained rate-limit evidence is production capacity or quota evidence;
- that public-demo traffic is representative production workload; or
- that Issue #61 measurement, Level 2B identity/linkage, numeric tuning, or K6 deployment is
  authorized.

The K5 research note also records a current HTTP-core test observation in which a synthetic
malformed identifier reached a `console.error` CastError path. It has no new disposition in the
existing Issue #61 record. Treat it as an evidence question for explicit authority review, not as a new
remediation authorization or as proof that the final scanner disposition is invalid.

Stop and return to explicit authority review if a proposed update would introduce a new security
behavior, policy value, benchmark meaning, provider decision, deployment target, log access, or
measurement field.

## Human review checklist

- [x] The reviewer confirmed the readiness matrix and evidence precedence by approving this
      package.
- [ ] The documented drift still requires a separate reconciliation decision, or an explicit
      decision to leave it historical.
- [ ] The current 29 policy IDs versus the retained 27-point closure baseline still requires
      explicit interpretation before treating the current catalog as approved policy scope.
- [x] The reviewer confirmed that deployment, measurement, and K6 remain out of scope.
- [x] The reviewer recorded explicit approval for this package on 2026-08-19.

The package is accepted for its stated evidence boundary. The unchecked questions remain open and
must return to explicit authority review before any policy, remediation, measurement, or deployment
decision is made.
