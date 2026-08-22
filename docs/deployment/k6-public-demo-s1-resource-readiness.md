# K6 S1 — Minimum provider resources and evidence contract

## Purpose and boundary

This record turns the maintainer's 2026-08-20 decisions into the smallest resource set that must
exist before D2 approval can be considered. It is an S1 target-binding artifact, not a deployment
instruction.

S1 may establish external provider resource identity, security posture, plan/region metadata,
capacity compatibility, and secret ownership. S1 does not deploy KittaChat workloads, bind runtime
secrets to Railway services, publish images, obtain image digests, allocate the Railway-generated
hostname, or claim live application connectivity. Those items remain D2-bound where stated below.

Secret values, connection strings containing credentials, access keys, passwords, tokens, and
private keys must stay in the provider/Railway/GitHub secret manager. They must not be returned in
chat, committed to Git, or written into evidence.

## Locked target decisions

| Decision | Binding | Evidence boundary |
| --- | --- | --- |
| Railway region | Southeast Asia Metal, Singapore, `asia-southeast1-eqsg3a` | Maintainer decision is S1-bound; runtime region read-back remains D2-bound |
| MongoDB | Dedicated MongoDB Atlas Free project/cluster | `0.0.0.0/0` is an explicit demo-only exception with compensating controls; Railway-to-Atlas connectivity remains D2 live evidence |
| GHCR server/worker package | `ghcr.io/nhibuaa/kitta-chat-server` | Package name fixed in S1; publication and immutable digest remain D2-bound |
| GHCR edge package | `ghcr.io/nhibuaa/kitta-chat-edge` | Package name fixed in S1; publication and immutable digest remain D2-bound |
| Worker image reuse | Backend, image-worker, and audit-worker use the server/worker package with service-specific commands | No separate notification-worker image is required in K6 because recovery/password reset is disabled |
| Railway hostname/CORS | Generated edge hostname, then exact `URL_FRONTEND` and `CORS_ALLOWED_ORIGINS` | Runtime allocation and derived values remain D2-bound |

## Current S1 evidence status

| Provider | S1 resource/security evidence | Live connectivity |
| --- | --- | --- |
| MongoDB Atlas Free | `RECORDED`: dedicated `kitta-chat` / `Cluster0`, M0/Free, AWS Hong Kong, TLS/auth enabled, `kittachat-demo` `readWrite` scoped to `shot-chat`, explicit `0.0.0.0/0` demo exception | `PENDING_D2` |
| Upstash Redis Free | `RECORDED`: resource, region, quota, native `rediss`/TLS, credential ownership, and accepted single-endpoint application-client topology; provider-internal mode remains unasserted by design | `PENDING_D2` |
| CloudAMQP Little Lemur | `RECORDED`: `kittachat-public-demo`, RabbitMQ `4.2.7`, AWS `ap-southeast-1`, AMQPS endpoint metadata, `bptdlerq` user/vhost, quotas, and 0 open connections/0 queues recorded; `configure`/`write`/`read` permission regexes remain explicitly `NOT_ASSERTED` | `PENDING_D2` |
| AWS S3 | `RECORDED`: dedicated private `kittachat-public-demo-nhibuaa` bucket in AWS `ap-southeast-1`, Block Public Access, owner-enforced ACLs disabled, SSE-S3, prefix-scoped customer-managed IAM policy, 7-day incomplete multipart cleanup, and D2-bound exact-origin CORS recorded | `PENDING_D2` |

The MongoDB evidence is retained in
`docs/deployment/k6-public-demo-s1-mongodb-atlas-evidence.md`. Its Hong Kong provider region is
separate from the Railway Singapore application region.
The Upstash evidence is retained in `docs/deployment/k6-public-demo-s1-upstash-evidence.md`.
The CloudAMQP evidence is retained in
`docs/deployment/k6-public-demo-s1-cloudamqp-evidence.md`. It accepts the provider-managed
application vhost/user boundary without asserting least-privilege permission regexes or provider
policies that the shared-plan UI does not expose.
The AWS S3 evidence is retained in
`docs/deployment/k6-public-demo-s1-s3-evidence.md`. It records the private bucket and
prefix-scoped IAM boundary; access-key creation, exact-origin CORS, and live upload behavior remain
`PENDING_D2`.

## Minimum resources to create or bind during S1

### 1. MongoDB Atlas Free

Minimum resource set:

