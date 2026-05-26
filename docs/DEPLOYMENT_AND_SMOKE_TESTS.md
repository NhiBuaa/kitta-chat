# Deployment And Smoke Verification

This guide is for local reviewer demos and maintenance checks. It documents the current Docker Compose workflow and the backend reliability signals that were added for interview-ready verification.

This is not a production runbook. The stack is a local Docker Compose deployment with nginx, backend replicas, MongoDB, Redis, RabbitMQ, and background workers.

## Architecture Boundaries To Verify

- MongoDB remains the source of truth for users, messages, groups, files, and call history.
- Socket.IO remains the realtime transport for chat, typing, presence, friend events, and calls.
- Redis supports Socket.IO adapter fan-out, cache/presence mirrors, and short-lived call coordination.
- RabbitMQ is background-only for image processing, notification/email, and audit jobs.
- nginx is the host-facing reverse proxy for the React app, REST APIs, Socket.IO, and backend operational endpoints.

## Prerequisites

- Docker Desktop is running.
- `server/.env` exists and contains safe local values for `JWT_SECRET`, `URL_FRONTEND`, Mongo/Redis/RabbitMQ settings, and optional AWS/email settings.
- The frontend has been built if using the production nginx static flow:

```powershell
cd D:\Study\HK5\NodeJS\Midterm\web-socket\client
npm install
npm run build
```

## Start The Stack

From the repository root:

```powershell
cd D:\Study\HK5\NodeJS\Midterm\web-socket
docker compose up -d --build
```

Check service state:

```powershell
docker compose ps
```

Expected services include:

- `nginx`
- `backend`
- `mongo`
- `redis`
- `rabbitmq`
- `image-worker`
- `notification-worker`
- `audit-worker`

The local override may also start `client-dev` for Vite development.

## Logs To Inspect

nginx:

```powershell
docker compose logs nginx --tail=100
```

backend:

```powershell
docker compose logs backend --tail=150
```

workers:

```powershell
docker compose logs image-worker --tail=100
docker compose logs notification-worker --tail=100
docker compose logs audit-worker --tail=100
```

RabbitMQ:

```powershell
docker compose logs rabbitmq --tail=100
```

MongoDB and Redis:

```powershell
docker compose logs mongo --tail=80
docker compose logs redis --tail=80
```

Useful things to look for:

- backend logs showing MongoDB connected, Redis connected, Socket.IO Redis adapter connected, and server started.
- worker logs showing they are consuming `image.process`, `notification.email`, or `audit.events`.
- request logs with `requestId`, method, path, status, and latency.
- worker failure logs with queue, job type, attempt, correlationId, and failure reason.

## Dependency Expectations

MongoDB:

- Docker service name: `mongo`.
- Container port: `27017`.
- Host port: `27017` through `docker-compose.override.yml`, or `27018` in the base compose mapping depending on the active compose files.
- Stores durable application state and remains authoritative.

Redis:

- Docker service name: `redis`.
- Host port through override: `6379`.
- Used for Socket.IO adapter fan-out, cache/presence mirrors, and short-lived coordination.
- Redis is not durable source-of-truth state.

RabbitMQ:

- Docker service name: `rabbitmq`.
- AMQP port: `5672`.
- Management UI port: `15672`.
- Used only for background side effects.

RabbitMQ Management UI:

```text
http://localhost:15672
```

Default local credentials when not overridden:

```text
username: guest
password: guest
```

## Operational Endpoint Checks

There are two types of health endpoints:

- `GET /healthz` is nginx-local and returns a plain `OK` for nginx/container health checks.
- `GET /backend-healthz`, `GET /readyz`, and `GET /ops` proxy to the backend through nginx.

Host-facing checks through nginx:

```powershell
curl.exe -i http://localhost/healthz
curl.exe -i http://localhost/backend-healthz
curl.exe -i http://localhost/readyz
curl.exe -i http://localhost/ops
```

Expected:

- `/healthz`: `200 OK` with plain text `OK` from nginx.
- `/backend-healthz`: backend JSON with `status`, `instance`, and dependency `services`.
- `/readyz`: backend JSON with `ready` when MongoDB and Redis are connected. RabbitMQ can be unavailable without making chat API readiness fail.
- `/ops`: backend JSON with status, timestamp, uptime, memory byte counts, dependency statuses, runtime info, and `monitoring.prometheus: false`.

Direct backend check from inside the backend container:

```powershell
docker compose exec backend wget -qO- http://localhost:3000/ops
```

The `/ops` endpoint is a lightweight local/debug signal, not a full Prometheus or production monitoring endpoint. It intentionally avoids secrets, tokens, email addresses, user PII, and raw connection strings.

## REST Auth Smoke Test

Register a local user through nginx:

```powershell
curl.exe -i -X POST http://localhost/api/auth/register ^
  -H "Content-Type: application/json" ^
  -H "x-request-id: smoke-register-1" ^
  -d "{\"displayName\":\"Smoke User\",\"email\":\"smoke-user@example.com\",\"password\":\"Password1!\",\"confirmPassword\":\"Password1!\"}"
```

Login:

