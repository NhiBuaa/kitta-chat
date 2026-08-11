# Issue #61 Query/Input Alert Source-to-Sink Matrix

## Scope and method

Read-only Q1 disposition review of the sixteen open `js/sql-injection`-named CodeQL alerts (#10–#25). The rule name does not establish SQL semantics: the sinks are Mongoose/MongoDB queries or Redis key/value operations. No source was patched, no alert was dismissed, no database or Redis connection was made, and no runtime exploit was reproduced.

The Mongoose evidence below is version-specific and offline: repository dependency `mongoose@9.3.3`, exact repository models, and `Query#cast()`/`Query#_castUpdate()` were exercised without a connection. It establishes query construction semantics, not authorization correctness or live-data impact.

| Offline check | Result relevant to this review |
| --- | --- |
| `findById`, `findOne({ _id })`, `findByIdAndUpdate` with a valid scalar ObjectId | Cast to ObjectId. |
| The same selectors with malformed scalar `not-an-object-id` | Throw `CastError` before execution. |
| The same selectors with `{ $eq: validId }`, `{ $ne: null }`, or `[validId]` | Preserve an operator-shaped selector (`$eq`, `$ne`, or `$in`) rather than rejecting it. Mongoose alone is therefore not an input boundary. |
| `Group.members` document assignment before `save()` with object/operator-shaped member input | Exact `Group` schema validation reports `CastError`; the object does not become an ObjectId member. |
| Exact `User` strict schema (`strict: true`) updating nested `activityStatus` with `$`-named nested fields | Unknown nested fields are stripped; an explicit field operator for `activityStatus.state` throws `CastError`. The fixed update keys remain application-owned. |

Final categories below are candidate security dispositions, not a GitHub alert UI action. Scanner confirmation or a separately approved dismissal workflow remains distinct.

| Alert | Source and flow | Actual sink / structure influence | Auth/authz context | Classification | Minimum next action; M1/M2 impact; stop/candidate status |
| ---: | --- | --- | --- | --- | --- |
| #10 | `POST /api/files/:fileId/download-url`; body `messageId`. | Fixed selector keys, but `Message.findOne({ _id: messageId, attachments: fileId })` at `fileController.js:107` receives raw body data before `getPermissions`. Mongoose 9.3.3 preserves operator-shaped `_id`. | Route is authenticated; authorization happens after this sink. | `REMEDIATION REQUIRED` | A scalar/canonical ObjectId boundary for `messageId` must precede both #10/#11 selectors. One future narrow file-identifier seam can cover both; preserve file permission/visibility ordering. |
| #11 | Same route and `messageId`. | `Message.exists({ _id: messageId, attachments: fileId, conversationId, ...visibilityFilter })` at lines 132–137; raw `messageId` again supplies selector value. | Permission and participant visibility occur first here, but that does not repair #10's prior unsafe selector. | `REMEDIATION REQUIRED` | Same boundary as #10. No M1/M2 change. |
| #12 | `POST /api/groups/:groupId/add-member`; body `memberId`. | `group.members.push(memberId); await group.save()` occurs before `User.findById(memberId)`. Exact `Group.members: ObjectId[]` validation rejects object/operator-shaped input with `CastError`; it cannot reach the later lookup as a selector. | Authenticated; caller membership is checked before assignment. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | This is a model-enforced ObjectId document boundary, not generic Mongoose selector casting. Malformed scalar and object input fail validation; no attacker-controlled query structure reaches the reported `findById`. |
| #13 | `POST /api/groups/:groupId/remove-member`; body `memberId`. | `User.findById(memberId)` at line 338. | Group existence, admin/self authorization, and strict string equality against an existing `group.members` ObjectId occur before sink. Object input stringifies differently and fails membership. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | The membership gate emits only a stored member identifier as an effective selector value. |
| #14 | `POST /api/groups/:groupId/transfer-admin`; body `newAdminId`. | `User.findById(newAdminId)` at line 467. | Current-admin authorization and strict equality against an existing `group.members` ObjectId occur before sink. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | The target-membership gate prevents object/operator query structure reaching the sink. |
| #15 | `GET /api/sidebar/conversations?kind=...`; `kind`. | `Conversation.find({ kind })` at `sidebarController.js:65`; application constructs the selector and calls it only inside `kind === "direct" || kind === "group"`. | Authenticated route. | `NO REMEDIATION REQUIRED — RULE SEMANTIC MISMATCH` | The sink has fixed Mongo query structure and a two-literal scalar enum boundary. Nonmatching strings and object-shaped query parsing bypass the query entirely; no alternate query shape exists. |
| #16 | `PUT /api/users/profile`; body `displayName`, `status`, parsed `activityStatus`. | Selector is verified `req.user.id`; update object has fixed top-level keys `{ displayName, status, activityStatus }`. Exact `User` schema is `strict: true`; unknown nested `$` fields are stripped and direct nested operator objects cast-fail. | Authenticated self-profile route. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | Body data can affect only known scalar/subdocument values, not selector or update-key structure. This addresses the query alert only; separate response/logging or product-validation concerns are not disposed here. |
| #17 | `POST /api/users/accept-friend`; body `senderId`. | `User.findById(senderId)` at line 399 after the pending-request match and accepted-request write-through. | `includesId()` canonicalizes via `toString`; only a receiver's stored pending-request ID matches. Object/operator input cannot match. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | The relationship gate supplies a stored relationship identity before the reported sink. |
| #18 | `POST /api/users/friend-request`; body `receiverId`. | `User.findById(receiverId)` at line 613 is reached before a scalar/ObjectId boundary; Mongoose preserves object/operator selector input. | Authenticated sender; self check alone does not constrain object structure. | `REMEDIATION REQUIRED` | The shared `receiverId` boundary must precede #18 and #19. This is a shared input and identifier seam for those two alerts. |
| #19 | Same `receiverId` flow. | `User.findByIdAndUpdate(receiverId, { $push: { friendRequests: senderId } })` at line 630. Selector values accept operator-shaped input under Mongoose 9.3.3; update keys are fixed. | Authenticated sender; runs after #18 lookup, but the same raw value controls both selectors. | `REMEDIATION REQUIRED` | Same shared `receiverId` boundary as #18; without it an operator-shaped selector can target an unintended user document. |
| #20 | `POST /api/users/remove-friend`; body `friendId`. | `User.findById(friendId)` at line 699 runs in parallel with current-user lookup before relationship membership is evaluated. Mongoose preserves object/operator selector input. | Authenticated current user; empty/self checks do not constrain object shape, and the friendship check is downstream. | `REMEDIATION REQUIRED` | Similar ObjectId semantic, but a distinct `friendId` input boundary and route behavior. It is not proven to share an implementation seam with #18/#19; preserve the route's `alreadyRemoved` compatibility when remediating. |
| #21 | Internal `addFriendWriteThrough(senderId, receiverId)` after #17. | Two `User.findByIdAndUpdate` `$addToSet` calls; Redis keys derive from same relationship IDs. | Its only shown caller follows the pending-request gate in #17. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | Both IDs are relationship-constrained scalars. Fixed Mongo update keys and fixed Redis command names leave no caller-controlled query/key structure. |
| #22 | Internal `removeFriendWriteThrough(currentUserId, friendId)`. | Two `findByIdAndUpdate` `$pull` calls; Redis keys derive from same IDs. | Called after the current user has been confirmed to list `friendId` as a friend. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | Relationship gate precedes internal call; update structure and Redis command names are fixed. |
| #23 | `setPresenceWriteThrough(userId, status)`. | Fixed `findByIdAndUpdate` update paths and `presence:<userId>` Redis key. | Known callers use handshake-verified `socket.userId` or `req.user.id`; `status` is normalized to known values. | `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | The reported data is a verified principal, not caller-supplied identifier. This relies on the stated caller contract and does not authorize changes to it. |
| #24 | `getUserPresence(userId)` from conversation-panel overview. | Fixed Redis command `hGetAll` with a single interpolated `presence:<userId>` argument, then fallback `User.findById(userId)` when Redis is closed. | Q2-D now validates a direct route ID as exactly two distinct strict ObjectIds, requires the builder's canonical representation, and verifies the JWT requester is one participant before permission or overview work. | `REMEDIATED / SCANNER CONFIRMATION PENDING` | Redis command/key structure remains safe. Invalid direct IDs return generic 403 before permission, overview, presence, Redis, or Mongo fallback. Distinct from M1/M2. |
| #25 | Same `getUserPresence(userId)` flow on Redis error. | Fixed fallback `User.findById(userId)` at line 138 after `hGetAll(presence:<userId>)` fails. | Same Q2-D shared route boundary as #24; fallback is downstream only of a validated canonical direct resource and existing permission gate. | `REMEDIATED / SCANNER CONFIRMATION PENDING` | No cache/read-model bypass was established. It shares #24's route boundary and awaits scanner confirmation. |

## Classification counts

| Classification | Count | Alerts |
| --- | ---: | --- |
| `NO REMEDIATION REQUIRED — CONSTRAINED BEFORE SINK` | 8 | #12, #13, #14, #16, #17, #21, #22, #23 |
| `NO REMEDIATION REQUIRED — RULE SEMANTIC MISMATCH` | 1 | #15 |
| `REMEDIATED / SCANNER CONFIRMATION PENDING` | 7 | #10, #11, #18, #19, #20, #24, #25 |

## Future-slice consequence

Q1 resolves the Mongoose casting uncertainty. Q2-A remediated #10–#11 and #18–#20 at source/test level. Q2-C established the virtual direct-pair resource model, and authorized Q2-D remediated the shared canonical direct-ID boundary for #24–#25 at source/test level.

The first per-alert table preserves the historical Q1 source-to-sink analysis. The classification-count table above is the current sixteen-alert workstream state: nine alerts need no remediation and seven are remediated at source/test level with scanner confirmation pending. No alert was dismissed.

## Q2-A source-shape exploitability preflight

This preflight distinguishes a Mongoose method accepting an operator object from the actual HTTP source being able to supply one. All five sources below are JSON-body properties: `createApp()` installs `express.json({ limit: "10kb" })` before the mounted routes. JSON can therefore carry a string, object, array, operator-shaped object, nested object, `null`, or an omitted property into `req.body`. No route parameter is the reported tainted identifier source. The companion `fileId` in #10/#11 is an Express route parameter and is a string at the controller seam; it is not evidence that `messageId` is scalar.

| Alert | Route / controller / source | Source shape and transformations before sink | Exact sink and reachability | Final preflight disposition |
| ---: | --- | --- | --- | --- |
| #10 | `POST /api/files/:fileId/download-url` → `createDownloadUrl`; `req.body.messageId` | Expected normal client value: string. A JSON caller can instead send array, nested object, `{ "$eq": value }`, `{ "$ne": null }`, or `null`. The only pre-sink guard is truthiness; truthy non-scalars pass unchanged. | `messageModel.findOne({ _id: messageId, attachments: fileId })` receives the original body value unchanged. | `REMEDIATION REQUIRED — NON-SCALAR SELECTOR SHAPE REACHABLE` |
| #11 | Same route/controller/source as #10 | Same source, parser, and unchanged value. It is the same canonical boundary seam as #10. | When visibility filtering applies, `messageModel.exists({ _id: messageId, attachments: fileId, conversationId, ...visibilityFilter })` receives the original body value unchanged. | `REMEDIATION REQUIRED — NON-SCALAR SELECTOR SHAPE REACHABLE` |
| #18 | `POST /api/users/friend-request` → `sendFriendRequest`; `req.body.receiverId` | Expected normal client value: string. JSON object/array/operator/nested shapes are reachable. The self check is strict equality only, so non-scalar values are neither normalized nor rejected. | `User.findById(receiverId)` receives the original body value unchanged. | `REMEDIATION REQUIRED — NON-SCALAR SELECTOR SHAPE REACHABLE` |
| #19 | Same route/controller/source as #18 | Same source and transformations as #18. The receiver lookup is followed by relationship checks, but none canonicalizes the raw selector value. | `User.findByIdAndUpdate(receiverId, { $push: { friendRequests: senderId } })` receives the original body value unchanged; only update keys are application-owned. | `REMEDIATION REQUIRED — NON-SCALAR SELECTOR SHAPE REACHABLE` |
| #20 | `POST /api/users/remove-friend` → `removeFriend`; `req.body.friendId` | Expected normal client value: string. JSON object/array/operator/nested shapes are reachable. Falsy values return 400; `toComparableId` is used only for self comparison and the original non-scalar value is retained. | In `Promise.all`, `User.findById(friendId)` receives the original body value unchanged before the `alreadyRemoved` relationship check. | `REMEDIATION REQUIRED — NON-SCALAR SELECTOR SHAPE REACHABLE` |

Mongoose 9.3.3 offline casting evidence is therefore relevant to each listed source: all five can carry a non-scalar shape to their reported selector. This is not an HTTP exploit reproduction and did not connect to MongoDB.

### Candidate Q2-A identifier boundary contract

Only if implementation is separately approved, each included seam must apply this order: `external identifier → validate scalar shape → retain the accepted scalar → Mongoose`. It must not validate a coerced copy and then pass the original body value.

- Accepted shape: a JavaScript string matching exactly 24 hexadecimal characters, case-insensitive.
- Rejected before Mongoose: missing where the route permits omission, `null`, array, object, nested object, `{ "$eq": ... }`, `{ "$ne": ... }`, short string, and 24-character non-hex string.
- Case decision: preserve the accepted client string; do not introduce a client-visible lower-case rewrite. Mongoose receives that same validated scalar and performs its existing ObjectId casting.
- Candidate mechanisms, measured against Mongoose 9.3.3: explicit `typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value)` and `typeof value === "string" && mongoose.isObjectIdOrHexString(value)` both reject the listed non-scalar shapes in this version. `mongoose.Types.ObjectId.isValid()` also rejected this Q2 input matrix in v9.3.3, but is not itself a clear external-type contract. Existing `isStrictObjectId` is backfill-only and coerces through `toIdString`; it is not a suitable HTTP boundary.
- No generic repository-wide ObjectId helper or migration is proposed.

### Existing and proposed compatibility behavior

| Seam | Existing malformed/non-scalar behavior | Proposed only if Q2-A is authorized | Valid identifier behavior that must remain |
| --- | --- | --- | --- |
| Q2-A1 `messageId` (#10/#11) | Missing/falsy: 400 `Thiếu thông tin tải tài liệu.`. Malformed scalar normally becomes a caught Mongoose error and this controller returns 500; truthy non-scalars can execute selectors. | Reject all malformed/non-scalar `messageId` with explicit 400 before either reported Mongoose call. The exact existing response schema/message must be confirmed in focused tests before choosing the final code/message. | Existing file lookup, permission and visibility decisions, 404/403 outcomes, and successful download path. `fileId` is outside this seam. |
| Q2-A2 `receiverId` (#18/#19) | No explicit missing/shape guard. Missing normally reaches `findById(undefined)`; malformed scalar reaches Mongoose and is caught as 500; truthy non-scalars can execute selectors. | Reject malformed/non-scalar `receiverId` with explicit 400 before lookup/update. This is an intentional behavior change from internal error/non-deterministic selector behavior. | Self-target, nonexistent-user, duplicate-request, existing-friend, write-through and event behavior for a valid ObjectId. |
| Q2-A3 `friendId` (#20) | Missing/falsy: 400 `Thiếu friendId`; malformed scalar reaches Mongoose and is caught as 500; truthy non-scalars can execute selector before membership check. | Reject malformed/non-scalar `friendId` with explicit 400 before `Promise.all`. | Valid ObjectId for an absent friendship must still return `{ success: true, alreadyRemoved: true }`; this behavior does not justify admitting malformed input to Mongoose. |

### Required implementation tests if Q2-A is authorized

For every included seam: valid canonical ObjectId string; short string; 24-character non-hex string; `$eq` object; `$ne` object; array; nested object; `null`; and omitted property where transport permits it. Each invalid non-scalar test must prove that the specific Mongoose lookup/update mock was not called. Valid tests must prove current business behavior. #20 additionally needs a valid ObjectId for an already-absent relationship to preserve `alreadyRemoved`.

### Q2-A human implementation gate

**A — Authorize Q2-A narrow identifier-boundary remediation** for exactly:

1. Q2-A1: #10/#11, `req.body.messageId`, one shared strict scalar 24-hex boundary before both selectors.
2. Q2-A2: #18/#19, `req.body.receiverId`, one shared strict scalar 24-hex boundary before lookup and update.
3. Q2-A3: #20, `req.body.friendId`, a separate strict scalar 24-hex boundary before `Promise.all`, preserving valid-ID `alreadyRemoved` behavior.

Implementation must use controller-boundary adversarial tests, preserve valid business outcomes, and stop if it requires M1/M2 authorization changes, API/schema redesign, a repository-wide migration, Mongo migration, query-model redesign, rate limiting, credential work, dependency upgrade, or deployment work.

**B — Keep Q2-A remediation on hold.** No code changes; the five findings remain source-confirmed remediation requirements.

## Q2-A implementation record — 2026-08-09

Maintainer chose Q2-A option A. The implementation adds one narrow helper, `server/src/validation/externalObjectId.js`, used only by the three approved controller seams. It returns true only for a JavaScript string matching exactly 24 hexadecimal characters. It neither coerces nor transforms input; each controller passes the same validated string to Mongoose.

| Alert(s) | Implemented boundary | Verification state |
| --- | --- | --- |
| #10, #11 | `createDownloadUrl` returns HTTP 400 before `fileModel.findById`, `messageModel.findOne`, or `messageModel.exists` when `req.body.messageId` is missing, non-string, or non-hex/non-24-character. Valid download, 403, and 404 tests remain green. | `REMEDIATED / SCANNER CONFIRMATION PENDING` |
| #18, #19 | `sendFriendRequest` returns HTTP 400 before `User.findById` or `User.findByIdAndUpdate` when `req.body.receiverId` is not a strict external ObjectId string. Valid request behavior remains green. | `REMEDIATED / SCANNER CONFIRMATION PENDING` |
| #20 | `removeFriend` returns HTTP 400 before `Promise.all`/`User.findById` when `req.body.friendId` is not a strict external ObjectId string. A valid ID with no friendship still returns `alreadyRemoved: true`. | `REMEDIATED / SCANNER CONFIRMATION PENDING` |

Controller-boundary tests cover missing, null, short, 24-character non-hex, `$eq` object, `$ne` object, array, nested object, and number. Every rejected case asserts that its relevant mocked Mongoose method is not called. No authorization, schema, rate-limit, credential, or other query-finding behavior was changed.

### Verification record

- 2026-08-09: attempted a parser-shape harness using `supertest`; it did not run because `server/node_modules` has no `supertest` package (`MODULE_NOT_FOUND`). The same compound command also contained an independent JavaScript object-literal syntax error in its second inline snippet. No dependency was installed and no application code was changed.
- 2026-08-09: reran the independent offline Mongoose missing/null check successfully. `findById(undefined)` and `findByIdAndUpdate(undefined, ...)` cast to `{}`; `null` casts to `{ _id: null }`. This supports retaining explicit missing-value handling rather than relying on Mongoose.
- 2026-08-09: RED run `node --test test/fileDownload.test.js test/removeFriendController.test.js` failed as expected before remediation: non-scalar controller inputs returned 404 rather than 400 and reached mocked lookups. The initial valid receiver fixture was also already a friend and returned its expected domain 400; the test fixture was corrected before the GREEN run.
- 2026-08-09: GREEN focused suite passed 18/18; full server `npm test` passed 421/421. Root `npm run lint:ci`, syntax checks for the three production files, and `git diff --check` passed. `server` has no `lint:ci` script; the attempted `npm run lint:ci` there failed with `Missing script: "lint:ci"`, then the repository root lint command was used. Local CodeQL CLI is unavailable, so no scanner claim is made.

## Q2-B direct-conversation authorization-boundary review — read-only

### Shared route-to-boundary path

`GET /api/conversations/:id/panel/metadata` is mounted as `verifyToken → getMetadata`. `verifyToken` cryptographically verifies the bearer JWT and assigns its payload to `req.user`; `getMetadata` reads `req.user.id || req.user._id` and the caller-controlled string route parameter `req.params.id`. It calls `permissionService.getPermissions(userId, conversationId)` and returns 403 before `overviewService.getOverview()` or `preferenceService.getPreferences()` if `canRead` is false.

| Alert | Source and resource | Authorization before read | Cache / read behavior | Observable result if gate permits | Candidate disposition |
| ---: | --- | --- | --- | --- | --- |
| #24 | `overviewService.getOverview()` derives `otherUserId` from the requested direct `conversationId`; resource is the other user’s display name or email fallback, avatar, and online state. | For a direct key, `getPermissions` only requires `conversationId.split("_").includes(verifiedUserId)`. It does not validate exactly two IDs, canonical ordering, ObjectId shape, existence of a Conversation record, or a ConversationParticipant row. | `getUserPresence(otherUserId)` builds `presence:<otherUserId>` and, when Redis is open, reads it with one fixed `hGetAll` call. | `overview` includes name/email fallback, avatar, `isOnline`, and direct-member count. | `DEEPER REVIEW REQUIRED` |
| #25 | Same derived `otherUserId`; resource is the durable `User.activityStatus` fallback used to derive online state. | Identical JWT and `canRead` gate, prior to fallback. | When Redis is closed or `hGetAll` throws, `getUserPresence` calls fixed `User.findById(otherUserId).select("activityStatus").lean()`. | Only status-derived `isOnline` reaches overview. | `DEEPER REVIEW REQUIRED` |

### What Q2-B proves

- **Redis key structure is not the vulnerability.** The command name is statically `hGetAll`; it receives one key argument. The `presence:` prefix is application-owned. A route parameter is a string, and splitting it can only supply a scalar segment to that fixed key.
- A caller cannot alter Redis command structure, add command arguments, or escape to another Redis command. A colon inside the segment remains part of one Redis key and does not escape the `presence:` namespace. There is no cross-resource key collision shown: the only reachable key type remains `presence:<segment>`.
- There is no cache/read-model authorization bypass in this path: the controller’s `canRead` check is before overview, Redis lookup, Mongo fallback, preference lookup, ETag creation, and response serialization. Redis failure selects a Mongo fallback only after the same gate.
- The repository’s normal direct-key builder is `[leftId, rightId].sort().join("_")`, and backfill code treats malformed/non-two-part direct identifiers as unsafe. The runtime direct authorization path does not enforce either invariant.

### Remaining authorization ambiguity

A verified requester can substitute any string containing their own user ID plus another segment. The existing direct-permission tests state that a requester in the pair has `canRead`, while a requester absent from the pair does not. They do not establish whether a fabricated pair containing the requester is intentionally allowed to expose the other user’s overview/presence, or whether authorization must bind to a canonical existing direct conversation/participant record.

Consequently neither alert can be called `NO REMEDIATION REQUIRED — AUTHORIZATION BOUNDARY VERIFIED`, and Q2-B cannot responsibly classify it as a confirmed resource gap without a product/authorization decision on that direct-conversation invariant.

### Relationship to M1/M2

#24/#25 are **independent authorization-boundary findings under review**, not the same root cause as M1 or M2:

- They use an authenticated `verifyToken` route and a pre-read `canRead` check.
- M1 is unauthenticated message write integrity; M2 is an unauthenticated message-history read/identity issue on different endpoints.
- Future M1/M2 work may clarify broader direct-conversation conventions, but neither is required to decide this panel-specific direct-resource invariant. Q2-B does not merge scopes.

### Minimum future contract, only if a decision confirms a gap

Before any cache, read-model, User, or preference access: derive a canonical verified requester; validate the requested direct resource against the approved direct-key contract; authorize that requester against the approved membership model; then resolve overview/presence and return a generic 403 for denial. Whether the model is pair-membership-only, canonical pair plus durable Conversation/ConversationParticipant membership, or another product rule is unresolved and must be chosen before remediation. No implementation is proposed by Q2-B.

### Candidate future regression matrix

- Authorized participant requesting an authorized direct conversation.
- Authenticated non-participant requesting another direct conversation.
- Requester substituted into a noncanonical, malformed, or fabricated pair.
- Unauthorized requester with a simulated Redis/presence hit.
- Authorized requester with a legitimate Redis/presence hit.
- Redis fallback for both authorized and unauthorized requester.
- Missing/not-found target or conversation.

The tests must prove that a denied requester receives no overview, presence-derived state, preference, or ETag-derived protected response.

## Q2-C direct-conversation product-contract reconstruction — read-only

### Lifecycle and authority reconstruction

1. The normal direct identity is virtual and canonical: `buildConversationId(senderId, receiverId)` converts two values to strings, sorts them, then joins them with `_`. The client derives the same sorted pair in `ChatPage` for an active direct chat.
2. The frontend sidebar intentionally includes friends with no message: `getSidebarUsers` computes `noMessageFriendIds` from friendship data and returns entries with `lastMessage: null`. Selecting such an entry creates an active direct chat; the enabled Conversation Panel fetches metadata whenever it is opened with an active chat and a conversation ID. This is source evidence that a valid panel flow exists before a first message and before durable read-model rows.
3. Direct socket message send derives the same pair if one is not supplied, persists the legacy `Message` first, and only then invokes `dualWriteConfirmedMessage`. The durable `Conversation` and two `ConversationParticipant` rows are created by `ensureConversationForConfirmedMessage` after that persistence.
4. Read-model dual-write is feature-flagged and disabled by default; migration rules explicitly say it is not sidebar/search source of truth. A durable `Conversation`/`ConversationParticipant` therefore cannot be a precondition for every valid direct overview. Preference lookup also returns defaults when no participant row exists.
5. `Conversation` stores `kind`, `legacyConversationId`, `directKey`, and `participantUserIds`; `ConversationParticipant` is uniquely keyed by durable conversation plus user. They are useful read-model state after message persistence, but current repository authority is the legacy direct-pair identity and Message flow, not durable membership for every direct panel read.

**Strongest supported model: Model A — virtual/potential direct conversation.** A canonical pair containing the verified requester is a valid direct resource even if durable read-model rows do not yet exist. Model B would break the explicit no-message-friend panel flow and conflict with the disabled-by-default migration contract.

### Canonical direct-ID boundary analysis

Normal paths establish all of the following: exactly two participants, ObjectId-shaped user identities, and lexicographically sorted ordering. The current panel route does not enforce them.

| Request parameter form (requester = `A`) | Current direct permission / overview behavior | Contract consequence |
| --- | --- | --- |
| `canonical(A,B)` | `canRead` true; overview derives `B`. | Valid Model-A resource. |
| reversed `B_A` | `canRead` true; overview still derives `B`. | Noncanonical alias accepted. |
| `A_B_C` | `canRead` true; overview selects the first segment not equal to `A` (`B`). | More than two participants accepted; not a valid normal direct identity. |
| `A_A_B` | `canRead` true; overview selects `B`. | Duplicate requester segment accepted. |
| `A_malformed` | `canRead` true; later User lookup may reject malformed scalar rather than a boundary denial. | Invalid identity reaches downstream work. |
| `A_nonexistentValidObjectId` | `canRead` true; no target user yields generic overview/fallback presence state. | Resource validity is not established, but no protected target data is returned. |

This is an identifier-validity problem independent of durable-membership semantics. It supplies the final candidate disposition for both #24 and #25: `REMEDIATION REQUIRED — DIRECT RESOURCE IDENTIFIER BOUNDARY`.

### Target-user existence and M1/M2 relationship

The valid pre-message UI path obtains a target from the authenticated user’s friend list, which already contains existing users. The server-side virtual-pair contract does not itself prove that friendship is a read authorization condition: direct socket message creation derives a pair from a receiver without a friendship gate. A nonexistent syntactically valid target returns a generic overview rather than protected target data. Therefore Q2-C does **not** establish a target-existence/resource-validity remediation beyond the direct-ID boundary.

#24/#25 remain independent from M1/M2. Their route has verified authentication and a pre-read permission call; M1/M2 have different message endpoint/root-cause contracts. Q2-C uses message paths only as lifecycle evidence and does not merge or remediate them.

### Exact future remediation contract — not implemented

Before `getPermissions`, preference, overview, Redis, or Mongo access for a direct panel resource:

1. Obtain the verified requester principal from the already-verified auth middleware.
2. Parse `req.params.id` as exactly two strict ObjectId strings separated by one underscore.
3. Require the pair to be canonical under the repository builder (sorted joined form) and require the verified requester to be one of those two IDs.
4. Reject invalid/noncanonical IDs before downstream reads; return generic 403 when the requester is absent from a valid pair.
5. Only then run existing permission, overview, preference, Redis, and fallback behavior.

Compatibility: normal client paths already construct sorted pairs and no-message friend panels remain valid. Legacy noncanonical direct IDs would become invalid for this panel endpoint; backfill already classifies them as ambiguous/unsafe, so any future implementation must expose that migration compatibility consequence explicitly rather than silently normalizing aliases.

### Candidate future tests

- Canonical requester/target pair with no durable Conversation or ConversationParticipant: allowed metadata response.
- Existing canonical pair with durable read-model rows: allowed metadata response.
- Requester absent from pair: generic 403 with no overview/presence/preference access.
- Reversed pair, three-or-more segments, duplicated requester, malformed segment: rejected before permission/overview/cache/Mongo reads.
- Canonical pair with a syntactically valid nonexistent target: preserve the explicitly approved generic current behavior, or revise only under a later target-validity decision.
- Authorized canonical pair with Redis hit and Redis fallback: retain existing observable behavior.

## Q2-D direct-resource identifier remediation — 2026-08-09

Maintainer authorized Q2-D option A for #24/#25 only. `GET /api/conversations/:id/panel/metadata` now validates an underscore-bearing direct ID before `getPermissions`, overview, preferences, presence, Redis, or Mongo fallback work. The narrow validator reuses `buildConversationId` after parsing both segments as strict external ObjectIds; ObjectId rendering supplies the existing normal lower-case generated representation, so the provided ID must equal the builder output rather than being silently normalized.

Accepted direct resource: exactly two distinct canonical 24-hex ObjectId participants, with the verified JWT requester as one participant. Rejected with the existing generic 403: reversed pair, three-or-more segments, duplicate participants, malformed or non-hex segments, requester absence, and other requester-containing arbitrary structures. A canonical pair continues through the existing Model-A flow without checking friendship, target existence, `Conversation`, or `ConversationParticipant`.

Route-level regression tests prove a canonical virtual pair reaches the existing permission, overview, and preference services without durable-read-model fixtures. Each invalid ID is denied before those services, which prevents the overview path from reaching presence, Redis, or Mongo fallback. Presence regressions preserve both `hGetAll` cache-hit and Redis-error Mongo-fallback behavior. Focused panel, overview, permission, and presence regression tests passed 33/33; local CodeQL CLI is unavailable, so #24/#25 remain `REMEDIATED / SCANNER CONFIRMATION PENDING`.
