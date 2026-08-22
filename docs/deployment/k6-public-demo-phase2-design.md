# K6 Phase 2 — Revised public-demo specification and design

## Status and authorization boundary

`PHASE_2_APPROVED / PHASE_3_DECOMPOSITION_PENDING`

This revision responds to the maintainer REQUEST_CHANGES for Phase 2. It is a design artifact only.
It does not authorize runtime implementation, provider mutation, credential creation, Railway secret
binding, GHCR publication, deployment, rollback, or Phase 3 decomposition.

K6 remains a non-production Railway `public-demo` target for portfolio and recruiter evaluation. It
must not be described as production, scalable production, production evidence, or an Issue #61
measurement environment. Issue #61 measurement, Level 2B, numeric tuning, and new quota creation
remain disabled and out of scope.

No secret value is recorded in this document, Git, chat, issue evidence, or logs.

## 1. Locked design decisions

- MongoDB remains the durable source of truth.
- Redis remains cache, presence, Socket.IO coordination, and short-lived coordination state.
- RabbitMQ remains background-only infrastructure.
- One backend instance is the K6 public-demo topology; no cross-replica production behavior claim is
  made.
- The public edge is the only public application ingress.
- REST and Socket.IO payloads, room identifiers, and legacy `Message.conversationId` remain unchanged.
- Recovery/password reset and Google login are disabled by explicit capability state. Missing provider
  secrets are not the disable mechanism.
- Upload begins fail-closed and is enabled only after the bounded D2 sequence in section 8.
- Seed data uses the `.test` namespace and contains no personal, sensitive, or production data.
- Startup migrations and automatic demo reset are forbidden.
- Auto Deploy is disabled; Railway deployment authority is an immutable GHCR digest, never `latest`.
- `/ops` and `/metrics` are not public.

## 2. Current architecture facts that constrain the design

The design is based on the current repository seams, not on local Compose names being valid Railway
names:

- The server image default command is `node server.js`; the worker commands are
  `npm run worker:image`, `npm run worker:audit`, and `npm run worker:notification`.
- The nginx image currently serves the built Vite SPA and has a hard-coded `backend:3000` upstream.
  Phase 4 must introduce a validated runtime upstream seam.
- Vite values are build-time values. The public-demo build therefore uses same-origin relative API
  and Socket.IO paths and must not embed the future Railway hostname.
- The current call client uses `simple-peer` with two public STUN servers and no TURN server or
  target-configurable ICE list. Signaling success is not media-path success.
- The existing image/profile queue source path is `queue-sources/*`, while the S1 S3 approval only
  allows `uploads/*` and `avatars/*`. This mismatch is an implementation blocker for upload and is
  not silently accepted by this design.
- The current health payload contains dependency and runtime details. Public health surfaces must be
  sanitized before D2; provider names, private hostnames, process details, memory, and secrets must
  not be disclosed.
- The existing demo seed is deterministic and upsert-based, but remote execution is guarded and the
  current seed module does not provide destructive cleanup. Cleanup therefore remains an explicit,
  bounded operator action to be designed in the implementation slice.

## 3. Authoritative Railway runtime topology

Railway target: project `kittachat-public-demo`, environment `public-demo`, region binding
`asia-southeast1-eqsg3a` (Singapore). The service IDs below are the maintainer-supplied targets.
Runtime instance and hostname read-back remain D2 evidence.

| Railway service | Service ID | GHCR package | Service-specific start command | Exposure | K6 disposition |
| --- | --- | --- | --- | --- | --- |
| `edge` | `8f6c46c6-0a82-4dc0-b9c6-6ff7bf272f58` | `ghcr.io/nhibuaa/kitta-chat-edge` | nginx image default: `nginx -g "daemon off;"` | Public HTTPS Railway domain; port 80 inside image | Only public ingress; serves SPA, proxies API/Socket.IO to private backend |
| `backend` | `e01ae8b7-2e11-4776-96b0-576b0470a8bb` | `ghcr.io/nhibuaa/kitta-chat-server` | `node server.js` | Private Railway service; no public domain | One instance; owns REST, Socket.IO, `/readyz`, and domain behavior |
| `image-worker` | `fefd7765-616b-4148-9a6d-83ad959e9aa7` | `ghcr.io/nhibuaa/kitta-chat-server` | `npm run worker:image` | Private worker; no public port | Required for image/avatar processing when upload is enabled |
| `audit-worker` | `ae3c0006-ed8c-4f69-a585-1afb931f23c6` | `ghcr.io/nhibuaa/kitta-chat-server` | `npm run worker:audit` | Private worker; no public port | Required background audit consumer |
| `notification-worker` | `4cfa1dba-7b5c-453b-a11f-b83e9fdca65c` | None in K6 | None; do not start | Private target remains un-deployed | Excluded because recovery/password reset is disabled. Do not delete or mutate this target in Phase 2/D2 without a separate maintainer decision |

