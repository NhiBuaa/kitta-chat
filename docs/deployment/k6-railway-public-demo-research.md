# K6 Railway Public Demo — Railway Research

## Question and evidence boundary

On 2026-08-20, what can be established from Railway's official documentation for a KittaChat
`public-demo` target that uses immutable GHCR images, private service networking, Socket.IO,
deployment-time health checks, public HTTPS, provider-managed variables, and rollback?

This is a target-compatibility research record. It does not provision a Railway target, choose a
plan or region, authorize a deployment, create secrets, or establish a production claim.

## Primary sources consulted

- [Private Registries](https://docs.railway.com/builds/private-registries.md)
- [Private Networking](https://docs.railway.com/networking/private-networking.md)
- [Healthchecks](https://docs.railway.com/deployments/healthchecks.md)
- [Public Networking](https://docs.railway.com/networking/public-networking.md)
- [Deployment Actions](https://docs.railway.com/deployments/deployment-actions.md)
- [Deploy a WebSocket Application with Socket.IO](https://docs.railway.com/guides/socketio.md)
- [Using Variables](https://docs.railway.com/guides/variables)
- [Image Auto Updates](https://docs.railway.com/deployments/image-auto-updates)
- [Railway CLI](https://docs.railway.com/reference/cli-api)
- [Railway Regions](https://docs.railway.com/deployments/regions.md)
- [Railway Static Outbound IPs](https://docs.railway.com/networking/static-outbound-ips.md)
- [MongoDB Atlas driver connection](https://www.mongodb.com/docs/atlas/driver-connection.md)
- [MongoDB Atlas Free Cluster Limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations.md)
- [MongoDB Atlas IP Access List](https://www.mongodb.com/docs/atlas/security/ip-access-list.md)
- [Upstash client connection](https://upstash.com/docs/redis/howto/connectclient)
- [CloudAMQP plans](https://www.cloudamqp.com/plans.html)
- [CloudAMQP FAQ](https://www.cloudamqp.com/docs/faq.html)
- [AWS SDK for JavaScript S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- [Amazon S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

## Findings

| Area | Official documentation establishes | K6 implication |
| --- | --- | --- |
| GHCR/private images | Railway supports standard Docker-auth registries, including `ghcr.io`. Private registry credentials are a Pro-plan capability; GHCR uses a GitHub token with `read:packages`, entered through service settings. | GHCR is technically compatible, but the maintainer must verify the plan and bind the exact Railway registry credential without placing it in Git, chat, or logs. |
| Private networking | Services in the same project environment can use internal DNS in the form `SERVICE_NAME.railway.internal`; the docs show `http://api.railway.internal:PORT`. Traffic remains inside Railway's private network. | Backend, MongoDB, Redis, RabbitMQ, and workers need explicit service names/reference variables after the real target is provisioned. Repository-local names such as `backend` cannot be assumed to resolve on Railway. |
| Health checks | Railway sends requests to the configured endpoint until it receives HTTP 200 before activating the new deployment. The service should listen on injected `PORT`. Health checks run at deployment time and are not continuous monitoring. | Bind the edge health endpoint deliberately. Keep `/healthz` as the public edge liveness check and verify backend `/readyz` separately; do not treat a deployment-time 200 as continuous health evidence. |
| HTTPS/custom domain | Railway public networking provides Railway domains, automatic SSL, and custom-domain support. Custom DNS requires the CNAME and TXT records Railway provides. | The public domain and exact CORS origin remain maintainer-owned target-binding inputs; they cannot be invented from the repository. |
| Socket.IO/WebSocket | Railway's official Socket.IO guide documents polling-to-WebSocket upgrade, reconnection, explicit frontend CORS origin, `PORT`, a health endpoint, and Redis adapter support. It also notes WebSocket connections are exempt from inactivity timeouts, while deploys/network interruptions can still disconnect clients. | K6 can verify Socket.IO through the public edge, but the exact domain/origin and one-backend/Redis topology must be tested on the real target. Keep payloads and event names unchanged. |
| Rollback/redeploy | Deployment rollback restores the previous successful deployment's Docker image and custom variables. Older deployments may fall outside retention; redeploy is a separate rebuild path. Deployment actions also document dependency ordering through reference variables. | Record the previous healthy revision and exact image digest before D2. Do not infer rollback availability until the target, retention plan, and owner are known. |
| Variables/secrets | Railway variables are available to build and running services; edits are staged changes requiring review/deploy. CLI docs describe `RAILWAY_TOKEN` for project-level CI actions. | Secret values belong in Railway/GitHub secret managers. The repository may contain only key names, non-secret defaults, and safe validation logic. |
| Auto updates | Railway documents image auto updates for GHCR and other supported registries. | K6 explicitly keeps Auto Deploy/image auto-updates off; every revision must be deliberately selected by immutable digest and reviewed commit lineage. |

## Maintainer target packet and provider candidate findings

The S1 packet binds the Railway project/environment and application service IDs, but reports no
current service instances. UUID syntax and uniqueness were checked locally (`8` parsed, `8` unique).
The packet intentionally leaves the Railway region and generated edge hostname pending.

The packet fixes the health ownership for later D2 verification: backend `GET /healthz` is the
application health signal, edge `GET /healthz` is the ingress signal, and backend `GET /readyz`
remains the detailed MongoDB/Redis readiness contract. Railway's configured healthcheck path and
port are still not read back and are not changed in S1.

- MongoDB Atlas Free is compatible at the URI/TLS layer: Atlas documents `mongodb+srv://`, TLS/SNI
  requirements and Free/M0 driver support. Atlas also requires an IP access-list entry. Railway
  documents static outbound IPs as a Pro feature and specifically names MongoDB Atlas as a use case;
  therefore the free-tier candidate is not final until the egress/allowlist decision is explicit.
- Upstash Redis documents TLS-by-default and `rediss://` client usage. A local no-connect check
  confirmed the repository's Node Redis client, duplicate client and Socket.IO Redis adapter can be
  constructed from a `rediss://` URL. Actual authentication, provider limits and the repository's
  Redis scripting/rate-limit workload still need provider-side verification.
- CloudAMQP Little Lemur's official plan page lists 100 queues, 10,000 queued messages, 1M messages
  per month and 20 connections. The repository declares 9 queues; a local no-connect AMQPS check
  accepted port 5671 and asserted all 9 queues. Real AMQPS, retry/DLQ and durability checks remain open.
- The current S3 module is AWS-specific: AWS SDK v3, `AWS_REGION`, bucket name, access key/secret,
  multipart operations and presigned URLs. AWS's official docs support this model. The existing AWS
  candidate is therefore architecture-compatible, but least-privilege IAM, bucket policy/CORS and
  live upload tests are still required before upload is enabled.

## Repository compatibility observations

- Local Compose is the only currently verified full topology. It uses nginx, backend, MongoDB,
  Redis, RabbitMQ, image worker, audit worker, and a notification worker; K6 intentionally excludes
  the notification worker because recovery is disabled.
- `nginx/nginx.conf` currently hard-codes `backend:3000` and has an existing origin-forwarding seam
  that must be reviewed before Railway implementation. The K6 plan requires forwarding the real
  `Origin` header and making the upstream runtime-configurable.
- The server validates `MONGO_URI`, `JWT_SECRET`, `URL_FRONTEND`, Redis, and exact browser origins.
- Server readiness treats MongoDB and Redis as required; RabbitMQ can be degraded without changing
  the readiness contract. This is consistent with the repository health tests and must be verified
  again against the Railway deployment.
- `/metrics` is opt-in and not proxied by nginx; `/ops` is internal at the current nginx seam. Any
  Railway ingress change needs a target-specific exposure test.
- No Railway manifest is present in the current workspace. An authenticated explicit
  project/environment CLI read-back on 2026-08-20 confirms the supplied target IDs and empty
  `serviceInstances`/`volumeInstances`; it does not establish a deployed runtime, region, domain,
  private hostnames, or healthcheck settings.

## Uncertainties and stop condition

The official docs and packet establish compatibility patterns and intended target identity. The
maintainer has now bound the Railway region and approved the dedicated Atlas wildcard-allowlist
demo exception. S1 remains open until the maintainer provisions the minimum provider resources and
returns the non-secret evidence contract recorded in
`k6-public-demo-s1-resource-readiness.md`:

- dedicated Atlas project/cluster/user/allowlist controls;
- standalone Upstash database and command/plan compatibility metadata;
- CloudAMQP broker/vhost/app-user and nine-queue topology metadata;
- private S3 bucket/IAM/policy/lifecycle metadata.

The generated hostname, derived CORS values, image digests, Railway private hostnames, live
healthcheck settings, runtime region read-back, and live Railway-to-provider connectivity are
explicitly D2-bound runtime evidence and are not S1 blockers.

No secret value is requested or recorded here. Until those inputs exist, K6 must not enter design
authorization, implementation, D2, or rollout.
