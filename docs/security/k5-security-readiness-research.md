# Workflow k5-security-readiness-package: Issue #61 Security-Readiness Research

## Question and evidence boundary

At repository HEAD 4388ed842498fa85d90a95d06944e7c9db936e25 on 2026-08-19, what can be established from current repository source code, focused tests, authoritative security records/ADRs, and reachable GitHub Issue #61/accepted comments about:

1. REST message create/history authorization and the route/controller contract;
2. reset-token fragment transport and logging/redaction;
3. the exact browser-origin/CORS policy;
4. the /ops exposure boundary;
5. distributed rate-limit policy, identity, failure semantics, and acceptance evidence; and
6. scanner, dependency, license, deployment, and public-demo residuals?

This is an evidence record only. It does not infer a new policy, remediation, deployment authorization, or benchmark meaning. Current source/tests are the authority for current behavior; retained security records and Issue #61 are cited for recorded dispositions and historical evidence. Where records conflict with current source, the conflict is stated explicitly.

## Primary sources

- GitHub Issue #61: https://github.com/NhiBuaa/kitta-chat/issues/61
- Accepted Issue #61 closure comment: https://github.com/NhiBuaa/kitta-chat/issues/61#issuecomment-5262050190
- Current REST/auth source and tests: server/src/routes/messages.js:1-21; server/src/controllers/messageController.js:1-167; server/src/middlewares/auth.js:1-44; server/test/messageAccessControl.test.js:39-106; server/test/httpCoreFlows.test.js:418-639.
- Current reset transport/logging source and tests: server/src/controllers/authController.js:414-537; client/src/features/auth/resetTokenFragment.js:1-7; client/src/features/auth/pages/ResetPassword.jsx:8-42; server/src/middlewares/requestLogging.js:15-57; server/src/utils/logger.js:3-70; nginx/nginx.conf:18-67,89-94; server/test/resetTokenTransport.test.js:7-45; server/test/resetTokenNginxPolicy.test.js:11-18.
- Current origin/operations source and tests: server/src/config/browserOriginPolicy.js:8-69; server/src/config/env.js:69-126; server/src/app.js:53-98; server/src/socket/index.js:38-65; docs/adr/014-browser-origin-security-boundary.md:1-10; scripts/ci/opsExposureBoundary.test.cjs:1-15.
- Current distributed admission source and tests: server/src/rateLimit/closureMinimumPolicyCatalog.js:25-73; server/src/rateLimit/requestIdentity.js:5-60; server/src/rateLimit/keyBuilder.js:1-123; server/src/rateLimit/distributedRateLimiter.js:14-287; server/src/rateLimit/httpAdmissionMiddleware.js:11-104; server/test/rateLimit/distributedAdmission.test.js:43-372.
- Current scanner/licensing source and records: .github/workflows/security.yml:20-220; scripts/ci/verifySecurityBaseline.cjs:25-85; scripts/ci/verifyLicensePolicy.cjs:35-117; docs/security/issue-61-security-check-baseline.json:1-27; docs/security/issue-61-license-policy.json:1-36; docs/security/issue-61-closure-gap-inventory.md:24-41,90-102; docs/security/issue-61-final-remaining-risk-record.md:1-45.
- Deployment boundary sources: nginx/nginx.conf:96-135; docker-compose.yml:39-69; README.md:43,156-176,268-279; docs/adr/011-staging-cd-boundary.md:1-7; docs/DEPLOYMENT_AND_SMOKE_TESTS.md:1-5.

## Findings

### 1. REST message create/history authorization and route/controller contract

Current route composition is:

| HTTP route | Middleware order | Controller |
| --- | --- | --- |
| POST /api/messages | authMiddleware, then messageWriteLimiter | createMessage |
| GET /api/messages/:userId1/:userId2 | authMiddleware, then messageHistoryLimiter | getMessages |
| GET /api/messages/sync | authMiddleware, then messageSyncLimiter | syncMissedMessages |

Source: server/src/routes/messages.js:6-19.

authMiddleware requires a bearer token, verifies it with JWT_SECRET, assigns the decoded payload to req.user, and returns 401 AUTH_REQUIRED or 403 INVALID_TOKEN before the controller on failure (server/src/middlewares/auth.js:4-29).