The three application images are intentionally two packages: one edge/frontend package and one
server/worker package. Railway must bind each service to an immutable digest of the appropriate
package. No service may deploy from `latest`, a mutable branch tag, or a dirty local tree.

### External provider bindings

| Dependency | S1-selected binding | Consumers | S1/D2 boundary |
| --- | --- | --- | --- |
| MongoDB | Atlas Free `kitta-chat` / `Cluster0`, AWS Hong Kong, database `shot-chat` | `backend`, `image-worker`, one-off seed | Connectivity and credential binding are PENDING_D2 |
| Redis | Upstash `kittachat-public-demo`, AWS Singapore `ap-southeast-1`, one native `rediss` endpoint | `backend`, `image-worker` | Provider-internal mode is unasserted; application client uses one endpoint; command/Pub/Sub/Lua/reconnect checks are PENDING_D2 |
| RabbitMQ | CloudAMQP Little Lemur `kittachat-public-demo`, AWS `ap-southeast-1`, AMQPS | `backend`, `image-worker`, `audit-worker` | Provider-managed user/vhost accepted; permission regexes remain NOT_ASSERTED; nine-queue operation is PENDING_D2 |
| Object storage | Private AWS S3 `kittachat-public-demo-nhibuaa`, AWS Singapore | `backend`, `image-worker` when upload is enabled | Access key, CORS, SDK, worker and browser validation are PENDING_D2 |

## 4. Target configuration and capability seam

### 4.1 Semantic interface

One target-configuration module is the highest useful seam. It produces validated semantic values:

```text
targetName
publicAppUrl
allowedBrowserOrigins
backendUpstream
capabilities
workerDependencyBindings
validationResult
```

Local Compose and Railway are adapters to this interface. Business modules do not read Railway DNS,
provider topology, or raw deployment-specific defaults directly.

`publicAppUrl` is the URL used for user-facing links. `allowedBrowserOrigins` is the exact
scheme/host/port allowlist used by Express and Socket.IO. They are separate values even when K6
binds them to the same generated edge origin. Wildcards, origin reflection, evil subdomains,
alternate ports, and alternate schemes are rejected.

### 4.2 Frontend build-time versus Railway runtime values

The resolution is same-origin frontend configuration:

1. The edge image is built with non-secret relative Vite paths: `VITE_API_URL=/`,
   `VITE_API_URL_AUTH=/api/auth`, `VITE_API_URL_USERS=/api/users`,
   `VITE_API_URL_MESSAGES=/api/messages`, `VITE_API_URL_GROUPS=/api/groups`,
   `VITE_API_URL_FILES=/api/files`, and `VITE_API_URL_CALLS=/api/calls`.
2. The SPA derives the current public origin from `window.location.origin` for browser-local
   behavior. The future Railway hostname is never a build-time constant.
3. The edge serves a same-origin, non-secret runtime capability document such as
   `/runtime-config.json`, generated from target configuration at container start. It contains only
   a schema version, target label, safe capability booleans, and non-secret WebRTC server metadata.
4. The frontend waits for this document before rendering optional controls. If it is missing,
   malformed, or stale, optional capabilities fail closed; no Google, recovery, metrics, or upload
   control is rendered.
5. D2-generated `URL_FRONTEND` and `CORS_ALLOWED_ORIGINS` are backend/provider values, not frontend
   build inputs. They are set only after the real edge hostname is read back.
6. No Firebase web configuration is bound for K6 because Google login is disabled. No secret or
   long-lived provider credential is placed in Vite output or `runtime-config.json`.

This removes dead UI controls: Google login, forgot-password/recovery navigation, reset-password
navigation, and upload controls are capability-gated at route and component boundaries. A direct
request to a disabled route fails closed with a non-sensitive unavailable response; it does not
reach an unconfigured provider and does not rely on a missing secret to disable the feature.

### 4.3 Capability states

