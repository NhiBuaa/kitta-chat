# KittaChat / web-socket

Interview-ready real-time chat project built with React, Express, Socket.IO, MongoDB, Redis, RabbitMQ, nginx, and Docker Compose.

The current architecture is intentionally conservative:

- MongoDB is the canonical source of truth for durable data.
- Redis is used for Socket.IO adapter fan-out, presence/cache, and short-lived call coordination mirrors.
- RabbitMQ is a background side-effect bus only; it is not used for realtime chat/call decisions.
- Socket.IO remains the synchronous realtime path for messaging, presence, calls, and friendship updates.

For deeper architecture notes, see `docs/ARCHITECTURE.md`. For REST endpoint
examples, see `docs/API.md`. For the RabbitMQ queue, retry, DLQ, and
poison-message flow, see `docs/RABBITMQ_WORKER_FLOWS.md`. For Socket.IO
multi-replica delivery with the Redis adapter, see `docs/SOCKET_IO_SCALING.md`.

## Features

- Direct and group chat with Socket.IO.
- Message history, read state, typing indicators, file/image attachments.
- Friend requests, accept/reject, remove friend/unfriend with realtime `friendRemoved` sync.
- Presence with multi-tab/user socket tracking.
- WebRTC audio/video calls with call history, missed-call badges, media-state sync, and hardened call finalization.
- Redis-backed conversation/friend/presence caches.
- RabbitMQ-backed image, notification/email, and audit/background workers.
- Docker Compose stack with nginx, 3 backend replicas, MongoDB, Redis, RabbitMQ, and workers.

## Tech Stack

### Client

- React 19 + Vite
- Socket.IO Client
- Axios
- React Router
- Tailwind CSS
- Simple Peer/WebRTC
- Firebase Web SDK for Google login (client config currently lives in `client/src/services/firebase/firebaseClient.js`)

### Server

- Node.js + Express 5
- Socket.IO 4 + Redis adapter
- MongoDB + Mongoose
- Redis
- RabbitMQ via `amqplib`
- Firebase Admin SDK (`server/src/config/firebase-service.json`)
- AWS S3 / CloudFront-compatible file URLs
- Nodemailer
- Sharp image processing

### Infrastructure

- Docker Compose
- nginx reverse proxy/load balancer
- MongoDB 7
- Redis Alpine
- RabbitMQ 3 Management

## Quick Start With Docker Compose

From the repository root:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env

# Edit server/.env and client/.env with local secrets/config.
cd client
npm install
npm run build
cd ..

docker compose -f docker-compose.yml up -d --build
```

Useful logs:

```powershell
docker compose logs -f backend
docker compose logs -f image-worker
docker compose logs -f notification-worker
docker compose logs -f audit-worker
docker compose logs -f nginx
```

Stop the stack:

```powershell
docker compose down
```

## Services And Ports

| Service | Role | Port |
| --- | --- | --- |
| `nginx` | Reverse proxy for static client, `/api`, and `/socket.io` | `80`, `443` |
| `backend` | Express + Socket.IO app, 3 Compose replicas | internal `3000` |
| `mongo` | MongoDB source of truth | host `27018` -> container `27017` |
| `redis` | Socket.IO adapter, cache, presence, call coordination | internal `6379` |
| `rabbitmq` | Background job broker | `5672`, management UI `15672` |
| `image-worker` | Image/file background jobs | internal |
| `notification-worker` | Email/notification jobs | internal |
| `audit-worker` | Audit/statistics/background jobs | internal |

Primary app URL through nginx: `http://localhost`.

## Local Development

Server:

```powershell
cd server
npm install
npm run dev
```

Client:

```powershell
cd client
npm install
npm run dev
```

Local client defaults point to `http://localhost:3000`; Docker/nginx production-style usage is served through `http://localhost`.

## Environment Files

- `server/.env.example` documents backend, worker, Redis, RabbitMQ, MongoDB, AWS, email, and feature flag variables.
- `client/.env.example` documents Vite client variables.
- Firebase client config is currently hardcoded in `client/src/services/firebase/firebaseClient.js`; Firebase Admin uses `server/src/config/firebase-service.json`.
- Do not commit real secrets in `.env` files.
- Docker Compose overrides some service-local connection values, e.g. Mongo/Redis/RabbitMQ container hostnames.

