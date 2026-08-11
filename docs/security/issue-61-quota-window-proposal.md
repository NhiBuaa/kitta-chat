# Issue #61 Quota, Window, And Burst Proposal

## Status

Quota topology and algorithm-family direction are approved at planning level. Every numeric quota, window and capacity in this document remains candidate/pending, including values inherited from current process-local limiters. This is not implementation approval and does not authorize Redis keys, middleware changes, nginx changes, Multer changes, auth/access-control remediation, HMAC material, or alert disposition.

The policy-class taxonomy architecture is approved for quota planning. `read_bounded` remains taxonomy-only and receives no distributed application counter in this proposal.

The approval-gate architecture is finalized. Evidence acquisition and measurement planning is maintained separately in [issue-61-evidence-measurement-plan.md](issue-61-evidence-measurement-plan.md); that plan does not authorize instrumentation or production measurement.

Maintainer Decision 2 is recorded as `B — stop retained-evidence pursuit`: retained compatibility evidence remains `B = 0`, there will be no provenance audit #3, and raw auth/recovery logs remain `restricted/quarantined for measurement use`. Every measurement-dependent numeric candidate therefore remains pending. Static reasoning cannot substitute for the missing measurement or silently reclassify `measurement required` as intentional hardening. Numeric approval can advance only through a separately approved privacy-safe measurement/instrumentation slice, or through a later explicit maintainer decision that changes the applicable approval gate; this document neither designs nor authorizes that slice.

## Algorithm Semantics

- Low-volume authentication and recovery buckets use rolling/sliding-window semantics so a fixed-window boundary cannot double the effective allowance. Burst is not separate from the window quota.
- Interactive authenticated buckets use token-bucket semantics with a refill rate and an explicit stored-token capacity. Capacity is the maximum immediate burst when the bucket is full. Refill is not a rolling-window maximum: over an interval, a full bucket can admit its initial capacity plus tokens replenished during that interval.
- Same-stage mandatory buckets should be checked and consumed atomically in Redis with all-or-none consumption. If any same-stage mandatory bucket blocks the operation, none of that stage's other buckets are consumed. Staged flows such as refresh may consume Stage A before Stage B exists; Stage A is not rolled back when a later stage rejects.
- Every backend replica observes the same logical counters. No replica-local fallback is allowed for distributed enforcement.
- Distributed decisions use authoritative/shared time semantics suitable for Redis coordination. Replica-local clock skew and naive independent `Date.now()` values cannot control window boundaries, refill or reset behavior.
- Sliding-window and token-bucket state has finite TTL derived from algorithm semantics. Expiry cannot discard still-relevant window history or restore token capacity earlier than natural refill-to-capacity.

### Authoritative time and TTL invariants

- Exact shared-time mechanics remain an implementation decision, but every replica must receive the same effective time basis for one distributed decision.
- Sliding-window history remains present until its events can no longer affect admission or `Retry-After`.
- Token-bucket state may be removed only when reinitializing at capacity would be equivalent to natural refill. Idle cleanup cannot grant an early burst.
- TTL derivation must use the approved window, or the token refill rate, current deficit and capacity. No concrete Redis TTL is selected here.

## Quota Topology

| Class | Mandatory topology | Mandatory actor-scoped secondary | Optional secondary | Target-wide status | Failure mode |
| --- | --- | --- | --- | --- | --- |
| `auth_entry` | Canonical network actor aggregate | Operation buckets for login, register and Google entry | None | Login HMAC account bucket proposed but pending due account-lockout fairness | Fail closed |
| `auth_recovery_request` | Canonical network actor | Recovery-request operation bucket is the class bucket | None | HMAC account bucket proposed, pending non-enumeration/fairness review | Fail closed |
| `auth_recovery_complete` | Canonical network actor before DB/token/bcrypt | None mandatory | Verified reset subject after cryptographic verification, if an evidence-backed cheap seam exists | None proposed | Fail closed |
| `auth_refresh` Stage A | Canonical network actor before refresh verification | None | None | None | Fail closed |
| `auth_refresh` Stage B | Canonical verified refresh-token subject after signature/type/subject verification and before DB | None | None | None | Fail closed |
| `state_mutation` | Verified user aggregate | Profile, friendship, group administration, conversation-panel mutation and call-history mutation domains | Actor-resource dimensions where cheap IDs exist | No target-wide bucket recommended | Fail closed |
| `file_resource` | Verified user aggregate | Upload-control, part-presign and download-signing operation families | Actor-file/upload scope | No target-wide file bucket recommended without abuse evidence | Fail closed |
| `read_expensive` | Verified user aggregate | User-directory, message-sync, call-history, groups, conversation-panel and sidebar domains; panel resources also require actor+conversation | Other actor-conversation/group/user dimensions | No target-wide read bucket recommended | Fail closed |
| `call_initiation` | Verified Socket user aggregate counting logical call attempts, not protocol events | Actor-callee pair | Conditional lightweight raw-event flood control if replay suppression cannot bound event cost | Callee-wide anti-storm bucket remains pending/not recommended without harassment evidence | Structured fail closed |
| `read_bounded` | No distributed application bucket until explicitly approved | None | None | None | Candidate enforcement only; store-unavailable semantics do not apply while unenforced |

### Mandatory operation/domain mapping

| Class and actor-scoped domain | Operations that consume it | Status |
| --- | --- | --- |
| `auth_entry` / `login` | `POST /api/auth/login` | Mandatory with the class aggregate |
| `auth_entry` / `register` | `POST /api/auth/register` | Mandatory with the class aggregate |
| `auth_entry` / `google` | `POST /api/auth/google` | Mandatory with the class aggregate |
| `state_mutation` / `profile` | Every `PUT /api/users/profile` | Mandatory; multipart/avatar mode also consumes file buckets |
| `state_mutation` / `friendship` | Accept, send, reject and remove friendship routes | Mandatory |
| `state_mutation` / `call_history` | `POST /api/calls/:id/read`, `POST /api/calls/read-all` | Mandatory |
| `state_mutation` / `group_admin` | Create, add/remove member, transfer admin, rename and delete group routes | Mandatory |
| `state_mutation` / `conversation_panel` | Preference, leave and delete panel routes | Mandatory |
| `file_resource` / `upload_control` | File init, complete and single-upload routes; multipart/avatar profile mode | Mandatory before buffering when buffering applies |
| `file_resource` / `part_presign` | `POST /api/files/get-presigned-url` | Mandatory |
| `file_resource` / `download_signing` | `POST /api/files/:fileId/download-url` | Mandatory |
| `read_expensive` / `user_directory` | Online friends, friends, friend requests, search and all-users reads | Mandatory |
| `read_expensive` / `message_sync` | `GET /api/messages/sync` | Mandatory |
| `read_expensive` / `call_history` | Call history and missed-call reads | Mandatory |
| `read_expensive` / `groups` | Group list and group detail reads | Mandatory |
| `read_expensive` / `conversation_panel` | Panel metadata and resources reads | Mandatory; resources also consume actor+conversation bucket |
| `read_expensive` / `sidebar` | User sidebar-list and conversation-sidebar reads | Mandatory |
| `call_initiation` / actor-callee | `initCall` and its correlated `callUser`, counted as one logical attempt | Mandatory with the call aggregate |

Actor-resource dimensions below these domains remain optional unless this document marks them mandatory. No target-wide bucket is mandatory in this proposal.

### Taxonomy items outside this numeric proposal

