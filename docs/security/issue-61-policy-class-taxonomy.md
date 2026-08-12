# Issue #61 Policy-Class Taxonomy Candidate

## Status

Historical planning taxonomy. Issue #61 closed with the implemented closure-minimum policy catalog. Current closure state and residual limitations are recorded in `issue-61-final-remaining-risk-record.md`.

## View A — Unique Operation Inventory

Each operation appears exactly once in this completeness view. Inventory labels do not imply exclusive enforcement membership.

| # | Unique HTTP route | Current boundary / inventory note |
| ---: | --- | --- |
| 1 | `GET /healthz` | Backend operational probe |
| 2 | `GET /readyz` | Backend readiness probe |
| 3 | `GET /ops` | Backend operational surface |
| 4 | `GET /metrics` | Conditional internal endpoint when metrics are enabled |
| 5 | `POST /api/auth/register` | Pre-auth account entry |
| 6 | `POST /api/auth/login` | Pre-auth credential entry |
| 7 | `POST /api/auth/google` | Pre-auth provider entry |
| 8 | `GET /api/auth/session` | Approved fail-open/exempt session introspection candidate |
| 9 | `POST /api/auth/refresh` | Staged network then cryptographically verified refresh-token-subject flow |
| 10 | `POST /api/auth/logout` | Approved fail-open/exempt cookie-clear candidate |
| 11 | `POST /api/auth/forgot-password` | Recovery request/email queue surface |
| 12 | `POST /api/auth/reset-password/:id` | Recovery completion surface; reset token is JSON-body only |
| 13 | `GET /api/users/online-friends` | Authenticated expensive read |
| 14 | `GET /api/users/profile` | Authenticated bounded-read candidate |
| 15 | `PUT /api/users/profile` | Authenticated mutation; optional multipart/avatar mode |
| 16 | `GET /api/users/friends` | Authenticated expensive relationship read |
| 17 | `GET /api/users/friend-requests` | Authenticated relationship read |
| 18 | `POST /api/users/accept-friend` | Authenticated mutation |
| 19 | `GET /api/users/sidebar-list` | Authenticated expensive read/fan-out |
| 20 | `POST /api/users/friend-request` | Authenticated mutation |
| 21 | `POST /api/users/reject-friend` | Authenticated mutation |
| 22 | `POST /api/users/remove-friend` | Authenticated mutation |
| 23 | `GET /api/users/search` | Authenticated expensive full-user search |
| 24 | `GET /api/users/:id` | Authenticated bounded-read candidate |
| 25 | `GET /api/users` | Authenticated expensive unbounded/N+1 read |
| 26 | `POST /api/messages` | Authenticated message write; `state_mutation.message_write` admission |
| 27 | `GET /api/messages/:userId1/:userId2` | Authenticated message history; `read_expensive.message_history` admission |
| 28 | `GET /api/messages/sync` | Authenticated expensive read/fan-out |
| 29 | `GET /api/calls/history` | Authenticated expensive aggregate read |
| 30 | `GET /api/calls/missed` | Authenticated count/preview read |
| 31 | `POST /api/calls/:id/read` | Authenticated mutation |
| 32 | `POST /api/calls/read-all` | Authenticated bulk mutation |
| 33 | `POST /api/groups` | Authenticated group mutation |
| 34 | `GET /api/groups` | Authenticated expensive group read |
| 35 | `POST /api/groups/:groupId/add-member` | Authenticated group mutation |
| 36 | `POST /api/groups/:groupId/remove-member` | Authenticated group mutation |
| 37 | `POST /api/groups/:groupId/transfer-admin` | Authenticated group mutation |
| 38 | `PUT /api/groups/:groupId/rename` | Authenticated group mutation |
| 39 | `DELETE /api/groups/:groupId` | Authenticated group mutation |
| 40 | `GET /api/groups/:groupId` | Authenticated member-amplifying read |
| 41 | `POST /api/files/init` | Authenticated file/resource operation |
| 42 | `POST /api/files/get-presigned-url` | Authenticated file/resource operation |
| 43 | `POST /api/files/:fileId/download-url` | Authenticated file/resource operation |
| 44 | `POST /api/files/complete` | Authenticated file/resource operation |
| 45 | `POST /api/files/upload-single` | Authenticated buffered file/resource operation |
| 46 | `GET /api/conversations/:id/panel/metadata` | Authenticated read; worst-case group amplification |
| 47 | `PATCH /api/conversations/:id/panel/preference` | Authenticated mutation |
| 48 | `GET /api/conversations/:id/panel/resources` | Authenticated parallel resource read |
| 49 | `POST /api/conversations/:id/panel/leave` | Authenticated mutation |
| 50 | `POST /api/conversations/:id/panel/delete` | Authenticated mutation |
| 51 | `GET /api/sidebar/conversations` | Authenticated expensive multi-query read |

