# Issue #61 Rate-Limit Planning Evidence

## Status

Identity/key hierarchy, policy-class taxonomy architecture and approval-gate architecture are approved for planning only. The authoritative taxonomy lives in `docs/security/issue-61-policy-class-taxonomy.md`; the quota candidate and numeric approval gates live in `docs/security/issue-61-quota-window-proposal.md`; the evidence plan lives in `docs/security/issue-61-evidence-measurement-plan.md`. No numeric value, instrumentation, implementation, network aggregation policy, nginx change, alert disposition or publication is approved by this historical reconciliation artifact.

## Superseded Primary-Class Reconciliation

This former one-route/one-class view is retained only as historical evidence and must not be used for enforcement design. Use `docs/security/issue-61-policy-class-taxonomy.md`.

The Express application exposes 51 HTTP routes:

| Candidate policy class | Count | Store-unavailable disposition |
| --- | ---: | --- |
| `operational_probe` | 4 | Not subject to Redis-backed distributed application quota |
| `auth_entry` | 3 | Fail closed |
| `auth_recovery` | 2 | Fail closed |
| `auth_refresh` | 1 | Fail closed |
| `auth_session_maintenance` | 2 | Fail open or outside distributed application quota |
| `file_resource` | 6 | Fail closed |
| `state_mutation` | 15 | Fail closed |
| `message_boundary_pending` | 2 | Historical only: retired after M1/M2 remediation; not a live policy or Redis class |
| `read_bounded` | 2 | Candidate enforcement; no distributed application counter until explicitly approved |
| `read_expensive` | 14 | Fail closed |
| **Total** | **51** | |

`POST /api/auth/logout` is a bounded, idempotent cookie-clear operation and is approved as a fail-open/exempt candidate. `GET /api/auth/session` stops before MongoDB for a missing or invalid refresh token; a valid token performs one bounded `User.findById`, does not mutate state, and does not issue a token. It is approved as a fail-open/exempt candidate. `POST /api/auth/refresh` verifies the refresh token, loads the user, issues new access and refresh tokens, and remains fail closed.

## Operational And Probe Evidence

Backend `/healthz`, `/readyz`, and `/ops` all call `checkServices()`. The RabbitMQ check calls `connectionManager.checkStatus()`, which calls `getChannel()` and can begin a RabbitMQ connection when no channel exists. These endpoints must not depend on the Redis-backed application limiter whose state they help observe.

nginx exposes backend `/healthz` as `/backend-healthz` and proxies `/readyz` and `/ops`. Those locations currently have no `limit_req`. This does not approve public, unprotected operational exposure: edge/network protection or access restriction requires a separate review. `/ops` must not be treated as production-ready public telemetry by default.

`/metrics` is registered only when `METRICS_ENABLED=true`. ADR-012 requires the backend port to remain internal and nginx not to proxy `/metrics`; Compose preserves that boundary. Its network-only exemption remains valid only while those conditions hold.

## Nginx Status-Code Compatibility Gap

