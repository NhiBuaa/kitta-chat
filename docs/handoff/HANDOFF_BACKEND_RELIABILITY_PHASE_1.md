# Handoff: OPSWAT-Oriented Backend Readiness Work

## 1. Current Architecture Summary

Repository: `D:\Study\HK5\NodeJS\Midterm\web-socket`.

This is a realtime distributed chat app prepared for backend/software engineering internship applications. Current stack:

- `client/`: React + Vite frontend using Socket.IO client and REST APIs.
- `server/`: Node.js/Express backend with Socket.IO, Mongoose/MongoDB, Redis, RabbitMQ workers.
- `MongoDB`: source of truth for users, messages, groups, files, call histories, and call log messages.
- `Socket.IO`: realtime transport for direct/group chat, typing, presence, friend updates, WebRTC call signaling, and call lifecycle events.
- `Redis`: Socket.IO adapter fan-out across backend replicas, presence/cache, friend/conversation caches, and short-lived call coordination.
- `RabbitMQ`: background side-effect bus only for image processing, notification/email, and audit jobs.
- `docker-compose.yml`: nginx, 3 backend replicas, MongoDB, Redis, RabbitMQ, and worker services.

Key docs now available:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/RABBITMQ_WORKER_FLOWS.md`
- `docs/SOCKET_IO_SCALING.md`

## 2. Important Design Decisions

- MongoDB remains the durable source of truth.
- RabbitMQ must not become the realtime chat/call delivery path.
- Socket.IO remains the realtime delivery and call signaling layer.
- Redis data is coordination/cache/presence state; it is disposable or reconstructable where designed.
- Keep changes as small vertical slices; avoid broad refactors.
- Preserve Docker Compose local developer workflow.
- Keep claims honest: this is stronger than a basic student project, but not a polished production SaaS.

## 3. Completed Engineering Improvements

Completed slices in this session sequence:

- Issue 1: HTTP integration tests for core REST flows.
  - Added testable Express app factory in `server/src/app.js`.
  - `server.js` still owns startup/shutdown, Mongo connect, Redis connect, Socket.IO init.
  - Added `server/test/httpCoreFlows.test.js` for register/login/profile/message HTTP flows with safe in-memory fakes.

- Issue 3: structured request logging + request IDs.
  - Added `server/src/utils/logger.js`.
  - Added `server/src/middlewares/requestLogging.js`.
  - Preserves/generates `x-request-id`, returns it in response, logs method/path/status/latency/requestId/userId when available.
  - Global error handler now routes through the logger where safe.

- Issue 5: hardened `/healthz` and `/readyz`.
  - Added `server/src/services/healthService.js`.
  - `/healthz` reports Mongo, Redis, RabbitMQ, uptime, memory, timestamp, and status `healthy|degraded|unhealthy`.
  - `/readyz` checks required startup dependencies: Mongo + Redis. RabbitMQ unavailable is degraded, not startup-blocking for chat API.
  - Added `server/test/healthEndpoints.test.js`.

- Issue 4: RabbitMQ `correlationId` propagation.
  - Added `server/src/queues/correlation.js`.
  - Producers preserve existing `correlationId`, otherwise use `requestId`, otherwise generate UUID.
  - AMQP payload, AMQP `correlationId`, and headers carry the same ID.
  - Worker retry/DLQ logs include queue/jobType/attempt/correlationId/reason.
  - HTTP-origin queue jobs pass `req.requestId` as `correlationId`.

- Issue 14: poison-message handling + DLQ reliability tests.
  - Malformed JSON poison messages now route directly to DLQ.
  - Poison messages preserve correlation metadata from AMQP metadata when available.
  - Worker does not ack if retry/DLQ publish fails.
  - Tests are in `server/test/rabbitmqInfrastructure.test.js`.

- Issue 6: RabbitMQ worker flow documentation.
  - Added `docs/RABBITMQ_WORKER_FLOWS.md`.
  - Linked from `README.md` and `docs/ARCHITECTURE.md`.

- Issue 7: Socket.IO multi-replica scaling documentation.
  - Added `docs/SOCKET_IO_SCALING.md`.
  - Linked from `README.md` and `docs/ARCHITECTURE.md`.

## 4. Reliability/Testing Improvements

- Server test suite increased and was passing after the last runtime change: `146` tests, `0` failures via `npm.cmd test` from `server/`.
- Focused tests now cover:
  - REST auth/profile/message integration path.
  - Request logging middleware behavior.
  - Health/readiness healthy/degraded/unhealthy cases.
  - RabbitMQ producer correlation metadata.
  - Retry preserves attempts + correlationId.
  - Max attempts routes to DLQ.
  - Malformed JSON routes directly to DLQ.
  - DLQ publish failure does not incorrectly ack original message.

PowerShell blocks `npm.ps1` in this environment, so use `npm.cmd test` instead of `npm test` when running from PowerShell.

## 5. Observability Improvements

- HTTP logs now include request-oriented structured fields.
- `x-request-id` is propagated back to clients.
- Queue jobs now carry `correlationId` across publish, retry, DLQ, and worker logs.
- A failed RabbitMQ job can be traced by one ID from HTTP request -> queue publish -> worker failure/retry/DLQ.
- Health/readiness endpoints now expose more operational status.

Remaining observability caveat: many existing Socket.IO/call logs still use raw `console.*`. Do not claim fully centralized structured observability yet.

## 6. Remaining OPSWAT-Oriented Gaps

Highest-value remaining gaps from the earlier audit:

- API documentation: no complete `docs/API.md` or OpenAPI spec yet.
- Centralized env/config validation: only partial fail-fast checks exist.
- CI pipeline: no `.github/workflows` yet for lint/test/build/docker build.
- Consistent API response/error shape: global handler exists, but controllers still vary.
- Metrics/operational signals: no `/metrics` or operational counters endpoint yet.
- App-level rate limiting: nginx limits exist; Express/socket-level limits are limited.
- Security hygiene docs/baseline: CORS/Helmet/upload/JWT validation posture could be clarified.
- Socket.IO integration test: not yet added; current socket tests are more focused/unit-ish.

## 7. Recommended Next Slices In Priority Order

1. Issue 8: Add clear REST API documentation.
   - Suggested file: `docs/API.md`.
   - Cover auth, users/profile, messages/sync, groups, files/upload, calls.
   - Include auth requirements, request examples, success/error response examples.
   - Low runtime risk and high backend interview value.

2. Issue 9: Centralized env validation.
   - Add a small config/env module with tests.
   - Must respect Docker Compose injected vars and separate server vs worker contexts.
   - Riskier than docs because startup can break.

3. Issue 12: GitHub Actions CI pipeline.
   - Run server tests, client tests, client lint/build, and optional Docker build.
   - Useful for Git workflow and AI-assisted verification claims.

4. Issue 10: Standardize API error response shapes.
   - Start narrow: auth/profile/messages.
   - Avoid broad controller rewrite.

5. Issue 11: Operational signals endpoint.
   - Add lightweight `/ops` or `/metrics` with non-sensitive uptime/memory/dependency/socket/queue signals.

6. Issue 2: Socket.IO integration test.
   - Useful but potentially trickier due Redis/socket setup. Prefer after docs/API/env if optimizing for low-risk progress.

## 8. Known Risks And Caveats

- `server/src/app.js` is a useful test seam; do not collapse it back into `server.js`.
- `server.js` still owns process lifecycle. Keep it that way unless doing a deliberate startup refactor.
- Request logging logs health checks too; acceptable for now, but may be noisy under Docker health polling.
- `/healthz` checks cache Redis, not separately every Socket.IO adapter pub/sub client after startup.
- RabbitMQ `checkStatus()` may actively connect; acceptable currently, but passive status could be safer later.
- HTTP integration tests use `require.cache` fakes. Pragmatic and fast, but somewhat coupled to CommonJS module boundaries.
- The repo has existing unrelated/uncommitted changes in the working tree from this work sequence. Always check `git status --short` before starting.
- Windows PowerShell may report `C:\Users\Admin/.config/git/ignore` permission warnings; they have not blocked work.

## 9. Honest CV-Safe Claims

Safe claims now:

- Built a realtime chat backend with Express, Socket.IO, MongoDB, Redis, RabbitMQ, and Docker Compose.
- Implemented multi-replica Socket.IO fan-out using the Redis adapter.
- Added request ID based HTTP logging and propagated correlation IDs through RabbitMQ jobs.
- Hardened RabbitMQ worker reliability with retry queues, DLQs, poison-message routing, and tests.
- Added HTTP integration tests for auth/profile/message flows.
- Added health/readiness endpoints covering MongoDB, Redis, RabbitMQ, degraded states, uptime, and memory.
- Documented RabbitMQ worker flows and Socket.IO multi-replica scaling with diagrams/manual verification.

Avoid claiming yet:

- Full production-grade observability.
- Full OpenAPI/Swagger coverage.
- Full TypeScript backend.
- Complete end-to-end distributed-system tests.
- Production-ready security posture.
- CI/CD pipeline, unless implemented later.

## 10. Things Not To Change Casually

- Do not make RabbitMQ part of realtime message/call delivery.
- Do not remove message idempotency/retry behavior.
- Do not remove MongoDB as the source of truth.
- Do not treat Redis as durable storage.
- Do not remove Socket.IO Redis adapter fail-fast behavior without a deliberate fallback design.
- Do not broadly refactor call flow without reading `server/src/socket/handlers/call/` and related tests.
- Do not broadly refactor `client/src/features/chat/hooks/useChatMessages.js` without preserving optimistic send, pending queue, and idempotency keys.
- Do not change Docker Compose service names/ports casually; docs and manual verification rely on them.
- Do not overstate docs/CV claims beyond implemented tests and code.

## Suggested Skill For Next Session

- Use `tdd` for any code slice: env validation, CI-affecting changes, API error shape, socket integration tests.
- Use `zoom-out` before touching Socket.IO/call architecture.
- Use documentation-only approach for `docs/API.md` unless adding generated OpenAPI tests.
