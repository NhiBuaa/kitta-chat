# Immutable Review Snapshot: GitHub Issue #112

## Snapshot metadata

- Repository: `NhiBuaa/kitta-chat`
- Issue: `#112`
- URL: https://github.com/NhiBuaa/kitta-chat/issues/112
- State at read-back: `OPEN`
- Label at read-back: `ready-for-agent`
- Source base: `1b70741b4512e5cc727224a788477d87fa1e67be`
- Captured at: `2026-08-23`
- Purpose: immutable Spec input for Test Cases, the manual guide, TDD, and the later whole-K6 review

## Title

K6-02 — Railway edge upstream, public routes và sanitized health projection

## Body

### Parent

#110

### What to build

Deliver a Railway-compatible public edge that obtains its private backend target through validated
`BACKEND_UPSTREAM` configuration, proxies REST and Socket.IO correctly, and exposes only minimal
public health information. Operational and verbose backend surfaces remain unreachable from the
public edge.

This slice is pre-D2 source/test work only. It must not deploy Railway workloads, bind a live private
hostname, or obtain D2-only runtime values.

### Locked edge configuration contract

For `K6_TARGET=public-demo`, `BACKEND_UPSTREAM` is exactly one private DNS authority in the form
`<hostname>:3000`, without a URL scheme. It must be nonblank, non-loopback, non-wildcard, and contain
no whitespace, userinfo, path, query, fragment, or alternate/implicit port. The production hostname
must be a Railway private DNS name ending in `.railway.internal`; focused tests may use
`.internal.test` only through explicit test authority. Missing or invalid input aborts edge startup
before traffic is served. There is no public-demo fallback to hard-coded `backend:3000`, localhost,
request `Host`, or another reflected value.

The exact D2-read-back hostname remains unknown and forbidden pre-D2.

### Locked Origin and proxy-header matrix

The edge applies the following contract to ordinary `/api/` REST, the more-specific `/api/auth/`
seam, Socket.IO polling/handshake, WebSocket upgrade, and reconnect:

- a present browser `Origin` is forwarded unchanged as `Origin`;
- an absent `Origin` remains absent;
- `Host`, `X-Forwarded-Host`, `Accept`, or an edge-derived value never substitutes for `Origin`;
- REST/auth also forward `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`;
- Socket.IO additionally forwards `Upgrade` and the mapped `Connection` header and preserves the
  existing no-buffering/long-timeout behavior;
- no public REST or Socket.IO payload, event, room, or conversation identifier changes.

### Locked public route matrix

| Class | Routes | Observable behavior |
| --- | --- | --- |
| Edge-local | exact `/healthz` | `200`, `text/plain`, body exactly `OK`; edge liveness only and independent of backend readiness |
| Edge-local | exact `/runtime-config.json` | same-origin non-secret runtime document owned by the approved #111 contract; never SPA fallback |
| Proxied | `/api/`, including `/api/auth/` | private backend target; REST/header contract above |
| Proxied | `/socket.io/` | private backend target; polling, upgrade, and reconnect contract above |
| Omitted public readiness | exact `/readyz` and every `/readyz/` nested/trailing-slash form | reserved, non-proxied `404` with generic non-HTML response; never `index.html` |
| Denied operational | `/ops`, `/metrics`, `/backend-healthz` and every nested/trailing-slash form | non-proxied `404` with generic non-HTML response; never upstream and never `index.html` |
| Reserved roots | exact `/api` and exact `/socket.io` | non-SPA generic response; must not be mistaken for a browser route |
| SPA | eligible frontend navigation routes only | static asset resolution followed by `index.html` fallback |

K6 intentionally omits a public readiness projection. Private backend `GET /readyz` remains the
Railway application-readiness authority and is not exposed through edge. Backend `/healthz` remains
a private verbose diagnostic and is never proxied publicly.

### Acceptance criteria

- [ ] Public-demo startup validates the exact `BACKEND_UPSTREAM` authority contract and fails before
  serving traffic for every missing/unsafe value.
- [ ] Local Compose remains supported through an explicit non-public-demo adapter; it is not an
  implicit public-demo fallback.
- [ ] Ordinary REST, `/api/auth/`, Socket.IO polling/handshake, WebSocket upgrade, and reconnect
  satisfy the locked Origin/header matrix for present and absent Origin.
- [ ] Edge `/healthz` satisfies the exact minimal liveness contract and discloses no provider,
  hostname, dependency, process, memory, stack, or secret-bearing detail.
- [ ] Public `/readyz` is omitted exactly as the route matrix defines while private backend
  `/readyz` remains authoritative.
- [ ] `/ops`, `/metrics`, `/backend-healthz`, their nested/trailing-slash variants, and reserved
  roots never reach the backend or SPA.
- [ ] SPA fallback cannot shadow API, Socket.IO, health, runtime config, omitted readiness, or denied
  operational routes.
- [ ] Automated tests cover rendering/startup validation, valid and invalid upstream values,
  REST/auth Origin pass-through and absence, Socket.IO polling/upgrade/reconnect, edge liveness,
  route exclusions, and SPA precedence.
- [ ] Local acceptance uses only synthetic/loopback fixtures and records `D2_MUTATIONS=0`.

### Retained risks and boundaries

Live Railway private-hostname read-back and healthcheck configuration remain D2 evidence. This
ticket completes source/local acceptance only; it is later covered by the single whole-K6 code
review after #111–#118 are integrated. It does not run a per-Issue post-implementation code review.

### Blocked by

- #111
