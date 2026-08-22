# K6 D2 Authorization Request and Execution Evidence Contract

## Authority

- Contract version: `k6-d2-contract-v1`.
- Lifecycle: `PHASE_3_PUBLISHED_B0_COMPLETE_ISSUE_111_PRE_IMPLEMENTATION_GATED_D2_UNAUTHORIZED`.
- Scope: Railway `public-demo` only; it is not production and is not Issue #61 evidence.
- D2 status: unauthorized until a human approves the exact request hash and reviewed candidate SHA.

This file is the sole normative field matrix for the K6 D2 Authorization Request and D2 Execution
Evidence Record. Other K6 artifacts may explain sequencing, but they must reference this contract
instead of defining shorter or alternate checklists. A missing required field is `BLOCKED`; an
execution-only value in the pre-approval request is invalid. Secret values are forbidden in both
records, Git, chat, logs, and evidence.

## A. D2 Authorization Request — required pre-approval fields

| ID | Required field | Required non-secret content |
| --- | --- | --- |
| `A01` | Contract identity | `k6-d2-contract-v1`, request identifier, request SHA-256, creation time, and approval status `pending` |
| `A02` | Reviewed source | Exact reviewed candidate commit SHA, merge-base/diff reference, and zero-Critical/Major pre-deployment review reference |
| `A03` | Railway target/topology | Project, environment, service IDs, intended Singapore region, one backend, edge-only public ingress, private workers, and notification-worker excluded |
| `A04` | Intended packages | `ghcr.io/nhibuaa/kitta-chat-server` and `ghcr.io/nhibuaa/kitta-chat-edge` names only; no digest or mutable deployment authority |
| `A05` | Provider identities/owners | Atlas, Upstash, CloudAMQP, and S3 resource identities plus credential owners/secret-manager locations, never values |
| `A06` | Intended service bindings | Complete least-privilege service/config/secret matrix: backend, image-worker, audit-worker, edge, one-off seed, and notification-worker non-binding |
| `A07` | Responsible owner/status mechanism | Maintainer as deployment/rollback owner; GitHub Actions publication from reviewed source; Railway immutable-digest binding with Auto Deploy disabled; planned revision/health read-back |
| `A08` | Intended health contract | Private backend `/readyz`, public edge `/healthz`, optional sanitized public readiness only if retained, and verbose backend health non-public |
| `A09` | Initial capabilities | Upload false; recovery false; Google login false; metrics export and Issue #61 measurement false; calls pending media acceptance |
| `A10` | Resources/cost/downtime | Intended compute/services, cost ceiling, expected downtime, and zero-visible-downtime goal where Railway supports it |
| `A11` | Rollback/first-deployment policy | Rollback policy and owner, previous-known-good digest/revision policy, `<=5 minutes` objective, and explicit first-deployment fallback owner/action without asserting a nonexistent prior revision |
| `A12` | Public-ingress security disposition | M1/M2 authenticated-principal authorization, reset-token fragment transport/log redaction, exact Origin policy, and no-public `/ops`; regression or missing containment blocks public ingress |
| `A13` | Synthetic-data/manual scope | `.test` seed and signup boundary, no personal/sensitive/production data, one-off seed policy, reset/cleanup boundary, and locked deployed-target manual-guide scope |
| `A14` | Public exposure/exclusions | Edge exposure map; no public backend/workers, `/ops`, `/metrics`, or verbose health; no notification-worker, startup migration, manual queue creation, `latest`, production claim, or Issue #61 enablement |
| `A15` | Requested mutations | Exact mutation list `M01`–`M10` below; approval grants only these actions for this candidate and target |

### Exact requested mutations