```powershell
curl.exe -i -X POST http://localhost/api/auth/login ^
  -H "Content-Type: application/json" ^
  -H "x-request-id: smoke-login-1" ^
  -d "{\"email\":\"smoke-user@example.com\",\"password\":\"Password1!\"}"
```

Expected:

- register returns `201` unless the email already exists.
- login returns `200` with an app JWT.
- response includes the same `x-request-id` header.
- backend logs include the request ID.

## Auth Rate Limit Manual Test

nginx already rate-limits `/api/auth/` at the edge. Express also applies app-level in-memory limits to sensitive auth routes.

Express defaults:

- login: 10 attempts per 15 minutes per backend process/IP.
- register: 5 attempts per hour per backend process/IP.
- forgot password: 5 attempts per hour per backend process/IP.

Important limitation: Express limits are in-memory per backend replica, so with multiple backend replicas behind nginx you may need more requests to hit `429`. This is not distributed rate limiting.

A simple login limit test:

```powershell
curl.exe -i -X POST http://localhost/api/auth/login ^
  -H "Content-Type: application/json" ^
  -H "x-request-id: smoke-rate-login-1" ^
  -d "{\"email\":\"rate-test@example.com\",\"password\":\"WrongPassword1!\"}"
```

Repeat until a limiter responds. Expected Express limiter body:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many login attempts. Please try again later."
  },
  "message": "Too many login attempts. Please try again later.",
  "requestId": "smoke-rate-login-1"
}
```

If nginx returns a rate-limit response first, that proves the edge limiter is active. If you specifically need to observe the Express limiter, test against a single local backend process with `cd server && npm run dev` or temporarily run one backend replica.

## RabbitMQ Worker Flow Smoke Checks

Open RabbitMQ Management UI:

```text
http://localhost:15672
```

Queues to inspect:

- `image.process`
- `image.process.retry`
- `image.process.dlq`
- `notification.email`
- `notification.email.retry`
- `notification.email.dlq`
- `audit.events`
- `audit.events.retry`
- `audit.events.dlq`

Worker logs:

```powershell
docker compose logs image-worker --tail=150
docker compose logs notification-worker --tail=150
docker compose logs audit-worker --tail=150
```

A normal worker flow should preserve `correlationId` from publish through worker processing, retry, and DLQ when failures occur.

## Poison-Message Manual Test

Use the RabbitMQ Management UI for a no-code smoke check:

1. Open `http://localhost:15672`.
2. Go to **Queues and Streams**.
3. Select `audit.events`.
4. Expand **Publish message**.
5. Set payload to malformed JSON:

```text
{not-valid-json
```

6. Publish the message.
7. Inspect `audit.events.dlq`.

Expected:

- the malformed message is treated as a poison message.
- it routes to the DLQ instead of being acked as a successful job.
- worker logs should include queue name, job type `poison`, attempt/correlation context when available, and the parse failure reason.

If you test another primary queue, inspect its matching `.dlq` queue.

## Socket.IO Multi-Replica Smoke Check

For a full manual check, open the app through nginx:

```text
http://localhost
```

Use two browser sessions or two users:

1. Register/login as User A and User B.
2. Send a direct message from A to B.
3. Confirm B receives it in realtime.
4. Refresh one tab and confirm presence/offline grace does not flicker unexpectedly.

For architecture details, see `docs/SOCKET_IO_SCALING.md`.

## Teardown And Reset

Stop services without deleting data:

```powershell
docker compose down
```

Stop services and delete MongoDB/RabbitMQ/Redis volumes:

```powershell
docker compose down -v
```

Rebuild from scratch:

```powershell
docker compose down -v
docker compose up -d --build
```

Restart only backend replicas after changing server code or environment:

```powershell
docker compose restart backend
```

Reload nginx after changing `nginx/nginx.conf`:

```powershell
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

## Common Startup Failures And Recovery

Docker cannot connect or permission denied:

- Ensure Docker Desktop is running.
- Restart the terminal as needed.
- Run `docker compose ps` again.

nginx returns React HTML for an operational endpoint:

- Confirm the endpoint is explicitly proxied in `nginx/nginx.conf`.
- Reload nginx:

```powershell
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

backend is unhealthy or `/readyz` is `not_ready`:

- Inspect backend logs:

```powershell
docker compose logs backend --tail=150
```

- Check MongoDB and Redis logs:

```powershell
docker compose logs mongo --tail=80
docker compose logs redis --tail=80
```

RabbitMQ is unavailable but chat still works:

- This can show as `degraded` in `/backend-healthz` or `/ops`.
- RabbitMQ is background-only, so realtime chat/calls should continue through Socket.IO.
- Inspect RabbitMQ and worker logs before retrying background jobs.

Auth requests return `429` too quickly:

- nginx may be enforcing the outer `/api/auth/` limit.
- Express also keeps in-memory per-process counters.
- Restart backend to clear Express counters:

```powershell
docker compose restart backend
```

Operational endpoint exposes only lightweight signals:

- `/ops` is intentionally not Prometheus.
- It does not expose secrets, tokens, email addresses, user PII, or raw connection strings.
- For production monitoring, add a dedicated metrics/exporter design instead of overloading this endpoint.
