# K6 Railway Public Demo — Target-Binding Record

## Status

`S1_PROVIDER_BINDING_RECORDED_PHASE2_PENDING`

The maintainer target-binding packet was supplied in the current execution context. The identifiers
below were first checked for UUID shape and uniqueness, then read back through the authenticated
Railway CLI with an explicit project/environment query on 2026-08-20. The read-back confirms the
project, environment, service names/IDs, an empty `serviceInstances` set, and an empty
`volumeInstances` set. The maintainer has separately bound the intended region and Atlas egress
strategy; runtime region read-back, public hostname, private hostnames, and health check settings
remain D2-bound. This is not a D2 deployment approval and does not authorize Railway or registry
mutation.

## Maintainer packet provenance

- Target packet scope: S1 continuation only.
- Project/environment currently report no `serviceInstances`.
- No runtime workload, image publication, provider mutation, secret creation, or D2 action was performed.
- All secret values remain excluded from this record.
- This checkpoint records provider-resource requirements and non-secret evidence requirements; it does
  not request or store secret values.

## Requested target

| Field | Binding | Evidence/status |
| --- | --- | --- |
| Provider | Railway | Bound by packet; project/environment read-back succeeded |
| Project | `kittachat-public-demo` | Bound; project ID `6b2778fb-27f8-4b06-bcce-a697f4a40908` |
| Environment | `public-demo` | Bound; environment ID `a0121f42-f7b6-4fe7-8acb-be8e9eb28c5c` |
| Region | Southeast Asia Metal, Singapore, `asia-southeast1-eqsg3a` | Bound by maintainer decision; runtime region read-back remains D2-bound |
| Public URL/domain | Railway-generated HTTPS domain on edge:80 | `PENDING_D2`; exact hostname is runtime evidence, not an S1 blocker |
| Exact CORS origin | exact same-origin of generated edge domain | `PENDING_D2`; derived `URL_FRONTEND`/`CORS_ALLOWED_ORIGINS` are not materialized in S1 |
| Cost ceiling | cost-optimized/free-tier strategy; exact ceiling pending D2 | Railway Hobby fallback requires maintainer approval if free-tier limits block safe deployment |
| Rollback owner | maintainer | Bound by packet; recovery objective `<= 5 minutes` |
| Expected downtime | zero user-visible downtime where supported | Actual downtime remains D2 verification |
| Health endpoint owner | backend owns application health/readiness semantics; edge owns ingress health | backend `GET /healthz` plus `/readyz` readiness detail, edge `GET /healthz`; Railway settings D2-bound |

## Expected service topology (application service IDs read back; no instances)

| Role | Required binding | Current state |
| --- | --- | --- |
| Public nginx/frontend edge | one public Railway service | `edge`, service ID `8f6c46c6-0a82-4dc0-b9c6-6ff7bf272f58` read back; no instance or public domain |
| Backend | exactly one instance | `backend`, service ID `e01ae8b7-2e11-4776-96b0-576b0470a8bb` read back; no instance/private hostname |
| Image worker | one worker service | `image-worker`, service ID `fefd7765-616b-4148-9a6d-83ad959e9aa7` read back; no instance; RabbitMQ/S3 validation pending |
| Audit worker | one worker service | `audit-worker`, service ID `ae3c0006-ed8c-4f69-a585-1afb931f23c6` read back; no instance; RabbitMQ validation pending |
| MongoDB | durable database provider/service | MongoDB Atlas Free S1 evidence recorded for dedicated `kitta-chat` / `Cluster0` in Hong Kong; live Railway connectivity remains D2-bound |
| Redis | one coordination/cache provider/service | Upstash S1 resource evidence and accepted K6 application-client topology recorded for `kittachat-public-demo` in Singapore; provider-internal mode intentionally unasserted; live compatibility remains D2-bound; Railway fallback provisioning previously hit free-plan limit |
| RabbitMQ | background queue provider/service | CloudAMQP `kittachat-public-demo`, Little Lemur/RabbitMQ `4.2.7`, AWS `ap-southeast-1`, AMQPS `armadillo.rmq.cloudamqp.com:5671`, user/vhost `bptdlerq`, quotas and zero current connections/queues recorded; permission regexes are `NOT_ASSERTED`, live topology remains D2 |
| S3-compatible storage | hard prerequisite for upload scope | AWS `kittachat-public-demo-nhibuaa` in `ap-southeast-1`; private controls, prefix-scoped IAM policy, lifecycle, and D2-bound CORS evidence recorded; access key/live upload remain D2 |
| Notification worker | target exists but excluded from K6 runtime topology | Service ID `4cfa1dba-7b5c-453b-a11f-b83e9fdca65c` read back; recovery disabled, so no K6 dependency |