| Capability | Initial public-demo state | Enablement rule |
| --- | --- | --- |
| Direct chat | Enabled | Existing authenticated REST/Socket.IO contracts |
| Group chat | Enabled | Existing authenticated group authorization |
| Realtime sidebar | Enabled | Legacy-authoritative sidebar contract |
| Calls and call history | Enabled but D2-gated | Media-path acceptance must pass; signaling alone is insufficient |
| Self-signup | Enabled | Existing auth controls plus demo-only operating policy |
| Seeded demo accounts | Enabled | Idempotent `.test` dataset and maintainer-controlled credential handling |
| Upload | `false` initially | S3/provider/internal validation, exact-origin CORS, then explicit enablement |
| Recovery/password reset | `false` | No public recovery route and no notification dependency |
| Google login | `false` | No Firebase provider binding or Google route exposure |
| Prometheus HTTP export | `false` | `METRICS_ENABLED=false`; no `/metrics` edge route or public backend |
| Issue #61 measurement | `false` and inert | No measurement collection, quota, numeric tuning, or production evidence |

Metrics clarification: the internal metrics module remains available to existing code paths for
safe in-process observations and test seams, but Prometheus HTTP export is disabled, no metrics
endpoint is public, no Railway scrape is configured, and Issue #61 measurement remains inert. K6
does not claim that internal observations are deployment evidence.

## 5. Complete configuration and secret-binding matrix

The following is the complete K6 binding contract. A variable not listed as bound is not injected.
Values shown as `D2` are derived or supplied at D2; no value is recorded here.

### 5.1 Backend service

| Variable | Required K6 value/source | Secret? | Railway recipient |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | No | `backend`, `image-worker`, `audit-worker` |
| `NODE_NAME` | service identity/default | No | `backend` |
| `PORT` | `3000` | No | `backend` |
| `MONGO_URI` | Atlas `shot-chat` URI, D2 secret binding | Yes | `backend`, `image-worker`; one-off seed only |
| `JWT_SECRET` | unique D2 secret | Yes | `backend` only |
| `REFRESH_TOKEN_SECRET` | distinct unique D2 secret | Yes | `backend` only |
| `URL_FRONTEND` | exact generated edge HTTPS origin, D2 | No | `backend` only |
| `CORS_ALLOWED_ORIGINS` | exact same generated edge origin, D2 | No | `backend` only |
| `AUTH_COOKIE_SECURE` | `true` | No | `backend` only |
| `METRICS_ENABLED` | `false` | No | `backend` only |
| `REDIS_URL` | Upstash `rediss` URL, D2 secret binding | Yes | `backend`, `image-worker` |
| `REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES` | empty | No | `backend` only |
| `RABBITMQ_URL` | CloudAMQP AMQPS URL, D2 secret binding | Yes | `backend`, `image-worker`, `audit-worker` |
| `RABBITMQ_MAX_ATTEMPTS` | `3` | No | `backend`, `image-worker`, `audit-worker` |
| `RABBITMQ_RETRY_DELAY_MS` | `30000` | No | `backend`, `image-worker`, `audit-worker` |
| `RABBITMQ_WORKER_RECONNECT_DELAY_MS` | `1000` | No | `backend`, `image-worker`, `audit-worker` |
| `RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS` | `30000` | No | `backend`, `image-worker`, `audit-worker` |
| `DEFAULT_AVATAR` | non-secret fallback URL | No | `backend` only |
| `CONVERSATION_DUAL_WRITE_ENABLED` | `false` | No | `backend` only |
| `CONVERSATION_SHADOW_COMPARE_ENABLED` | `false` | No | `backend` only |
| `CONVERSATION_SIDEBAR_READ_MODEL_ENABLED` | `false`; legacy remains authoritative | No | `backend` only |
| `CONVERSATION_PANEL_ENABLED` | `false`; outside the locked K6 surface | No | `backend` only |
| `CONVERSATION_PANEL_RESOURCES_ENABLED` | `false` | No | `backend` only |
| `CONVERSATION_PANEL_RATE_LIMIT` | `30`; existing default, no new quota | No | `backend` only |
| `CALL_DISTRIBUTED_TIMEOUT_ENABLED` | `false` unless separately approved | No | `backend` only |
| `CALL_DISTRIBUTED_TIMEOUT_POLL_MS` | `1000` | No | `backend` only |
| `K6_TARGET` | `public-demo` | No | `backend` only |
| `K6_CAPABILITY_UPLOAD` | `false` until D2 activation | No | `backend` only |
| `K6_CAPABILITY_RECOVERY` | `false` | No | `backend` only |
| `K6_CAPABILITY_GOOGLE_LOGIN` | `false` | No | `backend` only |
| `K6_CAPABILITY_CALLS` | `true`, subject to D2 media acceptance | No | `backend` only |
| `K6_CAPABILITY_ISSUE61_MEASUREMENT` | `false` | No | `backend` only |
| `K6_SYNTHETIC_SIGNUP_ONLY` | `true` | No | `backend` only |
| `AWS_REGION` | `ap-southeast-1`, D2 binding | No | `backend`, `image-worker` |
| `AWS_ACCESS_KEY_ID` | dedicated prefix-scoped IAM key, D2 secret binding for internal validation while upload remains false | Yes | `backend`, `image-worker` only |
| `AWS_SECRET_ACCESS_KEY` | matching IAM secret, D2 secret binding for internal validation while upload remains false | Yes | `backend`, `image-worker` only |
| `AWS_S3_BUCKET_NAME` | `kittachat-public-demo-nhibuaa` | No | `backend`, `image-worker` |
| `CLOUDFRONT_URL` | unset; no CloudFront provider selected | No | none; code must preserve private S3 download semantics |

