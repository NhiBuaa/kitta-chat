# K6 S1 Provider Readiness Research

## Status and scope

`COMPLETED` — research-only S1 artifact.

This note answers the maintainer's pre-D2 provisioning question for the three preferred
stateful providers:

- Upstash Redis Free;
- CloudAMQP Little Lemur (RabbitMQ);
- AWS S3.

No provider was provisioned or mutated while producing this note. No credential value was
requested, printed, or stored. No Railway workload was deployed, no image was published, no
Issue #61 measurement was enabled, and no production claim is made. The conclusions below are
provider-readiness requirements, not D2 approval.

The distinction is important:

- `S1 resource readiness` means the minimum provider objects, security settings, and secret-manager
  ownership exist or have an explicit maintainer disposition before D2 review.
- `D2 runtime proof` means credentialed connectivity, live workload behavior, exact Railway
  hostname/origin binding, and live acceptance. Those actions remain outside this research task.

## Repository boundaries inspected

The following are repository facts, not claims about a provider:

| Boundary | Current repository behavior | Consequence for provider readiness |
| --- | --- | --- |
| Redis cache and Socket.IO | `server/src/config/redis.js` creates a Node Redis client from `REDIS_URL`; `server/src/socket/index.js` creates a duplicate pub/sub pair and fails Socket.IO startup when Redis cannot connect. | One native Redis endpoint reachable over TLS is required. The provider must support the commands used by the adapter and application, not only an HTTP/REST API. |
| Redis rate limiting | `server/src/rateLimit/distributedRateLimiter.js` uses standalone Redis unless cluster roots are configured and executes a Lua script through `EVAL`; the script uses `TIME`, sorted sets, hashes, TTLs, and key expiration. | The selected database must pass real `EVAL`, `TIME`, sorted-set, hash, TTL, and expiration checks. This is a compatibility gate, not something static URL parsing proves. |
| RabbitMQ | `server/src/queues/rabbitmq.js` uses one `RABBITMQ_URL` and asserts the complete `QUEUE_TOPOLOGY` from `server/src/queues/topology.js`. | One RabbitMQ instance/vhost/credential is sufficient at the architecture boundary; nine queues must be supported: `image.process`, `image.process.retry`, `image.process.dlq`, `audit.events`, `audit.events.retry`, `audit.events.dlq`, `notification.email`, `notification.email.retry`, and `notification.email.dlq`. |
| RabbitMQ workers | `image-worker` consumes `image.process`; `audit-worker` consumes `audit.events`; notification recovery remains disabled for K6, but the shared topology still declares the notification queues. | Do not provision a separate broker per worker. Do not remove the notification queues unless a later approved runtime slice changes the shared topology. |
| S3 | `server/src/services/s3.service.js` uses AWS SDK v3 commands for `PutObject`, `GetObject`, `DeleteObject`, `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, and `AbortMultipartUpload`, plus presigned URLs. | One AWS S3 bucket and one least-privilege application principal are the minimum runtime resources. |
| Browser upload | `client/src/hooks/useUpload.js` sends browser `PUT` requests to presigned S3 URLs and reads `uploadRes.headers.etag`. | The bucket CORS configuration must allow the exact public-demo origin, the presigned upload method/headers, and expose `ETag`; the final origin is not knowable until Railway allocates the edge hostname. |
| Upload object paths | The service generates `uploads/<unique-name>` and `avatars/<unique-name>` keys. | The runtime principal can be restricted to the `uploads/*` and `avatars/*` prefixes rather than the whole bucket. |

## Executive answer

The minimum provider resources to ask the maintainer to create are:

| Provider | Minimum S1 resource set | Must exist before D2 approval? | Live proof timing |
| --- | --- | --- | --- |
| Upstash | One dedicated Redis database for KittaChat public-demo, with its native TLS endpoint and database authentication held in a provider/Railway secret manager. | Yes. Redis is a startup-critical dependency for the current Socket.IO composition and rate-limit boundary. | D2 rollout/acceptance: TLS connection, duplicate pub/sub clients, adapter behavior, and Lua command matrix. |
| CloudAMQP | One RabbitMQ Little Lemur instance, one instance vhost, and one application credential/connection URL held in the provider/Railway secret manager. | Yes. Backend and workers share one asserted queue topology and the image/audit paths need the broker. | D2 rollout/acceptance: AMQPS connection, topology assertion, publish/consume, retry TTL, and DLQ behavior. |
| AWS S3 | One dedicated private bucket, one least-privilege application IAM principal, one bucket-scoped policy, and a bucket CORS configuration prepared for the eventual exact public-demo origin. | Yes for the selected upload-enabled scope. The bucket and principal can be created in S1; final origin-specific CORS and live upload proof remain D2-bound. | D2 rollout/acceptance: single upload, multipart upload, presigned browser PUT/ETag, download, processed-image path, and cleanup. |

If any one of these provider resources cannot be created or safely constrained, the affected
capability is not ready for D2. Because upload is a K6 hard prerequisite, S3 failure does not
authorize an automatic downgrade to core-only demo scope.

## 1. Upstash Redis Free

### Exact minimum resource packet

Create exactly one dedicated Upstash Redis database for the KittaChat `public-demo` namespace:

1. One Redis database, named/tagged for KittaChat public-demo, in the selected provider region.
2. Its native TCP Redis endpoint and port, with TLS enabled.
3. One database authentication credential, stored only in the provider/Railway secret manager.
4. A provider-side database identifier and non-secret configuration record that can be read back
   without exposing the credential.

Do not create only an Upstash REST token. The current application uses the native Redis client and
Socket.IO Redis adapter; the REST SDK is a different integration boundary. Upstash's official
connection guide shows TLS as enabled by default and gives a native `rediss://` client example
using endpoint, port, and password [U1].

The Free candidate is a capacity choice, not an architecture change. Upstash currently describes
its free tier as 256 MB of data and 500,000 commands per month [U2]. Those limits must be recorded
as provider metadata and monitored during the demo; they are not production capacity evidence.

### Why it is necessary before D2 approval

The current Socket.IO startup path creates Redis pub/sub clients and fails startup when that
connection cannot be established. The rate-limit path additionally executes a Lua script that
requires `EVAL`, `TIME`, sorted sets, hashes, TTLs, and expiration. Therefore a database object
and native TLS endpoint must exist before D2 reviewers can judge whether the selected provider is
actually compatible with this repository.

The dedicated database is also a namespace and data-isolation control: K6 demo keys must not share
an unknown tenant's Redis keyspace. This is a K6 operational decision derived from the repository's
cache/coordination role, not a claim that Upstash requires one database per application.

### Safe, non-secret evidence to return

The maintainer should return a redacted provider read-back containing:

- provider/database name or ID;
- provider region;
- plan name and current published limits;
- endpoint hostname and port, but not the password or a full connection URL;
- `TLS=enabled` and certificate/transport mode, without private key material;
- database engine/version if the console exposes it;
- confirmation that the database is dedicated to KittaChat public-demo;
- secret-manager ownership: which manager stores the credential, with the key name only;
- a statement that no secret value was copied into Git, chat, logs, or deployment artifacts.

The maintainer must not return the password, REST token, full `rediss://` URL, or a log excerpt that
contains either credential. The safe evidence is sufficient to bind the target; the actual
credentialed command matrix belongs to D2 live verification.

### D2-bound items that must not block S1 research

These remain D2-bound and are intentionally absent from this note as final values:

- Railway-to-Upstash credentialed `PING`/`SET`/`GET` proof;
- pub/sub duplicate-client and Socket.IO adapter proof;
- `EVAL`/`TIME`/sorted-set/hash/TTL command proof;
- the actual Railway service environment variable binding;
- traffic-volume or production-scale claims;
- Issue #61 measurement, Level 2B, quota tuning, or numeric performance claims.

S1 may record the resource packet and its non-secret read-back without waiting for a Railway
workload or image digest.

### Compatibility risks and required validation

Upstash's official guide documents `ioredis` and the `rediss://` shape, while this repository uses
Node Redis v4 through `createClient({ url })`. That is encouraging protocol evidence, but it does
not prove this repository's duplicate-client, Socket.IO adapter, Lua, or free-tier behavior [U1].
The focused local check only validated URL/TLS shape and object construction; it did not connect to
Upstash.

D2 validation must therefore prove, with a disposable `.test` key namespace:

- TLS connection and authentication;
- `PING`, `SET`, `GET`, `DEL`, `EXPIRE`, and `TTL`;
- duplicate pub/sub clients and a Socket.IO adapter publish/subscribe round trip;
- the exact rate-limit Lua path using `EVAL` and `TIME`;
- sorted-set and hash operations used by rate limits and presence/sidebar state;
- reconnect behavior and failure handling;
- that the free command/data limits are sufficient for the declared demo-only workload.

## 2. CloudAMQP Little Lemur

### Exact minimum resource packet

Create exactly one CloudAMQP RabbitMQ instance on the Little Lemur development plan:

1. One CloudAMQP RabbitMQ instance, not a LavinMQ instance and not one instance per worker.
2. The instance's single shared vhost.
3. One application user/credential with access to that vhost.
4. One TLS AMQP connection URL, stored only in the provider/Railway secret manager.

No manual queue, exchange, retry, or DLQ creation is required as a separate provider resource:
the repository asserts its nine-queue topology at connection time. The maintainer must, however,
confirm that the vhost/user is allowed to declare durable queues, publish, consume, and acknowledge
messages.

CloudAMQP's current official pricing page describes Little Lemur as a free RabbitMQ development
plan with a 100-queue maximum, 10,000 queued-message maximum, 1 million messages/month, and a
20-connection limit [C1]. The repository's nine declared queues fit below the published queue
count, but that fact is not a substitute for D2 connection and retry testing. CloudAMQP's setup
guide describes a shared RabbitMQ instance as a vhost and recommends shared plans for testing or
hobby applications [C2].

Use AMQPS/TLS. CloudAMQP's official AMQP documentation identifies port 5671 as AMQPS/TLS and port
5672 as non-TLS AMQP [C3]. The connection URL must therefore use the TLS form supported by
`amqplib`; never downgrade the public-demo broker to plaintext merely to make connectivity work.

### Why it is necessary before D2 approval

The backend publishes image and audit jobs, the image worker consumes image jobs, and the audit
worker consumes audit jobs. Every RabbitMQ connection manager asserts all nine durable/retry/DLQ
queues. Without a real RabbitMQ instance, D2 cannot assess the image-processing or audit worker
dependency, retry TTL, or dead-letter contract.

One instance/vhost is the minimum because the repository has one `RABBITMQ_URL` boundary and uses
the broker as background-only infrastructure. Separate worker brokers would be a topology change,
not a cost optimization that can be inferred during S1.

### Safe, non-secret evidence to return

The maintainer should return:

- CloudAMQP instance ID/name;
- plan: `Little Lemur - For Development`;
- broker type: RabbitMQ;
- provider region/data center;
- vhost name, if non-secret;
- TLS connection shape: `amqps`, hostname, port, and redacted vhost, without user/password;
- published limits and current quota/connection settings;
- confirmation that the application user can declare/use the vhost, with permissions summarized
  but no credential value;
- confirmation that no pre-existing personal, production, or sensitive messages are present;
- secret-manager ownership and key name only;
- a statement that the full connection URL is absent from Git, chat, logs, and evidence.

Do not return the full AMQP URL: CloudAMQP documents that instance details include the connection
URL, user/vhost, and password in the console [C2], so the URL must be treated as secret-bearing
material even when its hostname is otherwise non-secret.

### D2-bound items that must not block S1 research

The following require a D2-authorized runtime or a separately approved disposable provider test;
they are not S1 target-binding facts:

- actual Railway-to-CloudAMQP AMQPS handshake;
- exact deployed connection count and Little Lemur quota consumption;
- queue declaration read-back from the live vhost;
- publish/consume/ack evidence for image and audit jobs;
- retry delay/TTL behavior and DLQ routing under failure;
- worker reconnect behavior;
- Railway service-to-provider network path and live logs.

S1 can close the resource and plan decision with the redacted instance read-back. It cannot claim
RabbitMQ runtime compatibility until D2 testing passes.

### Compatibility risks and required validation

The current queue topology uses durable queues, message TTL on retry queues, the default exchange,
dead-letter routing keys, confirm-channel publishing, prefetch, acknowledgements, and reconnect
logic. CloudAMQP's plan limits therefore need to be evaluated against the number of backend/worker
connections and the volume of demo traffic, not only the nine-queue count [C1].

D2 validation must prove:

- `amqps://` connection and TLS certificate verification;
- vhost authentication with the application credential;
- assertion of all nine queue definitions without pre-existing incompatible declarations;
- confirmed image/audit publish and consume paths;
- retry queue expiration and return to the primary queue;
- DLQ routing after the configured maximum attempts;
- safe behavior when the broker is unavailable;
- no notification worker dependency is accidentally enabled while recovery remains disabled.

## 3. AWS S3

### Exact minimum resource packet

Create the following minimum AWS resources for the upload-enabled K6 scope:

1. One dedicated private S3 bucket for KittaChat public-demo data, in the chosen AWS region.
2. One application IAM principal for the backend/image-worker boundary. Until the repository has
   an approved Railway workload-identity seam, this means one access-key credential pair compatible
   with the current `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables. Store
   the values only in the AWS/Railway secret managers.
3. One bucket-scoped least-privilege policy allowing only the object actions required by the
   inspected service, restricted to the `uploads/*` and `avatars/*` prefixes:
   `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and `s3:AbortMultipartUpload`.
4. One bucket CORS configuration prepared for the public-demo edge origin. It must support the
   browser's presigned `PUT` path and expose `ETag`; the exact `AllowedOrigins` value cannot be
   finalized until Railway allocates the edge hostname.
5. Keep S3 Block Public Access enabled and do not make the bucket or objects public. The application
   uses backend-generated presigned URLs, which AWS documents as time-limited access without giving
   the browser AWS credentials [A1].

The action set above is the minimum for the commands currently present in the repository. AWS's
official S3 policy-action mapping states that `PutObject` is required to put and complete a
multipart object, `GetObject` is required to read one, `DeleteObject` is required to remove one,
and `AbortMultipartUpload` is required to abort a multipart upload [A2]. The service does not call
`ListBucket`, `ListMultipartUploads`, or `ListParts`, so those permissions must not be added merely
because the SDK supports them.

The bucket CORS rule is not an object-storage secret. It is a browser compatibility control. AWS
documents that S3 CORS identifies allowed origins, methods, headers, and other operation-specific
information [A3]. This repository specifically requires browser `PUT` and response-header access
for `ETag`, so `ETag` must be included in the exposed response headers.

### Why it is necessary before D2 approval

Upload is a locked K6 hard prerequisite. The backend creates single objects and multipart uploads,
returns presigned URLs, downloads objects for image processing, deletes temporary/source objects,
and the image worker writes processed files and avatar files. Without a dedicated bucket and
least-privilege principal, D2 cannot test the declared upload scope or prove that the worker can
complete its cleanup path.

The policy must be prefix-scoped because the application-generated key families are known from the
repository. AWS recommends reducing permissions toward least privilege and reviewing/removing
unused permissions [A4]. A broad `s3:*` or account-wide policy would be an S1 security failure,
not a convenient setup.

The exact public-demo origin cannot be placed in `AllowedOrigins` yet: the Railway packet says the
generated edge hostname is D2-bound. This is a configuration sequencing constraint, not a reason
to delay creation of the bucket and IAM principal.

### Safe, non-secret evidence to return

The maintainer should return:

- bucket name, ARN, and region;
- a non-secret bucket configuration read-back showing Block Public Access enabled;
- whether versioning/lifecycle cleanup is enabled, with the chosen demo retention policy;
- IAM principal type and identifier, with no access key or secret key value;
- policy document hash or redacted policy showing the exact actions and `uploads/*`/`avatars/*`
  resource scope;
- CORS configuration hash or redacted rule showing the eventual origin strategy, allowed methods,
  allowed headers, and `ExposeHeaders: ETag`;
- secret-manager ownership and key names only;
- confirmation that no personal, production, or sensitive data is in the bucket;
- confirmation that no bucket/object public-read policy was added;
- confirmation that the existing Railway bucket `stashed-drum` was not silently selected.

Do not return access keys, secret keys, signed URLs, object contents, or request logs containing
presigned query parameters. A presigned URL is bearer-like, time-limited access material under the
AWS model [A1].

### D2-bound items that must not block S1 research

The following remain D2-bound:

- the exact `AllowedOrigins` value after Railway allocates the edge hostname;
- storing the final secret values in Railway and binding them to services;
- a live single-object upload and signed download;
- a live multipart upload with browser `PUT` and `ETag` capture;
- MIME/size enforcement plus `uploads/` and `avatars/` path checks;
- image-worker processing, source cleanup, processed-object write, and MongoDB file record;
- CORS proof from the final public URL;
- AWS billing/free-credit and quota observation under the real demo workload.

S1 may require the bucket, principal, policy, and a prepared CORS plan as a provisioning packet,
but it must not claim that upload is enabled until D2 live acceptance passes.

### Compatibility risks and required validation

The code constructs object URLs from `AWS_S3_BUCKET_NAME`, `AWS_REGION`, and an AWS S3 regional
hostname. That is compatible with the selected AWS S3 target but is not a generic guarantee for an
arbitrary S3-compatible provider. The client also reads `ETag` from the browser's multipart PUT
response, so a bucket that accepts the upload but does not expose that header through CORS will
still fail the application flow.

The current service uses static access-key variables, while AWS recommends temporary workload
credentials and least-privilege permissions where possible [A4]. Until an approved Railway
workload-identity design exists, the compensating control is a dedicated demo-only principal,
prefix-scoped policy, secret-manager-only storage, rotation/expiry ownership, and no reuse of
personal or production credentials.

D2 validation must prove:

- AWS SDK authentication without exposing the credential;
- `PutObject`, `GetObject`, and `DeleteObject` on allowed prefixes;
- multipart initiate, presigned part upload, complete, and abort;
- rejection or inability to use an object outside the permitted prefixes;
- exact-origin CORS behavior, including readable `ETag`;
- private bucket behavior with presigned access only;
- image-worker read/process/write/cleanup behavior;
- no secret or presigned query string in application logs/evidence.

## Cross-provider evidence contract

The maintainer's return packet should contain only:

1. Provider resource IDs/names, regions, plan names, and non-secret endpoint metadata.
2. Secret-manager ownership and key names, never secret values.
3. Redacted policy/configuration summaries or hashes.
4. Provider quota/limit read-backs and the declared demo-only budget/retention settings.
5. A statement that resources are dedicated to `.test`/demo data only.
6. A statement that no provider mutation was performed by Codex during this research task.
7. A list of any provider item that could not be created, with the provider's exact error and a
   proposed maintainer decision; do not silently substitute Railway or another provider.

The packet must not contain full database URLs, AMQP URLs, Redis passwords/tokens, AWS access keys,
AWS secret keys, presigned URLs, JWTs, cookies, request headers, or raw provider logs.

## What is still D2-bound and must not block this S1 artifact

The following items are intentionally not prerequisites for completing this research note:

- Railway workload deployment or service instances;
- Railway-generated edge hostname and final `URL_FRONTEND`/`CORS_ALLOWED_ORIGINS`;
- Railway private runtime hostnames and live healthcheck read-back;
- GHCR image publication and immutable image digests;
- credentialed connectivity from Railway to any provider;
- live WebSocket, worker, upload, or public-domain acceptance;
- rollback execution;
- Issue #61 measurement, Level 2B, quota tuning, or production/scalability claims.

These items remain required gates for D2 rollout and K6 completion, but they are not needed to
answer the minimum-provider-resource question or to close this research-only artifact.

## Findings, uncertainties, and failure state

### Findings

- Upstash requires one native TLS Redis database for this repository's Redis protocol boundary;
  an HTTP-only REST integration would not satisfy the current code path [U1].
- CloudAMQP requires one RabbitMQ Little Lemur instance/vhost/application credential; the current
  nine-queue topology is below the published queue-count limit, subject to connection/message
  quota validation [C1][C2].
- AWS S3 requires one private dedicated bucket, one prefix-scoped application principal/policy,
  and an origin-aware CORS configuration for the browser presigned-upload flow [A1][A2][A3][A4].
- S3 is a hard K6 upload prerequisite; no scope downgrade was inferred.

### Uncertainties

- Provider free-tier limits and plan names can change; the maintainer must return a dated console
  read-back before D2. Upstash and CloudAMQP official pages are the current sources used here
  [U2][C1].
- Upstash's official example uses `ioredis`; this repository uses Node Redis plus duplicate clients,
  Socket.IO adapter, and Lua. Live compatibility is therefore unproven until D2 [U1].
- CloudAMQP plan quota headroom depends on actual process connection counts and demo traffic; the
  published limits alone do not establish readiness [C1].
- The final S3 CORS origin depends on the Railway-generated edge hostname and cannot be fixed from
  the current S1 packet [A3].

### Failure state

`NONE for the requested research task.` The artifact was created and read back successfully.

The following are intentionally not failures: no provider mutation, no credentialed live test, no
Railway deployment, no image publication, and no D2 approval. Those actions were explicitly outside
the task boundary.

## Primary sources

All provider claims in this note use official first-party sources:

- **[U1] Upstash — Connect to Redis clients:**
  https://upstash.com/docs/redis/howto/connectclient
- **[U2] Upstash — Redis pricing/free tier:**
  https://upstash.com/pricing
- **[C1] CloudAMQP — Plans and pricing (Little Lemur):**
  https://www.cloudamqp.com/plans.html
- **[C2] CloudAMQP — Getting started / instance and vhost details:**
  https://www.cloudamqp.com/docs/index.html
- **[C3] CloudAMQP — AMQP protocol and AMQPS/TLS port:**
  https://www.cloudamqp.com/docs/amqp.html
- **[A1] AWS S3 — Presigned URLs:**
  https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- **[A2] AWS S3 — Mapping S3 API operations to policy actions:**
  https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html
- **[A3] AWS S3 — CORS configuration elements:**
  https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html
- **[A4] AWS IAM — Best practices and least privilege:**
  https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- **[A5] AWS S3 — Multipart upload overview:**
  https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html

## Maintainer evidence amendment — 2026-08-21

The maintainer supplied non-secret Upstash evidence for `kittachat-public-demo` in AWS Singapore
(`ap-southeast-1`): Free Tier, 256 MB storage, 500000 monthly commands, 50 GB monthly bandwidth,
native Redis TCP `rediss`/TLS on port 6379, no additional read regions, and credential ownership
outside Git/chat/evidence. The provider packet explicitly marks provider-internal
standalone/non-cluster as `NOT_ASSERTED` because the console exposes primary/read-region topology
rather than that mode. The maintainer accepts the K6 application-client topology instead: one
dedicated database, one native `rediss` endpoint, one primary region, no additional read regions,
and empty `REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES`. No provider-internal architecture is claimed, and
no repository K6 contract requires that claim. Railway connectivity, Node Redis, Socket.IO pub/sub,
Lua `EVAL`/`TIME`, and all live runtime acceptance remain `PENDING_D2`. The complete evidence record is
`k6-public-demo-s1-upstash-evidence.md`.

## Maintainer evidence amendment — AWS S3, 2026-08-21

The maintainer supplied non-secret S3 resource/security evidence for dedicated bucket
`kittachat-public-demo-nhibuaa` in AWS `ap-southeast-1`: Block Public Access enabled, bucket-owner
enforced ownership with ACLs disabled, SSE-S3 default encryption, approved prefixes `uploads/*`
and `avatars/*`, and customer-managed IAM policy `KittaChatPublicDemoS3ObjectAccess` directly
attached to IAM user `kittachat-public-demo`. The policy allows only `s3:PutObject`,
`s3:GetObject`, `s3:DeleteObject`, and `s3:AbortMultipartUpload` on those two prefixes. The
repository's S3 service uses `PutObject` for single-object and multipart create/part/complete
operations and the explicit abort action for abort; no broad `s3:*`, full-access, account-wide,
bucket-wide, or outside-prefix grant is recorded.

Lifecycle rule `kittachat-demo-cleanup` aborts incomplete multipart uploads after 7 days. The IAM
access key is `NOT_CREATED` in S1. Exact Railway-origin CORS, credential creation/binding, AWS SDK
authentication, browser `ETag`, image-worker processing, and all live S3 compatibility remain
`PENDING_D2`; wildcard public origin is not approved. The complete evidence record is
`k6-public-demo-s1-s3-evidence.md`.

## Maintainer evidence amendment — CloudAMQP, 2026-08-21

The maintainer supplied a non-secret permission/read-back disposition for a provisioned shared
CloudAMQP `Little Lemur` RabbitMQ instance: RabbitMQ version `4.2.7`, application vhost/user
identifier `bptdlerq`, and confirmation that the same application credential authenticates to the
Management UI for that vhost. The shared-plan Admin UI does not expose Users, Virtual Hosts, or
per-user `configure`/`write`/`read` permission regex configuration/read-back.

K6 accepts the application credential/vhost boundary as provider-managed for S1. It does not claim
least-privilege regex evidence, does not modify existing provider policies, and does not manually
provision the repository's nine queues in S1. The exact regex fields are `NOT_ASSERTED`; actual
queue declaration, publish, consume, acknowledge, retry, DLQ, reconnect, and Railway connectivity
remain `PENDING_D2`. D2 must fail safely if the credential cannot perform the required topology
operations. Instance identity, provider region, exact plan quotas, and redacted AMQPS endpoint
metadata were not included in this packet and remain unasserted in the target-binding record.
The complete evidence record is `k6-public-demo-s1-cloudamqp-evidence.md`.
