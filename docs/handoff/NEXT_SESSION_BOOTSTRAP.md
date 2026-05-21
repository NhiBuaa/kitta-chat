# Next Session Bootstrap: Backend Reliability / OPSWAT Prep

Use this file to bootstrap the next agent session for the `web-socket` repository.

## Current Goal

Continue preparing this realtime distributed chat project for backend/software engineering internship applications such as OPSWAT.

Prioritize small, verifiable backend engineering slices:

1. config/env validation
2. CI pipeline
3. API response/error consistency
4. operational signals/metrics
5. app-level rate limits/security polish
6. Socket.IO integration tests

Avoid large refactors.

## Current Architecture

- `client/`: React + Vite frontend.
- `server/`: Express backend + Socket.IO + Mongoose.
- `server/server.js`: process startup/shutdown only; connects MongoDB, Redis cache, initializes Socket.IO, then listens.
- `server/src/app.js`: Express app factory; owns middleware, routes, request logging, health/readiness, error handling.
- MongoDB is the durable source of truth.
- Redis is used for Socket.IO adapter fan-out, presence, caches, and short-lived call coordination.
- Socket.IO is the realtime path for chat, typing, presence, friendship events, WebRTC signaling, and call lifecycle events.
- RabbitMQ is background-only for image processing, notification/email, and audit jobs. Do not use RabbitMQ for realtime chat/call delivery.
- Docker Compose runs nginx, 3 backend replicas, Redis, MongoDB, RabbitMQ, and workers.

## Recently Completed Slices

- Issue 1: HTTP integration tests.
  - `server/test/httpCoreFlows.test.js`
  - `server/src/app.js` introduced as testable Express app factory.

- Issue 3: structured request logging + request IDs.
  - `server/src/middlewares/requestLogging.js`
  - `server/src/utils/logger.js`
  - Preserves/generates `x-request-id`, returns it in response, logs request fields.

- Issue 5: hardened health/readiness endpoints.
  - `server/src/services/healthService.js`
  - `/healthz`: MongoDB, Redis, RabbitMQ, uptime, memory, `healthy|degraded|unhealthy`.
  - `/readyz`: required startup deps are MongoDB + Redis; RabbitMQ can be degraded.

- Issue 4: RabbitMQ correlation propagation.
  - `server/src/queues/correlation.js`
  - `server/src/queues/producer.js`
  - `server/src/workers/workerRuntime.js`
  - HTTP `requestId` propagates to RabbitMQ `correlationId`, retry, DLQ, and worker logs.

- Issue 14: RabbitMQ poison-message handling and reliability tests.
  - Malformed JSON routes directly to DLQ.
  - Original message is not acked if retry/DLQ publish fails.
  - Covered in `server/test/rabbitmqInfrastructure.test.js`.

- Issue 6: RabbitMQ worker flow docs.
  - `docs/RABBITMQ_WORKER_FLOWS.md`

- Issue 7: Socket.IO multi-replica scaling docs.
  - `docs/SOCKET_IO_SCALING.md`

- Issue 8: REST API docs.
  - `docs/API.md`

- Handoff doc:
  - `docs/handoff/HANDOFF_BACKEND_RELIABILITY_PHASE_1.md`

## Important Docs To Read First

Read these before making backend reliability changes:

- `AGENTS.md`
- `docs/handoff/HANDOFF_BACKEND_RELIABILITY_PHASE_1.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/RABBITMQ_WORKER_FLOWS.md`
- `docs/SOCKET_IO_SCALING.md`

## Verification Status

Last full server test after runtime changes:

```powershell
cd server
npm.cmd test
```

Result at that time: `146` tests passed, `0` failed.

PowerShell blocks `npm.ps1` in this environment, so use `npm.cmd test` rather than `npm test` from PowerShell.

Docs-only slices after that did not require tests because no doc/link-check script exists.

## Current Known Gaps