| # | Unique Socket.IO call-initiation event | Current boundary / inventory note |
| ---: | --- | --- |
| S1 | `initCall` | Handshake-authenticated call initiation |
| S2 | `callUser` | Handshake-authenticated call initiation with current local limiter |

Inventory reconciliation: exactly **51 unique HTTP routes + 2 unique Socket.IO call-initiation events**.

## View B — Many-To-Many Enforcement Memberships

Membership count is intentionally not reconciled to 51. An operation may participate in an aggregate actor-wide bucket plus operation/domain actor-scoped buckets and an explicitly approved target-wide bucket.

| Stable class ID or planning label | Operations participating | Actor-wide membership | Actor-scoped operation/domain secondary candidates | Target-wide/aggregate candidate | Failure mode | Abuse, bypass, fairness and availability rationale |
| --- | --- | --- | --- | --- | --- | --- |
| `auth_entry` | Register, login, Google login | Mandatory canonical network actor aggregate bucket | Actor-bound `login`, `register`, and `google` operation dimensions may preserve different cadence/cost policies | Login HMAC account target remains pending endpoint approval | Fail closed | Aggregate bucket prevents route rotation across credential/provider entry. Operation secondaries preserve login/register/provider differentiation. NAT actors may experience cross-operation starvation, so no common numeric policy is implied. |
| `auth_recovery_request` | Forgot-password | Mandatory canonical network actor before account lookup/queue work | Actor-scoped recovery-request operation dimension if needed | HMAC account target pending endpoint approval | Fail closed | Isolates email/request abuse from reset completion so spam cannot consume completion capacity. |
| `auth_recovery_complete` | Reset-password | Mandatory canonical network actor before DB/token/bcrypt work | Any post-verification principal or target dimension requires separate evidence and a verified seam | None approved | Fail closed | Protects the security-restoring completion path independently from request spam. The path `id` and raw token are not actors. |
| `auth_recovery_aggregate` — optional, not approved | Forgot-password and reset-password | Optional canonical network aggregate bucket | Does not replace the two mandatory class buckets | None | Would fail closed if approved | Could cap combined recovery abuse, but reintroduces starvation of legitimate completion by request spam; requires a separate threat/fairness decision. |
| `auth_refresh` — Stage A | Refresh | Mandatory canonical network actor before refresh-token verification | None before verification | None | Fail closed | Protects cryptographic verification without DB lookup and without using the credential as key material. |
| `auth_refresh` — Stage B | Refresh after successful signature/type/subject verification | **Recommended mandatory** actor bucket keyed by the canonical verified refresh-token subject before `User.findById` and token issuance | Actor-scoped refresh operation dimension is inherent in the class; no raw-token dimension | None | Fail closed | The signed claim is trusted for rate-limit keying because it has been cryptographically verified. It does not prove that the user record still exists or is active; DB/account validation remains downstream. This stops one valid or compromised refresh-token subject from rotating IPs to multiply DB/token-issuance work. |
| `auth_session_maintenance` — non-enforcement label | Session and logout | No distributed application membership under approved fail-open/exempt disposition | None | None | Fail open/outside quota | Redis outage must not block bounded session introspection or cookie clearing. Existing nginx auth limiting remains edge-only. |
| `state_mutation` | **Every** profile update; 4 friendship mutations; 2 call-history mutations; 6 group mutations; 3 panel mutations | Mandatory verified-user aggregate bucket | Actor-scoped domains: `profile`, `friendship`, `call_history`, `group_admin`, `conversation_panel` | No target-wide bucket approved | Fail closed | Aggregate bucket prevents cross-domain mutation/fan-out rotation. Domain secondaries can prevent heavy group work starving low-cost preference/friendship actions without abandoning aggregate protection. |
| `file_resource` | Five file routes; **additionally** profile update when cheap boundary metadata indicates multipart/avatar mode | Mandatory verified-user aggregate bucket; profile decision must occur before Multer buffering | Actor-scoped `multipart`, `upload`, `download-signing`, file/upload scope candidates | No target-wide file bucket approved | Fail closed | Prevents rotation across file lifecycle and avatar upload. Multipart profile requests also remain in `state_mutation`; memberships are intentionally overlapping. |
| `message_boundary_pending` — retired Issue #61 planning label | None | Not a live policy | Do not reuse | None | Not applicable | Replaced by authenticated-principal message route policies. |
| `read_bounded` — candidate enforcement; no distributed application bucket until explicitly approved | User profile GET and user-by-id GET | No distributed application bucket | If enforcement is later approved: verified-user aggregate plus optional actor-scoped `self_profile` or target-user dimensions | None | Not applicable until approved; fail-open candidate if enforced | Do not create a counter for taxonomy symmetry. Runtime measurement must first show that application enforcement adds value beyond edge protection. |
| `read_expensive` | 14 authenticated expensive/fan-out reads from users, message sync, calls, groups, panel and sidebar | Mandatory verified-user aggregate bucket | Actor-scoped domains: `user_directory`, `message_sync`, `call_history`, `groups`, `conversation_panel`, `sidebar` | No target-wide bucket approved | Fail closed | Aggregate class prevents rotating across expensive UI/data paths. Domain secondaries preserve cost/fairness differences and reduce cross-screen starvation without class-per-route quotas. |
| `call_initiation` | `initCall`, `callUser` | Mandatory handshake-verified user aggregate bucket | Actor-scoped callee dimension | Target-wide callee anti-storm bucket remains unapproved | Fail closed with structured Socket error | Shared actor bucket blocks event-path rotation. Callee secondary limits one caller→callee pair; a callee-wide bucket has separate harassment/fairness risks. |
| `operational_probe` — non-enforcement label | Four operational routes | No Redis-backed application membership | None | Independent edge/network protection requires separate review | Preserve probe semantics | Reconciles inventory without making probes depend on the Redis limiter they observe. |

