# K6 S1 — CloudAMQP Little Lemur evidence

## Status and boundary

`S1_PROVIDER_MANAGED_VHOST_USER_ACCEPTED_PERMISSION_REGEX_UNASSERTED_LIVE_PENDING_D2`

This is a non-secret S1 evidence record for the K6 public-demo RabbitMQ candidate. It records
the provider-managed application vhost/user boundary and the provider UI limitation reported by
the maintainer. It does not claim least privilege, live compatibility, queue creation, worker
behavior, or D2 readiness.

No secret value, full AMQP connection URL, password, token, or private key is recorded. Existing
CloudAMQP policies were not modified. The nine application queues were not manually provisioned
during S1.

## Maintainer read-back

| Field | Evidence | Disposition |
| --- | --- | --- |
| Provider | CloudAMQP | S1 candidate accepted at the provider-managed boundary |
| Resource | `kittachat-public-demo` | S1 resource identity recorded |
| Plan/topology | `Little Lemur` shared RabbitMQ instance | Shared-plan user/vhost boundary accepted; exact permission regexes remain `NOT_ASSERTED` |
| Broker | RabbitMQ `4.2.7` | Version recorded; live application compatibility remains D2 |
| Region | AWS `ap-southeast-1` | Singapore region recorded |
| Cluster endpoint | `armadillo.rmq.cloudamqp.com` | Hostname recorded; full AMQP URL excluded |
| Node endpoint | `armadillo-01.rmq.cloudamqp.com` | Hostname recorded; full AMQP URL excluded |
| Transport | `amqps`, TLS port `5671` | Selected runtime transport is AMQPS/TLS; plaintext port `5672` is not selected |
| Application boundary | User identifier `bptdlerq`; vhost `bptdlerq` | Password excluded |
| Management authentication | The same application credential authenticated to the RabbitMQ Management UI for that vhost | Credential value excluded; this is not queue-operation proof |
| Quotas | 20 open connections; 150 queues; 1,000,000 messages; 10,000 max queue length; 1 GB max queue size; 28-day max idle queue time | Provider read-back recorded; actual K6 usage remains D2 |
| Current state | 0 open connections; 0 queues | Read-back confirms no queue was manually provisioned in S1 |
| Credential ownership | Provider-managed during S1; Railway secret manager binding remains D2-bound | No secret value is requested or recorded |

## Permission evidence boundary

| Permission field | S1 evidence | Meaning |
| --- | --- | --- |
| `configure` regex | `NOT_ASSERTED` | The shared-plan Admin UI does not expose per-user permission regex configuration/read-back |
| `write` regex | `NOT_ASSERTED` | No least-privilege regex claim is made |
| `read` regex | `NOT_ASSERTED` | No least-privilege regex claim is made |
| Provider-managed user/vhost boundary | `ACCEPTED` for K6 S1 | The application credential/vhost boundary is accepted as provider-managed under Little Lemur |

The missing regex evidence is an explicit provider-plan limitation, not evidence that the
credential has unrestricted access. Existing provider policies must not be changed merely to
produce K6 documentation. D2 must fail safely if the credential cannot perform the repository's
required topology operations.

## Repository queue contract — static only

The repository's `QUEUE_TOPOLOGY` contains nine durable queues. Retry queues use the configured
`RABBITMQ_RETRY_DELAY_MS` (default `30000` ms), the default exchange, and a dead-letter routing key
back to the corresponding primary queue. The queue names are:

- `image.process`
- `image.process.retry`
- `image.process.dlq`
- `audit.events`
- `audit.events.retry`
- `audit.events.dlq`
- `notification.email`
- `notification.email.retry`
- `notification.email.dlq`

This list is repository contract evidence, not a provider queue read-back. S1 did not declare,
delete, or modify any of these queues. The notification worker remains excluded from the locked K6
runtime topology, while the notification queue definitions remain part of the shared topology
asserted by the backend connection.

## S1 metadata disposition and D2 validation

The maintainer metadata packet closes the remaining CloudAMQP S1 identity, region, quota, and
redacted endpoint metadata gap. The permission regexes remain explicitly `NOT_ASSERTED` because the
shared-plan UI does not expose them. The current zero-queue state is consistent with the S1 rule
that no queue is manually provisioned; the application must assert its nine-queue topology during
the authorized D2 validation.

D2 must validate, with the credential held only in provider/Railway secret managers:

- Railway-to-CloudAMQP AMQPS/TLS connectivity;
- declaration of all nine queues with the repository's durable, retry-TTL, and dead-letter options;
- publish, consume, acknowledge, retry, and dead-letter behavior for image and audit jobs;
- reconnect and failure behavior without changing the readiness contract; and
- safe failure of the D2 gate if any required queue operation is denied.

Live queue operations, worker behavior, connection quota use, retry/DLQ behavior, and Railway
network-path evidence remain `PENDING_D2`. This provider is not described as production-grade or
least-privilege beyond the evidence actually exposed by the shared-plan UI.