For POST /api/messages (server/src/controllers/messageController.js:34-100):

- The principal is req.user.id or req.user._id; missing principal is rejected with 403 MESSAGE_ACCESS_DENIED.
- A supplied sender must equal that principal; otherwise the request is rejected before Message.save.
- The persisted sender is always the authenticated principal, not the caller-supplied value.
- Public type: system creation returns 400 PUBLIC_SYSTEM_MESSAGE_FORBIDDEN.
- Group writes require a canonical Mongo ObjectId receiver and a positive Group.findOne({ _id: receiver, members: principalId }) membership check; invalid group IDs return 400, non-members return 403, and both are rejected before save.
- Direct writes require a receiver and derive conversationId by sorting the authenticated sender and receiver. The controller does not perform a separate direct-contact/friend lookup in this path.
- A successful write saves, performs the guarded conversation dual-write, populates attachments, and returns the saved message with status 200. Persistence failures log message_create_failed with an error name and return a fixed 500 INTERNAL_ERROR response.

For GET /api/messages/:userId1/:userId2 (server/src/controllers/messageController.js:102-167):

- A missing principal is rejected with 403.
- For a direct conversation, the requester must equal userId1 or userId2; otherwise the controller returns 403 before Message.find.
- For a group request with isGroup=true, membership is checked against userId2 and Group.members before querying messages.
- ConversationParticipant is consulted only after that route-level authorization to add a visibility filter. It is not the source of group membership in this controller.
- limit is parsed and capped at 200; the query uses the derived conversation ID, optional _id less-than cursor, newest-first sorting, and sender/attachment population, then reverses the page for the response.
- Success is 200 with { success: true, data, hasMore }; query failures return a fixed 500 INTERNAL_ERROR response.

Focused authorization evidence passes in server/test/messageAccessControl.test.js:39-106: sender impersonation, principal-derived sender, public system-message rejection, former group-member rejection, malformed/operator-shaped group receiver rejection, direct-pair denial, and the limit cap. Current HTTP tests also pass unauthenticated create/history checks and route admission checks (server/test/httpCoreFlows.test.js:578-639).

### 2. Reset-token fragment transport and logging/redaction

The current reset flow is:

1. forgotPassword signs a reset JWT for 15 minutes and constructs URL_FRONTEND/reset-password/<user-id>#<reset-token> (server/src/controllers/authController.js:414-423).
2. The browser reads the fragment, removes it with history.replaceState, and keeps the returned value in React state (client/src/features/auth/resetTokenFragment.js:1-7; client/src/features/auth/pages/ResetPassword.jsx:8-12).
3. The client calls POST /api/auth/reset-password/:id with the token in the JSON body (client/src/services/api/authApi.js:37-45).
4. The only reset route is /reset-password/:id; the retired token-bearing path is absent (server/src/routes/auth.js:42-50; server/test/resetTokenTransport.test.js:7-16).
5. The controller verifies the body token and returns generic invalid/expired messages without echoing it (server/src/controllers/authController.js:452-537; server/test/httpCoreFlows.test.js:498-576).

Logging controls cover current and legacy path surfaces:

- Application request logging strips the query and redacts a legacy /api/auth/reset-password/<id>/<token> path before emitting path (server/src/middlewares/requestLogging.js:15-18,24-51).
- Express error logging applies the same legacy path replacement (server/src/app.js:119-150).
- The structured logger omits fields whose keys match authorization, cookie, credential, password, secret, token, body, payload, html, or raw; path values lose queries (server/src/utils/logger.js:3-21).
- nginx logs safe_request_uri and safe_referer, maps legacy reset paths/referrers to redacted values, and sends Referrer-Policy: no-referrer (nginx/nginx.conf:18-26,58-67,89-94).
- Focused transport and nginx tests assert body-only token transport, absence of the token from request-log fields, legacy route absence, path/referrer redaction, and no-referrer (server/test/resetTokenTransport.test.js:18-45; server/test/resetTokenNginxPolicy.test.js:11-18).