## Required Profile Multi-Membership And Ordering

`PUT /api/users/profile` always participates in `state_mutation`. When cheap request-boundary metadata indicates multipart/avatar mode, it additionally participates in `file_resource`.

Required semantic ordering:

```text
verified auth
→ canonical user actor
→ state_mutation actor-wide limiter
→ cheap multipart/boundary classification
→ file_resource actor-wide limiter when applicable
→ Multer buffering
→ authorization/business mutation and queue work
```

The decision cannot depend on `req.file`, because current `upload.single("avatar")` has already buffered the payload by then. Exact cheap boundary detection remains an implementation design question.

Compatibility/security gap: the profile route uses Multer `memoryStorage()` without an explicit file-size limit. This is recorded only; no Multer or middleware change is authorized during planning.

## Recovery Split

`auth_recovery_request` and `auth_recovery_complete` are separate mandatory classes. An umbrella `auth_recovery_aggregate` is optional and unapproved because request spam could starve legitimate recovery completion.

## Refresh Staged Identity Recommendation

```text
Stage A:
canonical network actor
→ auth_refresh network actor-wide limiter
→ refresh-token cryptographic verification

Stage B after successful verification:
canonical verified refresh-token subject from signed claims
→ auth_refresh verified-subject actor-wide limiter
→ User.findById
→ token issuance
```

