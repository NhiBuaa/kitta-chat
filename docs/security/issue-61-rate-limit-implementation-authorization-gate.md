# Issue #61 — Rate-Limit Implementation Authorization Gate

## Status

**IMPLEMENTED — VERIFICATION COMPLETE (source-and-test slice only).**

Issue #61 remains **NOT READY TO CLOSE**. R1 remains exactly the 27-value
`INTENTIONAL SECURITY BASELINE — NOT RUNTIME-EVIDENCE-DERIVED`; `B = 0`
remains unchanged. The maintainer authorized implementation decision `A`.

This gate authorizes neither a deployment, enablement, telemetry, Nginx change, scanner run, alert disposition, credential action, nor any control excluded by R1.

## Requested authorization boundary

Authorize one source-and-test slice that implements exactly the 27 approved enforcement points and their locked failure contracts:

- Redis shared across replicas; no in-memory runtime fallback.
- Redis server time is the authoritative time source for quota admission.
- All mandatory buckets for one admission stage are evaluated and consumed atomically, all-or-none.
- Confirmed HTTP quota exhaustion returns `429 RATE_LIMITED` with the maximum safely known `Retry-After`; Redis unavailability returns `503 RATE_LIMIT_UNAVAILABLE` before the protected business work.
- Confirmed Socket.IO quota exhaustion returns structured `RATE_LIMITED` with `retryAfterSeconds`; Redis unavailability returns structured `RATE_LIMIT_UNAVAILABLE` before protected call work.
- Token buckets initialize at their approved capacity, never empty; refill is capped at that same capacity.
- `initCall` and its correlated `callUser` are one logical attempt. A first unmatched `callUser` begins one logical attempt. A replayed correlated protocol phase is suppressed before expensive work; this is protocol de-duplication, not a new raw-event numeric control.

No numeric value, algorithm, actor scope, failure code, or exclusion may be changed in this slice.

## Final Redis execution contract clarification

### Topology contract

The implementation contract is **Redis OSS Cluster-compatible**. A standalone/single-shard Redis deployment is a valid one-shard instance of that contract. It is not permitted to make atomicity depend on standalone-only cross-key behavior.

Every multi-key `EVAL` invocation must receive every accessed key through `KEYS`, and every such key must have one identical documented hash tag. In a Cluster deployment that is the required same-slot proof; Redis Cluster permits Lua scripts only when their keys are in one hash slot. A `CROSSSLOT`, unresolved `MOVED`, `TRYAGAIN`, connection, timeout, script or Redis-command failure is a store-unavailable result: fail closed with the approved HTTP/Socket unavailable contract. There is no sequential multi-key fallback, partial retry/compensation, or process-local fallback.

The current repository Compose configuration is one `redis:alpine` service and the present Node wiring uses `createClient`, not `createCluster`. That is source evidence of a current single service only; it is neither a deployed-topology claim nor a Cluster-compatibility proof. The implementation slice must add a testable topology-aware client seam rather than infer Cluster support from the existing client.

### Key-slot proof

`<actor-tag>` below is the canonical actor representation produced by the approved key builder. It is the exact string between the first `{` and `}` of each key; prefixes and suffixes never change the selected slot.

| Atomic admission stage | Required key layout | Same-slot proof |
| --- | --- | --- |
| Auth aggregate + operation | `rl:v1:{net:<actor-tag>}:auth_entry:aggregate` and `rl:v1:{net:<actor-tag>}:auth_entry:<operation>` | Same network actor tag |
| State aggregate + domain | `rl:v1:{user:<actor-tag>}:state_mutation:aggregate` and `rl:v1:{user:<actor-tag>}:state_mutation:<domain>` | Same verified-user tag |
| File aggregate + domain | `rl:v1:{user:<actor-tag>}:file_resource:aggregate` and `rl:v1:{user:<actor-tag>}:file_resource:<domain>` | Same verified-user tag |
| Expensive-read aggregate + domain | `rl:v1:{user:<actor-tag>}:read_expensive:aggregate` and `rl:v1:{user:<actor-tag>}:read_expensive:<domain>` | Same verified-user tag |
| Panel aggregate/domain + actor-conversation | `rl:v1:{user:<actor-tag>}:read_expensive:aggregate`, `...:conversation_panel`, and `...:panel_resources:conversation:<canonical-conversation>` | The conversation is a suffix; it cannot alter the actor tag/slot |
| Call quota + correlation | `rl:v1:{socket-user:<actor-tag>}:call_initiation:aggregate` and `rl:v1:{socket-user:<actor-tag>}:call_attempt:<validated-client-call-id>` | Same handshake-verified socket-user tag |