Evidence limitation: historical log occurrence, retention, and access were not inspected. The accepted closure record explicitly preserves that limitation (docs/security/issue-61-final-remaining-risk-record.md:25,27-34). A separate current non-token PII path remains in the forgot-password queue-failure branch, which calls console.error with userId, normalized email, queue, and error fields (server/src/controllers/authController.js:424-448); this report does not assign a new disposition to that adjacent path.

### 3. Exact browser-origin/CORS policy

CORS_ALLOWED_ORIGINS is parsed as a comma-separated exact allowlist. Each entry must parse as a bare http or https origin with no userinfo, path other than /, query, or fragment; duplicates are removed and normalized URL.origin values are stored (server/src/config/browserOriginPolicy.js:10-49).

The exact predicates are:

- A browser origin is accepted only when it is a string exactly present in the configured set (server/src/config/browserOriginPolicy.js:52-59).
- A request with no Origin is accepted by the non-browser/request predicate; a present origin must be exactly allowlisted (lines 60-62).
- Missing or blank configuration is allowed only for development and test; outside those environments it throws CORS_ALLOWED_ORIGINS is required outside development and test (lines 32-39).
- validateServerEnv performs this parsing before normal server startup and returns the policy to createApp (server/src/config/env.js:69-126; server/server.js:7-20).

Express uses the shared policy with credentials true, methods GET/POST/PUT/DELETE/PATCH/OPTIONS, allowed headers Content-Type/Authorization/X-Request-ID, and exposed header X-Request-ID (server/src/app.js:66-76). Socket.IO uses the same exact-origin predicate, credentials true, methods GET/POST, and an allowRequest gate that permits only an absent or exact Origin (server/src/socket/index.js:38-65).

ADR-014 is explicit: credentialed REST and Socket.IO share exact scheme/host/port origins; wildcards, reflected origins, implicit aliases, and using the public app URL as the allowlist are not implicit (docs/adr/014-browser-origin-security-boundary.md:3-10). Current tests cover accepted exact origins, evil-subdomain rejection, missing production configuration, malformed origins, absent Origin, and Socket.IO rejection (server/test/browserOriginPolicy.test.js:9-49; server/test/httpCoreFlows.test.js:264-293; server/test/socketInitReadiness.test.js:131-146).

### 4. /ops exposure boundary

The Express application defines GET /ops without application authentication (server/src/app.js:78-98). The payload is operational: overall status, timestamp, uptime, memory byte counts, dependency status summaries, NODE_ENV, Node version, active Socket count, and lightweight-ops/prometheus false markers (server/src/services/healthService.js:123-148). It does not serialize configured secrets or connection strings; the focused endpoint test checks that (server/test/healthEndpoints.test.js:145-192).

The public boundary is supplied by nginx and Compose:

- nginx has an exact location = /ops with internal, so an external request cannot use that location directly (nginx/nginx.conf:103-135).
- The Compose backend service has no published ports entry and is attached only to chat-network (docker-compose.yml:39-69).
- The repository CI boundary test asserts both the nginx internal rule and the absence of backend port publication (scripts/ci/opsExposureBoundary.test.cjs:10-15).
- Direct access from inside the backend container/network remains possible because the Express route itself is not authenticated; the local diagnostic guide records that direct shape (docs/DEPLOYMENT_AND_SMOKE_TESTS.md:133-162).

This proves the current repository Compose boundary, not every future ingress. The accepted closure inventory records the /ops disposition as complete and preserves reopening on a public route or backend-port publication (docs/security/issue-61-closure-gap-inventory.md:37,41).

### 5. Distributed rate-limit policy, identity, failure semantics, and acceptance evidence

Current catalog and route membership:

- The current source catalog contains 29 policy IDs (server/src/rateLimit/closureMinimumPolicyCatalog.js:25-55; server/test/rateLimit/keyBuilder.test.js:16-56).
- Message create admits state_mutation.aggregate plus state_mutation.message_write; message history admits read_expensive.aggregate plus read_expensive.message_history (server/src/routes/messages.js:6-14).
- The HTTP middleware derives a network actor from req.ip for network-scoped policies and a user actor from req.user.id or req.user._id for user-scoped policies (server/src/rateLimit/httpAdmissionMiddleware.js:11-27; server/src/rateLimit/requestIdentity.js:5-23).
- The focused HTTP integration test observes exactly one admission per message request, with authenticated user-1 as actor and no route/conversation-derived actor (server/test/httpCoreFlows.test.js:595-639).
- Process-local compatibility rate limiting is retired; the legacy factory throws rather than providing an in-memory fallback (server/src/middlewares/rateLimit.js:1-12).