Recommendation: Stage B verified-subject membership should be **mandatory**, not merely optional. The subject is trusted for rate-limit keying because the refresh-token signature, type, and subject claim have been cryptographically verified; it does not prove the user record still exists or is active. DB/account validation remains downstream. It protects DB lookup and token issuance against a valid or compromised subject rotating across IPs, and it cannot use the raw refresh token, an HMAC/hash of that credential, caller-supplied IDs, or a DB lookup to derive the Stage A network actor.

Current compatibility gap: refresh verification and principal extraction live inside controller/service flow rather than an approved pre-DB limiter seam. No middleware refactor is authorized during the grill.

## Broad Aggregate Class Analysis

| Class | Aggregate abuse scenario | Likely actor-scoped secondaries | User-visible starvation risk | Why retain aggregate protection |
| --- | --- | --- | --- | --- |
| `auth_entry` | Rotate login, register and Google entry to multiply bcrypt/provider/session work | `login`, `register`, `google`; account target where separately approved | Failed login behind a NAT may reduce registration/provider capacity | Prevents route rotation while still allowing later per-operation cadence differentiation |
| `state_mutation` | Rotate friendship, group, call-history, panel and profile writes to multiply Mongo/Redis/Socket effects | `profile`, `friendship`, `call_history`, `group_admin`, `conversation_panel` | Group administration could delay profile or preference operations | Caps aggregate write/fan-out pressure; domain secondaries preserve fairness |
| `read_expensive` | Rotate search/sidebar/list/history/group/panel/sync reads to multiply fan-out and enrichment work | `user_directory`, `message_sync`, `call_history`, `groups`, `conversation_panel`, `sidebar` | Heavy sidebar or search could delay call history or panel data | Caps total expensive read pressure without class-per-route fragmentation |

## Stable Enforcement Class IDs Ready For Approval

- `auth_entry`
- `auth_recovery_request`
- `auth_recovery_complete`
- `auth_refresh`
- `state_mutation`
- `file_resource`
- `read_expensive`
- `call_initiation`

These IDs are symbolic planning IDs. Their approval would not select numeric policies or authorize implementation.

## Planning-Only Or Provisional Labels

- `message_boundary_pending` — retired Issue #61 historical planning label; not a Redis namespace.
- `auth_recovery_aggregate` — optional aggregate candidate, not approved.
- `auth_session_maintenance` — non-enforcement inventory label.
- `operational_probe` — non-enforcement inventory label.
- `read_bounded` — candidate enforcement; no Redis-backed application bucket until explicit approval.
- Operation/domain secondary dimensions listed above — membership and concrete names remain pending quota/fairness review.
- Target-wide account, callee, file, conversation or route buckets — pending explicit threat/fairness approval.

## Remaining Taxonomy Ambiguities

- Exact cheap boundary signal that identifies multipart/avatar profile mode before Multer buffering.
- Whether plain profile updates need a profile-domain secondary bucket in addition to `state_mutation`.
- Whether `auth_recovery_aggregate` is justified despite recovery-completion starvation risk.
- Exact verified session seam needed to enforce mandatory refresh Stage B before DB lookup.
- Whether reset completion gains any post-verification principal/target bucket without an expensive pre-limit lookup.
- Creation/publication authorization and identifier for the combined M1/M2 follow-up.
- Reclassification of message routes after the follow-up establishes verified-principal/authz semantics.
- Exact operation/domain secondary dimensions retained for `auth_entry`, `state_mutation`, and `read_expensive`.
- Whether runtime evidence justifies promoting `read_bounded` from taxonomy-only label to an enforced application class.
- Whether direct panel metadata merits a cheaper secondary policy while group metadata remains expensive.
- Endpoint approval for target-wide account HMAC protection.
- Any target-wide callee/resource protection and its fairness semantics.

## Explicit Non-Goals

- No numeric quota, window or burst selection.
- No limiter, Redis key builder, Multer, auth, refresh, message, nginx or JWT changes.
- No IPv6 prefix choice.
- No HMAC material creation or rotation.
- No alert dismissal or access-control remediation publication.