- `operational_probe` remains outside the Redis-backed application quota. External `/backend-healthz`, `/readyz` and `/ops` exposure still requires independent edge/network review; `/metrics` remains conditional and internal under current evidence.
- `auth_session_maintenance` remains outside the distributed quota under the approved `GET /api/auth/session` and `POST /api/auth/logout` fail-open/exempt candidate disposition.
- `message_boundary_pending` receives no numeric policy. M1 and M2 are assigned to `dedicated message-access-control follow-up required / identifier pending`. The two unauthenticated routes cannot use a caller-supplied sender, path user, receiver, group or conversation as an authenticated actor. A canonical network actor is planning-safe only and must not become a stable Redis contract merely because auth is currently missing. Route-specific distributed application limiter implementation is blocked by default until the follow-up produces verified-principal/authorization semantics; temporary network-only application limiting is not approved.
- `read_bounded` remains a candidate enforcement label only, with no Redis-backed application counter until separately approved.

## Target-Wide Account Lockout Analysis

HMAC protects account identifiers from raw key/log disclosure and supports deterministic derivation. It does not prevent an attacker who knows a victim's email or username from exhausting the victim's shared target bucket through many network actors.

| Account bucket | Enforcement semantics | Distributed guessing benefit | Backend protection | Targeted victim lockout risk | Enumeration/activity side-channel risk | Recovery/availability consequence | Interaction with network actor bucket |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login account `20/15 min` | A. Hard admission gate | Strong: caps attempts against one account across IPs | Strong: rejects before repeated lookup/bcrypt when target budget is exhausted | High: attacker can make the victim's correct login reject until reset | High unless rejection, timing and retry metadata are indistinguishable; victim-visible lockout still exists even with generic response | Denies account access during the window | Network bucket still caps each source; target gate adds cross-network concentration control |
| Login account `20/15 min` | B. Side-effect/work suppression | Strong only if credential verification itself is suppressed | Strong if auth work is skipped | High: a correct login cannot succeed without auth work, so generic suppression is still effective lockout | Direct API shape can remain generic, but success/failure behavior reveals activity to the victim and may create timing risk | Denies login; offers little fairness advantage over a hard gate | Network bucket remains mandatory |
| Login account `20/15 min` | C. Telemetry/detection only | Detects distributed concentration but does not stop guessing | None directly | Low direct lockout risk | Lowest direct enforcement side channel if telemetry is not externally exposed | Login remains available subject to network quota | Network bucket is the only admission gate; operations may trigger alert/review separately |
| Forgot account `3/hour` | A. Hard admission gate | Limits distributed recovery requests to one target | Strong: blocks lookup/queue/email work | Very high: only three distributed requests can prevent the victim's legitimate recovery admission for the rest of the window | `429` or target-specific retry behavior can reveal target activity unless completely indistinguishable | Legitimate recovery request is rejected and no email is sent | Network bucket limits each source but cannot stop several sources consuming the shared target budget |
| Forgot account `3/hour` | B. Side-effect/work suppression | Limits repeated recovery side effects across IPs | Strong: generic response can skip lookup/queue/email | Very high and silent: attacker can consume three units, after which victim receives generic success but no recovery email | External response can remain generic, but delivery/non-delivery is an activity signal to the account owner | Directly threatens recovery availability; non-delivery must be an explicit accepted tradeoff | Network bucket remains mandatory and does not restore target availability |
| Forgot account `3/hour` | C. Telemetry/detection only | Detects distributed target concentration | None directly; lookup/queue/email still run unless another control blocks | Low direct target-lockout risk | Lowest externally visible target-state signal | Recovery remains available subject to network quota | Network bucket remains the only admission gate |

Current planning classification for both account targets is `telemetry/detection only`. Login hard/suppression enforcement is blocked by unresolved targeted-lockout policy. Forgot side-effect suppression remains an analyzable candidate, but `3/hour` enforcement is blocked until the maintainer explicitly accepts silent recovery-email non-delivery and victim-starvation risk. HMAC is not counted as a lockout mitigation.

## Target-Wide Policy Status

| Target | Threat defended | Proposed enforcement type | Targeted-starvation risk | Existence/activity leakage consideration | Current recommendation | Approval blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Login account | Distributed credential guessing against one account | `telemetry/detection only`; hard/suppression blocked | High if enforced | Status/timing/retry and victim login behavior can reveal target throttling | Keep telemetry-only; do not promote `20/15 min` to gate | Explicit maintainer acceptance of targeted login lockout plus non-enumeration design |
| Forgot-password account | Distributed recovery-email/queue abuse | `telemetry/detection only`; suppression candidate blocked | Critical at `3/hour`; victim can silently lose recovery email | Generic response hides API result, but email non-delivery reveals suppression to victim | Keep telemetry-only until recovery availability decision | Explicit acceptance of silent non-delivery/target starvation and evidence for threshold |
| Verified reset subject | Abuse by one cryptographically verified reset subject; not a public account-target bucket | Optional hard admission after verification if approved | Lower public-target risk because valid token is required; holder can exhaust its own subject budget | Must not reveal user-record existence after token verification | Keep pending; treat as verified-subject actor bucket, not target-wide account gate | Cheap verified seam, token semantics and workload evidence |
| Callee-wide | Distributed call storm/harassment against one callee | `telemetry/detection only` | High: unrelated callers can deny legitimate calls | Rejection may reveal callee activity/pressure | Hard gate not recommended | Harassment evidence, product recovery semantics and explicit starvation acceptance |
| File-wide/resource-wide | Distributed traffic against one file/upload target | `telemetry/detection only`; no concrete bucket proposed | Medium/high for shared or popular resources | Target-specific rejection can reveal resource existence/activity | Not recommended without resource-specific evidence | Threat evidence, authorization-safe key derivation and fairness model |
| Conversation-wide | Distributed fan-out against one conversation/group | `telemetry/detection only`; no concrete bucket proposed | High: one or several members can starve all participants | Target rejection can reveal conversation existence/activity | Not recommended | Threat evidence, membership fairness and non-leakage design |

## Charge Semantics

The default unit is one admitted attempt, not one success. Cheap, bounded parsing may run first only to derive the complete applicable bucket set. Once that set is derivable, all mandatory same-stage buckets charge atomically before the expensive work they protect. Transport or body-parser failures that never reach route admission cannot be charged by these application buckets and require independent bounded parser/edge protection.