- one dedicated MongoDB Atlas project for the KittaChat public demo;
- one MongoDB Atlas Free/M0 cluster in a maintainer-selected region;
- one application database user with the minimum permissions required by the KittaChat backend and
  image worker;
- one Atlas IP access-list entry `0.0.0.0/0` in this dedicated demo project, documented as the
  explicit cost-constrained demo exception;
- TLS/authentication enabled, with a strong unique database credential held only by the provider or
  Railway secret manager.

Why it is needed before D2:

- MongoDB is the durable source of truth and is required for backend readiness and the image worker.
- The D2 packet must identify the exact durable target and its security exception before any Railway
  runtime can be authorized.
- The dedicated project and demo-only dataset prevent the wildcard allowlist from applying to
  personal, sensitive, or production data.

Non-secret evidence to return:

- Atlas project and cluster names/IDs;
- selected Atlas region and Free/M0 plan;
- TLS and authentication enabled status;
- the allowlist entry shown exactly as `0.0.0.0/0`, with the project explicitly identified as the
  KittaChat public-demo project;
- application database username identifier and role names only, never the password or URI;
- confirmation that the cluster contains only `.test`/seed/demo data;
- the exact compensating controls: dedicated project, TLS, unique credential, minimum role, and
  no production/personal data.

D2-only evidence:

- Railway-to-Atlas connection from the actual backend/image-worker runtime;
- `/readyz` readiness with Atlas connected;
- any runtime region/egress observation.

### 2. Upstash Redis Free

Minimum resource set:

- one Upstash Redis database dedicated to KittaChat public-demo;
- native Redis TLS endpoint (`rediss://` semantics), not only an HTTP/REST endpoint;
- one database credential stored only in the provider or Railway secret manager.

The K6 application-client topology is one endpoint with one primary region, no additional read
regions, and an empty `REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES`. This is a configuration statement
about KittaChat's client path. Provider-internal standalone/non-cluster architecture is not a
required S1 evidence claim and must remain unasserted.

The database must support the existing repository boundary: native Redis authentication over TLS,
Lua `EVAL`, `TIME`, sorted sets, hashes, TTL/PEXPIRE, and Pub/Sub. The repository uses Redis for
cache/presence, distributed rate limiting, call coordination, and the Socket.IO Redis adapter.
`REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES` remains empty for this single-database target.

Current maintainer evidence records database `kittachat-public-demo` in AWS Singapore
(`ap-southeast-1`), Free Tier quotas of 256 MB storage, 500000 commands/month and 50 GB/month
bandwidth, native `rediss` TCP/TLS on port 6379, and no additional read regions. The provider UI
does not assert a provider-internal standalone/non-cluster classification. The maintainer accepts
the K6 application-client topology instead: one dedicated endpoint, no read regions, and empty
`REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES`. No provider-internal classification is inferred.

Why it is needed before D2:

- Redis is a backend readiness dependency, not an optional cache for this topology.
- The exact database mode and provider limits must be known before approving Socket.IO, call,
  rate-limit, and reconnect acceptance on Railway.
- A REST-only or command-incompatible database would pass URI checks but fail the real application
  contract.

Non-secret evidence to return:

- Upstash database name/ID and selected region;
- redacted endpoint hostname and port, with TLS enabled shown; omit username/password/token;
- plan and quota/limit summary relevant to storage, commands, bandwidth, and connections;
- confirmation that the database is standalone/non-cluster;
- provider-side or maintainer-run compatibility result for `PING`, `TIME`, a bounded Lua `EVAL`,
  sorted-set operations, hash operations, TTL/PEXPIRE, and Pub/Sub; use disposable test keys and
  return only pass/fail plus timestamps, never values containing credentials;
- confirmation that the Redis credential is stored in a secret manager and is not in Git/chat/logs.

D2-only evidence:

- actual Railway backend-to-Upstash connection;
- `/readyz` Redis readiness;
- Socket.IO handshake/reconnect and call/rate-limit acceptance against the bound runtime database.

S1 disposition:

- Resource identity and non-secret capacity/transport evidence: recorded.
- Application-client topology: accepted by maintainer disposition.
- Provider-internal architecture: intentionally unasserted; no repository K6 contract requires it.
- Live command and application compatibility: `PENDING_D2`.

### 3. CloudAMQP Little Lemur

Minimum resource set:

- one CloudAMQP Little Lemur broker instance;
- one broker vhost for KittaChat public-demo;
- one application user with the minimum configure/write/read permissions for that vhost;
- AMQPS/TLS endpoint on the provider's TLS port, with the credential stored only in the provider or
  Railway secret manager.

The application currently declares nine durable queues itself: primary, retry, and DLQ queues for
image processing, audit events, and notification email. The notification worker is excluded from
the K6 runtime topology, but its three queues are still part of the shared `QUEUE_TOPOLOGY` asserted
by the backend connection. No separate manual queue provisioning is required if the application
user can declare the nine queues with their retry TTL and dead-letter arguments.

#### Received S1 evidence and disposition

The maintainer supplied a provisioned shared `Little Lemur` RabbitMQ instance with RabbitMQ
`4.2.7`, application vhost/user identifier `bptdlerq`, and confirmation that the same credential
authenticates to the Management UI for that vhost. The provider Admin UI does not expose Users,
Virtual Hosts, or per-user `configure`/`write`/`read` permission regex configuration/read-back.

K6 therefore accepts the application credential/vhost boundary as provider-managed for S1, while
recording all three permission regexes as `NOT_ASSERTED`. This is not a least-privilege claim, does
not authorize changing provider policies, and does not prove that the credential can assert or use
the repository topology. No queue was manually provisioned during S1. See
`k6-public-demo-s1-cloudamqp-evidence.md`.

The follow-up metadata read-back identifies resource `kittachat-public-demo`, RabbitMQ `4.2.7`,
Little Lemur on AWS `ap-southeast-1`, cluster hostname `armadillo.rmq.cloudamqp.com`, node hostname
`armadillo-01.rmq.cloudamqp.com`, selected `amqps`/TLS port `5671`, application user/vhost
`bptdlerq`, and quotas of 20 open connections, 150 queues, 1,000,000 messages, 10,000 maximum
queue length, 1 GB maximum queue size, and 28 days maximum idle queue time. Current read-back is
0 open connections and 0 queues. The full URL and password remain excluded. This closes the
CloudAMQP S1 metadata gap; live queue operations remain D2-bound.

Why it is needed before D2:

- RabbitMQ is background-only but is required to exercise image processing and audit behavior.
- The broker plan must fit the declared nine-queue topology and the connection/message budget before
  D2 approval.
- The vhost/user boundary prevents the public demo from sharing queue state with another workload.

Non-secret evidence to return or retain:

- CloudAMQP resource name, AWS region, plan limits, redacted AMQPS hostname/port, vhost name, TLS
  enabled status, and user permission scope are now recorded; exact permission regexes remain
  `NOT_ASSERTED` under the shared-plan UI limitation;
  exact permission regexes remain `NOT_ASSERTED` under the shared-plan UI limitation;
- a queue-topology read-back or dry-run report showing all nine expected names and their durable/retry
  TTL/dead-letter settings only when obtained under the authorized validation boundary; do not
  manually provision queues in S1, and do not return passwords or the full connection URI;
- confirmation that no notification-worker runtime is required under the locked K6 scope;
- confirmation that the broker credential is stored in a secret manager and excluded from evidence.

D2-only evidence:

- actual Railway backend/image-worker/audit-worker broker connections;
- queue declaration/consumer behavior from the deployed revision;
- degraded readiness behavior when RabbitMQ is unavailable.

### 4. AWS S3 object storage

Minimum resource set:

- one private S3 bucket dedicated to KittaChat public-demo;
- one least-privilege IAM principal (user or role) for the backend and image worker;
- bucket controls for Block Public Access, bucket-owner object ownership, and browser CORS prepared
  for the exact public origin when D2 allocates it;
- one lifecycle/cleanup rule for incomplete multipart uploads, with its retention period recorded by
  the maintainer.

#### Received S1 evidence and disposition

The maintainer supplied a dedicated bucket `kittachat-public-demo-nhibuaa` in AWS
`ap-southeast-1` with Block Public Access enabled, bucket-owner-enforced ownership and ACLs
disabled, versioning disabled, and SSE-S3 default encryption with S3-managed keys. The approved
prefixes are exactly `uploads/*` and `avatars/*`.

The IAM user `kittachat-public-demo` has console access disabled and a directly attached
customer-managed policy `KittaChatPublicDemoS3ObjectAccess`. The policy allows only
`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:AbortMultipartUpload` on the two approved
prefixes. No access key has been created. The repository maps `s3:PutObject` to single-object and
multipart create/part/complete operations, while abort uses `s3:AbortMultipartUpload`; no broad
`s3:*`, full-access, account-wide, bucket-wide, or outside-prefix grant is recorded.

