Using `to-issues`: these are tracer-bullet, independently executable implementation issues. I’m not publishing or modifying anything yet.

**P0 Issues**

1. **Add HTTP Integration Tests For Core REST Flows**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** Existing tests are strong around isolated domain behavior, but the project lacks serious REST integration tests proving auth, protected routes, message APIs, and error responses work through Express.
- **Acceptance Criteria:**
  - [ ] Add integration tests for register/login/profile protected access.
  - [ ] Add integration tests for direct message create/fetch or sync behavior.
  - [ ] Tests exercise Express middleware and route wiring, not only controller functions.
  - [ ] Tests isolate external dependencies with safe fakes/mocks or test DB strategy.
  - [ ] `cd server && npm test` passes.
- **Technical Scope:** Server test harness, Express app export or test bootstrap if needed, auth route tests, user/message route tests, test fixtures.
- **Manual Verification:** Run `cd server && npm test`; confirm failures clearly identify route/middleware regressions.
- **Risks:** App startup is currently coupled to Mongo/Socket.IO in `server.js`; may need a small app/server separation without broad refactor.

2. **Add Socket.IO Integration Test For Authenticated Message Delivery**
- **Type:** AFK
- **Blocked by:** Issue 1 preferable, but can start independently
- **Problem:** Redis adapter and socket handlers are central to the app, but there is no end-to-end Socket.IO client test proving authenticated connection, room join, message emit, and receive behavior.
- **Acceptance Criteria:**
  - [ ] Test rejects missing/invalid socket JWT.
  - [ ] Test accepts valid JWT and assigns user room behavior.
  - [ ] Test covers `sendMessage` happy path with callback success.
  - [ ] Test verifies delivered event shape for sender/receiver room.
  - [ ] `cd server && npm test` passes.
- **Technical Scope:** Socket.IO server test bootstrap, fake Redis adapter or isolated adapter mode, mocked message persistence where appropriate.
- **Manual Verification:** Run targeted socket integration test and full server test suite.
- **Risks:** Real Redis requirement could make tests flaky; prefer explicit test seams/mocks over Docker-only tests.

3. **Introduce Structured Request Logging With Request IDs**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** Logs are mostly `console.*` and not consistently correlated across REST, socket, and queue flows, making debugging weaker for OPSWAT-style backend expectations.
- **Acceptance Criteria:**
  - [ ] Every HTTP request gets or preserves `x-request-id`.
  - [ ] Response includes `x-request-id`.
  - [ ] Request logs include method, path, status, latency, requestId, and authenticated userId when available.
  - [ ] Error logs include requestId and do not leak secrets.
  - [ ] Existing tests pass.
- **Technical Scope:** Lightweight logger utility, request ID middleware, auth middleware context integration, global error handler logging.
- **Manual Verification:** Start server, call protected and unprotected endpoints, confirm logs include stable requestId and response header.
- **Risks:** Over-logging sensitive auth payloads; keep fields explicit and safe.

4. **Propagate Correlation IDs Through RabbitMQ Jobs**
- **Type:** AFK
- **Blocked by:** Issue 3 recommended
- **Problem:** Queue jobs include some `requestId` fields, but correlation is not standardized across producers, worker logs, retries, and DLQs.
- **Acceptance Criteria:**
  - [ ] Queue producers attach `correlationId` or preserve incoming requestId consistently.
  - [ ] Worker logs include queue name, job type, attempt, correlationId, and failure reason.
  - [ ] Retry and DLQ payloads preserve correlation metadata.
  - [ ] Tests cover retry/DLQ correlation preservation.
  - [ ] `cd server && npm test` passes.
- **Technical Scope:** Queue producer helpers, worker runtime, job payload builders, queue tests.
- **Manual Verification:** Publish a test/failing job locally and confirm retry/DLQ logs can be traced by one ID.
- **Risks:** Existing job schemas may be inconsistent; avoid breaking consumers by adding optional fields only.

5. **Harden `/healthz` And `/readyz` For Mongo, Redis, RabbitMQ**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** `/healthz` currently reports Mongo and RabbitMQ, but Redis is `"unknown"` and degraded states are not clearly modeled.
- **Acceptance Criteria:**
  - [ ] `/healthz` reports Mongo, Redis cache, Redis socket adapter if available, RabbitMQ, uptime, memory, and timestamp.
  - [ ] Response distinguishes `healthy`, `degraded`, and `unhealthy`.
  - [ ] `/readyz` only returns ready when required startup dependencies are usable.
  - [ ] Tests cover healthy, degraded, and unhealthy dependency states.
  - [ ] Docker healthcheck behavior remains compatible.
