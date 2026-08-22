# ADR-016 — K6 public-demo target configuration and capability boundary

**Status: accepted — Phase 2 consistency revision approved**

**Date:** 2026-08-22

## Context

KittaChat is validated locally through Compose, but K6 targets Railway `public-demo` with a public
edge, one private backend, private workers, and external MongoDB, Redis, RabbitMQ, and S3 bindings.
The target must remain explicitly non-production and must not become Issue #61 measurement evidence.

The first Phase 2 draft left material decisions implicit: readiness ownership, final service
topology, least-privilege bindings, frontend handling of the future Railway hostname, upload
activation, WebRTC relay readiness, demo-account operations, and the D2 authorization sequence.

## Decision

Use one validated target-configuration seam plus one explicit capability contract. Local Compose and
Railway are adapters; domain modules retain ownership of business behavior, REST/Socket.IO payloads,
MongoDB durability, Redis coordination, RabbitMQ background work, and the existing S3 module seam.

The authoritative K6 topology is:

- public `edge` using `ghcr.io/nhibuaa/kitta-chat-edge` and the nginx default command;
- one private `backend` using `ghcr.io/nhibuaa/kitta-chat-server` and `node server.js`;
- private `image-worker` and `audit-worker` using the same server package with their existing worker
  commands; and
- the currently-created `notification-worker` Railway target excluded from K6 because recovery is
  disabled. It receives no image, command, secret, or traffic and is not deleted by this ADR.

Railway uses immutable GHCR image digests, never mutable tags. The edge is the only public ingress;
backend and workers are private.

### Revised readiness authority

Backend `GET /readyz` is the Railway application-readiness authority and is ready only when MongoDB
and Redis are connected. Edge `GET /healthz` is public edge-process liveness. Backend `/healthz` is
private diagnostic health and is explicitly not the readiness authority. This supersedes earlier S1
wording that assigned readiness authority to backend `/healthz`. Any public readiness projection is
sanitized to a minimal ready/not-ready result; no provider, runtime, or secret-bearing details are
public.

RabbitMQ degradation may make internal health degraded but does not falsify MongoDB/Redis readiness.
Prometheus HTTP export is disabled with `METRICS_ENABLED=false` and no public `/metrics` route.
The internal metrics module may remain for safe in-process observations, but K6 does not treat those
observations as Issue #61 evidence.

### Revised frontend and capability binding

The public-demo SPA is built with same-origin relative Vite paths. It does not embed the future
Railway hostname. The edge serves a same-origin, non-secret runtime capability document containing
only safe booleans and non-secret WebRTC metadata. Optional UI controls and direct routes are gated
by that document and fail closed when disabled or unavailable. Recovery, Google login, upload before
activation, metrics, and Issue #61 measurement are never disabled merely by missing credentials.

`URL_FRONTEND` and `CORS_ALLOWED_ORIGINS` are backend values derived from the D2-read-back edge
hostname; they remain separate semantic values even when equal.

### Revised provider and upload boundary

S3 upload starts disabled. D2 binds the prefix-scoped IAM credential only to backend and image-worker,
proves internal SDK/worker/multipart/cleanup behavior while public upload remains fail-closed,
resolves the current `queue-sources/*` versus S1-approved `uploads/*`/`avatars/*` prefix mismatch,
finalizes exact-origin S3 CORS, enables the capability, and only then runs browser acceptance.
Wildcard CORS and public objects remain forbidden.

### Revised WebRTC boundary

The current client is STUN-only and has no TURN binding. The ICE list must become target-configurable
without putting long-lived TURN credentials in a Vite bundle. D2 call acceptance requires connected
ICE and bidirectional media, not only signaling. If STUN-only behavior fails on the approved network
matrix, K6 is blocked until a TURN/provider decision or explicit scope-change approval; calls are not
silently removed.

### Revised demo and D2 boundary

Seeded `.test` accounts use a deterministic, idempotent one-off seed guarded against non-demo targets.
Demo credentials remain outside the ADR. Self-signup is guarded by the backend-only
`K6_SYNTHETIC_SIGNUP_ONLY=true` policy and accepts only normalized `.test` email domains, regardless
of whether the request comes from the SPA or a direct client. Existing edge/backend auth limits
remain the abuse-control basis; no new quota is introduced. Reset/cleanup is explicit and
namespace-bounded.

The former single D2 packet is split into a pre-approval D2 Authorization Request and a post-approval
D2 Execution Evidence Record. The request contains the reviewed commit SHA, package names, provider
identities/owners, intended bindings, intended health paths, initial capabilities, cost/resources,
rollback/first-deployment policy, and the exact requested mutations. It does not require actual
digests, generated hostnames, derived URLs, live checks, revision IDs, acceptance, or rollback
results. The evidence record is populated only after approval and records those actual values and
results. Pre-D2 work may prepare/test candidates; publication, binding, rollout, live validation,
and deployed-target acceptance are post-approval actions.

Image-worker `REDIS_URL` remains intentional because its startup calls `connectCacheRedis()` and
`createSocketEmitter()`, which creates Redis publisher/subscriber clients for Socket.IO event
emission. A first deployment without a prior stable revision must declare that exception and cannot
claim prior-revision rollback evidence until a stable revision exists.

## Alternatives rejected

- Hard-coding Railway hostnames/origins in nginx or business modules couples local Compose to one
  deployment and makes rollback unsafe.
- Giving every route and worker its own deployment policy spreads target logic and weakens locality.
- Using missing secrets as feature flags creates accidental partial activation.
- Treating STUN signaling as proof of public call readiness creates a false acceptance claim.
- Enabling upload before exact-origin CORS and prefix/worker validation violates the S1 storage scope.
- Treating a D2 execution output as a pre-approval authorization input creates an impossible gate and
  blurs human approval with evidence capture.
- Relying on a self-signup warning instead of a backend `.test` boundary permits non-synthetic data.
- Publishing a public metrics endpoint or using internal observations as Issue #61 evidence violates
  the K6 security/evidence boundary.

## Consequences

Positive:

- Railway-specific values are localized at a small configuration seam.
- Public exposure, health semantics, capabilities, and secret binding are auditable per service.
- The future hostname does not require rebuilding the frontend image.
- Disabled features have explicit fail-closed behavior and no dead controls.
- D2 evidence can connect commit, digest, revision, health, and rollback without exposing secrets.

Costs and risks:

- Phase 4 must add/configure the runtime capability document, nginx upstream seam, health projection,
  and WebRTC ICE seam.
- The current S3 `queue-sources/*` path and direct private-object URL behavior require explicit
  implementation resolution before upload can pass.
- Public calls remain at risk until the STUN-only path passes or a TURN provider is separately bound.
- CloudAMQP permission regexes and all live provider compatibility remain intentionally unasserted
  until D2.

## Scope and transition

This ADR authorizes no implementation, secret creation, image publication, provider mutation, Railway
deployment, rollback, or Issue #61 measurement. Phase 2 is approved for the next decomposition gate;
`to-tickets` must still obtain maintainer approval of vertical-slice granularity and blocking edges
before publishing implementation issues. The linked design artifact is:
`docs/deployment/k6-public-demo-phase2-design.md`.
