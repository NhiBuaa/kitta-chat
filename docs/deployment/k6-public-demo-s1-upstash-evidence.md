# K6 S1 — Upstash Redis public-demo evidence

## Status and boundary

`S1_RESOURCE_AND_APPLICATION_TOPOLOGY_ACCEPTED_PROVIDER_INTERNAL_TOPOLOGY_UNASSERTED_LIVE_PENDING_D2`

This is a maintainer-supplied, non-secret S1 evidence record for the dedicated Upstash Redis
public-demo database. It records provider resource identity, capacity, native Redis transport, and
credential ownership. It does not contain a password, token, full `REDIS_URL`, Railway secret
binding, or live application compatibility proof.

The provider region below (`Singapore`, `ap-southeast-1`) is the Upstash data-store region. It is
consistent with the intended Railway audience region but is not a Railway runtime-region read-back.

## Resource identity and capacity

| Field | Value |
| --- | --- |
| Database name | `kittachat-public-demo` |
| Provider | Upstash Redis |
| Plan | Free Tier |
| Cloud provider | AWS |
| Primary region | Singapore |
| Primary region ID | `ap-southeast-1` |
| Additional read regions | None configured |
| Storage limit | `256 MB` |
| Command limit | `500000` per month |
| Bandwidth limit | `50 GB` per month as shown in the console |
| Current cost | `$0.00` |
| Usage scope | Dedicated to KittaChat public-demo |

## Topology disposition

| Field | Evidence/status |
| --- | --- |
| Provider model | Upstash managed Redis |
| Provider-internal standalone/non-cluster classification | `NOT_ASSERTED` |
| Reason | Provider UI exposes primary/read-region topology rather than a standalone/cluster mode |
| K6 application-client topology | Accepted: one dedicated database, one native `rediss` endpoint, one primary region, no read regions, and empty `REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES` |
| Additional read regions | None configured |

The K6 target contract requires one coordination/cache database and a single-endpoint application
client for the one-backend public-demo topology. The maintainer has explicitly accepted this
application-client topology while declining to make a provider-internal standalone/non-cluster
claim. Codex must not infer provider-internal architecture from the lack of read regions or from the
native Redis endpoint. This disposition closes the S1 topology blocker because no repository K6
contract requires provider-internal cluster-mode evidence.

## Native Redis transport

| Field | Value |
| --- | --- |
| Protocol | Redis TCP |
| Connection scheme | `rediss` |
| TLS/SSL | Enabled |
| Endpoint hostname | `eager-wolf-118366.upstash.io` |
| Port | `6379` |
| Username | `default` |
| Password/token | Not included |
| Full `REDIS_URL` | Not included |

## Credential handling

- Credential is retained outside Git, chat, and repository evidence.
- Railway secret binding remains D2-bound.
- No credential value, token, or full connection URL is recorded in this file.

## Live compatibility boundary

All items below remain `PENDING_D2`:

- Railway-to-Upstash connectivity;
- Node Redis authentication and command compatibility;
- Socket.IO Redis pub/sub adapter acceptance;
- Lua `EVAL`/`TIME` acceptance for the distributed rate-limit path;
- sorted-set/hash/TTL/PEXPIRE behavior;
- reconnect/failure behavior under the deployed public-demo runtime.

This record advances the Upstash S1 resource and application-client topology evidence. It does not
assert provider-internal architecture, enable Redis-dependent runtime behavior, authorize image
publication, or authorize D2 deployment.