- **Technical Scope:** Health service/helper, Redis status check, RabbitMQ status reuse, route tests.
- **Manual Verification:** Start with all services; stop Redis/RabbitMQ/Mongo individually and inspect status codes/body.
- **Risks:** If Redis is a fail-fast dependency for sockets, health semantics must match actual startup behavior.

6. **Create RabbitMQ Worker Flow Documentation**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** RabbitMQ is implemented with retry queues and DLQs, but the docs do not clearly explain event producers, consumers, payloads, retry, DLQ, or poison-message handling.
- **Acceptance Criteria:**
  - [ ] Document each queue, producer, consumer, payload purpose, retry queue, and DLQ.
  - [ ] Explain max attempts, retry delay, reconnect behavior, and poison-message routing.
  - [ ] Explain RabbitMQ is background-only and not the realtime chat/call path.
  - [ ] Include manual verification commands/logs for workers.
  - [ ] Link from README and architecture docs.
- **Technical Scope:** `docs/` documentation only.
- **Manual Verification:** A reviewer can explain image, notification, and audit worker flows without reading code.
- **Risks:** Docs may drift; keep tied to current queue names and env vars.

7. **Document Socket.IO Multi-Replica Scaling With Redis Adapter**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** The app uses the Redis adapter and Docker Compose replicas, but lacks a clear CV/interview-ready explanation of cross-replica room delivery, presence, reconnects, and failure behavior.
- **Acceptance Criteria:**
  - [ ] Document client connection, JWT auth, user rooms, group rooms, and Redis adapter fan-out.
  - [ ] Explain why Mongo remains source of truth and Redis is disposable coordination/cache.
  - [ ] Explain reconnect/heartbeat/offline grace behavior.
  - [ ] Include a Mermaid sequence or topology diagram.
  - [ ] Link from README/architecture docs.
- **Technical Scope:** Architecture documentation only.
- **Manual Verification:** Reviewer can answer “how does message delivery work across 3 backend replicas?” from docs.
- **Risks:** Avoid overstating guarantees; document real limitations.

**P1 Issues**

8. **Add OpenAPI Or Clear REST API Documentation**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** The project has many REST routes but no professional API reference for auth, users, messages, groups, files, and calls.
- **Acceptance Criteria:**
  - [ ] Document endpoint method/path, auth requirement, request body/query params, success response, and common errors.
  - [ ] Cover auth, users, messages, groups, files, and calls.
  - [ ] Include example requests for login, protected profile, message sync, file upload.
  - [ ] Link API docs from README.
  - [ ] Docs match current route behavior.
- **Technical Scope:** Prefer `docs/API.md` first; OpenAPI JSON/YAML optional if kept small.
- **Manual Verification:** Follow docs with Postman/curl against local server for at least auth/profile/message endpoints.
- **Risks:** Swagger generation can become a large detour; markdown API docs may be better first slice.

9. **Add Centralized Environment Validation**
- **Type:** AFK**
- **Blocked by:** None
- **Problem:** Some env checks exist, but critical configuration is not validated centrally at startup.
- **Acceptance Criteria:**
  - [ ] Validate required server env vars such as `MONGO_URI`, `JWT_SECRET`, `URL_FRONTEND`, Redis config, RabbitMQ URL where needed.
  - [ ] Validate worker-specific env vars before worker starts.
  - [ ] Startup errors are clear and actionable.
  - [ ] `.env.example` remains aligned with validation.
  - [ ] Tests cover missing required config.
- **Technical Scope:** Config module, server startup integration, worker startup integration, env tests.
- **Manual Verification:** Temporarily remove required env vars and confirm fail-fast error messages.
- **Risks:** Docker Compose injects some env vars; validation must respect server vs worker contexts.