The backend receives JWT, refresh, MongoDB, Redis, RabbitMQ, and S3 credentials only because it
owns the corresponding authenticated or persistence paths. It does not receive email-provider or
Firebase credentials in K6.

### 5.2 Edge/frontend service

| Variable or build argument | Required K6 value/source | Secret? | Railway recipient |
| --- | --- | --- | --- |
| `BACKEND_UPSTREAM` | D2-read-back private backend hostname and `:3000` | No | `edge` only |
| `K6_TARGET` | `public-demo` | No | `edge` only |
| `K6_RUNTIME_CONFIG_FILE` | generated safe runtime config path | No | `edge` only |
| `K6_CAPABILITY_UPLOAD` | `false` initially, then D2-enabled | No | `edge` only |
| `K6_CAPABILITY_RECOVERY` | `false` | No | `edge` only |
| `K6_CAPABILITY_GOOGLE_LOGIN` | `false` | No | `edge` only |
| `K6_CAPABILITY_CALLS` | `true`, D2-gated | No | `edge` only |
| `K6_CAPABILITY_ISSUE61_MEASUREMENT` | `false` | No | `edge` only |
| `VITE_API_URL` | `/` | No | edge image build only |
| `VITE_API_URL_AUTH` | `/api/auth` | No | edge image build only |
| `VITE_API_URL_USERS` | `/api/users` | No | edge image build only |
| `VITE_API_URL_MESSAGES` | `/api/messages` | No | edge image build only |
| `VITE_API_URL_GROUPS` | `/api/groups` | No | edge image build only |
| `VITE_API_URL_FILES` | `/api/files` | No | edge image build only |
| `VITE_API_URL_CALLS` | `/api/calls` | No | edge image build only |
| `VITE_DEFAULT_AVATAR` | non-secret public fallback | No | edge image build only |

The edge receives no MongoDB, Redis, RabbitMQ, AWS, JWT, refresh, email, Firebase, or database
credential. `VITE_PROXY_TARGET` is a local development build input and is not a Railway secret or
runtime binding.

### 5.3 Image worker service

| Variable | Required K6 value/source | Secret? | Railway recipient |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | No | `image-worker` |
| `NODE_NAME` | service identity/default | No | `image-worker` |
| `MONGO_URI` | Atlas `shot-chat` URI | Yes | `image-worker` |
| `REDIS_URL` | Upstash `rediss` URL | Yes | `image-worker` |
| `RABBITMQ_URL` | CloudAMQP AMQPS URL | Yes | `image-worker` |
| `RABBITMQ_MAX_ATTEMPTS` | `3` | No | `image-worker` |
| `RABBITMQ_RETRY_DELAY_MS` | `30000` | No | `image-worker` |
| `RABBITMQ_WORKER_RECONNECT_DELAY_MS` | `1000` | No | `image-worker` |
| `RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS` | `30000` | No | `image-worker` |
| `IMAGE_WORKER_CONCURRENCY` | `2` | No | `image-worker` |
| `AWS_REGION` | `ap-southeast-1` | No | `image-worker` |
| `AWS_ACCESS_KEY_ID` | dedicated prefix-scoped IAM key for internal validation while upload remains false | Yes | `image-worker` only |
| `AWS_SECRET_ACCESS_KEY` | matching IAM secret for internal validation while upload remains false | Yes | `image-worker` only |
| `AWS_S3_BUCKET_NAME` | `kittachat-public-demo-nhibuaa` | No | `image-worker` |

