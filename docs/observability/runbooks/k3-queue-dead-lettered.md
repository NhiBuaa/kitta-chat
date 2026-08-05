# KittaChatQueueDeadLettered

## Meaning

This critical alert fires when `poison` or `retry_exhausted` produces at least one dead-letter event in the last five minutes. K3 applies the invariant `expected dead-letter count = 0`, so both reasons are critical today.

The alert intentionally has no `for` clause. A counter increment is a real event; delaying notification is not used as sample-noise filtering. If notification delay is introduced later, it must be documented as separate notification semantics.

## Response

1. Start with the alert's `queue`, `job_type`, `reason`, and five-minute time window.
2. Find the corresponding structured worker logs and failure stage.
3. Use the correlation ID and trace context from those logs to follow the job lifecycle.
4. Inspect the DLQ payload only through a tool with controlled access and appropriate authorization.
5. Determine whether the event is poison input or exhausted retry, then apply the existing RabbitMQ retry/DLQ contract.

Do not automatically retry outside the RabbitMQ retry contract. Do not expose message payloads, credentials, or tokens in logs or incident notes.

If poison messages later become an expected outcome for untrusted input, update the policy so `poison` is warning while `retry_exhausted` remains critical.

K3 does not deploy Alertmanager. Without Alertmanager or another notification consumer, this rule evaluates in Prometheus but does not produce outbound notifications.