10. **Standardize API Error Response Shapes**
- **Type:** AFK
- **Blocked by:** Issue 3 recommended
- **Problem:** A global error handler exists, but controllers still return mixed response shapes, making APIs less professional and harder to test.
- **Acceptance Criteria:**
  - [ ] Define standard success/error response conventions.
  - [ ] Apply to a narrow high-value path first: auth/profile/messages.
  - [ ] Global error handler includes requestId.
  - [ ] Tests assert consistent error shape for validation/auth/not-found/server errors.
  - [ ] Existing client behavior is not broken.
- **Technical Scope:** Error helper, async route wrapper if needed, selected controllers/routes, tests.
- **Manual Verification:** Trigger bad login, missing token, not found route, oversized JSON, and inspect consistent body.
- **Risks:** Broad controller rewrites are risky; keep first slice narrow.

11. **Add Operational Signals Endpoint**
- **Type:** AFK
- **Blocked by:** Issue 3 and Issue 5 recommended
- **Problem:** Health exists, but there is no simple view of runtime operational signals such as active sockets, queue status, process uptime, and recent dependency failures.
- **Acceptance Criteria:**
  - [ ] Add a lightweight `/metrics` or `/ops` endpoint with non-sensitive operational counters.
  - [ ] Include uptime, memory, active socket count if available, dependency status, and worker/queue publish counters if feasible.
  - [ ] Do not expose secrets or user PII.
  - [ ] Document endpoint and intended use.
  - [ ] Add tests for response shape.
- **Technical Scope:** Metrics/ops route, socket count hook, queue publisher counters, docs.
- **Manual Verification:** Start server, connect a socket client, confirm active socket count changes if implemented.
- **Risks:** Full Prometheus is unnecessary for this project; avoid overengineering.

12. **Add GitHub Actions CI Pipeline**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** The project has test/build scripts but no CI pipeline, which weakens Git workflow and verification claims.
- **Acceptance Criteria:**
  - [ ] CI runs server install and `npm test`.
  - [ ] CI runs client install, `npm test`, `npm run lint`, and `npm run build`.
  - [ ] CI builds Docker images or runs `docker compose config`/targeted Docker build.
  - [ ] CI caches npm dependencies where safe.
  - [ ] README documents CI checks.
- **Technical Scope:** `.github/workflows/ci.yml`, possible script fixes if CI exposes real issues.
- **Manual Verification:** Push branch and confirm CI passes.
- **Risks:** Docker Compose integration can be slow; prefer build verification over full multi-service boot initially.

13. **Add App-Level Rate Limits For Sensitive Paths**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** nginx rate limits exist, but local/dev Express and socket paths do not enforce sensitive action limits.
- **Acceptance Criteria:**
  - [ ] Add Express rate limits for login/register/password reset.
  - [ ] Add upload size/count limits documented and tested.
  - [ ] Add socket-level rate limit or reuse existing call/message guard for high-risk events.
  - [ ] Return consistent rate-limit error responses.
  - [ ] Tests cover at least auth limiter behavior.
- **Technical Scope:** Express middleware, route wiring, socket guard if narrow, tests, docs.
- **Manual Verification:** Repeated login/password reset requests eventually receive rate-limit response.
- **Risks:** Tests can become timing-sensitive; use low test-only limits or injectable limiter config.

14. **Add RabbitMQ Poison Message Verification Tests**
- **Type:** AFK
- **Blocked by:** Issue 4 recommended
- **Problem:** Retry/DLQ runtime exists, but explicit poison-message behavior should be locked down for interview-ready reliability.
- **Acceptance Criteria:**
  - [ ] Test malformed JSON or invalid job payload behavior.
  - [ ] Test max attempts routes job to DLQ.
  - [ ] Test retry preserves attempts and correlation ID.
  - [ ] Test worker does not ack incorrectly when DLQ publish fails.
  - [ ] `cd server && npm test` passes.
- **Technical Scope:** Worker runtime tests with mocked channels, queue payload validation tests.
- **Manual Verification:** Run targeted worker tests and inspect failure cases.
- **Risks:** Current runtime may expose edge-case bugs; keep fixes focused if implementation follows later.

**P2 Issues**

15. **Create Interview Notes: Backend Reliability Story**
- **Type:** HITL
- **Blocked by:** P0 docs preferably complete
- **Problem:** The project has handoff docs but no concise interview-ready narrative explaining design tradeoffs, failures handled, and what was learned.
- **Acceptance Criteria:**
  - [ ] Add a short “What I Learned / Interview Notes” doc.
  - [ ] Explain Mongo source of truth, Redis adapter/cache/presence, RabbitMQ workers, idempotency, retry/DLQ.
  - [ ] Include honest limitations and next improvements.
  - [ ] Include 5–8 CV bullets that are safe to claim.
  - [ ] Link from README.