| Bucket or bucket family | Charge point and unit | Malformed, validation or authorization outcome | Downstream failure and success | Retry, idempotency or replay |
| --- | --- | --- | --- | --- |
| `auth_entry` network aggregate | One route admission after canonical network actor and applicable operation are known; before credential, provider or DB work | Post-boundary malformed input and invalid credentials charge; no authorization step exists | Provider/DB/bcrypt failure and success both remain charged; no refund | Every retry charges |
| Login operation | Atomic with `auth_entry`; one login attempt before account lookup/bcrypt | Invalid identifier/password and semantic validation failure charge | DB/bcrypt/internal failure and success remain charged | Every retry charges; no caller-supplied idempotency bypass |
| Register operation | Atomic with `auth_entry`; one registration attempt before duplicate/account checks and hashing | Duplicate account, invalid fields and semantic validation failure charge | DB/bcrypt/queue failure and success remain charged | Every retry charges unless a future server-owned idempotent seam suppresses all expensive work |
| Google-entry operation | Atomic with `auth_entry`; one provider-entry attempt before provider-token verification | Missing, malformed or invalid provider token charges once route admission is derivable | Provider outage/rejection, DB failure and success remain charged | Every retry charges |
| Optional login target-wide HMAC account | For a valid normalized external identifier, one target attempt atomic with network aggregate and login operation; before account existence lookup | Unknown and existing accounts charge indistinguishably; an identifier that cannot be normalized has no target bucket, but the network and login-operation buckets still charge before bounded rejection | Credential/DB failure and success remain charged; no account-existence-dependent refund | Every valid-target retry charges; raw identifier is never keyed/logged |
| `auth_recovery_request` network | One forgot-password admission before account lookup and queue work | Unknown account, invalid field and post-boundary validation failure charge | DB/queue failure and success remain charged; no refund | Every retry charges |
| Optional forgot target-wide HMAC account | One normalized target attempt, atomic with the request bucket when applicable and before lookup | Unknown/existing account behavior is indistinguishable; an unnormalizable target has no target bucket, but the network request bucket still charges before bounded rejection | Lookup/queue failure and success remain charged | Every valid-target retry charges; no existence-dependent skip |
| `auth_recovery_complete` network | One reset completion admission before token verification, DB lookup and bcrypt | Malformed/invalid/expired token and invalid password input charge | DB/bcrypt failure and success remain charged | Every retry charges |
| Optional verified reset-subject | One attempt after successful cryptographic verification and before DB/bcrypt | Cryptographic failures cannot derive and do not charge this bucket; Stage/network bucket already charged. Downstream authorization/account rejection charges | DB/bcrypt failure and success remain charged | Every post-verification retry charges |
| Refresh Stage A network | One refresh route admission before refresh-token verification | Missing, malformed, invalid or expired token charges Stage A | Verification/internal failure and later success/failure do not refund Stage A | Every retry charges Stage A |
| Refresh Stage B verified subject | One cryptographically verified subject attempt before `User.findById` and token issuance | Invalid signature/type/subject never reaches Stage B; missing/inactive user after verification charges | DB/token-issuance failure and success remain charged | Every verified retry charges; Stage A is not rolled back |
| `state_mutation` aggregate plus mandatory domain | One mutation admission after cheap bucket-set derivation and before authorization/resource lookup, DB, queue or realtime work | Post-admission validation and authorization rejection charge all applicable same-stage buckets | DB/queue/Socket failure and success remain charged | Retry charges; server-validated dedupe may suppress work but does not create a caller-controlled free path |
| Optional mutation actor-resource | When approved and cheaply derivable, one actor-resource attempt in the same atomic admission | Malformed resource identity is rejected before expensive lookup; unauthorized canonical resource attempts charge | Downstream failure and success remain charged | Replays charge unless server suppresses them before expensive work under an approved idempotency rule |
| `file_resource` aggregate plus operation domain | One init, complete, presign, download-sign or buffered-upload admission; multipart/profile file mode is admitted before Multer buffering | Invalid metadata, rejected file/boundary validation and authorization rejection after admission charge | S3, DB, queue, Multer/buffering failure and success remain charged | Every retry charges; completion replay is free only if server-owned idempotency suppresses expensive work before admission under a separately approved design |
| Optional actor-file/upload scope | When approved and cheaply derivable, one actor-file/upload attempt in the same atomic file admission | Invalid scope rejects before expensive work; unauthorized canonical scope charges | Downstream failure and success remain charged | Caller-supplied file/upload ID cannot claim prior charge |
| `read_expensive` aggregate plus mandatory domain | One read admission before authorization/resource lookup and expensive query/fan-out | Post-admission validation and authorization rejection charge | Query/cache/downstream failure and success remain charged | Refresh/retry/reconnect requests each charge |
| Panel-resources actor+conversation | One panel-resources read, atomic with expensive-read aggregate and panel domain | Malformed canonical conversation is rejected before expensive work; authorization rejection after admission charges | Query/fan-out failure and success remain charged | Every refresh/retry charges |
| `call_initiation` aggregate plus actor-callee | One server-validated logical attempt, normally at accepted `initCall`; unmatched `callUser` starts and charges a new attempt | Post-admission parameter rejection and downstream call authorization rejection charge; input that cannot derive a canonical callee is rejected before expensive work | DB/Redis/signalling failure and success remain charged; no refund | Expected correlated `callUser` does not double-charge. Repeated phases are suppressed before expensive work or covered by raw-event control |
| Optional callee-wide target | If approved, one logical attempt atomic with caller aggregate and actor-callee buckets | Same canonical target semantics regardless of later call outcome | Downstream failure and success remain charged | Same server-validated logical-attempt correlation; third-party starvation risk remains pending |
| Conditional lightweight raw call-event control | One raw `initCall`/`callUser` event when replay suppression alone cannot bound event-flood work | Malformed and replayed events charge | Event rejection/suppression does not refund | Every raw event charges; numeric policy remains unselected |
| `read_bounded` | No bucket and no charge | Not applicable | Not applicable | Not applicable |

## Numeric Approval-Gate Matrix

Every Tier B/Tier C value remains pending. For token buckets, the candidate includes refill rate and stored-token capacity; it is not a strict rolling-window maximum.

### Authentication, recovery and refresh

