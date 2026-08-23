# Immutable Review Snapshot: GitHub Issue #111

## Snapshot metadata

- Repository: `NhiBuaa/kitta-chat`
- Issue: `#111`
- URL: https://github.com/NhiBuaa/kitta-chat/issues/111
- State at read-back: `OPEN`
- Label at read-back: `ready-for-agent`
- Read-back source: authenticated read-only GitHub CLI response
- Captured at: `2026-08-22`
- Purpose: local immutable Spec-axis input for K6 Issue #111 guide and fixed-point review

## Title

K6-01 — Target configuration, runtime capability document và Vite same-origin contract

## Body

### Parent

#110

### What to build

Deliver the public-demo target-configuration seam that keeps the frontend image independent of the
future Railway hostname. The SPA uses same-origin relative paths and consumes a versioned,
non-secret runtime capability document. Invalid, missing, unavailable, or incompatible target
configuration fails closed so optional controls and client routes are not accidentally exposed.

This slice prepares source and tests only. It does not authorize runtime implementation until the
locked guide is externally reviewed and approved by the maintainer. It does not authorize
credential operations, GHCR publication, Railway mutation, deployment, live acceptance, or D2.

### Locked contract decisions

- The runtime document path is same-origin `/runtime-config.json`.
- The current document contract is `schemaVersion: 1` and `target: "public-demo"`.
- The client requests the document without cache reuse and accepts only the exact supported schema
  version, target, required keys, value types, and safe allowlisted fields.
- A document is stale/incompatible when its schema version is older or newer than the supported
  version, its target differs, or required contract fields are absent. There is no wall-clock TTL.
- Missing, unavailable, malformed, stale/incompatible, target-mismatched, or unsafe documents enter
  an explicit error state and keep every optional capability disabled. Loading and error states must
  not flash optional controls.
- The document contains only safe capability booleans and non-secret WebRTC metadata. Issue #115
  owns the ICE/TURN source and media-readiness behavior; this ticket owns only the safe document seam.
- The public-demo target parser has no local, empty, host-derived, reflected, wildcard, or permissive
  fallback. Invalid target input returns a fatal validation result for startup consumers.
- Issue #112 owns edge Origin forwarding, public edge routes, and nginx exposure. Issue #113 owns
  backend startup wiring, server capability enforcement, and protected REST/Socket.IO rejection.
  This ticket owns client controls/routes and the shared target/config contract only.

### Acceptance criteria

- [ ] The target-configuration module validates `targetName`, `publicAppUrl`,
  `allowedBrowserOrigins`, `backendUpstream`, `capabilities`, and
  `workerDependencyBindings` as one semantic contract without reading provider topology in business
  modules.
- [ ] For `targetName=public-demo`, missing, blank, malformed, wildcard, reflected, duplicate, or
  otherwise unsafe public URL/origin values return a fatal validation error. Tests include wrong
  scheme, wrong host, wrong port, evil subdomain, wildcard, duplicate origin, and absent values.
- [ ] The target parser never falls back to localhost, an empty allowlist, `Host`, a reflected
  request origin, or a permissive origin. Backend startup consumption and request rejection remain
  explicit acceptance work in Issue #113.
- [ ] The production frontend uses only same-origin relative API, Socket.IO, and runtime-config
  paths and does not embed a Railway-generated hostname.
- [ ] `/runtime-config.json` uses exact `schemaVersion: 1`, exact target `public-demo`, allowlisted
  capability booleans, and non-secret WebRTC metadata. Unknown fields do not become executable
  configuration or secret-bearing output.
- [ ] The runtime loader has explicit `loading`, `ready`, and `error` states, requests with
  cache reuse disabled, and rejects missing, unavailable, malformed, target-mismatched, old-version,
  future-version, or incomplete documents.
- [ ] During loading or error, Google login, recovery/password-reset navigation, upload controls,
  metrics/Issue #61 controls, and other optional client capabilities remain hidden or unavailable
  without a transient flash.
- [ ] Disabled or unknown capabilities do not leave dead client-side controls or directly reachable
  SPA routes. Public edge exposure is deferred to Issue #112; backend endpoint enforcement is
  deferred to Issue #113.
- [ ] A valid local fixture can enable an allowlisted capability without rebuilding for a hostname;
  this test does not claim the provider-backed feature or D2 live path is ready.
- [ ] Automated tests cover valid target configuration, every listed invalid-origin/fallback case,
  schema/version/target handling, fail-closed loading/error/reload behavior, no-flash rendering,
  client route guards, and same-origin production build output.
- [ ] REST and Socket.IO request/response payloads, event names, room identifiers,
  `Message.conversationId`, and public conversation identifiers remain unchanged. Boundary tests
  verify the configuration seam does not rewrite these contracts; backend enforcement belongs to
  Issue #113.
- [ ] No secret, provider credential, token, deployment digest, generated hostname, derived
  `URL_FRONTEND`, derived `CORS_ALLOWED_ORIGINS`, derived `BACKEND_UPSTREAM`, or other D2-only value
  appears in the frontend artifact or runtime capability document.

### Retained risks and boundaries

This ticket does not resolve edge proxy/health behavior, backend capability enforcement, live
provider compatibility, TURN availability, S3 behavior, Railway hostname allocation, or
first-deployment rollback evidence. Those remain in Issues #112–#118 and D2 as published.

### Blocked by

- None — this is the initial implementation frontier, but implementation remains guide-approval
  gated.
