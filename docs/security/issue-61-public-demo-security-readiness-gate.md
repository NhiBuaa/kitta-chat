# Issue #61 Public-Demo Security Readiness Gate (S1)

## Status

`D1 public-demo compatibility reviewed / S1 security readiness pending`.

This gate is for an Internet-accessible `public-demo` on Railway, intended for `portfolio / recruiter evaluation`. It is not a production-hardening gate, does not authorize deployment or collection, and does not turn demo traffic into representative production workload or Issue #61 quota evidence. `B = 0` remains unchanged.

## D1 Compatibility Record

Maintainer-selected target plan:

| Dimension | Planning input | Scope boundary |
| --- | --- | --- |
| Provider/platform | Railway | Maintainer input; no provider discovery was performed |
| Environment | `public-demo` | Not production or staging |
| Deployment | GitHub-connected controlled deployment; Auto Deploy off; only a deliberately selected immutable reviewed commit | D2 must create/verify actual lineage; this record creates none |
| Backend topology | One backend instance | Demo topology only; no production `R` inference |
| Redis | One Redis service in the same Railway project | Required by backend/Socket.IO source startup |
| Rollback | Railway rollback to previous successful deployment; fallback redeploy of known-good commit/build | Exact prior artifact is a later lineage value |
| Issue #61 | Disabled/inert | Generic metrics must not activate Issue #61 |

D1 is target-ready for S1 consideration. It is not D2 authorization.

## Static Runtime Dependency Inventory

| Dependency or boundary | Source evidence | Public-demo disposition before D2 |
| --- | --- | --- |
| MongoDB | `validateServerEnv()` requires `MONGO_URI`; server only listens after Mongoose connects | **Deployment dependency:** choose/provision a demo MongoDB service or compatible external service |
| Redis | `validateServerEnv()` requires Redis; Socket.IO initialization fails when Redis adapter connection fails | **Deployment dependency:** maintainer chose one Railway Redis service; actual connection/config must later be verified |
| Frontend/API/Socket routing | frontend uses build-time API URLs; server requires `URL_FRONTEND`; Socket.IO and REST need a coherent public routing/origin plan | **Deployment dependency:** decide the Railway service/proxy delivery shape before D2; provider-generated URL is allowed |
| RabbitMQ plus notification worker/email | Password reset enqueues `notification.email`; notification worker requires RabbitMQ and email credentials | **Feature dependency / S1 blocker while recovery is publicly exposed:** either provide bounded safe recovery containment and its runtime dependencies, or explicitly prevent recovery exposure in an authorized later deployment slice |
| Object storage plus image worker/RabbitMQ | File routes use S3-compatible storage; direct image upload queues image work | **Feature dependency:** do not claim upload support unless storage/worker path and its security review are ready; feature scope/disable decision is needed before D2 if unavailable |
| Firebase Admin | Google login verifies Firebase token | **Feature dependency:** only if Google login is exposed; no service credential is committed |
| Audit worker | message/audit publish failures are caught in the message socket path | **Optional for core demo flow:** decide whether audit processing is included; it is not evidence collection for Issue #61 |

## Public-Demo Security Classifications

| Classification | Item | Evidence and required S1 outcome |
| --- | --- | --- |
| **PUBLIC-DEMO BLOCKER** | M1 `POST /api/messages` | Route has no `authMiddleware`; controller accepts caller-supplied `sender`. Dedicated follow-up assignment is not Internet-exposure approval. Authorized remediation is required before D2. |
| **PUBLIC-DEMO BLOCKER** | M2 `GET /api/messages/:userId1/:userId2` | Route has no `authMiddleware`; controller falls back to path `userId1` for visibility lookup. Authorized remediation is required before D2. |
| **PUBLIC-DEMO BLOCKER** | Reset-token URL/log exposure | Client and API place reset token in path; nginx logs `$request` and `$http_referer`; request logger records `originalUrl || url`. S1 needs approved minimum containment that prevents credential-bearing path logging and verifies no regression output reveals a token, or must record that a protocol redesign is necessary. |
| **PUBLIC-DEMO BLOCKER** | Browser-origin policy mismatch | Source currently applies `cors({ origin: true, credentials: true })` and mutates missing `Origin` from `Accept`; this conflicts with the reviewed exact-origin policy. S1 needs an approved safe public-demo CORS/origin configuration/remediation. |
| **PUBLIC-DEMO BLOCKER if ingress exposes it** | `/ops` operational details | App exposes unauthenticated `/ops`; current nginx proxies it publicly. S1 must prove the chosen Railway ingress does not expose it, or authorize access restriction/remediation. |
| **SAFE TO DEFER FOR DEMO** | Level 2A enablement/collection, Level 2B, C1/A1, numeric quotas, `read_bounded` | None is required for an inert recruiter demo. Level 2A remains disabled and no demo traffic is Issue #61 evidence. |
| **SAFE TO DEFER FOR DEMO, subject to separate review** | Distributed rate-limit implementation and Nginx quota normalization | Their absence is not automatically a demo blocker, but known public-demo blockers cannot be masked by deferring them. |
| **POST-DEMO / EVIDENCE WORK** | Portfolio feedback documentation | May describe deployment/tester feedback only after actual deployment; it must not claim production users or Issue #61 measurement evidence. |

## S1 Decisions And Prerequisites

Before D2, the maintainer must authorize or scope the remediation/containment work for each public-demo blocker above. S1 must also set the demo data policy: no personal/private production data; demo accounts and seed/test data only; no real secrets committed or included in evidence; and a deliberate feature decision for recovery, uploads, Google login and any absent optional dependency.

S1 must preserve the reviewed `397` valid-manifest maximum and `493` outer authorization ceiling. It must not add Level 2B, enable Issue #61, collect behavioral telemetry, select quota values or treat public-demo use as production evidence.

## Paths After S1

```text
Demo path:     D1 → S1 → D2 inert public-demo deployment → live recruiter demo
Evidence path: D1 → S1 → D2 → C1 enablement/collection → A1 analysis → numeric-policy review
```

The evidence path is optional for the demo path. No gate automatically authorizes or requires the next gate.