Railway's documented private DNS pattern is `<service-name>.railway.internal`; the actual names
must be copied from the provisioned target and bound through provider variables, not inferred from
local Compose names.

## Artifact and registry binding

| Field | Binding | Current state |
| --- | --- | --- |
| Registry | GHCR | `ghcr.io/nhibuaa`; public visibility target; Railway pull credentials not required for public images |
| Exact image package names | S1 decision | `ghcr.io/nhibuaa/kitta-chat-server` for backend/image-worker/audit-worker; `ghcr.io/nhibuaa/kitta-chat-edge` for edge |
| Server/worker image | immutable digest | `PENDING_D2`; no image built or digest available in S1 |
| nginx/frontend image | immutable digest | `PENDING_D2`; no image built or digest available in S1 |
| GitHub Actions package permission | minimum `packages:write` as needed | Actual publication remains D2-bound by packet |
| Railway pull permission | public image pull | No private registry credential needed; actual image binding remains D2-bound |
| Auto Deploy | off | Locked K6 decision; not configured/verified |

## Observed Railway target metadata

| Item | Value | Disposition |
| --- | --- | --- |
| Project service targets | edge, backend, image-worker, notification-worker, audit-worker | Authenticated CLI read-back; no service instances currently present |
| Environment instances | `serviceInstances: []`, `volumeInstances: []` | Authenticated CLI read-back; no runtime or volume deployment observed |
| Observed bucket | `stashed-drum`, ID `94beb966-22d9-4d9f-a948-e7485acc2028` | Explicitly not authoritative for K6 object storage; do not use without a later maintainer confirmation |

## Provider candidate disposition

| Candidate | S1 compatibility result | Remaining proof |
| --- | --- | --- |
| MongoDB Atlas Free | S1 evidence recorded: dedicated `kitta-chat` project, `Cluster0`, M0/Free, AWS Hong Kong, TLS/auth enabled, `kittachat-demo` `readWrite` scoped to `shot-chat`, and explicit `0.0.0.0/0` demo exception. | This is a demo-only cost trade-off, not a production recommendation. Actual Railway-to-Atlas connectivity remains D2 live evidence. See [MongoDB Atlas evidence](k6-public-demo-s1-mongodb-atlas-evidence.md). |
| Upstash Redis Free | S1 resource evidence and accepted application-client topology: `kittachat-public-demo`, Free Tier, AWS Singapore `ap-southeast-1`, 256 MB/500000 commands/50 GB bandwidth, native Redis TCP `rediss`/TLS, one endpoint, no read regions, empty `REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES`. | Provider-internal standalone/non-cluster mode remains intentionally unasserted; no K6 repository contract requires that claim. Node Redis, Socket.IO, Lua `EVAL`/`TIME`, readiness, and live Railway connectivity remain D2. See [Upstash evidence](k6-public-demo-s1-upstash-evidence.md). |
| CloudAMQP Little Lemur | S1 resource metadata and provider-managed boundary recorded: `kittachat-public-demo`, RabbitMQ `4.2.7`, AWS `ap-southeast-1`, AMQPS `armadillo.rmq.cloudamqp.com:5671`, user/vhost `bptdlerq`, quotas, and 0 open connections/0 queues. | `configure`/`write`/`read` regexes are `NOT_ASSERTED`; queue declaration/use, retry/DLQ, worker behavior, and Railway connectivity remain D2-bound. See [CloudAMQP evidence](k6-public-demo-s1-cloudamqp-evidence.md). |
| AWS S3 public-demo bucket | S1 resource/security evidence recorded: private bucket `kittachat-public-demo-nhibuaa`, Block Public Access, owner-enforced ACLs disabled, SSE-S3, prefixes `uploads/*`/`avatars/*`, customer-managed prefix-scoped IAM policy, and 7-day incomplete multipart cleanup. | Access key is `NOT_CREATED`; exact Railway-origin CORS, AWS SDK auth, multipart, presigned `PUT`/`ETag`, worker processing, and live connectivity remain D2. See [S3 evidence](k6-public-demo-s1-s3-evidence.md). |

## Secret ownership (names only; values excluded)