Lifecycle rule `kittachat-demo-cleanup` aborts incomplete multipart uploads after 7 days and does
not delete completed objects. Exact CORS origin remains the future Railway-generated edge origin;
only `PUT` with exposed `ETag` is intended, and wildcard public origin is not approved. See
`k6-public-demo-s1-s3-evidence.md`.

The IAM boundary must cover only the bucket/prefixes used by the current service (`uploads/` and
`avatars/`) and the actions required by the code: object read, object write, object delete, and
multipart create/part/complete/abort operations used for presigned upload. A separate CloudFront
distribution is not a minimum K6 S1 resource; the current service has an S3 URL/presigned-URL
boundary.

Why it is needed before D2:

- Upload is a locked hard prerequisite for the full K6 feature scope; it cannot be enabled by merely
  setting placeholder AWS variables.
- The image worker reads source objects, writes processed objects, and deletes temporary source
  objects, so the bucket/IAM boundary must cover both backend and image-worker flows.
- Private bucket controls and a bounded prefix prevent public demo uploads from becoming an
  unrestricted public object store.

Non-secret evidence to return:

- bucket name and AWS region: recorded;
- Block Public Access and bucket-owner-enforced status: recorded;
- bucket CORS rule summary: intended exact public origin, `PUT`, and exposed `ETag`; exact origin is
  D2-bound and wildcard is not approved;
- IAM principal identifier and action/resource scope: recorded with no secret material;
- approved `uploads/` and `avatars/` prefixes: recorded;
- incomplete-multipart lifecycle rule and 7-day retention: recorded;
- access key status: `NOT_CREATED`; credential creation and final Railway binding remain D2-bound.

D2-only evidence:

- actual Railway backend/image-worker S3 access;
- MIME/size/presign/multipart/processed-image acceptance on the public target;
- final CORS origin and public URL behavior.

## What is not an S1 resource blocker

The following must not keep S1 blocked because they require the D2 runtime boundary or an image that
the current packet expressly forbids publishing now:

- Railway-generated edge hostname;
- derived `URL_FRONTEND`;
- derived exact `CORS_ALLOWED_ORIGINS`;
- actual GHCR image digests;
- Railway private runtime hostnames;
- live Railway healthcheck path/port/settings read-back;
- Railway runtime region read-back;
- Railway service-variable/secret binding and application connectivity.

They remain mandatory D2 packet/evidence fields and must be marked `PENDING_D2`, never `PASS`, until
the authorized runtime exists.

## S1 completion condition for this resource contract

S1 provider-binding evidence is complete for the four provider candidates. CloudAMQP
resource identity, region, quota, endpoint metadata, and provider-managed user/vhost boundary are
recorded; permission regexes remain unasserted. AWS S3 resource/security evidence is now recorded;
access-key creation, final Railway binding, exact-origin CORS, and live compatibility remain D2
gates. Credential ownership is bounded without values: MongoDB remains under the maintainer password
manager until D2, Upstash/CloudAMQP credentials remain outside Git/chat/evidence until D2 binding,
and the S3 access key is not created in S1. This closes resource identity/security-readiness only;
it does not enable upload, claim live compatibility, or authorize D2. Phase 2 specification/design
and its authorization gate are the next transition.

## Primary sources and repository evidence

- Railway regions: <https://docs.railway.com/deployments/regions.md>
- Railway static outbound IPs: <https://docs.railway.com/networking/static-outbound-ips.md>
- MongoDB Atlas IP access list: <https://www.mongodb.com/docs/atlas/security/ip-access-list/>
- MongoDB Atlas free/shared limits: <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>
- Upstash client connection: <https://upstash.com/docs/redis/howto/connectclient>
- CloudAMQP plans: <https://www.cloudamqp.com/plans.html>
- CloudAMQP FAQ: <https://www.cloudamqp.com/docs/faq.html>
- AWS SDK for JavaScript S3 examples: <https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html>
- Amazon S3 presigned URLs: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>
- Current Redis boundary: `server/src/config/redis.js`, `server/src/socket/index.js`, `server/src/rateLimit/distributedRateLimiter.js`
- Current RabbitMQ topology: `server/src/queues/topology.js`, `server/src/queues/connectionManager.js`
- Current S3 boundary: `server/src/services/s3.service.js`, `server/src/controllers/fileController.js`
