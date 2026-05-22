# Interview Notes / What I Learned

This document is an honest engineering retrospective for the realtime chat backend. It is meant to help explain the project in interviews without overstating production readiness.

The project is a realtime chat application with a React client, Node.js/Express backend, Socket.IO realtime transport, MongoDB, Redis, RabbitMQ workers, nginx, Docker Compose, integration tests, operational endpoints, and CI.

## One-Sentence Backend Story

I took a realtime chat project and hardened the backend around reliability, observability, and explainability: app/server separation, integration tests, request IDs, RabbitMQ retry/DLQ/poison handling, health/readiness/ops endpoints, env validation, API docs, CI, app-level auth rate limiting, and deployment smoke docs.

## Strongest Backend Engineering Decisions

### Keep MongoDB As The Source Of Truth

MongoDB stores durable users, messages, groups, files, and call history. Redis and RabbitMQ are useful infrastructure, but neither should decide durable application truth.

Why this matters:

- Chat messages and call logs must survive process restarts.
- Presence and cache state can be rebuilt, but persisted conversations cannot.
- Call lifecycle correctness is easier to reason about when final states are gated by MongoDB updates instead of scattered across Redis or worker state.

Tradeoff:

- MongoDB reads/writes remain on the critical path for important actions.
- This is acceptable for the project because correctness is more important than pretending to optimize with cache-first durability.

What I learned:

- A distributed system becomes easier to explain when every component has a clear authority boundary.
- The phrase "source of truth" only helps if the code actually respects it.

### Keep RabbitMQ Background-Only

RabbitMQ is used for side effects such as image processing, notification/email, and audit events. It is intentionally not used for realtime message delivery or call lifecycle decisions.

Why this matters:

- Chat delivery should feel immediate and is already handled by authenticated Socket.IO rooms.
- Queue delays, retries, or DLQs should not block a user from seeing realtime chat/call state.
- Background jobs can fail, retry, or land in a DLQ without corrupting the main chat path.

Tradeoff:

- RabbitMQ does not provide durable chat delivery semantics in this project.
- That is an honest design choice because MongoDB persists messages and Socket.IO handles realtime fan-out.

What I learned:

- Queues are powerful, but adding a queue to the critical path can make user-facing behavior harder to reason about.
- A queue is best when failure can be isolated and retried without breaking the main workflow.

### Keep Socket.IO As The Realtime Path

Socket.IO handles realtime messaging, typing, presence, friend events, and WebRTC signaling. The Redis adapter allows events to fan out across multiple backend replicas.

Why this matters:

- Socket.IO rooms map naturally to user rooms and group rooms.
- JWT socket authentication ensures the socket identity comes from the token, not from arbitrary client payloads.
- Redis adapter fan-out lets a message emitted on one backend replica reach sockets connected to another replica.

Tradeoff:

- Socket.IO requires careful connection lifecycle handling: reconnects, heartbeat, multi-tab, and offline grace periods.
- It is not a replacement for MongoDB persistence.

What I learned:

- Realtime systems need both a transport story and a persistence story.
- "Message delivered over Socket.IO" and "message persisted in MongoDB" are separate guarantees.

### Use Redis As Coordination And Cache, Not Durable State

Redis supports Socket.IO adapter pub/sub, presence, profile/friend/conversation caches, short chat history, and short-lived call coordination keys.

Why this matters:

- Redis can be fast and disposable at the same time.
- Presence is naturally temporary and TTL-based.
- Cache misses can fall back to MongoDB.

Tradeoff:

- Redis failures can degrade fan-out/caching/coordination.
- The system must avoid treating Redis-only values as permanent truth.

What I learned:

- Redis is safest when each key has a clear owner, TTL/invalidating behavior, and fallback path.

## Reliability Lessons

### Retry, DLQ, And Poison Messages

RabbitMQ workers now preserve `correlationId`, retry failed jobs, route exhausted jobs to DLQs, and treat malformed JSON as poison messages.

Why this matters:

- A failed background job should be traceable across publish, processing, retry, and DLQ.
- Poison messages should not crash the worker forever or be silently acknowledged as successful.
- Tests document failure behavior better than comments alone.

Tradeoff:

- The worker runtime is more complex than a simple `consume -> process -> ack` loop.
- That complexity is justified because message loss and infinite retry loops are worse.

What I learned:

- Queue reliability is mostly about what happens when things fail, not what happens when everything is healthy.
- A DLQ is only useful if the payload preserves enough context to debug it.

### Request IDs And Correlation IDs

HTTP requests get an `x-request-id`; queue jobs preserve that request ID as `correlationId` when applicable.

Why this matters:

- A request can be followed from REST logs into RabbitMQ worker logs.
- Failed jobs can be connected back to the user-facing operation that created them without logging secrets or tokens.

Tradeoff:

- Correlation IDs require discipline at producer and worker boundaries.
- They do not replace real tracing, but they provide a practical debugging baseline.

What I learned:

- Even simple structured logs become much more useful when every boundary carries the same correlation key.

## Observability And Operations Lessons

### Health, Readiness, And Ops Are Different