The image worker receives no JWT, refresh secret, CORS origin, public URL, Firebase, email, or
Google credential. `REDIS_URL` is intentionally retained: `startImageWorker` calls
`connectCacheRedis()`, and then `createSocketEmitter()` creates Redis publisher/subscriber clients
for the Socket.IO adapter used to emit `fileProcessed` and `avatarUpdated` events. Its MongoDB access
is required by the existing File/User processing path; this is a known privilege surface to verify
during implementation review. The binding is therefore evidence-backed, not defensive over-injection.

### 5.4 Audit worker, excluded notification target, and seed job

| Variable | `audit-worker` | `notification-worker` | One-off seed job |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | Not bound | As needed |
| `NODE_NAME` | service identity/default | Not bound | Not required |
| `RABBITMQ_URL` | Yes | Not bound | Not required |
| `RABBITMQ_MAX_ATTEMPTS` | `3` | Not bound | Not required |
| `RABBITMQ_RETRY_DELAY_MS` | `30000` | Not bound | Not required |
| `RABBITMQ_WORKER_RECONNECT_DELAY_MS` | `1000` | Not bound | Not required |
| `RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS` | `30000` | Not bound | Not required |
| `AUDIT_WORKER_CONCURRENCY` | `10` | Not bound | Not required |
| `MONGO_URI` | No | Not bound | Yes, D2 one-off only |
| `DEMO_SEED_PASSWORD` | No | Not bound | Yes, D2 secret-safe one-off only |
| `ALLOW_REMOTE_DEMO_SEED` | No | Not bound | `true` only for the approved one-off seed command |

The notification-worker target remains an existing Railway target but receives no image, command,
secrets, or runtime traffic in K6. `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS`, Firebase Admin
credentials, and Firebase web values are not bound to any K6 service.

## 6. Health, readiness, and public response contract

This revision explicitly supersedes earlier S1 wording that made backend `/healthz` the Railway
readiness authority.

| Surface | Authority/meaning | Exposure | Railway use |
| --- | --- | --- | --- |
| Backend `GET /readyz` | Authoritative application readiness; ready only when MongoDB and Redis are connected | Private backend service; edge may expose only a sanitized status | Backend Railway healthcheck, D2-read back |
| Edge `GET /healthz` | Edge process liveness only; does not claim backend/provider readiness | Public | Edge Railway healthcheck and public smoke test |
| Backend `GET /healthz` | Private diagnostic health/degraded signal, not Railway readiness authority | Private only | Optional internal diagnostic |
| Edge `GET /readyz` | If retained, sanitized projection of backend readiness (`ready`/`not_ready` only) | Public | Public smoke test only; not a provider diagnostic |
| Edge `GET /backend-healthz` | Internal-only route or removed from public route map | Private/internal | Never a public dependency-status endpoint |
| `/ops` | Internal operational route | Private/internal only | No public edge route |
| `/metrics` | Not registered with `METRICS_ENABLED=false`; no edge proxy | Not public | No Railway scrape |

MongoDB or Redis unavailable means backend `/readyz` is `503`/not ready. RabbitMQ degradation may
make private diagnostics degraded, but does not make the MongoDB/Redis readiness contract false.
The public `edge /healthz` may remain `200` while backend readiness is not ready; this distinction is
intentional.

Every public health response must be minimal and secret-safe. It must not include provider names,
private hostnames, connection strings, usernames, secret-bearing error messages, process IDs,
memory, active sockets, or dependency-by-dependency detail. The current verbose health payload is
therefore not acceptable on a public surface and must be sanitized in the implementation slice.

## 7. WebRTC dependency and readiness design

The current client `ICE_SERVERS` contains `stun:stun.l.google.com:19302` and
`stun:global.stun.twilio.com:3478`; no TURN server is configured and no TURN variable is currently
consumed. Socket.IO signaling and Redis call coordination do not guarantee that a media path can be
established through NAT, symmetric NAT, enterprise firewalls, or restrictive recruiter networks.

The implementation seam must make the ICE list target-configurable without placing long-lived TURN
credentials in a Vite bundle. Non-secret STUN URLs may be in the runtime capability document. If a
TURN provider is selected, the browser must receive short-lived/ephemeral TURN credentials through
the approved call configuration path; provider master credentials remain backend-only. No TURN
provider is claimed as bound by S1.

D2 call acceptance is a media test, not just a signaling test:

1. Two authenticated demo principals establish a Socket.IO call through the public edge.
2. Both browsers obtain microphone/camera permission and exchange offer/answer.
3. ICE reaches a connected/completed state and bidirectional media is observable.
4. Call end writes the existing call-history result and both clients recover to the idle state.
5. The case is repeated from the approved browser/network matrix, with no call secret or token in
   evidence.

