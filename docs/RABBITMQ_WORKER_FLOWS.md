# RabbitMQ Worker Flows

This document explains the current RabbitMQ background-worker design for the
`web-socket` chat project.

RabbitMQ is a background side-effect bus only. It is not the realtime delivery
path for chat messages, typing, presence, WebRTC signaling, call state, or call
lifecycle decisions. Socket.IO remains the synchronous realtime path. MongoDB
remains the source of truth for durable records such as users, messages, files,
groups, call histories, and call-log messages.

## Runtime Roles

Docker Compose starts one RabbitMQ broker and three worker processes:

| Service | npm command | Primary queue | Purpose |
| --- | --- | --- | --- |
| `rabbitmq` | n/a | n/a | Broker and management UI. |
| `image-worker` | `npm run worker:image` | `image.process` | Processes image/file side effects. |
| `notification-worker` | `npm run worker:notification` | `notification.email` | Sends password reset email jobs. |
| `audit-worker` | `npm run worker:audit` | `audit.events` | Processes audit/statistics events. |

The backend API publishes jobs, then returns control to the user-facing request
or Socket.IO flow. Workers consume asynchronously with `startQueueWorker`.

## Queue Topology

The queue topology is declared in `server/src/queues/topology.js`.

| Primary queue | Retry queue | DLQ |
| --- | --- | --- |
| `image.process` | `image.process.retry` | `image.process.dlq` |
| `notification.email` | `notification.email.retry` | `notification.email.dlq` |
| `audit.events` | `audit.events.retry` | `audit.events.dlq` |

Primary and DLQ queues are durable. Retry queues are durable and use
`messageTtl` from `RABBITMQ_RETRY_DELAY_MS` before dead-lettering back to the
primary queue. `RABBITMQ_MAX_ATTEMPTS` controls when a failed parsed job stops
retrying and goes to the DLQ.

## Correlation IDs

Every published job gets a `correlationId`.

- If the job already has `correlationId`, the producer preserves it.
- If not, the producer uses the job `requestId`.
- If neither exists, the producer generates a UUID.
- The producer stores the value in the JSON job payload, AMQP `correlationId`,
  and AMQP headers.
- Worker retry and DLQ publishing preserve the same `correlationId`.
- Worker failure, retry, poison, and DLQ logs include the same `correlationId`.

HTTP-origin jobs pass `req.requestId` as `correlationId`, so a request can be
traced from HTTP log -> queue publish -> worker failure/retry/DLQ logs.

## Shared Worker Runtime

All workers use `server/src/workers/workerRuntime.js`.

Successful job:

1. Parse JSON.
2. Call the worker-specific `processJob`.
3. `ack` the original message.

Failed parsed job before max attempts:

1. Log `worker_job_failed`.
2. Publish the job to `<queue>.retry` with incremented `attempts`.
3. Preserve `correlationId` in payload, AMQP property, and headers.
4. `ack` the original message only after retry publish succeeds.

Failed parsed job at max attempts:

1. Log `worker_job_failed`.
2. Log `worker_job_dlq`.
3. Publish a DLQ envelope to `<queue>.dlq`.
4. Preserve `correlationId` in the envelope and error metadata.
5. `ack` the original message only after DLQ publish succeeds.

Malformed JSON poison message:

1. Do not call the worker-specific `processJob`.
2. Build a poison payload with `type: "poison"`, `parseFailed: true`, and the
   raw message body.
3. Log `worker_job_poison`.
4. Publish directly to `<queue>.dlq`.
5. Preserve `correlationId` from AMQP metadata when available.
6. `ack` the original message only after DLQ publish succeeds.

If retry or DLQ publish fails, the original message is intentionally left
unacked by the worker runtime. This avoids incorrectly acknowledging a failed
job before RabbitMQ has accepted the failure-route copy.

## Image Worker Flow

### Queues

- Primary: `image.process`
- Retry: `image.process.retry`
- DLQ: `image.process.dlq`

### Producers

- `server/src/controllers/fileController.js` publishes `chat-image` jobs after
  staging uploaded image bytes in S3-compatible storage.
- `server/src/controllers/userController.js` publishes `avatar-image` jobs for
  profile avatar updates.
- `server/src/controllers/authController.js` publishes remote avatar jobs for
  Google avatar processing.

### Consumer

- `server/src/workers/imageWorker.js`

### Payload Purpose

Image jobs contain metadata only:

- job `type`, such as `chat-image` or `avatar-image`
- `requestId` for idempotency/user-facing polling
- `correlationId` for tracing
- `userId`
- source object key or source URL
- file metadata such as original name, MIME type, and size
- optional profile update metadata for avatars

The API stages source bytes before publishing. The worker performs the expensive
image processing, storage write, MongoDB update, and realtime completion emit.