- **Technical Scope:** Documentation only.
- **Manual Verification:** Read the doc aloud as interview prep; ensure no fake TypeScript/observability/CI claims.
- **Risks:** Needs human tone and accuracy; do not oversell.

16. **Add Clean Architecture And Flow Diagrams**
- **Type:** AFK
- **Blocked by:** Issues 6 and 7 recommended
- **Problem:** The architecture docs are textual and would be stronger with diagrams for system topology, queue flow, and WebSocket flow.
- **Acceptance Criteria:**
  - [ ] Add Mermaid system topology diagram.
  - [ ] Add RabbitMQ producer/retry/DLQ/worker diagram.
  - [ ] Add Socket.IO multi-replica Redis adapter diagram.
  - [ ] Diagrams match current Docker Compose services and code paths.
  - [ ] Link diagrams from README or architecture doc.
- **Technical Scope:** Documentation only.
- **Manual Verification:** Render Mermaid preview and confirm diagrams are readable.
- **Risks:** Mermaid syntax can break; keep diagrams simple.

17. **Document Deployment And Smoke Verification Checklist**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** Docker Compose startup exists, but a deployment/smoke checklist would make the project easier to verify professionally.
- **Acceptance Criteria:**
  - [ ] Document local Docker Compose startup, logs, health checks, and teardown.
  - [ ] Include smoke checks for REST auth, socket connection, message send, worker logs, RabbitMQ UI.
  - [ ] Include known ports and common failure diagnosis.
  - [ ] Keep aligned with current `docker-compose.yml`.
- **Technical Scope:** README or `docs/DEPLOYMENT.md`.
- **Manual Verification:** Follow the checklist from clean Docker state.
- **Risks:** Full stack may require secrets/S3/email; mark optional external integrations clearly.

18. **Tighten Security Hygiene Documentation And Baseline**
- **Type:** AFK
- **Blocked by:** None
- **Problem:** Security basics exist, but CORS, Helmet absence, upload limits, JWT expiry, and validation posture are not clearly documented or consistently enforced.
- **Acceptance Criteria:**
  - [ ] Document current security controls and gaps.
  - [ ] Add or plan Helmet if compatible with current frontend/socket setup.
  - [ ] Document CORS expectations for local and Docker/nginx usage.
  - [ ] Document upload limits and JWT expiry.
  - [ ] Avoid breaking local development.
- **Technical Scope:** Prefer documentation-first; small middleware addition only if low risk.
- **Manual Verification:** Run client build and basic login/socket smoke after security change if implemented.
- **Risks:** Helmet/CORS changes can break WebSocket or asset loading if applied too broadly.

**Suggested Implementation Order**
- 1. **Issue 1** — HTTP integration tests establish safety net for backend changes.
- 2. **Issue 3** — structured request logging creates foundation for observability.
- 3. **Issue 5** — health/readiness is high-value and bounded.
- 4. **Issue 4** — queue correlation extends logging into event-driven flows.
- 5. **Issue 14** — poison-message tests lock down RabbitMQ reliability.
- 6. **Issue 6** — RabbitMQ docs turn implemented reliability into CV-ready evidence.
- 7. **Issue 7** — Socket.IO scaling docs explain the distributed chat architecture.
- 8. **Issue 2** — Socket.IO integration test proves realtime flow.
- 9. **Issue 8** — API docs make REST work presentable.
- 10. **Issue 9** — env validation improves startup professionalism.
- 11. **Issue 10** — consistent API errors after tests/logging are in place.
- 12. **Issue 12** — CI once tests/build behavior is stable.
- 13. **Issue 11** — operational signals after health/logging are mature.
- 14. **Issue 13** — app-level rate limits after response/error conventions.
- 15. **Issue 16** — diagrams after docs stabilize.
- 16. **Issue 17** — deployment checklist after health/CI/docs.
- 17. **Issue 15** — interview notes once claims are accurate.
- 18. **Issue 18** — security baseline can run parallel, but avoid derailing P0 backend work.