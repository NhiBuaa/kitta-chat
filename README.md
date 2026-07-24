# KittaChat

[![Tests](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/tests.yml)
[![Build](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/NhiBuaa/kitta-chat/actions/workflows/build.yml)

Realtime Chat & Calling Platform built with React, Express, Socket.IO, MongoDB, Redis, RabbitMQ, nginx, and Docker Compose.

KittaChat is intentionally conservative in its architecture:

- MongoDB is the source of truth for durable users, messages, friendships, groups, files, and calls.
- Socket.IO is the realtime path for chat, presence, friendship updates, and WebRTC signaling.
- RabbitMQ is a background side-effect bus for image, notification/email, and audit/statistics jobs.
- Redis is adapter/cache/coordination infrastructure for Socket.IO fan-out, presence/cache, and short-lived call mirrors.
- nginx is the reverse proxy for the frontend, REST APIs, Socket.IO, and operational endpoints.

For deeper implementation notes, see `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SOCKET_IO_SCALING.md`, `docs/RABBITMQ_WORKER_FLOWS.md`, `docs/DEPLOYMENT_AND_SMOKE_TESTS.md`, and `docs/INTERVIEW_NOTES.md`.

## Screenshots

Add reviewer screenshots here before publishing the portfolio page:

- Chat inbox and active conversation.
- Group chat and unread badges.
- Audio/video call window.
- RabbitMQ management UI showing worker queues.

## Features

- Direct and group messaging with realtime Socket.IO delivery.
- Online presence, typing indicators, unread badges, friendship updates, and group updates.
- Audio/video calling with WebRTC signaling over Socket.IO.
- Memory-only frontend auth state with HttpOnly refresh-cookie session recovery.
- File/avatar upload flow with S3 or CloudFront-compatible delivery when configured.
- Redis-backed Socket.IO adapter, cache, presence, and call coordination mirrors.
- RabbitMQ-backed background workers with retry/DLQ-oriented flow documentation.
- Docker Compose stack with nginx, backend replicas, MongoDB, Redis, RabbitMQ, and workers.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS, Socket.IO Client, WebRTC APIs |
| Backend | Node.js, Express 5, Socket.IO 4, Mongoose, JWT, Firebase Admin SDK |
| Data/infra | MongoDB, Redis, RabbitMQ, nginx, Docker Compose |
| Workers | RabbitMQ consumers for image, notification/email, and audit/statistics jobs |
| Tests/CI | Node test runner, client behavior tests, server integration/unit tests, GitHub Actions |

## One-Command Docker Quickstart

The reviewer-friendly path is Docker Compose. It builds the React frontend inside Docker, serves it from nginx, and starts the backend, replicas, workers, MongoDB, Redis, and RabbitMQ.

```powershell
Copy-Item server/.env.example server/.env
# Edit server/.env and replace placeholder secrets/config.
docker compose up --build
```

Detached mode:

```powershell
docker compose up -d --build
```

Older Compose installations may use:

```powershell
docker-compose up --build
```

Stop the stack:

```powershell
docker compose down
```

Notes:

- `server/.env` is still a required one-time setup step; do not commit real secrets.
- Docker quickstart does not require local `npm install`, local `npm run build`, `client/.env`, or a pre-existing `client/dist` folder.
- Google login requires `server/src/config/firebase-service.json`; do not commit that file.
- Email and S3-compatible file delivery require real provider credentials before those integrations work end-to-end.

## Services And Ports

| Service | Purpose | Host access |
| --- | --- | --- |
| `nginx` | Reverse proxy and static frontend server | `http://localhost`, `https://localhost` |
| `backend` | Express + Socket.IO app replicas | internal `3000` via nginx |
| `mongo` | MongoDB source of truth | `localhost:27018` |
| `redis` | Redis adapter/cache/coordination | internal `6379` |
| `rabbitmq` | RabbitMQ broker and management UI | `localhost:5672`, `http://localhost:15672` |
| `image-worker` | Image/avatar background jobs | internal worker |
| `notification-worker` | Email/notification jobs | internal worker |
| `audit-worker` | Audit/statistics jobs | internal worker |

## Smoke Verification

After `docker compose up --build`, verify the stack through nginx:

```powershell
curl.exe -i http://localhost/healthz
curl.exe -i http://localhost/backend-healthz
curl.exe -i http://localhost/readyz
curl.exe -i http://localhost/ops
```

Manual reviewer checklist:

- Open `http://localhost` and load the frontend.
- Open RabbitMQ management UI at `http://localhost:15672`.
- Register or log in, then refresh the page and confirm the session recovers.
- Send a direct message and confirm realtime sidebar/unread updates.
- Start, accept, and end an audio/video call between two users.
- If provider credentials are configured, test avatar/file upload and email-related flows.

Useful logs:

```powershell
docker compose logs -f nginx
docker compose logs -f backend
docker compose logs -f image-worker
docker compose logs -f notification-worker
docker compose logs -f audit-worker
```

## Local Development

Run services locally when you want fast Vite HMR or backend iteration outside the production-style nginx path.

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

Local client defaults point to `http://localhost:3000`. Docker/nginx usage is served through `http://localhost`.

For containerized Vite development, use the explicit dev override rather than relying on automatic Compose overrides:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Environment Model

- `server/.env.example` documents backend, worker, Redis, RabbitMQ, MongoDB, AWS, email, Firebase Admin, and feature-flag variables.
- `client/.env.example` documents local Vite variables. It is not required for the Docker/nginx quickstart.
- For Vite dev, use `URL_FRONTEND=http://localhost:5173` in `server/.env`.
- For Docker/nginx demo, use `URL_FRONTEND=http://localhost` in `server/.env`.
- Docker Compose injects service-local connection values for MongoDB, Redis, and RabbitMQ.
- Do not commit `.env` files, Firebase service account JSON, or real provider secrets.

Important backend variables:

- `JWT_SECRET` signs REST and Socket.IO access tokens.
- `REFRESH_TOKEN_SECRET` signs refresh/session cookies; if omitted, the app falls back to `JWT_SECRET` for local workflow compatibility.
- `AUTH_COOKIE_SECURE=false` is appropriate only for controlled non-HTTPS local testing.
- `MONGO_URI`, `REDIS_URL`, and `RABBITMQ_URL` configure backing services outside Compose.
- `AWS_*`, `CLOUDFRONT_URL`, and `EMAIL_*` are needed for real upload/email integrations.

## Auth Model

- The frontend keeps the access token and current user in memory only.
- The frontend does not persist token/user in `localStorage`; non-sensitive UI/temp keys may still use `localStorage`.
- Reload/session recovery uses an HttpOnly refresh cookie.
- REST requests still send `Authorization: Bearer <access token>` from memory.
- Socket.IO authenticates with the in-memory token and user from `useAuth()`.
- `axiosClient` refreshes once on `401/403`, then clears auth and redirects if refresh fails.

This is a practical demo architecture, not a claim that the app is fully secure or XSS-proof.

## Realtime And Scaling

- Socket.IO remains the realtime path for messages, presence, friend events, group updates, and call signaling.
- Redis adapter support lets multiple backend replicas deliver events through the same logical rooms.
- MongoDB remains authoritative; Redis mirrors are disposable and rebuildable.
- Call coordination uses MongoDB idempotency gates with Redis/local mirrors for cross-replica routing and timeout coordination.

See `docs/SOCKET_IO_SCALING.md` for the detailed multi-replica delivery model.

## Background Processing

RabbitMQ is used for background side effects only. It does not decide realtime chat or call lifecycle behavior.

- `image-worker`: remote avatar/image processing.
- `notification-worker`: notification/email side effects.
- `audit-worker`: audit/statistics events.

See `docs/RABBITMQ_WORKER_FLOWS.md` for retry, delayed retry, DLQ, and poison-message notes.

## Engineering Challenges Solved

- Removed sensitive token/user persistence from frontend `localStorage` while preserving reload recovery through refresh cookies.
- Split auth context/hook exports to satisfy React Fast Refresh without behavior changes.
- Made server tests independent from `client/node_modules` by using server-local dev dependencies.
- Made Firebase Admin safe to import in CI when `firebase-service.json` is absent.
- Built frontend assets inside the nginx Docker image so `docker compose up --build` works after a fresh clone.
- Stabilized realtime state around unread counts, call lifecycle idempotency, and cross-replica Socket.IO delivery.

## Testing And CI

Client:

```powershell
cd client
npm test
npm run build
```

Server:

```powershell
cd server
npm test
```

GitHub Actions uses independent workflows on pull requests and pushes to `main`:

- `Tests` (`.github/workflows/tests.yml`): installs dependencies independently and runs both server and client test suites.
- `Build` (`.github/workflows/build.yml`): installs client dependencies and verifies the production frontend build.

The two dynamic badges at the top of this README report the current `main` branch status. Lint and Docker image builds remain separate future workflow candidates.

## Known Production Gaps

- Docker Compose is the demo/reviewer deployment path, not a Kubernetes or multi-region production deployment.
- Secrets are file/env based for local demo; use a managed secret store for production.
- Firebase Admin, SMTP/email, and S3-compatible delivery need real provider configuration.
- Observability is currently health/readiness/ops endpoints plus logs, not a full metrics/tracing stack.
- Some call lifecycle safeguards still include process-local fallbacks, with MongoDB/Redis guards mitigating multi-replica issues.
- The frontend production build currently reports a chunk-size warning; code splitting is a safe later improvement.

## Useful Docs

- `docs/API.md`: REST API examples and auth behavior.
- `docs/ARCHITECTURE.md`: current architecture overview.
- `docs/DEPLOYMENT_AND_SMOKE_TESTS.md`: deployment and manual smoke notes.
- `docs/SOCKET_IO_SCALING.md`: Socket.IO Redis adapter and multi-replica behavior.
- `docs/RABBITMQ_WORKER_FLOWS.md`: queue, retry, DLQ, and worker semantics.
- `docs/INTERVIEW_NOTES.md`: CV-safe claims, trade-offs, and interview talking points.