| Candidate | Policy purpose | Current baseline | Compatibility risk | Security benefit | Evidence required | Human tradeoff required | Approval mode | Rollback/revisit signal | Current status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth_entry` aggregate — sliding `20/15 min` | Bound route rotation across login/register/Google | None | Shared NAT cross-operation starvation | Caps combined credential/provider/session work | Mixed auth traffic per network; provider/bcrypt cost | Accept coupling of otherwise distinct entry paths | `measurement required` | Auth conversion/support issues or aggregate blocks healthy operation bucket | Pending — Tier C |
| Login operation — sliding `10/15 min` | Bound credential guessing and bcrypt work per network | Process-local first-hit fixed `10/15 min`; every route-reaching pass, failed controller attempt and over-limit request increments; invalid JSON/oversize body is upstream of limiter | Coordination scope, algorithm and accounting all tighten: roughly one-to-three shards collapse, fixed window becomes sliding, rejected-admission accounting changes | Removes replica/window-boundary multiplication and bounds credential work cluster-wide | Source fingerprint; login tests; actual ingress distribution; NAT concentration and block outcomes | Explicitly accept coordination-scope change + algorithm change + accounting change, not just same visible number | `explicit intentional hardening decision` | Legitimate login failures, NAT complaints, operation `429` concentration or semantic compatibility issue | Pending — Tier B |
| Register operation — sliding `5/hour` | Bound account creation/hash abuse | Process-local fixed `5/hour` | Multiple legitimate signups behind one NAT may block sooner | Cluster-wide account-creation ceiling | Signup distribution, NAT concentration and conversion | Choose hardening versus approximate current behavior | `measurement required` | Signup abandonment/support or high shared-network blocks | Pending — Tier B |
| Google operation — sliding `10/15 min` | Bound provider verification/session work | None | Provider retries and shared NAT users may block | Adds missing provider-entry admission control | Provider latency, retry patterns, failures and NAT distribution | Accept availability impact during provider instability | `measurement required` | Provider-login failure/retry amplification | Pending — Tier C |
| Login account target — sliding `20/15 min` | Detect or limit distributed guessing against one account | None | Enforced gate can lock out a targeted victim | Cross-network concentration signal/control | Target concentration, false positives, lockout simulation, timing analysis | Explicitly accept targeted login denial if promoted beyond telemetry | `blocked by unresolved policy` | Victim login denial, hot-target false positives or leakage | Pending — Tier C; telemetry-only |
| Recovery request network — sliding `5/hour` | Bound account lookup/email queue abuse per network | Process-local fixed `5/hour` | Shared NAT recovery may block sooner | Cluster-wide request/queue protection | Recovery frequency, queue load, NAT concentration, successful recovery rate | Balance abuse control with security-restoring availability | `measurement required` | Recovery failures, support requests or edge/app starvation | Pending — Tier B |
| Forgot account target — sliding `3/hour` | Detect or suppress distributed recovery abuse against one account | None | Three distributed attempts can silently starve victim email delivery | Cross-network target concentration signal/control | Target-request distribution, email delivery, recovery success, lockout exercises | Explicitly accept silent recovery non-delivery if suppression is chosen | `blocked by unresolved policy` | Victim non-delivery, recovery failures or activity leakage | Pending — Tier C; telemetry-only |
| Recovery completion network — sliding `10/15 min` | Bound reset-token verification, DB and bcrypt | None | Shared NAT can block legitimate completion | Protects security-restoring expensive path separately from forgot | Reset attempts, invalid-token cost, completion success and NAT distribution | Accept completion throttling independent from request flow | `measurement required` | Valid reset completion failures or support volume | Pending — Tier C |
| Optional verified reset subject — sliding `5/hour` | Bound repeated work by one cryptographically verified reset subject | None | Valid holder may exhaust own recovery path | Limits post-verification IP rotation | Cheap verification seam, token retry patterns and bcrypt cost | Decide whether optional subject bucket is justified | `blocked by unresolved policy` | Valid-token completion failures or seam requiring expensive lookup | Pending — Tier C |
| Refresh Stage A network — token `60/min`, capacity `10` | Bound refresh-token verification before subject exists | None | NAT/bootstrap/retry storms may block users | Caps cryptographic verification load | Tabs/devices per network, bootstrap and 401/403 retry storms | Accept shared-network refresh coupling | `measurement required` | Forced logout, refresh `429` or retry amplification | Pending — Tier C |
| Refresh Stage B subject — token `20/min`, capacity `5` | Bound DB/token issuance by verified subject across IPs | None | Multi-tab/device bootstrap can exhaust subject budget | Stops valid/compromised subject multiplying work through IP rotation | Concurrent tabs/devices, verified retries, DB/issuance cost | Accept one principal sharing quota across all clients | `measurement required` | Auth churn, forced logout or subject-bucket saturation | Pending — Tier C |

### State mutation and file/resource work

| Candidate | Policy purpose | Current baseline | Compatibility risk | Security benefit | Evidence required | Human tradeoff required | Approval mode | Rollback/revisit signal | Current status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `state_mutation` aggregate — token `120/min`, capacity `30` | Bound cross-domain mutation/fan-out rotation | None | One noisy domain can starve another for the user | Caps total DB/queue/realtime write pressure | Per-user mutation mix and burst distribution | Accept cross-domain coupling | `measurement required` | Healthy domain blocked by unrelated mutation load | Pending — Tier C |
| Profile mutation — token `10/hour`, capacity `3` | Bound low-cadence profile/avatar changes | None | Editing retries may block legitimate settings work | Limits profile DB/cache/avatar amplification | Profile edits, avatar retries and failure rates | Accept low-cadence assumption | `measurement required` | Profile abandonment or repeated legitimate blocks | Pending — Tier C |
| Friendship mutation — token `30/min`, capacity `10` | Bound request/accept/reject/remove fan-out | None | Bulk legitimate relationship actions may block | Limits DB and realtime effects | Mutation bursts and fan-out cost | Accept one budget for four related operations | `measurement required` | Friendship action failures or queue/realtime pressure mismatch | Pending — Tier C |
| Group-admin mutation — token `30/min`, capacity `10` | Bound create/member/admin/rename/delete work | None | Active administration may block | Limits multi-member DB/realtime amplification | Group size, admin bursts and fan-out cost | Accept group-admin coupling | `measurement required` | Admin workflow failures or large-group outliers | Pending — Tier C |
| Conversation-panel mutation — token `60/min`, capacity `15` | Bound preference/leave/delete mutations | None | UI toggles/retries may block | Caps participant/state writes | UI mutation frequency and retries | Accept shared budget across different panel actions | `measurement required` | Preference/leave/delete failure concentration | Pending — Tier C |
| Call-history mutation — token `120/min`, capacity `30` | Bound per-call/read-all write bursts | None | Multi-device read marking may block | Caps bulk DB/realtime updates | Read-mark frequency, device count and bulk cost | Accept higher cadence within state aggregate | `measurement required` | Unread-state drift or mutation `429` bursts | Pending — Tier C |
| `file_resource` aggregate — token `300/hour`, capacity `50` | Bound rotation across upload lifecycle and signing | None | Multipart-heavy users may exhaust aggregate | Caps combined S3/queue/buffering work | File sizes, part counts, retries and concurrency | Accept one aggregate across file operations | `measurement required` | Upload abandonment or aggregate saturation during valid transfer | Pending — Tier C |
| Upload control — token `30/hour`, capacity `10` | Bound init/complete/single/avatar admission | None | Repeated legitimate uploads may block | Limits queue/buffer/control-plane work | Upload attempts, avatar frequency, completion retries | Accept shared operation-family budget | `measurement required` | Valid upload initiation/completion failures | Pending — Tier C |
| Part presign — token `240/hour`, capacity `40` | Permit multipart parts while bounding signing | None | Large files/high retry count may block mid-upload | Caps signing amplification | Parts per file, parallelism and retry rate | Choose supported file/part envelope | `measurement required` | Valid uploads stall before all parts are signed | Pending — Tier C |
| Download signing — token `120/hour`, capacity `30` | Bound repeated signed-download URL work | None | Active users may block legitimate downloads | Caps DB/authz/signing work | Download cadence, retry/cache behavior and signing cost | Accept per-user download ceiling | `measurement required` | Download failures or excessive unused URLs | Pending — Tier C |
| Optional actor-file/upload scope — token `60/hour`, capacity `20` | Bound one actor repeatedly targeting one file/upload | None | Optional scope may create mid-flow starvation | Adds per-resource concentration control | Resource-specific abuse, retry and idempotency evidence | Decide whether secondary adds value beyond domains | `blocked by unresolved policy` | One upload/file repeatedly blocks legitimate completion | Pending — Tier C |

### Expensive reads and call initiation

| Candidate | Policy purpose | Current baseline | Compatibility risk | Security benefit | Evidence required | Human tradeoff required | Approval mode | Rollback/revisit signal | Current status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `read_expensive` aggregate — token `240/min`, capacity `60` | Bound rotation across all fan-out read domains | None | One reconnect/search/sidebar loop can starve another screen | Caps total per-user query/fan-out work | Per-domain QPS, query count, p95/p99 and multi-tab bursts | Accept cross-screen coupling | `measurement required` | UI-wide `429`, latency or aggregate saturation | Pending — Tier C |
| User directory/search — token `60/min`, capacity `20` | Bound users/friends/search/list reads | None | Search-heavy legitimate use may block relationship reads | Caps query/N+1 directory work | Query shapes, result sizes and search cadence | Accept one domain budget for related reads | `measurement required` | Search/friend UI failures or latency mismatch | Pending — Tier C |
| Message sync — token `12/min`, capacity `4` | Bound reconnect/fan-out synchronization | None | Unstable networks or several tabs may block sync | Caps expensive sync loops | Reconnect frequency, tabs, query count and payload size | Accept delayed sync under repeated reconnect | `measurement required` | Stale messages, repeated reconnect `429` or sync backlog | Pending — Tier C |
| Call-history read — token `30/min`, capacity `10` | Bound history/missed aggregation | None | Refresh/pagination may block | Caps aggregate queries | Page/refresh cadence, query count and payload size | Accept shared history/missed budget | `measurement required` | History UI failures or high cache miss cost | Pending — Tier C |
| Groups read — token `60/min`, capacity `20` | Bound group list/detail/member amplification | None | Active group navigation may block | Caps member/population fan-out | Group sizes, navigation cadence and query fan-out | Accept list/detail coupling | `measurement required` | Large-group blocks or group UI failures | Pending — Tier C |
| Conversation-panel read — token `60/min`, capacity `20` | Bound metadata/resources fan-out | None beyond resources bucket | Panel refresh/realtime loops may block | Caps panel query fan-out | Panel open/refresh cadence, group sizes and payloads | Accept metadata/resources domain coupling | `measurement required` | Panel failures or resource refresh saturation | Pending — Tier C |
| Panel resources actor+conversation — sliding `30/min` | Bound one user's resource fan-out in one conversation | Process-local default `30/min`, environment-overridable | Redis-shared default may be much stricter during reconnect/multi-tab use | Removes per-replica multiplication | Deployment override, resource refresh cadence and cache/query cost | Choose hardening versus approximate current behavior | `measurement required` | Valid panel refresh blocked or deployment default mismatch | Pending — Tier B |
| Sidebar read — token `60/min`, capacity `20` | Bound both sidebar fan-out paths | None | Chat bootstrap/realtime refresh may block | Caps multi-query sidebar work | Bootstrap, realtime refresh, query count and payload | Accept coupling of user/sidebar routes | `measurement required` | Startup/sidebar failures or reconnect saturation | Pending — Tier C |
| Call aggregate — sliding `10 logical attempts/min` | Bound initiation across `initCall`/`callUser`, sockets and replicas | User+process `callUser` fixed `10/min`; `initCall` unprotected | Multi-device/redial/reconnect/glare behavior may differ materially | Closes unprotected event and replica/multi-socket bypass | Normal multi-device calls, redial, reconnect, glare and correlation reliability | Explicitly accept broader logical-attempt hardening only after evidence | `measurement required` | Call setup failure, redial blocks, correlation mismatch or glare regressions | Pending — Tier B |
| Actor-callee — sliding `4 logical attempts/5 min` | Bound repeated caller-to-callee harassment | None | Connectivity retries may look like harassment | Adds pair-specific protection without affecting other callees | Redial/connectivity failure and harassment data | Balance retry fairness against anti-harassment | `measurement required` | Legitimate redial blocks or continued harassment | Pending — Tier C |
| Callee-wide — sliding `20 logical attempts/5 min` | Bound distributed call storms against one callee | None | Unrelated callers can deny all legitimate calls | Cross-actor anti-storm control | Harassment evidence, call volume and product recovery behavior | Explicitly accept third-party starvation of callee | `not recommended` | Any legitimate callee starvation or activity leakage | Pending — Tier C; do not approve |
| Conditional raw call-event control — no number | Protect decision/suppression plane if raw replay is costly | None | Extra bucket may reject protocol noise independently from business quota | Bounds raw event QPS without replacing logical quota | Raw event QPS, suppression CPU/memory and Redis evaluator load | Decide whether an extra protection plane is justified | `blocked by unresolved policy` | Evaluator pressure absent or raw bucket harms valid signalling | Pending — Tier C; no numeric candidate |

`read_bounded` remains Tier A taxonomy-only with no application bucket and therefore has no numeric approval gate.

## Aggregate And Secondary Interaction

Each request or logical event must pass every mandatory bucket applicable at its current admission stage. Atomicity crosses policy-class membership: after cheap bounded classification derives the complete set, the evaluator checks and consumes the full set as one all-or-none decision.

- Login: `auth_entry` network aggregate + login network operation + target-wide account bucket only if later approved.
- Register/Google: `auth_entry` network aggregate + corresponding operation bucket.
- Forgot-password: recovery-request network + target-wide account bucket only if approved.
- Reset-password: recovery-complete network; optional verified-subject bucket only after a trusted derivation seam exists.
- Refresh: Stage A network; after successful cryptographic verification, Stage B verified refresh-token subject. DB validation and token issuance follow Stage B.
- Plain profile update: state aggregate + profile secondary.
- Multipart/avatar profile update: state aggregate + profile secondary + file aggregate + upload-control secondary, all in one atomic admission before Multer buffering. A file-bucket rejection cannot consume state/profile capacity, and a state/profile rejection cannot consume file capacity.
- Panel resources: expensive-read aggregate + conversation-panel domain + actor-conversation resources bucket.
- Logical call initiation: call actor aggregate + actor-callee secondary. `initCall` and its correlated `callUser` for the same logical attempt must not consume two actor tokens.

An operation-specific or domain bucket never replaces its aggregate actor bucket. Broad aggregates limit route rotation; secondaries preserve cost and fairness differences. The trade-off is deliberate: aggregate exhaustion can temporarily block otherwise healthy domains, while removing it permits an attacker to sum every domain allowance.

Refresh is the explicit staged exception, not a partial-consumption bug. Stage A admits and charges network-actor verification work. Only a cryptographically verified subject can reach the separate Stage B admission. Stage A is not refunded when Stage B rejects or downstream account/token work fails.

## Admission Quota Versus Raw-Request Protection

- Business admission quotas bound admitted expensive downstream work. They do not, by themselves, bound every raw HTTP/Socket.IO event or every Redis evaluator decision.
- Under all-or-none semantics, a request blocked by a narrow domain/target bucket does not consume unrelated actor-aggregate capacity. An attacker may therefore continue reaching the evaluator while that narrow bucket remains blocked.
- Nginx/edge controls can protect network-level HTTP floods, but they remain a separate protection plane and are not Redis-shared application admission quotas.
- Authenticated distributed or multi-IP decision-plane abuse must be measured and reviewed separately, including evaluator QPS, Redis latency and rejected-decision cardinality.
- A lightweight raw-attempt bucket is added only if threat evidence shows that edge/parser protection and bounded evaluation are insufficient. It never replaces business actor aggregates or domain/target admission buckets.
- The conditional raw Socket.IO call-event control is one application of this general principle. No numeric raw HTTP bucket is proposed in this planning step.

## Redis Atomicity Topology Prerequisite

Repository evidence currently shows one Compose Redis service and Node clients created with `createClient` against one Redis URL; no `createCluster` configuration was found. This supports a repository single-instance/non-cluster assumption only for the current documented topology.

Before implementation approval:

- Verify the actual deployment Redis topology and atomicity domain for every same-stage mandatory key.
- For a single instance/non-cluster deployment, record the assumption and deployment evidence explicitly.
- For Redis Cluster or any multi-slot topology, use deliberate same-slot/co-location design or an explicit atomic alternative for multi-key admission.
- Never degrade silently to sequential check/consume with partial capacity consumption.
- Key-slot strategy must preserve the approved no-raw-PII/credential rules; hash tags or co-location metadata cannot expose email, username, token, credential or target HMAC through responses/logging.
- Actor-wide and actor-scoped buckets often have common canonical actor affinity, so a future co-location strategy may exploit that shared dimension.
- Target-wide buckets intentionally remove actor from the sharing dimension: one target must aggregate across many actors while each actor aggregate continues across many targets.
- A simple same-slot/hash-tag shape cannot be assumed to preserve both dimensions. If login/forgot target-wide buckets become mandatory hard admission gates, implementation needs explicit cross-partition atomicity/data-model proof or an approved atomic alternative.
- Do not weaken actor-wide or target-wide sharing to force co-location, and do not duplicate actor-target composite counters and describe them as target-wide enforcement.
- Current login/forgot target-wide candidates are telemetry-only, so this cross-partition hard-gate issue does not block current quota topology. It blocks any later hard or side-effect promotion.
- This planning does not select Lua, transaction, Redis Function, hash-tag or other implementation mechanics.

## Login Current Semantic Fingerprint

| Dimension | Source-proven current behavior | Compatibility status |
| --- | --- | --- |
| Route/middleware order | `express.json({ limit: "10kb" })` runs before `/api/auth`; `/api/auth/login` runs `loginLimiter` before `login` controller | Invalid JSON and body-too-large errors never reach the login limiter; valid JSON reaches it before credential/DB work |
| Key source | `String(req.ip \|\| req.headers["x-forwarded-for"] \|\| req.socket?.remoteAddress \|\| "unknown")` | `req.ip` is primary. Source includes raw `X-Forwarded-For` fallback; there is no explicit IPv4/IPv6 validation or canonicalization in this limiter. `trust proxy = 1` is configured globally, but deployment topology proof remains separate |
| Counter state | A `Map` closed over by each `createRateLimiter` instance | Process-local; each backend replica has independent state |
| Window algorithm | First request stores `{ count: 1, resetAt: currentTime + windowMs }`; reset occurs when `currentTime >= resetAt` | First-hit anchored fixed window; reset is not wall-clock aligned and later requests do not extend `resetAt` |
| Passing requests | Existing entry increments `count`; requests with `count <= max` call `next()` | Every route-reaching passing attempt consumes one unit |
| Successful login | Controller runs only after limiter; no success signal returns to limiter and no skip option exists | Successful login consumes quota |
| Failed login | Invalid user, Google-provider account and invalid password return from controller after limiter | Failed login consumes quota |
| Over-limit request | `count` increments before `count > max` is checked; `429` is then returned | Rejected requests also increment the in-memory count, but do not extend the existing reset time |
| Malformed input | Invalid JSON raises `entity.parse.failed` in `express.json` and returns `400 BAD_JSON`; body over `10kb` returns `413 PAYLOAD_TOO_LARGE` before route middleware | These parser failures do not consume the login limiter. Valid JSON missing `email` reaches the limiter and `email.trim()` can produce a controller-level `500`; this path is source-proven but not covered by a dedicated test |
| Skip/refund behavior | No `skipSuccessfulRequests`, equivalent callback, refund, or result-aware decrement exists in `createRateLimiter` | None; all route-reaching attempts are accounted by current counter semantics |
| Exceeded response | Status `429`, `Retry-After = max(1, ceil((resetAt-now)/1000))`, code `RATE_LIMITED`, custom login message, request ID from shared error helper | No body retry field and no multi-bucket maximum-wait semantics exist today |

Existing test evidence sends two wrong-password requests with an injected `max: 2`, then asserts the third response is `429 RATE_LIMITED`. It proves failed attempts consume the current counter and verifies response shape, but does not prove production replica distribution, malformed-body behavior or current retry-header consumption at login.

### Login `10/15 min` gate consequence

Keeping `10/15 min` is not “the same number with Redis.” It requires explicit acceptance of all three semantic changes:

1. coordination scope: process-local counter → Redis-shared cluster-wide counter;
2. algorithm: first-hit fixed window → sliding window;
3. accounting: current route-reaching counter, including over-limit increments, → proposed admitted-attempt accounting with same-stage all-or-none consumption and no unrelated-bucket consumption on rejection.

The source proves the current accounting above. Unknown deployment evidence remains: how requests distribute across the three replicas in the actual ingress topology, and whether any deployment can make `req.ip` spoofable beyond the verified proxy boundary. Those unknowns do not invalidate an explicit hardening decision, but they must not be described as behavior preservation.

## Baseline-Informed Migration Comparison

The ranges below are approximate counter-shard exposure, not guarantees. HTTP requests may stay on one backend or reach several because DNS resolution, connection reuse and traffic distribution are not guaranteed to be even. Independent fixed-window start times also prevent a simple exact `replicas × quota` rolling guarantee.

| Candidate | Current counter scope and topology | Approximate current effective protection | Proposed Redis-shared protection | Compatibility/fairness consequence | Security benefit | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Login `10/15 min` | Network key + process-local `Map`; only `POST /api/auth/login`; three backend processes may hold independent counters. Current key is `String(req.ip \|\| raw XFF fallback \|\| socket remote \|\| unknown)`. First-hit fixed window; successful, failed and over-limit route-reaching attempts all increment | Nominally 10 if traffic reaches one process and up to 30 if it reaches all three; skewed fixed-window boundaries can change an arbitrary rolling-interval result. Invalid JSON/oversize body is rejected before limiter | One canonical network actor, 10 across all replicas, sliding-window state, admitted-attempt accounting and pending `auth_entry` aggregate | This is coordination-scope + algorithm + accounting tightening, not behavior preservation; shared NAT and rejected-request accounting differ | Removes replica/fixed-window multiplication and closes current process-local boundary behavior | `explicit intentional hardening decision`; maintainer must accept the full semantic delta |
| Register `5/hour` | Network key + process-local `Map`; only `POST /api/auth/register` | Nominally 5–15 across one to three active counter shards, with uneven distribution | One canonical network actor, 5/hour across all replicas, plus pending `auth_entry` aggregate | Multiple legitimate signups behind one NAT may lose capacity previously available through shard distribution | Bounds account-creation/hash work cluster-wide | `measurement required` before choosing intentional hardening versus approximate-behavior adjustment |
| Forgot-password `5/hour` | Network key + process-local `Map`; only forgot-password; reset completion has no current application counter | Nominally 5–15 forgot attempts across active shards; exact rolling behavior is not guaranteed | One canonical network actor, 5/hour across all replicas; reset completion remains a separate class | Shared NAT recovery requests may be blocked sooner; nginx auth sharing can still starve reset before application admission | Bounds account lookup/email-queue abuse without consuming reset-completion quota | `measurement required` because recovery availability is security-sensitive |
| Panel resources default `30/min` | Verified user + conversation + process-local `Map`; only panel-resources route; default is environment-overridable | Nominally configured value `M` on one process and up to `3M` if requests reach three shards; default nominal range 30–90 | One user+conversation bucket at candidate 30/min across replicas, plus expensive-read aggregate/domain buckets | Reconnect, refresh and multi-tab behavior may become materially stricter; deployment overrides may differ from 30 | Removes replica multiplication on a fan-out read | `measurement required`; do not assume repository default equals deployment-safe shared value |
| Call `10/min` | Verified user + process-local `Map`; only `callUser` charges. One socket stays on one process, while multiple sockets/reconnects can reach multiple processes. `initCall` is unprotected | `callUser` is nominally 10 for one process and up to 30 across three user/process shards. Overall logical initiation has no equivalent ceiling because `initCall` can perform DB/Redis work without this limiter | One verified user, 10 logical attempts/min across replicas and both protocol paths, with correlated pair charged once | Normal single-socket cadence may remain similar, but multi-device, reconnect, redial, glare and `initCall` behavior can tighten materially | Closes unprotected `initCall`, multi-socket and replica bypass while avoiding expected two-event double charge | `measurement required` before intentional hardening approval |

Nginx `/api/` `10r/s burst=20` and `/api/auth/` `1r/s burst=5` remain independent edge/IP baselines. They are not distributed application quotas and do not convert the approximate application ranges above into exact guarantees.

### Candidate numerical rationale to validate

| Class | Why the candidate is not lower | Why the candidate is not higher | Main fairness/availability risk |
| --- | --- | --- | --- |
| `auth_entry` | Each operation keeps its own cadence, including the existing 10-login allowance; the 20 aggregate leaves room for legitimate route diversity. | More than 25 per 15 minutes would be redundant under the proposed operation caps; 20 makes route rotation materially bounded. | Shared NAT users consume one network aggregate. |
| `auth_recovery_request` | The existing 5/hour network allowance permits delivery retries and correction of mistyped account identifiers. | Email queue and account-target spam are low-cadence operations; a materially larger allowance weakens the purpose of the class. | A 3/hour account-target bucket is easy for a third party to exhaust, so it remains pending. |
| `auth_recovery_complete` | Ten attempts per 15 minutes allows token-entry and password-validation correction without sharing forgot-password capacity. | Token verification, DB work and bcrypt make repeated completion attempts expensive and security-sensitive. | A shared NAT can still block unrelated reset users; nginx can starve them earlier at the edge. |
| `auth_refresh` | Network capacity 10 and subject capacity 5 aim to absorb bootstrap and retry bursts from multiple tabs. | Refill 60/min per network and 20/min per verified subject bound verification, DB and token-issuance loops. | The capacities may be too low for many tabs or too high for compromised-token abuse; measurement is mandatory. |
| `state_mutation` | Aggregate refill 120/min and capacity 30 leave room for read-marking bursts and several devices; lower domain buckets preserve low-cadence actions. | The aggregate remains below the sum of domain refill rates, so cross-domain rotation cannot multiply all domain budgets. | One noisy domain can temporarily starve another for the same user. |
| `file_resource` | Multipart flows need many part-presign calls; hourly refill avoids breaking a legitimate multi-part operation. | Aggregate 300/hour and narrower operation-family buckets cap presign, queue and buffered-upload amplification. | Part count, retry policy and file-size distribution are unknown; all new file numbers remain pending. |
| `read_expensive` | Refill 240/min and capacity 60 allow reconnect and multi-tab UI bursts; narrow domain buckets avoid one uniform quota. | Domain caps constrain search, sync, history, group, panel and sidebar fan-out, while the aggregate binds their combined use. | A reconnect/sidebar loop can still starve another screen, and a 60-request immediate aggregate burst may be too high. |
| `call_initiation` | Existing 10/min aggregate permits call setup retries; four caller-to-callee attempts per five minutes allows limited redial. | The pair bucket bounds repeated harassment even when aggregate capacity remains. | The pair number may block legitimate network-failure retries; a callee-wide bucket could let third parties deny service. |
| `read_bounded` | No number is proposed because no application enforcement need has been demonstrated. | Edge/network controls remain independent; taxonomy symmetry is not a reason to allocate a Redis counter. | If later evidence shows meaningful abuse, the class must return for explicit approval. |

All network-actor candidates share NAT consequences. All verified-user candidates intentionally aggregate every tab, device and backend replica for that principal. Compose declares three backend replicas, so Redis-shared counters remove the current ability to multiply a process-local allowance through replica distribution. No replica-local fallback is permitted.

## Rationale And Fairness

### Authentication Entry

The aggregate 20-per-15-minute network window prevents alternating login, registration and Google entry. Operation windows preserve their different cadence. The three operation caps could otherwise admit up to 25 attempts in the same 15 minutes, so an aggregate of 30 would never bind and would not provide anti-rotation protection. Twenty remains above every individual operation cap, while bounding combined bcrypt/provider/session work.

Shared NATs are the main risk: multiple legitimate users can share one network actor and consume the 20-attempt aggregate together. This is why 20 is a pending assumption rather than an approve-now number. Nginx's existing one-request-per-second auth edge limit is separately stricter during bursts and must not be mistaken for distributed application protection.

### Recovery Fairness

Forgot and reset use separate mandatory classes and counters, so application-layer forgot abuse cannot consume reset-completion capacity. The proposed optional account bucket exists only on the request flow unless separately approved for reset.

Residual gap: current nginx `auth_limit` is shared across all `/api/auth/` routes. A same-IP forgot flood can still consume edge capacity before reset reaches the application. Full starvation protection therefore requires an edge-policy review; the application quota topology alone cannot prove end-to-end fairness.

### Refresh And Multi-Tab Behavior

Stage A proposes a refill of 60 attempts per minute per network with a capacity of 10. Stage B proposes 20 per minute per cryptographically verified subject with a capacity of 5. These are working assumptions, not demonstrated safe envelopes: five concurrent subject refreshes fit immediately, while a sixth must wait for refill. The subject bucket limits a valid or compromised token subject rotating IPs.

Access tokens last one day and refresh tokens seven days, but the client can refresh on bootstrap and independently after 401/403 responses. Multiple tabs do not share the in-memory access token, so runtime measurement of simultaneous bootstrap and retry storms is required.

### State Mutation And Multi-Client Behavior

The 120-per-minute user aggregate is deliberately high enough for several tabs/devices and read-marking bursts. Lower domain buckets constrain expensive or low-cadence actions. All devices for one verified user intentionally share the same distributed actor quota.

Profile edits are low cadence; group and friendship actions can produce database and realtime fan-out. Call-history read marks may be much more frequent, which is why their secondary is higher and may prove unnecessary after measurement.

### File And Profile

File workflows are multi-request: init, several part signatures, completion, download signing, or queue-backed single upload. A low request-per-minute rule would break legitimate multipart uploads, so the proposal uses an hourly aggregate with operation-family capacities.

Plain profile requests do not consume file buckets. Multipart/avatar profile requests consume both state and file buckets before buffering. Actual multipart part counts, upload sizes, retry behavior and concurrent tabs must be measured before numeric approval.

### Expensive Reads

The 240-per-minute aggregate allows a bursty chat UI and multiple tabs but bounds total fan-out across fourteen routes. Domain buckets prevent one search/sidebar/reconnect loop from consuming the entire class unchecked.

The panel resource 30-per-minute actor+conversation value is the repository default and can be overridden by deployment configuration. Other domain numbers are new assumptions and require request-frequency, query-count, latency and payload-size evidence.

### Call Initiation

One normal logical call emits `initCall` and then `callUser` with the same temporary call identifier. The aggregate quota is therefore per logical initiation, not per event. The current 10-per-minute configured value is retained as a baseline candidate. The actor-callee 4-per-5-minute proposal limits repeated harassment from one caller while permitting reasonable redial.

The no-double-charge rule requires server-confirmed, short-lived correlation bound to canonical caller, canonical callee and one logical attempt. A matching expected `callUser` does not consume a second business-attempt token only when that correlation exists. An unmatched `callUser` consumes one logical-attempt token, and changing caller, callee or identifier cannot reuse another attempt's marker. Caller-supplied correlation data alone is not proof.

Correlation cannot turn replay into free work:

- Each protocol phase is accepted at most once for a correlation, and the correlation cannot be reused for another callee, caller or later attempt.
- Duplicate/replayed events are rejected or idempotently suppressed before DB, Redis coordination, signalling fan-out or timeout creation.
- If replay suppression itself cannot bound raw event CPU/memory cost, an independent lightweight raw-event flood bucket charges every Socket.IO event. Its numeric policy remains pending.
- Correlation state has finite TTL and bounded cardinality. Expiry cannot make an old attacker-chosen call ID an accepted “already charged” attempt.
- No concrete correlation storage or implementation mechanism is approved here.

A target-wide callee bucket could mitigate distributed call storms, but unrelated callers could exhaust it and deny legitimate calls. Keep it pending until harassment evidence and product recovery semantics exist.

## HTTP 429 And Store-Unavailable Semantics

- A request passes only when every mandatory same-stage bucket passes.
- Same-stage bucket evaluation should return one atomic all-or-none decision; a blocked request does not consume the other same-stage buckets. No raw Redis key, target digest, HMAC version, account identifier, resource identifier or bucket name is exposed.
- If the atomic evaluator can identify every mandatory blocking bucket without partial consumption, `Retry-After` is the ceiling of the maximum remaining wait among them, because the request cannot succeed until all are eligible. If a complete safe calculation is unavailable, it must not invent a shorter bucket-specific wait.
- HTTP should return integer-seconds `Retry-After` plus the same generic `retryAfterSeconds` field in its structured error body. Socket.IO ACK/error should carry `retryAfterSeconds` without claiming an HTTP status. Both use the generic machine-readable code `RATE_LIMITED`.
- Account-target rejection must be indistinguishable from network/operation rejection in status, body shape, timing class and logging. No response identifies a bucket/class, Redis key, account HMAC, resource ID or account existence.
- A staged flow may return the retry time for the stage that rejected it without revealing whether a user/account exists.
- Confirmed quota exhaustion returns `429`. Redis/rate-limit store unavailability returns `503 RATE_LIMIT_UNAVAILABLE` for fail-closed HTTP operations.
- Socket.IO uses structured `RATE_LIMITED` or `RATE_LIMIT_UNAVAILABLE` ACK/error semantics and does not claim an HTTP status when no HTTP response exists.
- `RATE_LIMIT_UNAVAILABLE` must not reuse quota-derived retry metadata. Any generic service-retry hint is a separate availability decision.
- Nginx edge rejection remains a separate compatibility item; its current default `503` must eventually be normalized to `429` if approved.

## Approval Tiers

### A. Approved planning invariants

- Policy-class topology and sliding-window/token-bucket family direction.
- Redis-shared counters across replicas with no replica-local enforcement fallback.
- Authoritative/shared distributed time semantics; replica-local `Date.now()` is not a security clock.
- Algorithm-derived finite TTL that preserves window history and natural token refill.
- Admission attempts charge before protected expensive work; post-admission failure and success do not refund.
- Atomic all-or-none same-stage admission across every applicable policy-class membership.
- Explicit separation between business admission quotas and raw-request/decision-plane protection.
- Target-wide HMAC privacy does not mitigate targeted lockout; target enforcement type and starvation acceptance require explicit policy.
- Redis deployment topology/atomicity-domain verification before multi-key implementation; no sequential partial-consumption fallback.
- Intentionally separate refresh Stage A and Stage B consumption.
- Server-validated, bounded call correlation with replay suppression or independent raw-event flood control.
- Generic `429 RATE_LIMITED`, maximum safely known blocking wait, and distinct `503 RATE_LIMIT_UNAVAILABLE` semantics.
- No Redis-backed application counter for `read_bounded` until separately approved.

No numeric value is approved by Tier A.

### B. Baseline-informed numeric candidates

| Candidate | Evidence source | Current recommendation | Approval status |
| --- | --- | --- | --- |
| Login `10/15 min` | Current process-local login limiter | Preserve visible number intentionally as distributed hardening | Pending explicit numeric approval |
| Register `5/hour` | Current process-local register limiter | Measurement required | Pending |
| Forgot-password `5/hour` | Current process-local forgot limiter | Measurement required because recovery availability matters | Pending |
| Panel resources default `30/min` actor+conversation | Current process-local, environment-overridable panel limiter | Measurement required | Pending |
| Call `10 logical attempts/min` | Current user+process `callUser` limiter at 10/min; `initCall` currently unprotected | Measurement required for multi-device/redial/reconnect/glare/correlation behavior | Pending |

These values are evidence anchors only. Keeping one visible number under Redis-shared enforcement is intentional hardening unless measurement shows that an adjusted number is needed to preserve approximate current behavior.

### C. New numeric candidates with gate-specific blockers

- `auth_entry` aggregate and Google operation.
- Login/forgot target-wide HMAC account buckets.
- Recovery-complete and optional verified reset-subject buckets.
- Refresh Stage A and Stage B refill/capacity.
- Every state-mutation aggregate/domain bucket.
- Every file-resource aggregate/domain/actor-resource bucket.
- Expensive-read aggregate and every new domain bucket.
- Actor-callee and optional callee-wide call buckets.
- Any lightweight raw call-event flood bucket; no number has yet been proposed.

The numeric approval-gate matrix is authoritative for each individual candidate's approval mode and status.

## Required Runtime Measurement Before Final Approval

- Per-IP auth traffic distribution and legitimate shared-NAT concurrency.
- Login/register/Google provider latency and bcrypt/provider CPU cost.
- Forgot/reset frequency, queue load and edge starvation behavior.
- Refresh calls per tab, concurrent tabs/devices, 401 retry storms and invalid-token verification cost.
- Per-user state mutation bursts, especially read-all and group fan-out.
- Multipart part counts, upload size distribution, presign retries, download-signing cadence and avatar upload frequency.
- Per-domain expensive-read request rates, Mongo query counts, p95/p99 latency, result sizes and reconnect storms.
- Logical call initiation/redial/glare frequency and correlation reliability between `initCall` and `callUser`.
- Redis latency, atomic multi-bucket script cost, TTL/cardinality and behavior during reconnects.
- Actual Redis deployment topology, key-slot/atomicity domain and rejected decision-plane load.
- Interaction with current nginx edge limits and eventual `429` normalization.
- Network actor canonicalization and IPv6 aggregation policy remain separate unresolved prerequisites.

## Approval-Mode Lists

### Explicit intentional hardening decision

- Login operation `10/15 min` only. Approval must explicitly accept all three semantic tightenings: process-local to Redis-shared coordination, first-hit fixed window to sliding window, and current all-route-reaching accounting to admitted-attempt/all-or-none accounting. The `auth_entry` aggregate remains a separate measurement gate.

### Measurement required

- Auth: `auth_entry` aggregate `20/15 min`, register `5/hour`, Google `10/15 min`.
- Recovery/refresh: forgot network `5/hour`, completion `10/15 min`, Refresh Stage A `60/min` capacity `10`, Stage B `20/min` capacity `5`.
- State: aggregate `120/min` capacity `30`, profile `10/hour` capacity `3`, friendship/group `30/min` capacity `10`, panel mutation `60/min` capacity `15`, call-history mutation `120/min` capacity `30`.
- File: aggregate `300/hour` capacity `50`, upload `30/hour` capacity `10`, part presign `240/hour` capacity `40`, download signing `120/hour` capacity `30`.
- Reads: aggregate `240/min` capacity `60`, directory `60/min` capacity `20`, sync `12/min` capacity `4`, call history `30/min` capacity `10`, groups/panel/sidebar `60/min` capacity `20`, panel resources `30/min`.
- Calls: aggregate `10 logical attempts/min` and actor-callee `4 logical attempts/5 min`.

### Blocked by unresolved policy

- Login target-wide account `20/15 min`: targeted login lockout and enforcement type unresolved; telemetry-only now.
- Forgot target-wide account `3/hour`: silent recovery-email starvation and enforcement type unresolved; telemetry-only now.
- Optional verified reset subject `5/hour`: optional membership and cheap verified seam unresolved.
- Optional actor-file/upload scope `60/hour` capacity `20`: incremental value and fairness unresolved.
- Conditional raw call-event control: trigger, algorithm and number unresolved.

### Not recommended

- Callee-wide `20 logical attempts/5 min`: unrelated callers can starve the callee.
- Any file-wide or conversation-wide hard admission bucket: no numeric candidate exists and the target-starvation/fairness model is unresolved.

No number becomes approved merely because it appears in these lists.

## Explicit Non-Goals

- No implementation or test changes.
- No runtime, nginx, Multer, auth, refresh, JWT, Socket.IO or message access-control changes.
- No alert dismissal.
- No HMAC material creation or rotation.
- No IPv6 prefix selection.