1. `M01` — create or rotate only required provider application credentials in approved secret managers.
2. `M02` — publish reviewed server/edge images through the approved GitHub Actions workflow.
3. `M03` — capture immutable image digests and read back Railway public/private hostnames.
4. `M04` — bind non-secret configuration and secrets according to the approved least-privilege matrix.
5. `M05` — bind immutable digests and roll out backend, image-worker, audit-worker, and edge in the approved order; notification-worker remains undeployed.
6. `M06` — apply/read back Railway health settings and run live provider compatibility checks while upload remains false.
7. `M07` — finalize exact-origin S3 CORS after the real edge origin exists.
8. `M08` — enable upload only after internal S3/worker/prefix/private-object checks pass.
9. `M09` — run the one-off idempotent `.test` seed and locked deployed-target acceptance, including WebRTC media acceptance.
10. `M10` — record stable/first-deployment disposition and perform at most one conditional rollback only when the approved rollback prerequisites are satisfied.

### Values forbidden before approval

The Authorization Request must not contain or require actual image digests, generated public/private
hostnames, derived `URL_FRONTEND`, `CORS_ALLOWED_ORIGINS` or `BACKEND_UPSTREAM`, live Railway
region/health/revision results, final S3 CORS, live provider compatibility, deployed-target
acceptance, stable-revision results, or rollback results. Producing those values belongs to an
approved mutation or live execution and therefore cannot be a condition for approving that action.

## B. D2 Execution Evidence Record — required post-approval fields

The record may be populated only after approval of the exact `A01` request hash and `A02` candidate.

| ID | Required field | Required secret-safe evidence |
| --- | --- | --- |
| `E01` | Approval binding | Human approval reference/time, approved request identifier/hash, reviewed candidate SHA, and `k6-d2-contract-v1` |
| `E02` | Artifact lineage | Actual immutable server/edge digests linked to candidate SHA and workflow run; no `latest` authority |
| `E03` | Railway identity/binding | Generated edge/private hostnames, exact applied `URL_FRONTEND`, `CORS_ALLOWED_ORIGINS`, `BACKEND_UPSTREAM`, service-to-digest bindings, and region read-back |
| `E04` | Applied configuration ownership | Secret/config key names, receiving services, provider secret-manager references/fingerprints where safe, and proof of no unauthorized recipient; never values |
| `E05` | Rollout/status | Railway revision IDs, deployment order/timestamps, configured healthcheck read-back, backend `/readyz`, edge `/healthz`, optional sanitized readiness, and no-public verbose health evidence |
| `E06` | Provider compatibility | Secret-safe Atlas, Upstash, CloudAMQP nine-queue/retry/DLQ, and S3 SDK/multipart/worker/private-object/prefix-rejection results |
| `E07` | S3 activation | Final exact-origin CORS read-back, internal checks while upload false, upload capability transition, browser `PUT`/`ETag`, delivery, and cleanup evidence |
| `E08` | Security revalidation | M1/M2, reset-token transport/logging, exact REST/Socket.IO Origin rejection, no-public `/ops`/`metrics`, sanitized health/logs, and no-secret evidence |
| `E09` | Demo data/identity | One-off idempotent `.test` seed, seeded login, server-enforced synthetic signup, cleanup/reset disposition, and no-personal-data evidence |
| `E10` | Locked acceptance | Guide revision, append-only Evaluation, provider/auth/direct/group/sidebar/WebSocket/call/media/upload/disabled-capability observations, flow-time result, and explicit human approval |
| `E11` | Stable/rollback disposition | Stable digest/revision marker; failed/restored digest/revision and health evidence when rollback is valid, or explicit first-deployment no-prior-revision fallback disposition |
| `E12` | Final outcome | Every required case `PASS`, `FAIL`, or `BLOCKED`, maintainer decisions, retained limitations, and final public-demo status without production/Issue #61 claims |

## Validation rules

- The request is incomplete unless every `A01`–`A15` field is present and secret-safe.
- The request is invalid if it contains any execution-only value listed above.
- The evidence record is invalid before exact request approval or if candidate/target identity drifts.
- Candidate drift requires a new request and approval.
- `FAIL` or `BLOCKED` cannot be rewritten as `PASS`; append new evidence after an authorized action.
- D2 approval does not authorize Issue #61 C1/A1, Level 2B, numeric tuning, production claims, or any
  mutation outside `M01`–`M10`.