The catalog includes network-scoped auth/recovery windows, subject-scoped refresh Stage B, user-scoped state/file/read buckets, a user-conversation panel bucket, and a socket-user call bucket. Exact current values and algorithms are source-owned in closureMinimumPolicyCatalog.js:25-55. Examples relevant to this issue are:

- state_mutation.message_write: token bucket, 60 per minute, capacity 20, user scope.
- read_expensive.message_history: token bucket, 30 per minute, capacity 10, user scope.
- auth_recovery_request: sliding window, 5 per hour, network scope.
- auth_recovery_complete: sliding window, 10 per 15 minutes, network scope.
- call_initiation: sliding window, 10 per minute, socket-user scope.

Distributed semantics:

- ADMISSION_SCRIPT uses Redis TIME, not independent replica clocks (server/src/rateLimit/distributedRateLimiter.js:20-24).
- It checks every same-stage bucket before consuming any bucket; a rejection returns the rejected index and retry interval without entering the consume loop (lines 72-114). Consumption then occurs in the same Redis EVAL script (lines 116-149).
- Sliding-window state is a sorted set with bounded cleanup and a window TTL; token-bucket state stores credit/refill time and derives a TTL from the remaining deficit (lines 120-140).
- Keys encode identity values, use an explicit Redis Cluster hash tag, and reject cross-slot multi-key stages rather than falling back to sequential partial consumption (server/src/rateLimit/keyBuilder.js:5-85).
- The client selects native Redis Cluster when REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES is set, otherwise a standalone client from REDIS_RATE_LIMIT_URL, REDIS_URL, or host-port (server/src/rateLimit/distributedRateLimiter.js:261-277). Runtime startup connects the rate-limit Redis client before the server listens (server/server.js:12-16,93-124).
- EVAL/Redis failures return allowed false, unavailable true, and code RATE_LIMIT_UNAVAILABLE; HTTP middleware maps unavailable or missing service to 503, confirmed quota exhaustion to 429 RATE_LIMITED, and supplies integer Retry-After only when the limiter returns retry metadata (server/src/rateLimit/distributedRateLimiter.js:206-222; server/src/rateLimit/httpAdmissionMiddleware.js:68-100).
- Invalid user-conversation identity is rejected with 403 FORBIDDEN before admission; malformed admission replies and invalid call phases fail closed as unavailable (server/src/rateLimit/httpAdmissionMiddleware.js:44-66; server/test/rateLimit/distributedAdmission.test.js:328-372).
- Logical call correlation is short-lived at 120 seconds, binds caller/callee/client-call ID, charges an initial attempt, correlates the expected next phase, and suppresses replay without refreshing marker TTL (server/src/rateLimit/distributedRateLimiter.js:14-18,50-69,144-146; server/test/rateLimit/distributedAdmission.test.js:128-180).

Acceptance evidence:

- The retained acceptance harness starts pinned Redis OSS 7.0.0 standalone and native three-primary Cluster instances, injects both endpoints, runs distributedAdmission.test.js, and cleans only containers it started (server/scripts/runRateLimitAcceptance.js:6-24,148-190).
- The retained R2 record reports 8 tests, 8 passed, 0 failed, 0 skipped, including atomic multi-bucket admission, token-bucket TTL/refill, call correlation/replay, two-client concurrency, and Cluster slot checks (docs/security/issue-61-rate-limit-acceptance-evidence.md:12-63).
- This research did not rerun the Docker acceptance harness. The current local distributedAdmission.test.js run without explicit Redis endpoints passed 3 static tests and skipped 5 Redis-backed tests; this is an environment limitation, not evidence that the Redis acceptance cases failed.
- nginx has separate per-IP edge zones at 10 requests/second for general API and 1 request/second for auth, with bursts; those zones are ingress protection, not the Redis-shared application quota (nginx/nginx.conf:69-79,153-180). nginx retains a separate 503 edge-rejection behavior (nginx/nginx.conf:217-221).