### Retry, DLQ, and Poison Behavior

- Processing failures retry through `image.process.retry` until
  `RABBITMQ_MAX_ATTEMPTS`.
- At max attempts, the job goes to `image.process.dlq`.
- Malformed JSON goes directly to `image.process.dlq`.
- Existing idempotency behavior uses `requestId` to avoid duplicating image/file
  results when jobs are retried.

## Notification Worker Flow

### Queues

- Primary: `notification.email`
- Retry: `notification.email.retry`
- DLQ: `notification.email.dlq`

### Producer

- `server/src/controllers/authController.js` calls
  `queuePasswordResetEmail` for forgot-password requests.

### Consumer

- `server/src/workers/notificationWorker.js`

### Payload Purpose

Password reset email jobs contain:

- `type: "email.password_reset"`
- `requestId`
- `correlationId`
- recipient email
- template name
- subject
- rendered HTML body with reset link
- creation timestamp

The reset token and durable user state remain outside RabbitMQ. The worker only
sends the email side effect.

### Retry, DLQ, and Poison Behavior

- Mailer/send failures retry through `notification.email.retry`.
- At max attempts, the job goes to `notification.email.dlq`.
- Unknown notification job types throw from the worker and follow the normal
  retry/DLQ path.
- Malformed JSON goes directly to `notification.email.dlq`.

## Audit Worker Flow

### Queues

- Primary: `audit.events`
- Retry: `audit.events.retry`
- DLQ: `audit.events.dlq`

### Producer

- `server/src/socket/handlers/messageHandler.js` publishes `message.created`
  audit jobs after a non-duplicate message is saved.

### Consumer

- `server/src/workers/auditWorker.js`

### Payload Purpose

`message.created` jobs contain:

- `type: "message.created"`
- message id
- conversation id
- sender and receiver ids
- message type
- group/direct flag
- duplicate flag
- attachment count
- message creation timestamp
- audit emission timestamp
- producer-added `correlationId`

MongoDB remains the source of truth for the actual `Message`. Audit jobs are
derived side effects and must not decide realtime message delivery.

### Retry, DLQ, and Poison Behavior

- Audit processing failures retry through `audit.events.retry`.
- At max attempts, the job goes to `audit.events.dlq`.
- Unknown audit job types throw from the worker and follow retry/DLQ behavior.
- Malformed JSON goes directly to `audit.events.dlq`.

## Manual Verification

### Watch Worker Logs

```powershell
docker compose logs -f image-worker
docker compose logs -f notification-worker
docker compose logs -f audit-worker
docker compose logs -f rabbitmq
```

Look for structured worker runtime events:

- `worker_job_failed`
- `worker_job_retry`
- `worker_job_poison`
- `worker_job_dlq`

The same `correlationId` should appear across related failure, retry, and DLQ
logs.

### Use RabbitMQ Management UI

1. Start the stack:

   ```powershell
   docker compose up -d --build
   ```

2. Open RabbitMQ Management UI:

   - URL: `http://localhost:15672`
   - Username: `guest` unless `RABBITMQ_USER` overrides it.
   - Password: `guest` unless `RABBITMQ_PASS` overrides it.

3. Inspect queues:

   - `image.process`
   - `image.process.retry`
   - `image.process.dlq`
   - `notification.email`
   - `notification.email.retry`
   - `notification.email.dlq`
   - `audit.events`
   - `audit.events.retry`
   - `audit.events.dlq`

### Publish a Malformed Test Message

Use the RabbitMQ UI for the safest manual poison-message check:

1. Go to **Queues and Streams**.
2. Select a primary queue, for example `audit.events`.
3. Open **Publish message**.
4. Set **Properties**:

   ```json
   {"correlation_id":"manual-poison-1","headers":{"correlationId":"manual-poison-1"}}
   ```

5. Set **Payload** to malformed JSON:

   ```text
   {bad json
   ```

6. Publish the message.
7. Watch the worker logs for `worker_job_poison` and `worker_job_dlq`.
8. Inspect `audit.events.dlq` in the UI and confirm the DLQ envelope contains
   `correlationId: "manual-poison-1"`.

### Inspect a DLQ Message

In RabbitMQ Management UI:

1. Open the DLQ, for example `audit.events.dlq`.
2. Use **Get messages** with requeue disabled for manual inspection only.
3. Confirm the payload has:

   - top-level `correlationId`
   - `job`
   - `error.message`
   - `error.failedAt`
   - `error.originalQueue`
   - `error.correlationId`

Do not purge DLQs in shared environments unless you intentionally want to delete
failure evidence.

## Useful Test Commands

RabbitMQ infrastructure and poison-message tests:

```powershell
cd server
node --test test/rabbitmqInfrastructure.test.js
```

Full server regression:

```powershell
cd server
npm test
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd test
```