nginx defines `api_limit` and `auth_limit` shared-memory zones and applies them to `/api/` and `/api/auth/`, but the repository does not configure `limit_req_status`. Nginx therefore uses its [documented default rejection status of `503`](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html#limit_req_status) when an edge quota is exceeded.

This conflicts with the approved semantic distinction:

- Confirmed quota exceeded → `429`.
- Redis-backed application rate-limit store unavailable → HTTP `503` with `RATE_LIMIT_UNAVAILABLE`.

No nginx change is authorized during the grill. An approved implementation plan must decide how to normalize edge rejection, with `limit_req_status 429` as the expected candidate, and must verify edge and application behavior separately.

Nginx rate limiting remains an edge/IP defense-in-depth control backed by nginx shared memory. It is not the Redis-shared distributed application quota and must not be presented as one.

## Verification Items For An Approved Implementation

- Prove nginx edge quota rejection returns `429` after any approved configuration change.
- Prove Redis application quota exhaustion returns `429` with the application response contract.
- Prove Redis application store unavailability returns `503 RATE_LIMIT_UNAVAILABLE` for fail-closed HTTP operations.
- Prove Socket.IO fail-closed operations return transport-appropriate structured `RATE_LIMIT_UNAVAILABLE` errors rather than HTTP semantics.
- Prove operational probes do not depend on the Redis-backed application limiter.
- Re-review `/backend-healthz`, `/readyz`, and `/ops` exposure/access controls without folding that work silently into application rate limiting.

## Identity And Key Planning Invariants

Current Compose routes external traffic through nginx and does not publish backend port `3000`; nginx appends forwarding data and Express currently uses `trust proxy = 1`. This single-ingress/hop assumption is a security boundary, not a topology-independent guarantee. Any proxy-count, ingress, or direct-backend-reachability change requires trust-proxy and `req.ip` behavior to be verified again.

HTTP actor identity must come from `req.ip` for pre-auth network identity or from the principal established by `authMiddleware` for authenticated identity. Socket.IO actor identity must come from `socket.userId` established by handshake JWT verification. Caller-supplied IDs are never actor identities, including message sender IDs and message path parameters covered by the separate access-control triage.

A future key builder must map every present verified principal field to one canonical representation and must not silently create separate buckets for equivalent ObjectId, string, or token-field representations.

One valid canonical verified principal field is sufficient; every alias need not exist. When multiple verified aliases are present, they must canonicalize to the same principal. No valid canonical principal or conflicting aliases must fail authentication/key derivation.

Current Socket.IO handshake code assigns `socket.userId = decoded.id || decoded._id`. A token containing both fields with different principals is not explicitly rejected; runtime currently prefers `id`. This is an implementation compatibility gap to resolve before key-builder approval, not authorization to change JWT or Socket.IO middleware during the grill.

`req.ip` remains the sole pre-auth network identity source after verified ingress topology. A future network actor canonicalizer must validate IPv4 and IPv6 and collapse equivalent textual forms to one address representation. IPv6 prefix aggregation is required as an explicit pre-implementation decision, but no `/56`, `/60`, `/64`, or other prefix is selected without deployment evidence. IPv4 aggregation must also be explicit and must not silently group distinct addresses.

Actor scope is per rate-limit policy class. A global aggregate actor bucket across classes remains undecided. Actor-scoped secondary buckets bind actor and target in the same key. Target-wide protection buckets intentionally omit actor only after explicit aggregate threat-model and fairness approval.

Key-schema version and HMAC derivation/key-material version are independent. Every target HMAC shape must identify its derivation version so all active replicas derive one logical bucket. A mixed-version deployment must not split one account target across independent counters; rotation requires a coordinated single-version cutover or an explicitly designed migration strategy. No HMAC material is created or rotated during planning.

Authenticated limiter ordering must preserve this semantic sequence:

```text
verified authentication
→ canonical actor derivation
→ actor-wide class limiter
→ cheap syntactic/boundary validation and canonical secondary dimension
→ actor-scoped secondary or approved target-wide limiter
→ authorization/resource lookup/business operation
```

Pre-auth network limiting must run without confirming account existence. Account normalization/HMAC must not change response, timing, or logging in a way that reveals whether an account exists.

## Symbolic Key Shapes

These shapes describe hierarchy only. They do not select Redis commands, quotas, windows, bursts, concrete class names, or a key-builder implementation.

### Pre-Auth Login

```text
actor-wide:
rl:v1:class:<CREDENTIAL_ENTRY_CLASS>:actor:network:<CANONICAL_NETWORK_ACTOR_FROM_VERIFIED_REQ_IP>

target-wide account protection, when approved for this endpoint:
rl:<SCHEMA_VERSION>:class:<CREDENTIAL_ENTRY_CLASS>:target-wide:account:hmac:<HMAC_KEY_VERSION>:<ACCOUNT_TARGET_DIGEST>

ACCOUNT_TARGET_DIGEST = HMAC(<HMAC_KEY_MATERIAL_FOR_VERSION>, normalizeAccountTarget(<EXTERNAL_ACCOUNT_IDENTIFIER>))
```

The canonical network actor bucket is mandatory. The target-wide account bucket intentionally aggregates attempts against one account from multiple network actors and never replaces the network actor bucket. Raw email, username, tokens, and HMAC key material are absent from Redis keys and limiter logs.

### Authenticated File Operation

```text
actor-wide:
rl:v1:class:<FILE_RESOURCE_CLASS>:actor:user:<CANONICAL_VERIFIED_PRINCIPAL_ID>

optional actor-scoped secondary:
rl:v1:class:<FILE_RESOURCE_CLASS>:actor:user:<CANONICAL_VERIFIED_PRINCIPAL_ID>:secondary:file:<CANONICAL_VALIDATED_FILE_OR_UPLOAD_SCOPE>
```

The verified user bucket applies across protected file operations in the same class. A caller cannot obtain a new actor quota by changing file, upload, or route. The file/upload dimension may impose an additional tighter bound where a validated resource exists.

### Authenticated Conversation Operation

```text
actor-wide:
rl:v1:class:<CONVERSATION_POLICY_CLASS>:actor:user:<CANONICAL_VERIFIED_PRINCIPAL_ID>

optional actor-scoped secondary:
rl:v1:class:<CONVERSATION_POLICY_CLASS>:actor:user:<CANONICAL_VERIFIED_PRINCIPAL_ID>:secondary:conversation:<CANONICAL_VALIDATED_CONVERSATION_ID>
```

The verified user bucket spans routes and conversations assigned to the same policy class. The conversation bucket is additive and cannot turn a caller-supplied conversation identifier into actor identity.

### Socket.IO Call Initiation

```text
actor-wide:
rl:v1:class:<CALL_INITIATION_CLASS>:actor:user:<CANONICAL_VERIFIED_SOCKET_USER_ID>

optional actor-scoped secondary:
rl:v1:class:<CALL_INITIATION_CLASS>:actor:user:<CANONICAL_VERIFIED_SOCKET_USER_ID>:secondary:callee:<CANONICAL_VALIDATED_TARGET_USER_ID>
```

The handshake-verified socket user is the actor. The callee is only a secondary dimension, so changing targets cannot bypass the caller's class-wide quota.

## Optional Target-Wide Protection Example — Not Approved

```text
target-wide callee protection candidate:
rl:v1:class:<CALL_INITIATION_CLASS>:target-wide:callee:<CANONICAL_VALIDATED_TARGET_USER_ID>
```

This candidate would aggregate call attempts from every caller targeting one callee to mitigate distributed call storms or harassment. It could also let unrelated callers consume the callee's shared budget and deny legitimate calls, so its threat model, fairness behavior, recovery semantics, and quota require explicit approval. It is not part of the approved login account-target distinction and is not currently approved for implementation.

## Superseded Single-Membership Policy-Class Candidate

This table predates the approved separation between unique inventory and many-to-many enforcement membership. It is non-authoritative; use `docs/security/issue-61-policy-class-taxonomy.md`.

The taxonomy avoids route-per-class keys. Every protected operation in a class shares the class actor bucket, while actor-scoped secondary buckets may add target-specific protection.

| Stable class ID | Operations/routes/events | Actor and actor-wide applicability | Secondary and target-wide candidates | Failure mode | Shared-budget rationale and split-bypass consequence | Grouping fairness/availability consequence |
| --- | --- | --- | --- | --- | --- | --- |
| `operational_probe` — 4 HTTP | `GET /healthz`, `/readyz`, `/ops`, conditional `/metrics` | No distributed application actor bucket | None in application limiter; independent edge/network protection requires separate review | Preserve probe semantics; no Redis-limiter dependency | Reconciled as one operational class, but not a shared Redis quota | `/backend-healthz`, `/readyz`, and `/ops` must not become public-unprotected by implication; `/metrics` remains network-only only under ADR-012 conditions |
| `auth_entry` — 3 HTTP | `POST /api/auth/register`, `/login`, `/google` | Mandatory canonical network actor bucket | Target-wide HMAC account bucket for login is a shape candidate; endpoint requirement remains pending | Fail closed | All perform credential/provider verification, account entry/provisioning, session issuance, or CPU/external work; separate route buckets allow rotation across three entry paths | One NAT actor's failed login could reduce registration or Google-login availability; this trade-off needs quota review rather than route splitting by default |
| `auth_recovery` — 2 HTTP | `POST /api/auth/forgot-password`, `/reset-password/:id` | Mandatory canonical network actor bucket | Target-wide HMAC account bucket pending; raw email, user ID, or token cannot be actor | Fail closed | Both consume account-recovery capacity; splitting lets an attacker alternate email-queue requests and reset verification/hash work | Forgot-password abuse could consume a shared budget needed for legitimate reset completion; request/commit separation remains an assignment ambiguity |
| `auth_refresh` — 1 HTTP | `POST /api/auth/refresh` | Mandatory canonical network actor bucket under current route wiring; no refresh token in keys | A verified-principal bucket would require an approved verified session seam; none assumed here | Fail closed | Kept separate because token refresh has different normal frequency and availability sensitivity from login/provisioning | A dedicated class avoids login attacks starving valid refresh, but provides an additional network budget attackers can consume separately |
| `auth_session_maintenance` — 2 HTTP | `GET /api/auth/session`, `POST /api/auth/logout` | Not subject to distributed application quota under approved candidate disposition | None | Fail open or outside application limiter | Session is bounded introspection; logout is idempotent cookie clearing. Existing nginx auth limit remains edge defense only | Keeping them out avoids Redis outage blocking bootstrap/logout; external edge behavior remains independently testable |
| `file_resource` — 6 HTTP | Five `POST /api/files/*` routes plus `PUT /api/users/profile` | Verified user actor bucket | Actor-scoped file/upload scope when cheaply canonicalizable; target-wide file/resource protection not approved | Fail closed | Multipart lifecycle, presigning, S3, queue work and avatar upload can be alternated to evade per-route budgets | Plain profile edits share capacity with avatar/file work; conditional classification of the mixed profile route remains ambiguous |
| `state_mutation` — 15 HTTP | User friendship mutations (4); call-history read mutations (2); group mutations (6); panel preference/leave/delete (3) | Verified user actor bucket | Optional actor-scoped target-user, group, call-history, or conversation dimensions; no target-wide bucket approved | Fail closed | These operations write MongoDB and often invalidate Redis or emit Socket.IO events; domain-specific classes would allow cross-domain write/fan-out rotation | A broad class can let heavy group administration delay unrelated friendship or preference changes; domain subdivision may be needed if evidence shows normal collisions |
| `message_boundary_pending` — 2 HTTP, historical-only | `POST /api/messages`; `GET /api/messages/:userId1/:userId2`; superseded by F2-A/R3 | Not a live actor contract; caller-supplied sender, `userId1`, receiver, group or conversation ID is never actor | No live bucket under this label | Retired | The original concern was that a temporary shared network defense could not substitute for access control | Current policies are `state_mutation.message_write` and `read_expensive.message_history`, both keyed only by authenticated principal |
| `read_bounded` — 2 HTTP | `GET /api/users/profile`, `/api/users/:id` | No distributed application counter until explicitly approved | If enforcement is later approved: verified-user aggregate plus optional actor-scoped target-user dimension for `/:id`; no target-wide bucket approved | Fail-open candidate only if enforcement is approved | Both are bounded user/profile reads; splitting offers little security value and permits trivial route rotation | Shared budget could couple self-profile bootstrap with viewing another profile, but taxonomy symmetry alone does not justify a counter |
| `read_expensive` — 14 HTTP | Users: `/online-friends`, `/friends`, `/friend-requests`, `/sidebar-list`, `/search`, `/api/users`; messages: `/api/messages/sync`; calls: `/api/calls/history`, `/missed`; groups: `/api/groups`, `/api/groups/:groupId`; panel: metadata/resources; `/api/sidebar/conversations` | Verified user actor bucket | Optional actor-scoped conversation, target-user, group, or route-family dimensions; no target-wide aggregate approved | Fail closed | All perform fan-out, aggregation, unbounded relationship expansion, multi-query enrichment, or expensive resource reads; narrower classes permit endpoint rotation to multiply backend work | One shared budget can make a heavy sidebar/search refresh delay unrelated call history or group reads; cost evidence may justify a small number of subclasses, not class-per-route |
| `call_initiation` — 2 Socket.IO events | `initCall`, `callUser` | Handshake-verified canonical `socket.userId` actor bucket | Actor-scoped callee secondary approved at shape level; target-wide callee anti-storm bucket remains pending and not approved | Fail closed with structured `RATE_LIMIT_UNAVAILABLE` transport error | Both can initiate/persist/coordinate call state; separate event buckets make switching between legacy/parallel initiation paths a direct bypass | Shared budget is fair for one caller, while any future target-wide callee bucket risks third parties exhausting the callee's aggregate capacity |

### Reconciliation

- HTTP: `4 + 3 + 2 + 1 + 2 + 6 + 15 + 2 + 2 + 14 = 51` routes.
- Socket.IO: `2` call-initiation events, outside the HTTP count.
- Combined mapped operations: `53`.

## Ambiguous Or Blocked Assignments

- `PUT /api/users/profile`: mixed lightweight profile mutation and optional memory/queue-backed avatar upload; candidate `file_resource` assignment is based on worst-case behavior.
- `POST /api/auth/forgot-password` versus reset-password: one shared `auth_recovery` class prevents recovery-path rotation, but forgot abuse could starve legitimate reset completion.
- `POST /api/auth/refresh`: current route has no standard auth middleware, so taxonomy uses network actor only; any verified-principal quota needs a separately approved verified session seam.
- Historical note: M1/M2 were initially deferred. They are now remediated and use authenticated-principal-only route-specific admission: `state_mutation.message_write` for POST and `read_expensive.message_history` for history GET. `message_boundary_pending` is retired.
- `GET /api/conversations/:id/panel/metadata`: direct conversations appear bounded, while group metadata can scale with member data; candidate remains `read_expensive` by worst-case behavior.
- `state_mutation`: broad grouping prevents cross-domain write rotation but may need evidence-backed domain subclasses for fairness.
- `read_expensive`: broad grouping prevents read-fan-out rotation but may need a small number of cost-homogeneous subclasses after measurement.
- Target-wide account protection is represented for login but endpoint requirements for login, recovery, or other account flows remain pending.
- Target-wide callee, file, conversation, route, or other aggregate buckets remain unapproved.

## Route-Switch Bypass Risks If Classes Are Split Incorrectly

- Rotate `/register`, `/login`, and `/google` to multiply authentication/provisioning capacity.
- Alternate forgot-password and reset-password to consume separate recovery request and password-hash budgets.
- Rotate multipart init, presign, completion, download signing, single upload, and profile-avatar upload paths.
- Alternate friendship, group administration, call-history mutation, and conversation-panel mutation endpoints to multiply MongoDB/write/fan-out load.
- Alternate unauthenticated message reads and writes while exploiting the separate access-control gap.
- Rotate among sidebar, search, lists, histories, group reads, panel loaders, and message sync to multiply expensive read/fan-out capacity.
- Alternate Socket.IO `initCall` and `callUser` to evade call-initiation enforcement.

## Unresolved Identity And Key Decisions

- Canonical network actor representation and validation library/interface.
- IPv6 aggregation/subnet policy based on actual deployment allocation and ingress evidence.
- Explicit IPv4 aggregation policy; no implicit grouping is approved.
- Canonical verified-principal representation and conflict-handling seam shared by HTTP and Socket.IO.
- Resolution of the current Socket.IO `decoded.id || decoded._id` conflict compatibility gap.
- Normalization contract, HMAC derivation version naming, and dedicated key-management mechanism for external account identifiers.
- Coordinated HMAC rotation cutover or migration strategy; no material is created or rotated during planning.
- Which endpoints require target-wide account protection beyond the login example.
- Whether any file, conversation, callee, route, or other target-wide protection bucket is justified.
- Whether a global aggregate actor bucket across policy classes is needed.
- Maintainer approval or revision of the candidate policy-class taxonomy and its ambiguous assignments.
- Exact middleware/composition seams that preserve the approved limiter ordering without expensive pre-limit lookups.