### 6. Scanner, dependency/license residuals, and deployment/public-demo boundaries

#### Scanner and dependency residuals

The Issue #61 body’s 99 open Code Scanning alert count is explicitly a 2026-08-08 point-in-time inventory, not a current count (https://github.com/NhiBuaa/kitta-chat/issues/61). The accepted closure record instead records:

- Current package-manager audit baseline: root 0; client 16 with 2 critical, 2 high, 5 moderate, and 7 low; server 7 with 1 high, 5 moderate, and 1 low. Residuals are individually accounted by reachability/disposition records; the current closure overlay identifies accepted Firebase not-shipped/service-unreached branches, installed-only client build chains, and a maintainer-owned @babel/core/ajv dev-build-only review date of 2026-11-11 (docs/security/issue-61-closure-gap-inventory.md:90-96; docs/security/issue-61-final-remaining-risk-record.md:17-24).
- Direct current-checkout verification reconciled all three audit surfaces against docs/security/issue-61-security-check-baseline.json with exit 0.
- CodeQL evidence is advisory and merge-ref evidence, not a direct analysis of this current HEAD: the retained record identifies analysis 1605443353, merge 5e4f881…, and covered immutable source SHA 54e902fcb6666c4ed03eb818fdff3ab10d4715e5. It retains five final results as safe-boundary/custom-middleware-visibility dispositions; they are not described as dismissed (docs/security/issue-61-final-remaining-risk-record.md:21-22,27-34).
- The Gitleaks workflow scans full history with redacted output, sanitizes SARIF, and reconciles safe coordinates/fingerprints rather than values (.github/workflows/security.yml:172-220; scripts/ci/verifySecurityBaseline.cjs:35-79). The retained matrix classifies #1–#3 and #5 as real/revoked, #4 as historical/no longer used, and #102–#103 as synthetic test-only; no secret values were opened (docs/security/issue-61-gitleaks-sanitized-triage.md:5-17). GitHub Secret Scanning API access is recorded as unavailable (docs/security/issue-61-gitleaks-sanitized-triage.md:7).
- The workflow keeps audit, license, CodeQL, and sanitized secret checks advisory and verifies truthfully; ADR-009 prohibits hidden bypasses and broad allowlists (.github/workflows/security.yml:20-220; docs/adr/009-security-scanning-strategy.md:3-7). The current verifiers fail on audit-baseline drift, new Gitleaks coordinates, or license package/version/expression drift (scripts/ci/verifySecurityBaseline.cjs:65-85; scripts/ci/verifyLicensePolicy.cjs:52-117).

#### License residuals

The current package-specific manifest accounts for 7 root findings, 15 client findings, and 12 server findings. It preserves exact SPDX expressions, records client@0.0.0 UNLICENSED as separate project metadata, selects MIT as the recorded compliance basis for spark-md5, and marks current Linux Sharp libvips artifacts LGPL-3.0-or-later with a pre-distribution compliance/reopen condition (docs/security/issue-61-license-policy.json:1-36).

Current read-only license checks passed:

- root: license policy reconciled: root (7 findings);
- client: license policy reconciled: client (15 findings);
- server: license policy reconciled: server (12 findings).

The policy is exact-package/version/expression accounting, not a broad license-family allowlist. It does not establish legal sufficiency for a future distribution. In particular, the current manifest refers to @img/sharp-libvips-linux-x64@1.3.2 and @img/sharp-libvips-linuxmusl-x64@1.3.2; the original Issue #61 body named @img/sharp-libvips-linux-x64@1.2.4. Those are different historical coordinates and must not be conflated (docs/security/issue-61-license-policy.json:25-33; https://github.com/NhiBuaa/kitta-chat/issues/61).

#### Deployment and public-demo boundary

The repository currently documents a local Docker Compose product path, not a hosted public environment: README says no hosted public environment is advertised and describes nginx, three backend replicas, MongoDB, Redis, RabbitMQ, and workers for local Compose (README.md:43,156-176,273-279). ADR-011 leaves staging/CD deferred until a real target, credentials, protected environment, rollback, and runtime verification are approved (docs/adr/011-staging-cd-boundary.md:3-7).