If signaling works but ICE/media fails, the call case is `FAIL` or `BLOCKED` according to whether the
failure is a product defect or missing provider/network capability. K6 cannot be marked stable or
complete from signaling-only evidence. No automatic scope downgrade to remove calls is allowed; a
TURN binding or an explicit scope-change approval is required.

## 8. Bounded D2 upload activation sequence

Upload remains fail-closed until every gate below passes. A missing S3 secret is not the capability
switch.

1. D2 approval confirms the exact bucket, IAM principal, approved prefixes, and credential owner.
2. Bind the AWS credential only to `backend` and `image-worker`; do not bind it to edge, audit, or
   notification services.
3. Keep `K6_CAPABILITY_UPLOAD=false` and hide upload controls/routes while running internal,
   secret-safe provider checks: SDK authentication, `PutObject`, `GetObject`, `DeleteObject`,
   multipart initiate/part/complete/abort, image-worker processing, cleanup, and outside-prefix
   rejection.
4. Resolve the current `queue-sources/*` mismatch. The implementation must either map temporary
   sources into an explicitly approved prefix policy or obtain a new scope approval; it must not
   write outside `uploads/*` and `avatars/*` under the existing S1 contract.
5. Read back the exact Railway-generated edge origin. Finalize S3 CORS with that exact origin,
   `PUT`, and `ETag` exposure. Wildcard origin remains forbidden.
6. Set the backend and edge capability to `upload=true` only after steps 1–5 pass. Restart/redeploy
   the affected immutable revision under the D2 procedure.
7. Run browser acceptance for single upload, multipart upload, presigned `PUT`, readable `ETag`,
   download authorization, image processing, cleanup, MIME/size rejection, and outside-prefix
   rejection.

Any failed internal check leaves upload disabled. It does not justify a core-only scope claim without
a separate maintainer scope-change approval.

## 9. Seeded accounts, self-signup, reset, and cleanup

### Seed contract

- The deterministic demo namespace is `kittachat-demo`.
- Seeded users are the repository-defined `.test` identities, including
  `alice@kittachat.test` and `bob@kittachat.test`; the complete non-personal catalog remains in the
  seed module.
- The seed password is one maintainer-controlled demo credential and is not recorded in this
  document, chat, or evidence. If it is intentionally published for recruiters, that is a separate
  maintainer decision for the final README.
- The seed operation is one-off, explicitly invoked, and guarded by `ALLOW_REMOTE_DEMO_SEED=true`.
  It is never a startup hook.
- User, group, file, message, conversation, and participant records are upserted by stable demo
  keys/identifiers. Re-running the same seed is idempotent and must not duplicate records.
- A reset/cleanup operation, when needed, may delete only the known demo namespace, seed emails,
  seed request IDs, and seed conversation keys in the dedicated Atlas project. It must be explicit,
  operator-owned, dry-run capable, and never run against a non-demo target.

### Self-signup policy

- Self-signup remains enabled, but `K6_SYNTHETIC_SIGNUP_ONLY=true` makes the synthetic identity
  boundary server-enforced rather than instructional. On the public-demo target, the registration
  controller must accept only normalized email addresses whose domain is in the `.test` namespace
  (for example `visitor-123@kittachat.test`) and must reject public domains before persistence.
- This guard applies at the backend registration seam regardless of whether the request came through
  the SPA, a direct HTTP client, or a future edge route. The existing registration request/response
  shape remains unchanged; only the existing validation-error path is used for rejection. The UI may
  explain the synthetic-only rule, but the UI is not the enforcement mechanism.
- Display names and other registration fields remain synthetic-demo data under the operating policy;
  the server-side `.test` namespace is the non-bypassable identity boundary for persisted self-signup
  accounts. Demo instructions must still tell users not to submit personal, sensitive, or production
  information.
- Existing nginx auth IP throttling and existing backend auth/rate-limit policy IDs are the only
  protection basis in K6. No new quota or numeric tuning is introduced by Phase 2.
- Registration rate-limit exhaustion returns the existing bounded `429`/retry behavior; limiter
  unavailability follows the existing fail-closed contract. D2 must verify that the registration
  path cannot be bypassed through an alternate edge route.
- Seeded accounts and self-signup accounts are reset/retained according to the dedicated demo data
  policy, never mixed with personal data.

## 10. D2 authorization and execution contracts

The previous single “D2 packet” is split into two records with different creation boundaries. The
first is a pre-approval request; the second is append-only evidence created only after approval and
after the corresponding action has occurred. Neither record contains credential values.

### A. D2 Authorization Request — pre-approval contract