| Owner | Secret/configuration keys | Status |
| --- | --- | --- |
| Railway environment secret manager | `JWT_SECRET`, `MONGO_URI`, `REDIS_URL`, `RABBITMQ_URL`, S3 credentials, and any provider-specific credentials | Values not requested or recorded; S3 access key is not created at S1 and final binding remains D2-bound |
| Railway service variables | `URL_FRONTEND`, `CORS_ALLOWED_ORIGINS`, `PORT`, capability flags, metrics flag, worker settings | Exact values depend on target binding; not materialized |
| GitHub Actions secrets | GHCR publish credential if `GITHUB_TOKEN` is insufficient | Permission model pending; no value inspected |

## Preflight evidence

- Base `main` commit: `72a9828579f34c0b88c9c8a1c51c2c4f8225c1ca`.
- Feature branch: `nhibuaa/k6-public-demo`.
- `railway status` without a linked project reports no linked project; explicit project/environment status query is available.
- Explicit Railway read-back: `railway status --project 6b2778fb-27f8-4b06-bcce-a697f4a40908 --environment a0121f42-f7b6-4fe7-8acb-be8e9eb28c5c --json` exit `0`; project/environment/service IDs match the packet and both `serviceInstances` and `volumeInstances` are empty.
- Provider environment-key check: no `RAILWAY_*`, `GHCR_*`, `GITHUB_TOKEN`, or registry key names present.
- Repository manifest check: no `railway.json` or `railway.toml` present.
- Baseline `npm run ci:validate`: exit `0`.
- Baseline `npm run test:ci`: `132/132` passed, exit `0`.
- Baseline `git diff --check`: exit `0`.
- Maintainer packet UUID validation: `8` IDs parsed and `8` unique, exit `0`.
- Redis candidate static compatibility check: `rediss`, TLS, duplicate client and Socket.IO adapter factory reported valid, exit `0`.
- AMQPS candidate static compatibility check: `amqps`, port `5671`, and `9` declared queues reported valid, exit `0`.
- Maintainer CloudAMQP read-back recorded: `kittachat-public-demo`, `Little Lemur` RabbitMQ `4.2.7`,
  AWS `ap-southeast-1`, AMQPS cluster hostname `armadillo.rmq.cloudamqp.com`, TLS port `5671`,
  user/vhost `bptdlerq`, quotas, and 0 open connections/0 queues. The shared Admin UI does not
  expose permission regexes, so `configure`/`write`/`read` are `NOT_ASSERTED`.
- Focused provider-boundary tests: `44/44` passed (`envValidation`, health, RabbitMQ, S3 mock boundary).
- No deployment, registry login, provider provisioning, domain mutation, secret creation, project linking, or runtime change performed.

## Remaining S1 blockers

None for non-secret resource/security binding. Credential handling is recorded as follows: MongoDB
credential ownership is the maintainer password manager until D2 Railway binding; Upstash and
CloudAMQP credentials remain outside Git/chat/evidence until D2 binding; the S3 access key is not
created at S1. No secret value is requested or recorded.

CloudAMQP permission regexes remain `NOT_ASSERTED` as an accepted provider UI limitation, not an
S1 metadata blocker. AWS S3 resource/security readiness is recorded; exact CORS, credential
creation/binding, upload, worker behavior, and connectivity remain D2 validation requirements.

S1 provider-binding evidence is complete for the selected MongoDB, Redis, RabbitMQ, and S3
resources. Phase 2 specification/design and its authorization gate are the next transition; this
record does not authorize implementation, image publication, deployment, or D2.

The exact minimum resource set and evidence return format are recorded in
[k6-public-demo-s1-resource-readiness.md](k6-public-demo-s1-resource-readiness.md).
The MongoDB Atlas evidence record is [k6-public-demo-s1-mongodb-atlas-evidence.md](k6-public-demo-s1-mongodb-atlas-evidence.md).

The following are explicitly not S1 blockers and must remain `PENDING_D2`: generated edge hostname,
derived `URL_FRONTEND`, derived `CORS_ALLOWED_ORIGINS`, actual GHCR image digests, Railway private
runtime hostnames, live Railway healthcheck settings, Railway runtime-region read-back, Railway
service-variable/secret binding, and live Railway-to-provider connectivity.

## D2 prerequisite packet

Before D2, the maintainer must return the remaining non-secret resource evidence in
`k6-public-demo-s1-resource-readiness.md`, then confirm the allocated hostname, derived CORS values,
exact image digests, Railway healthcheck/private-host settings, cost ceiling, rollback owner,
expected downtime, GHCR/Railway permissions, and secret ownership in the D2 packet. Secret values
must not be sent in chat.

Until the S1 provider-resource evidence is returned, Phase 2/implementation and D2 rollout claims
must not be recorded. The supplied decisions close the region and Atlas-network decision gaps but
are not sufficient to authorize D2.