The historical public-demo gate explicitly does not authorize deployment and says any future public-demo deployment needs a new authorization (docs/security/issue-61-public-demo-security-readiness-gate.md:3-7). Its old blocker table must not be used as current behavior evidence because it still describes pre-remediation no-auth message routes, path-carried reset tokens, permissive CORS, and public /ops (docs/security/issue-61-public-demo-security-readiness-gate.md:37-47). Current source/tests above supersede those behavior statements; the non-authorization boundary remains explicit.

## Explicit uncertainties and stale historical records

- No deployed production/hosted environment, deployed revision, ingress configuration, runtime Redis topology, log retention/access record, or behavioral measurement window was established. The accepted record states that no deployed production environment or hosted-log inspection was established and that raw auth/recovery logs remain quarantined (docs/security/issue-61-final-remaining-risk-record.md:27-34).
- The final CodeQL evidence covers SHA 54e902… via a merge-ref analysis, not current HEAD 4388ed…; it is retained evidence with an explicit source-coverage limitation, not a fresh CodeQL claim about this checkout.
- docs/security/issue-61-rate-limit-acceptance-evidence.md:5-10 and docs/security/issue-61-closure-gap-inventory.md:28-29 retain a historical 27-point/R1 description. Current closureMinimumPolicyCatalog.js and keyBuilder.test.js contain and assert 29 IDs. The retained 8/8 Redis run remains acceptance evidence for its harness/test set, but the 27-count wording is stale for the current catalog.
- docs/security/issue-61-l2-license-policy-disposition.md:5-9,54-63 is a planning-era record that says the license row remained unresolved; the current machine-readable policy, verifier, current checks, and final closure overlay are later enforcement evidence.
- docs/security/issue-61-reset-token-logging-triage.md:3-8,17-56 is explicitly historical pre-remediation and still describes token-bearing URL paths; current fragment/body-only source and tests supersede that behavior description.
- docs/DEPLOYMENT_AND_SMOKE_TESTS.md:133-162,191-201 describes an older public /ops proxy and process-local auth limiter. Current nginx boundary tests and Redis-backed rate-limit source supersede those statements.
- A current HTTP-core test run emitted a raw Mongoose CastError stack through console.error from messageController.js:130-132 for synthetic non-ObjectId IDs while the visibility lookup failed closed to the legacy message query. This is an observed logging behavior outside the reset-token-specific assertions; it is recorded here without a new scanner disposition or remediation conclusion.
- The Issue #61 accepted comment says no mandatory closure blocker remains, rows 20–22 are future hardening, and no scanner alert was dismissed; it identifies the final closure record and covered-source SHA. It does not authorize deployment or establish current hosted runtime behavior (https://github.com/NhiBuaa/kitta-chat/issues/61#issuecomment-5262050190).

## Failure state

Artifact creation and source read-back are the completion criteria for this research. A background research agent created this note and read it back successfully. No evidence-collection failure occurred.

Evidence remains intentionally incomplete for deployed behavior, full-history Gitleaks rerun, fresh CodeQL analysis, and the Docker Redis acceptance rerun. These are limitations of the available primary evidence, not claims of failure or authorization to take further action.

## Current read-only verification record

- Focused boundary command covering message access, route limiter wiring, reset transport/nginx redaction, browser origin, request logging, and /ops boundary: 19 passed, 0 failed.
- server/test/httpCoreFlows.test.js: 18 passed, 0 failed.
- server/test/rateLimit/distributedAdmission.test.js without explicit Redis endpoints: 3 passed, 5 skipped, 0 failed.
- Scanner verifier tests: 9 passed, 0 failed.
- Current audit baseline reconciliation for root, client, and server: exit 0 for all three.
- Current license policy reconciliation: exit 0 for root, client, and server, with 7, 15, and 12 findings respectively.
- During the research operation, the background agent made no commit, branch creation, deployment,
  scanner dismissal, dependency mutation, or file change other than this report. The main K5
  workflow later added the readiness package and the two canonical session-state updates.