The project separates operational signals:

- nginx `/healthz` is a lightweight nginx/container health stub.
- backend `/healthz` reports overall dependency health and degraded states.
- backend `/readyz` reports whether required startup dependencies are ready.
- backend `/ops` exposes lightweight local/debug operational JSON.
- nginx exposes backend signals through `/backend-healthz`, `/readyz`, and `/ops`.

Why this matters:

- A service can be alive but not ready.
- RabbitMQ can be degraded without making realtime chat unavailable.
- nginx health and backend health answer different questions.

Tradeoff:

- More endpoints need clearer docs to avoid confusion.
- `/ops` is intentionally not Prometheus and not full production monitoring.

What I learned:

- Operational endpoints should state what they mean and what they do not mean.
- Returning JSON is easy; choosing honest semantics is the harder part.

### Docker And Nginx Lessons

The Docker Compose stack includes nginx, backend replicas, MongoDB, Redis, RabbitMQ, and workers. nginx serves the frontend and proxies backend REST/socket/ops paths.

A real debugging incident:

- Calling `http://localhost:3000/ops` failed because the backend container port was not exposed to the host.
- Calling `http://localhost/ops` originally returned React HTML because nginx routed it to the SPA fallback.
- The fix was to expose backend operational endpoints through explicit nginx locations: `/backend-healthz`, `/readyz`, and `/ops`.

What I learned:

- A passing backend test does not guarantee the endpoint is reachable through the deployed topology.
- Smoke tests must verify the actual route a reviewer will use, not only the internal container route.

## API And Security Lessons

### Standardized Core API Errors