Important backend variables:

- `JWT_SECRET` is required for REST and Socket.IO auth.
- `MONGO_URI` is required outside Docker; Compose injects `mongodb://mongo:27017/shot-chat`.
- `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` configures Redis.
- `RABBITMQ_URL` configures background workers and queue publishers.
- `AWS_*` and `CLOUDFRONT_URL` are needed for real file upload delivery.
- `EMAIL_*` variables are needed for password reset / notification worker email delivery.

Known feature flags:

- `CALL_DISTRIBUTED_TIMEOUT_ENABLED=false` by default. Enables Redis sorted-set based distributed call timeout polling when set to `true`, `1`, `yes`, or `on`.
- `CALL_DISTRIBUTED_TIMEOUT_POLL_MS=1000` controls poll interval when the distributed timeout finalizer is enabled.
- `IMAGE_WORKER_CONCURRENCY`, `NOTIFICATION_WORKER_CONCURRENCY`, and `AUDIT_WORKER_CONCURRENCY` tune worker prefetch.
- `RABBITMQ_MAX_ATTEMPTS`, `RABBITMQ_RETRY_DELAY_MS`, `RABBITMQ_WORKER_RECONNECT_DELAY_MS`, and `RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS` tune background job retry/reconnect behavior.

## Architecture Overview

See `docs/ARCHITECTURE.md` for the detailed current architecture. Short version:

- REST APIs handle auth, profile, friends, groups, messages, files, and call history.
- Socket.IO handles realtime message delivery, typing, presence, friend updates, and WebRTC signaling.
- MongoDB remains authoritative; Redis mirrors are disposable and rebuildable.
- RabbitMQ workers process side effects in the background and never decide realtime call/chat lifecycle.
- REST endpoint examples are documented in `docs/API.md`.
- Socket.IO multi-replica delivery is documented in `docs/SOCKET_IO_SCALING.md`.
- RabbitMQ worker flow details are documented in `docs/RABBITMQ_WORKER_FLOWS.md`.

## Testing Commands

Server:

```powershell
cd server
npm test
```

Client:

```powershell
cd client
npm test
npm run build
```

## CI Pipeline

GitHub Actions runs `.github/workflows/ci.yml` on pull requests and pushes to
`main`/`master`.

- `Server Tests`: installs `server/` with `npm ci` and runs `npm test`.
- `Client Build`: installs `client/` with `npm ci` and runs `npm run build`.
- Lint and Docker image builds are intentionally not part of this small CI slice yet.

## Manual Smoke Checklist

Before freezing/releasing:

- Register/login with local auth and Google auth if Firebase is configured.
- Direct message between two users through nginx.
- Group create, group message, member list update.
- Friend request accept/reject and remove friend/unfriend.
- Unfriend with previous messages keeps the sidebar row as non-friend.
- Unfriend without messages removes the sidebar row.
- File/image upload and preview if AWS/S3 env is configured.
- Presence online/offline across refresh and multiple tabs.
- Audio call and video call between two users.
- Receiver reject and receiver pre-call cancel finalize as rejected.
- Offline missed call creates one `CallHistory` and one `call_log`.
- Answered call does not become missed after stale local timeout.
- Docker/nginx with 3 backend replicas keeps Socket.IO, call signaling, and badges correct.
- Optional: set `CALL_DISTRIBUTED_TIMEOUT_ENABLED=true` and confirm all backend replicas start the poller without duplicate `call_log` records.

## Known Constraints

- This is a monorepo demo/project, not a polished SaaS product.
- RabbitMQ is background-only; realtime features depend on Socket.IO.
- Redis call coordination keys are mirrors/locks/indexes with TTL or disposable semantics, not durable call records.
- The distributed timeout finalizer exists but remains disabled by default; local timeouts remain enabled as fallback.
- Some UI files are intentionally large; avoid broad refactors without tests and smoke coverage.