This record is the human approval request. It may contain plans and identities already known without
crossing D2, but it must not require outputs that can exist only after D2 authority is granted.

Required fields:

- reviewed commit SHA, fixed before the request is submitted;
- GHCR package names `ghcr.io/nhibuaa/kitta-chat-edge` and
  `ghcr.io/nhibuaa/kitta-chat-server`; no image digest is required or asserted here;
- Railway project/environment/service IDs, intended region, and intended public/private topology;
- provider resource identities and credential owners for Atlas, Upstash, CloudAMQP, and S3;
- intended service/secret binding matrix from section 5, with secret names/locations but no values;
- intended Railway healthcheck paths: backend `/readyz` and edge `/healthz`;
- initial capability state: upload false, recovery false, Google login false, metrics export false,
  Issue #61 measurement false, and calls pending the later media acceptance;
- expected resources, cost ceiling, expected downtime, rollback policy, and first-deployment
  exception policy;
- seed/self-signup policy, no-personal-data rule, and manual-guide scope;
- the exact actions for which D2 authority is requested:
  1. create or rotate only the approved application credentials in provider secret managers;
  2. bind those credentials to the intended Railway services;
  3. publish immutable GHCR images from the reviewed commit;
  4. read back Railway hostnames and configure intended environment values;
  5. bind image digests and rollout backend, workers, and edge in the approved order;
  6. finalize exact-origin S3 CORS after the real edge origin exists;
  7. run internal provider checks while upload remains fail-closed;
  8. enable upload only after its gates pass;
  9. run the one-off demo seed and deployed-target manual acceptance;
  10. record stable and rollback evidence.
- explicit exclusions: no `latest` deployment authority, no manual RabbitMQ queue provisioning, no
  notification-worker rollout, no startup migration, no public `/ops` or `/metrics`, no Issue #61
  measurement, and no production claim.

The Authorization Request must not require actual immutable image digests, generated public/private
hostnames, exact derived `URL_FRONTEND`, exact derived `CORS_ALLOWED_ORIGINS`, live healthcheck
read-back, final S3 CORS, Railway revision IDs, provider connectivity, manual acceptance, or rollback
results. Those are execution outputs.

### B. D2 Execution Evidence Record — post-approval contract

This record may be populated only after the Authorization Request has a human approval timestamp and
the relevant action is authorized. It records actual results, not intended values:

- human approval reference and approved request hash/identifier;
- actual immutable GHCR image digests linked to the reviewed commit SHA;
- Railway generated public edge hostname and private service hostnames;
- exact applied `URL_FRONTEND`, `CORS_ALLOWED_ORIGINS`, and `BACKEND_UPSTREAM`;
- live Railway region and healthcheck setting read-back;
- final exact-origin S3 CORS read-back and upload capability transition;
- Railway deployment/revision IDs and dependency-order timestamps;
- secret-safe Atlas, Upstash, CloudAMQP, and S3 connectivity/compatibility evidence;
- readiness/liveness results for backend `/readyz` and edge `/healthz`;
- seeded-account, self-signup, WebSocket, chat/group/sidebar, call, and conditional-upload manual
  acceptance records;
- failed candidate digest, restored known-good digest, or the first-deployment fallback result;
- any `BLOCKED`, `FAIL`, or `PASS` disposition with the maintainer decision that followed.

### D2 sequence

Pre-D2 work is limited to design, decomposition, source implementation after the relevant approval,
automated tests, Docker build validation, workflow/descriptors preparation, a locked manual guide,
and candidate configuration review. Pre-D2 work must not publish GHCR deployment artifacts, create or
bind credentials, read back D2-only hostnames/digests, roll out Railway workloads, or execute manual
acceptance that requires a deployed target.

After the D2 Authorization Request is human-approved:

1. Confirm provider resources and create/rotate only the required application credentials in the
   provider secret managers. AWS access-key creation occurs here; values are never sent to chat.
2. Publish the reviewed commit to GHCR through the least-privilege GitHub Actions workflow and
   capture actual digests in the Execution Evidence Record. Do not publish `latest` as authority.
3. Read back Railway service private hostnames and the generated edge hostname. If the platform
   cannot provide these values without the approved mutation, stop and return `BLOCKED`.
4. Apply backend `URL_FRONTEND` and `CORS_ALLOWED_ORIGINS` from the exact edge origin. Bind secrets
   only to the recipients in section 5. Keep upload false and notification-worker absent.
5. Roll out the immutable backend digest and wait for private `/readyz=200`. Do not run startup
   migrations. If the backend is not ready, stop before public edge rollout.