This deliberately co-locates only one actor's admission state, not all application keys. Any proposed policy key that lacks the stage's exact tag is a design conflict: do not invoke `EVAL`; stop implementation and report the conflict.

### Redis version contract

- **Minimum supported runtime:** Redis OSS `7.0.0`.
- **Required acceptance test targets:** pinned Redis OSS `7.0.0` standalone and a pinned native Redis OSS `7.0.0` three-primary Cluster, including the same-slot `EVAL` cases in the table above.
- **Current status:** verified by the retained R2 acceptance harness against pinned Redis OSS `7.0.0` standalone and native three-primary Cluster targets. The repository Compose `redis:alpine` image remains neither a version-pinned acceptance target nor a production-topology claim.

The implementation may use only the documented Redis commands/semantics required here: `EVAL` with Lua 5.1, `redis.call("TIME")`, and millisecond TTL commands such as `PEXPIRE`/`PTTL`. Redis documents `EVAL` and `TIME` since 2.6.0, while Redis 7 uses effects replication and removes verbatim script replication, so a script can safely read Redis server time before writing. The test floor remains 7.0.0; no behavior is assumed merely because it worked on an unpinned image.

Authoritative references: [Redis Lua scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/), [EVAL](https://redis.io/docs/latest/commands/eval/), [TIME](https://redis.io/docs/latest/commands/time/), and the [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/).

### Call correlation contract

The 120-second correlation record is a **single-use, server-recorded logical-attempt binding**, not a raw-event counter:

1. `initCall` validates the client call-id shape before Redis admission. The client ID is a lookup hint only. In the same atomic admission, Redis records a server-generated attempt nonce, the handshake-verified caller, canonical validated callee, phase `init_pending`, and the fixed 120-second TTL.
2. A `callUser` with the same validated client ID, verified caller and canonical callee atomically transitions that record from `init_pending` to `call_user_consumed`. It consumes no second quota unit: the pair is one logical attempt.
3. An unmatched `callUser` creates and charges one new logical attempt with its own server-generated nonce and caller/callee binding.
4. A replay after `call_user_consumed`, a caller/callee mismatch, an invalid ID, or an expired binding is not allowed to revive or extend the existing marker. A valid replay is suppressed before expensive work; a changed/missing binding follows the unmatched-attempt path. No replay refreshes the 120-second TTL indefinitely.

This contract adds no raw-event numeric limiter, no target-wide bucket and no actor-callee quota.

## Exact planned components and files

### New limiter boundary

- `server/src/rateLimit/closureMinimumPolicyCatalog.js` — immutable catalog for only the 27 approved policies, route/event membership, algorithms, limits, capacities and stages.
- `server/src/rateLimit/redisAdmission.js` — one Redis `EVAL`/Lua admission contract, response decoding, Redis-error normalization and no local fallback.
- `server/src/rateLimit/keyBuilder.js` — versioned namespaced keys from canonical network/user/socket actors and the approved panel conversation secondary; it must reject absent or conflicting actor identity rather than create a fallback bucket.
- `server/src/rateLimit/httpAdmissionMiddleware.js` — stage-aware Express middleware that writes only the approved HTTP failure contracts.
- `server/src/rateLimit/callLogicalAttemptAdmission.js` — atomic logical-attempt correlation/de-duplication and Socket.IO error adaptation; it must not introduce a raw-event quota.

### Existing wiring to modify

- `server/src/config/redis.js` — expose an injected/testable standalone-or-Cluster client seam; it must not silently downgrade a Cluster configuration to one standalone node.
- `server/src/app.js` — inject the limiter dependency and construct router factories without changing operational-probe, `read_bounded`, or message-route treatment.
- `server/src/routes/auth.js` and `server/src/controllers/authController.js` — entry/recovery middleware plus the two refresh stages: Stage A before refresh-token verification; Stage B after successful signature/type/subject verification and before `User.findById` or issuance.
- `server/src/routes/user.js`, `server/src/routes/group.js`, `server/src/routes/callHistory.js`, `server/src/routes/file.js`, `server/src/routes/conversationPanel.js`, `server/src/routes/messages.js`, and `server/src/routes/sidebar.js` — attach only the approved authenticated mutation, file-resource and expensive-read memberships. `messages.js` receives only `/sync`; M1/M2 stay untouched.
- `server/src/socket/index.js`, `server/src/socket/handlers/call/index.js`, `server/src/socket/handlers/call/handlers/initCall.js`, and `server/src/socket/handlers/call/handlers/callUser.js` — inject and use logical-attempt admission before their respective expensive call work.
- `server/src/socket/handlers/call/rateLimit.js` and `server/src/socket/handlers/call/state.js` — remove/retire the current process-local raw `callUser` counter in the same change, so it cannot double-charge or act as a fallback.

No client file is planned. Existing client API/socket shapes remain stable; only the approved error outcomes become observable on exhaustion or Redis failure.

## Atomicity and shared-time design

One Lua script is the sole admission primitive for every stage. It reads Redis `TIME` inside the script, so every replica calculates sliding-window pruning, token refill and retry time from the same authoritative clock. The script rejects any stage whose supplied keys do not share the required hash tag before it attempts a write.

The script accepts all keys required at that stage, evaluates every bucket first, and consumes none if any bucket is exhausted. It supports only:

- sliding-window state: prune timestamps at or before the approved window boundary, test the exact limit, then append an opaque unique event member only on admission; and
- token-bucket state: refill from Redis time, cap at approved capacity, test all requested tokens, then debit only on admission.

The call component includes correlation state in that same atomic operation, using the server-recorded caller/callee/nonce binding above. The current `TEMP_CALL_MAPPING_TTL_SECONDS = 120` is the compatibility-aligned correlation-marker lifetime: it is a protocol linkage lifetime, not a 121st numeric rate policy.

## TTL derivation

- A sliding-window key receives a TTL equal to its approved window after its newest admitted event. The complete set of chargeable timestamps is therefore retained for the full window and no longer.
- A token-bucket key receives `ceil((capacity - remainingTokens) / refillPerSecond)` seconds, rounded up to milliseconds in the script. It expires only once a missing key would be semantically equivalent to a full-capacity bucket. A full bucket need not be retained.
- A call correlation marker uses the existing 120-second temp-call mapping lifetime. It is written only with the logical-attempt admission and expires independently of quota state.

No TTL is a substitute numeric policy, and TTL expiry must never reset a not-yet-full token bucket early.

## Required stage ordering

1. Pre-auth entry/recovery: canonical `req.ip` actor → approved aggregate/operation stage → validation, lookup, provider, bcrypt, queue or issuance work.
2. Refresh: canonical network actor → Stage A → refresh-token verification → canonical verified subject → Stage B → `User.findById` and issuance.
3. Authenticated HTTP: auth middleware → canonical verified user → aggregate stage → cheap route/domain or multipart classification → approved domain/secondary stage → authorization/resource lookup/business work.
4. `PUT /api/users/profile`: `state_mutation` is always admitted before Multer; if request-boundary metadata shows avatar/multipart mode, the required `file_resource` memberships are also admitted before buffering.
5. Panel resources: verified user → `read_expensive` aggregate and conversation-panel domain → canonical validated conversation secondary → controller fan-out. The present process-local panel limiter is removed only when its Redis replacement is active.
6. Socket calls: handshake-verified `socket.userId` → atomic logical-attempt admission/correlation → syntactic validation, Mongo/Redis/signalling work. No raw Socket event counter is added.

## Required tests and verification

Add focused tests for the new components and extend existing HTTP/socket tests:

1. Redis-script contract: Redis `TIME`; full-capacity initialization; fractional refill; capacity cap; every approved exact value; sliding expiry; computed retry; stage all-or-none; keys/TTL never persist a partial admission; and every multi-key stage passes `CLUSTER KEYSLOT` equality under the pinned standalone/Cluster test matrix.
2. Failure contract: Redis command/script errors return `503 RATE_LIMIT_UNAVAILABLE` or the structured Socket equivalent, invoke no protected controller/handler work, and never fall back to `Map`/memory.
3. HTTP membership matrix: prove all and only the 26 HTTP enforcement points are attached; `read_bounded`, M1/M2, session/logout, probes and Nginx are unchanged.
4. Refresh ordering: prove Stage A precedes verification and Stage B follows verified-subject extraction but precedes database/issuance.
5. Profile and panel ordering: prove avatar/multipart admission happens before Multer buffering; prove panel-resource secondary uses a validated canonical conversation.
6. Socket logical attempts: one `initCall` plus correlated `callUser` consumes once across isolated handler/module state; server caller/callee/nonce binding is required; unmatched `callUser` consumes once; replay cannot refresh correlation TTL and is suppressed; glare path remains a bounded logical attempt; Redis failure emits the structured unavailable response.
7. Regression: existing route, auth, upload, panel, call and full server tests continue to pass. Do not run a scanner under this gate.

## Migration and compatibility impact

The limiter creates a new versioned Redis namespace only; it does not migrate MongoDB, rewrite Redis business data, or use an in-memory shadow/fallback. Token buckets begin at approved capacity on first use. Existing process-local panel and raw-call counters must be removed in the same implementation cutover to prevent double enforcement.

Rolling mixed versions cannot be represented as complete enforcement: old replicas would not consume the new shared keys. Deployment is outside this gate; a later deployment gate must require a coordinated all-replica cutover and rollback plan. No client API contract, Nginx configuration, raw call-event policy, target-wide policy, actor-callee policy, reset-subject policy, M1/M2, or `read_bounded` behavior changes here.

## Human authorization decision

Maintainer response:

```text
Rate-limit closure-minimum implementation: A | B
```

- **A selected** — only the source-and-test implementation described in this
  gate was authorized, preserving all R1 values/contracts and exclusions.
- **B not selected** — the numeric baseline was not held.

## Verification record

- The retained command `npm --prefix server run test:rate-limit:acceptance`
  runs the four mandatory Redis tests without skip against Redis OSS `7.0.0`
  standalone and a native three-primary Redis Cluster `7.0.0`; the command
  passed `8/8` tests with `0` skipped.
- The tests cover same-slot `EVAL`, atomic all-or-none multi-bucket admission,
  token-bucket full initialization/refill/capacity TTL, Redis-time usage,
  failure-to-unavailable behavior, refresh Stage A/B ordering, multipart
  admission before Multer, panel actor+conversation keys, logical-call
  correlation/replay semantics, and two-client concurrent logical-attempt
  single-use behavior.
- Full server regression passes serially with `437` passed and `5` skipped
  tests; the additional skip is the new Redis-backed concurrency test when the
  explicit acceptance endpoints are absent from an ordinary local suite.
- No deployment, telemetry enablement, Nginx change, scanner run, credential
  mutation, source/history rewrite, or excluded control was performed.

## Stop condition

Stop after implementation and verification for maintainer stress-review. This
authorization still does not authorize deployment, telemetry, Nginx changes,
scanner execution, or Issue #61 closure.
