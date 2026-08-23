# Immutable Review Snapshot: GitHub Issue #113

## Snapshot metadata

- Repository: `NhiBuaa/kitta-chat`
- Issue: `#113`
- URL: https://github.com/NhiBuaa/kitta-chat/issues/113
- State at read-back: `OPEN`
- Label at read-back: `ready-for-agent`
- Source base: `1b70741b4512e5cc727224a788477d87fa1e67be`
- Captured at: `2026-08-23`
- Purpose: immutable Spec input for Test Cases, the manual guide, TDD, and the later whole-K6 review

## Title

K6-03 — Backend capability gates, synthetic signup và environment validation

## Body

### Parent

#110

### What to build

Deliver fail-closed backend capability gates and public-demo environment validation.
Recovery/password reset and Google login remain disabled. Upload starts disabled. Calls are
explicitly bound. A server-enforced synthetic identity policy constrains self-signup. Enabled-path
public request/response and Socket.IO contracts remain unchanged.

This ticket does not create credentials, bind Railway variables, publish images, deploy, or
authorize D2.

### Locked capability authority and disabled-response contract

The backend is authoritative for direct HTTP/Socket.IO enforcement. The SPA runtime document and
edge state are non-secret projections only and cannot enable a backend-disabled capability.

For public-demo, startup requires explicit boolean configuration: recovery `false`, Google login
`false`, upload `false` initially, calls explicitly `true` or `false` according to the reviewed
target contract, Issue #61 measurement `false`, and `K6_SYNTHETIC_SIGNUP_ONLY=true`. Missing,
malformed, contradictory, or credential-derived state fails startup. Missing provider secrets are
never feature flags.

Disabled HTTP paths use the existing `sendError` envelope with status `404`, code
`CAPABILITY_DISABLED`, generic message `Feature unavailable`, and the existing request ID field.
Gates run before controller/provider/database/queue/business side effects.

Affected HTTP paths:

- recovery: `POST /api/auth/forgot-password` and `POST /api/auth/reset-password/:id`;
- Google: `POST /api/auth/google`;
- upload mutations: `POST /api/files/init`, `/api/files/get-presigned-url`,
  `/api/files/complete`, and `/api/files/upload-single`;
- calls when disabled: every `/api/calls` route.

The authenticated private-download route `POST /api/files/:fileId/download-url` is not an
upload-enablement route. #114 owns its private-object semantics.

When calls are disabled, all call Socket.IO events (`initCall`, `callUser`, `answerCall`, `endCall`,
`rejectCall`, and `toggleMedia`) short-circuit before rate-limit, database, Redis coordination,
signaling, or history side effects. They use the existing `callRejected` event with exact payload
`{ "reason": "Call feature unavailable" }`. When calls are enabled, every existing event name,
payload, ACK, room identifier, authorization check, rate-limit behavior, and call-history shape
remains unchanged. #115 still owns ICE/media readiness.

### Locked synthetic self-signup boundary

The public request shape remains `{ displayName, email, password, confirmPassword }`. The server
applies this deterministic order before persistence:

1. Require `email` to be a string and preserve the existing required-field/format error path.
2. Reject leading/trailing whitespace, any internal whitespace, ASCII control, Unicode
   control/format character, Unicode dot-separator lookalike, or multiple/missing `@`.
3. Normalize with locale-independent lowercase. Do not trim or rewrite an otherwise rejected value.
4. Require a non-empty local part and an ASCII DNS-style domain with at least one label before a
   final label exactly equal to `test`.
5. Apply existing email-format checks. Query and persist only the normalized value that passed the
   `.test` boundary.

Accepted examples include `Visitor@KittaChat.Test` -> `visitor@kittachat.test` and
`visitor@team.kittachat.test`. Rejected classes include public domains, `test` without a preceding
label, empty labels, leading/trailing hyphens, trailing dot, `kittachat.test.evil`, `kittachattest`,
`test.evil`, wildcard, userinfo-like or multiple-`@` input, Unicode separator/lookalike ambiguity,
and any value that normalizes to a non-`.test` domain. Rejection occurs before `User.findOne`,
hashing, save, session issuance, or another persistence/provider side effect. The same boundary
applies to SPA and direct clients.

Non-public-demo/local behavior remains backward compatible when the synthetic-only policy is
explicitly false. No implicit public-demo fallback is allowed.

### Locked least-privilege recipient matrix

- `edge`: no provider/application secrets.
- `backend`: only the exact variables and secrets listed in Phase 2 section 5.1; no email/Firebase
  credentials.
- `image-worker`: exactly MongoDB, Redis, RabbitMQ, and listed S3 credentials/settings. JWT,
  refresh, CORS/public URL, Firebase, email, Google, and unspecified internal-signing secrets are
  forbidden.
- `audit-worker`: only `RABBITMQ_URL` plus the listed non-secret RabbitMQ/runtime settings. MongoDB,
  Redis, S3, JWT, refresh, CORS/public URL, Firebase, email, and Google bindings are forbidden.
- `notification-worker`: no image, command, configuration, or secrets.

Target environment validation must reject missing required keys, malformed values,
unknown/excessive target keys, and forbidden cross-service recipients without logging values.

### Locked abuse-control preservation

No quota or numeric tuning is added. Existing policy IDs, limits, and middleware composition remain
unchanged. This includes `auth_entry.aggregate`, `auth_entry.register`, Google/recovery policies,
call policies, and file-resource policies. There is no alternate registration route or
synthetic-boundary bypass. Existing quota exhaustion remains `429` with existing retry semantics.
Redis/store unavailability on protected HTTP paths remains fail-closed `503` with
`RATE_LIMIT_UNAVAILABLE`, never `429`. Socket.IO preserves its structured
`RATE_LIMIT_UNAVAILABLE` event/error behavior.

### Acceptance criteria

- [ ] Recovery and Google paths return the locked disabled envelope before Firebase, JWT-reset,
  RabbitMQ, database, or provider side effects.
- [ ] Upload mutation paths default disabled and return the locked envelope before S3/queue work.
  Private download remains delegated to #114.
- [ ] Calls are explicitly bound. Disabled HTTP/socket paths use the locked behavior. Enabled call
  contracts remain byte/shape compatible.
- [ ] `K6_SYNTHETIC_SIGNUP_ONLY=true` enforces the exact normalization/boundary table for SPA and
  direct clients before persistence.
- [ ] Existing registration/login enabled-path request and response payload shapes remain stable.
- [ ] Existing auth/file/call abuse controls, policy IDs, numeric limits, `429`, retry, and
  store-unavailable contracts remain unchanged.
- [ ] Service-specific target environment validation enforces the exact least-privilege recipient
  matrix and fails startup safely without value disclosure.
- [ ] Automated tests cover every capability state, provider-side-effect spies, direct-client
  signup bypass attempts, all normalization classes, enabled payload/event compatibility, limiter
  behavior, and missing/malformed/excessive/cross-service environment values.
- [ ] Local acceptance uses only synthetic/loopback/in-memory test adapters and records
  `D2_MUTATIONS=0`.

### Retained risks and boundaries

Live provider credentials/connectivity remain D2-bound. This ticket must not convert missing
secrets into feature flags. S3 prefix/private-object/upload activation remains #114. ICE/media
readiness remains #115. No per-Issue post-implementation code review runs. The single whole-K6
review covers this ticket later.

### Blocked by

- #111