From the OPSWAT-oriented audit, remaining gaps include:

1. Centralized env/config validation.
2. GitHub Actions CI pipeline.
3. Consistent API error/response shapes.
4. Basic operational signals or metrics endpoint.
5. App-level rate limiting for sensitive routes/events.
6. Security hygiene polish: Helmet/CORS/upload/JWT validation docs or baseline.
7. Socket.IO integration tests for authenticated connection/message delivery.
8. Optional OpenAPI later; current `docs/API.md` is hand-written and intentionally honest.

## Recommended Next Slice

Recommended next implementation slice: **centralized env/config validation**.

Why:

- High backend-engineering value for OPSWAT.
- Complements health/readiness and Docker Compose docs.
- Can be implemented test-first with small scope.

Suggested TDD scope:

- Add a config/env module for server and worker contexts.
- Validate required variables:
  - server: `MONGO_URI`, `JWT_SECRET`, frontend URL/CORS setting where applicable, Redis URL/host/port
  - RabbitMQ publishers/workers: `RABBITMQ_URL` when queue use is required
  - worker-specific concurrency/retry values should parse as numbers with defaults
- Keep Docker Compose injected env compatible.
- Add tests for missing/invalid env without starting real services.
- Do not broadly rewrite startup.

Alternative lower-risk next slice: **GitHub Actions CI** once current working tree is clean.

## Skills To Use

- Use `tdd` for env validation, CI-affecting scripts, API response consistency, metrics, rate limits, and socket integration tests.
- Use `zoom-out` before touching Socket.IO/call architecture.
- Use `diagnose` if tests fail unexpectedly.
- Use `handoff` when compacting the session again.

## Do Not Change Casually

- Do not remove `server/src/app.js`; it is the Express test seam.
- Do not move process startup back into `app.js`.
- Do not use RabbitMQ for realtime chat/call delivery.
- Do not make RabbitMQ a hard dependency for chat API readiness unless explicitly designed.
- Do not treat Redis as durable source of truth.
- Do not remove `idempotencyKey` behavior from message send.
- Do not remove RabbitMQ `correlationId`, retry, DLQ, or poison-message behavior.
- Do not refactor call flow broadly without reading call handler services and tests.
- Do not overstate production readiness in docs or CV notes.

## Files Most Likely Needed Next

Backend reliability:

- `server/server.js`
- `server/src/app.js`
- `server/src/services/healthService.js`
- `server/src/middlewares/requestLogging.js`
- `server/src/utils/logger.js`
- `server/src/queues/producer.js`
- `server/src/queues/correlation.js`
- `server/src/workers/workerRuntime.js`
- `server/test/httpCoreFlows.test.js`
- `server/test/healthEndpoints.test.js`
- `server/test/requestLoggingMiddleware.test.js`
- `server/test/rabbitmqInfrastructure.test.js`

Docs:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/RABBITMQ_WORKER_FLOWS.md`
- `docs/SOCKET_IO_SCALING.md`
- `docs/handoff/HANDOFF_BACKEND_RELIABILITY_PHASE_1.md`

## Honest CV-Safe Claims Right Now

Safe:

- Realtime chat backend using Express, Socket.IO, MongoDB, Redis adapter, RabbitMQ, and Docker Compose.
- Multi-replica Socket.IO delivery documented with Redis adapter fan-out.
- Request ID and queue correlation ID tracing from HTTP to RabbitMQ retry/DLQ.
- RabbitMQ retry queues, DLQs, poison-message routing, and tests.
- Health/readiness endpoints with degraded states.
- HTTP integration tests for core REST flows.
- Hand-written REST API, RabbitMQ, and Socket.IO architecture docs.

Not safe yet:

- Full production observability.
- Full OpenAPI/Swagger automation.
- TypeScript backend.
- Complete CI/CD.
- Production-grade security hardening.
- Complete end-to-end distributed-system test coverage.