6. Roll out image-worker and audit-worker in dependency order; verify RabbitMQ topology through the
   application contract. Do not manually create the nine queues. Keep notification-worker excluded.
7. Roll out the immutable edge digest with private `BACKEND_UPSTREAM`; verify public `/healthz`,
   sanitized `/readyz` if exposed, `/api`, SPA fallback, and Socket.IO upgrade.
8. Perform fail-closed S3 internal checks, finalize exact-origin CORS, then enable upload only after
   the section 8 gates pass.
9. Run the one-off idempotent demo seed with secret-safe environment injection; never seed on
   process startup.
10. Execute the locked deployed-target manual acceptance guide and append results to the Execution
    Evidence Record.
11. Mark a revision stable only after all required cases pass. Record the stable digest/revision as
    the known-good rollback target.

### Rollout failure and rollback

- Stop on health, migration, provider, or acceptance failure. Do not auto-rollback through a
  migration marker.
- If no migration marker exists, the maintainer may approve one rollback to the previous known-good
  immutable digest/revision. Verify backend `/readyz` and edge `/healthz` after restoration.
- Record the failed candidate digest, restored digest, revision IDs, timestamps, reason, and health
  results. `latest` is never a rollback reference.
- On the first deployment, if no prior stable public-demo revision exists, the packet must state
  that fact and define the fallback as disabling public ingress/target services pending maintainer
  decision. K6 cannot claim prior-revision rollback evidence until a first stable revision is
  recorded.

## 11. Verification seams for later implementation and D2

Phase 3 may decompose only these bounded slices after this design is approved:

1. target configuration, runtime capability document, and Vite same-origin build contract;
2. configurable nginx upstream and sanitized edge route/health contract;
3. backend capability gates and least-privilege environment validation;
4. S3 prefix/CORS/upload activation boundary, including the `queue-sources` disposition;
5. ICE configuration seam and call media acceptance fixture;
6. immutable GHCR publication and Railway service descriptors;
7. idempotent demo seed/reset operating guide;
8. locked manual acceptance and evidence aggregation.

The required automated seams are target validation, edge route rendering, capability fail-closed
behavior, health/readiness semantics, origin policy, S3 mock/provider boundary, worker env
validation, queue topology, ICE configuration, and seed idempotency. The required D2 manual seams
are exact target identity, commit-to-digest-to-revision lineage, provider connectivity, WebSocket
handshake, authenticated direct/group/sidebar/call behavior, conditional upload, disabled routes,
secret-safe logs, and rollback evidence.

## 12. Remaining unresolved risks

These risks are explicit and must not be silently converted into Pass:

- **TURN gap:** current WebRTC is STUN-only. A public call path may fail on restrictive networks;
  D2 must either pass the approved media matrix or obtain an explicit TURN/provider decision.
- **S3 prefix gap:** current `queue-sources/*` behavior is outside the S1-approved prefix list;
  upload cannot be enabled before implementation resolves it.
- **Private-object URL gap:** no CloudFront is selected and some current file/image paths construct
  direct S3 URLs. D2 upload acceptance must prove private downloads work or implementation must use
  presigned/approved delivery consistently.
- **Provider live compatibility:** Atlas connectivity, Upstash Node Redis/Socket.IO/Lua behavior,
  CloudAMQP nine-queue operations, and S3 SDK/worker behavior remain PENDING_D2. CloudAMQP permission
  regexes remain NOT_ASSERTED.
- **Public health sanitization:** current health payloads include details that are not suitable for
  public exposure; implementation must create the minimal public projection.
- **First-deployment rollback:** there may be no prior stable Railway revision; the D2 packet must
  use the explicit first-deployment fallback until a stable digest exists.
- **Disabled UI routes:** current frontend contains Google/recovery flows; implementation must gate
  both UI controls and direct routes using the runtime capability document.

## Phase 2 approval checkpoint

`PHASE_2_APPROVED_FOR_PHASE_3_DECOMPOSITION`

The maintainer approved the Phase 2 consistency revision. The eight prior architecture deltas and
the remaining consistency corrections are accepted without redesigning ADR-016: separate D2
Authorization Request versus Execution Evidence Record, ledger ordering, server-enforced `.test`
self-signup, evidence-backed image-worker Redis binding, and continued explicit treatment of the
later implementation/D2 risks.

The valid next transition is Phase 3 ticket decomposition/cadence. `to-tickets` must present the
vertical slices and blocking edges for maintainer approval before publishing issues. Runtime
implementation, secret creation, image publication, Railway mutation, deployment, and Issue #61
measurement remain unauthorized.