Core auth/profile/message validation errors now return a consistent shape:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email hoặc mật khẩu không đúng"
  },
  "message": "Email hoặc mật khẩu không đúng",
  "requestId": "demo-request-1"
}
```

Why this matters:

- Clients can key off `error.code`.
- Humans can still read `message`.
- `requestId` makes support/debugging easier.

Tradeoff:

- Some legacy controllers still need cleanup.
- The project intentionally standardized a core slice first instead of rewriting every controller at once.

What I learned:

- Backward compatibility matters. Keeping legacy fields like `msg` during transition is safer than breaking clients.

### App-Level Rate Limits

nginx provides an outer rate limit, and Express provides basic in-process limits for login, register, and forgot-password.

Why this matters:

- Local/dev and direct backend traffic still get basic abuse protection.
- Sensitive auth actions are protected without broadly limiting every API.

Tradeoff:

- Express limits are in-memory and per backend replica.
- This is not distributed rate limiting and should not be described as production-grade abuse prevention.

What I learned:

- Security improvements should be explicit about scope. "Basic app-level protection" is honest; "production rate limiting" would be misleading.

## Testing And CI Lessons

### Integration Tests First

The most useful tests exercise public behavior:

- auth register/login/profile
- message create/fetch
- Socket.IO authenticated connection and message delivery
- health/readiness/ops payloads
- RabbitMQ retry/DLQ/poison behavior
- rate-limit 429 responses

What I learned:

- Integration tests gave confidence to change startup/app wiring and middleware.
- Tests around failure behavior made the queue system easier to explain.

### CI As Verification, Not Decoration

GitHub Actions now runs server tests and client build. It does not yet claim full CI/CD, Docker publishing, or production deployment.

What I learned:

- CI is more credible when it runs checks that already pass locally.
- Adding too many unstable checks at once can reduce trust instead of improving quality.

## Biggest Debugging Incidents

### 1. App/Server Coupling Blocked HTTP Integration Tests

Problem:

- The original server startup path mixed Express app setup with MongoDB/Redis/Socket.IO startup.

Resolution:

- Introduced a small `createApp()` seam while keeping `server.js` responsible for process startup/shutdown.

Lesson:

- Testability often improves when process lifecycle and app wiring are separated.

### 2. RabbitMQ Correlation Was Not Consistent Enough

Problem:

- Jobs and worker logs did not consistently preserve the same correlation context through retry and DLQ.

Resolution:

- Standardized `correlationId` propagation through producers, workers, retry payloads, and DLQ payloads.

Lesson:

- Distributed debugging depends on metadata surviving failure paths, not just happy paths.

### 3. Poison Messages Needed Explicit Behavior

Problem:

- Malformed JSON can create ambiguous worker behavior if not handled deliberately.

Resolution:

- Added tests and behavior so malformed jobs route to DLQ and are not incorrectly acked if DLQ publish fails.

Lesson:

- "Invalid input" in a worker is still an operational event and needs a safe destination.

### 4. Docker/Nginx Endpoint Reachability Was Different From Backend Reachability

Problem:

- `/ops` worked inside the backend container but was not reachable from the host through nginx.

Resolution:

- Added nginx proxy locations for `/backend-healthz`, `/readyz`, and `/ops`.

Lesson:

- Manual smoke tests should match the deployed path, not just internal service URLs.

## What Was Intentionally Not Implemented

- Full Prometheus metrics: `/ops` is lightweight JSON only.
- Distributed rate limiting: Express limiter is in-memory per backend replica.
- Full OpenAPI generation: current API docs are hand-written and honest.
- Full TypeScript backend migration: backend remains JavaScript.
- Production CI/CD deployment: CI runs server tests and client build only.
- RabbitMQ for realtime chat delivery: Socket.IO remains the realtime path.
- Redis as durable state: MongoDB remains authoritative.
- Broad controller rewrite: API response standardization started with core auth/profile/messages.

## What I Would Improve Next In Production

1. Replace in-memory Express rate limits with Redis-backed distributed rate limiting.
2. Add a real metrics/exporter path for Prometheus or another monitoring system.
3. Standardize remaining legacy controller error shapes.
4. Add security baseline hardening: Helmet review, stricter CORS documentation/config, upload limits, and input validation pass.
5. Add frontend tests to CI and consider Docker image build checks once stable.
6. Add more Socket.IO integration tests for reconnect, group rooms, and call signaling edge cases.
7. Add structured socket logs and reduce ad-hoc `CALL_DIAG` logs.
8. Add OpenAPI if the REST API becomes a primary external contract.

## Likely Interview Questions And Concise Answers

### Why did you keep MongoDB as the source of truth?

Because messages, users, groups, files, and call history are durable state. Redis caches and coordination keys can disappear and be rebuilt. RabbitMQ can retry side effects. MongoDB is the system of record that protects correctness across restarts and infrastructure failures.

### Why not use RabbitMQ for realtime chat delivery?

RabbitMQ is better for background side effects in this project. Realtime chat needs low-latency socket fan-out, while message durability is handled by MongoDB. If RabbitMQ were in the realtime path, queue delays or DLQ behavior could affect the user-facing chat experience.

### What does Redis do?

Redis is used for Socket.IO adapter fan-out across backend replicas, presence/cache mirrors, recent conversation/chat history caches, and short-lived call coordination keys. It is not durable source-of-truth storage.

### How does message delivery work across three backend replicas?

Clients connect to one backend replica through nginx. Each authenticated socket joins user and group rooms. When a backend emits to a room, the Socket.IO Redis adapter fans the event out to other replicas so sockets connected elsewhere receive it. MongoDB remains the durable message store.

### What happens if RabbitMQ is down?

Realtime chat and calls should continue because RabbitMQ is background-only. Health can become `degraded`, and background jobs such as image processing, notification/email, or audit may fail to publish or process until RabbitMQ recovers.

### How do you debug a failed background job?

Use the `correlationId` from the HTTP request or job payload. Worker logs include queue, job type, attempt, correlationId, and failure reason. Retry and DLQ payloads preserve correlation metadata so the job can be traced across its lifecycle.

### What is the difference between `/healthz`, `/readyz`, and `/ops`?

`/healthz` reports dependency health and degraded states. `/readyz` answers whether required startup dependencies are ready. `/ops` is lightweight debug JSON with uptime, memory, dependency statuses, runtime info, and active socket count. Through nginx, `/backend-healthz`, `/readyz`, and `/ops` proxy to the backend, while nginx `/healthz` is a local stub.

### Is this production-ready observability?

No. It is a practical local/debug baseline. Production would need real metrics, dashboards, alerting, log aggregation, and possibly distributed tracing.

### Is the rate limiting production-grade?

No. nginx provides edge rate limiting, and Express provides in-memory per-replica limits for sensitive auth paths. A production system should use Redis-backed or gateway-level distributed rate limiting.

### Why did you add integration tests instead of only unit tests?

The risky parts are boundaries: middleware, route wiring, Socket.IO auth/rooms, queue retry/DLQ behavior, and health semantics. Integration tests exercise those public behaviors better than isolated unit tests.

### What are you most careful not to overclaim?

I would not claim full production observability, full distributed rate limiting, full TypeScript backend, full OpenAPI coverage, or production CI/CD. I would claim practical backend reliability improvements with tests and honest documentation.

## CV-Safe Claims

Safe to mention:

- Built a realtime chat backend with Express, Socket.IO, MongoDB, Redis adapter, RabbitMQ, nginx, and Docker Compose.
- Added HTTP and Socket.IO integration tests for auth/profile/message and authenticated realtime delivery flows.
- Implemented request ID logging and RabbitMQ correlation ID propagation across publish, retry, and DLQ paths.
- Hardened RabbitMQ workers with retry queues, DLQs, poison-message handling, and reliability tests.
- Added health, readiness, and lightweight operational endpoints for MongoDB, Redis, RabbitMQ, uptime, memory, and socket visibility.
- Added centralized environment validation for backend and worker startup.
- Added standardized core API error responses and app-level auth rate limiting.
- Added GitHub Actions CI for backend tests and frontend build.
- Documented REST APIs, RabbitMQ worker flows, Socket.IO scaling, and Docker Compose smoke verification.

Avoid saying:

- Production-grade monitoring.
- Distributed rate limiting.
- Full OpenAPI/Swagger implementation.
- Full TypeScript backend.
- Kafka experience from this project.
- RabbitMQ-backed realtime message delivery.
- Redis-backed durable storage.
