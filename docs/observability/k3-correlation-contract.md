# K3 request and correlation contract

## Request IDs

`x-request-id` is accepted only when it is a single string of 1–128 ASCII characters from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:`, and `-`. Missing, empty, repeated, comma-joined, overlong, control-character, whitespace, Unicode, or otherwise invalid values are replaced with a generated UUID. The canonical value is returned in the response and stored in request-scoped `AsyncLocalStorage`.

Request completion and error logs use the same canonical request ID. Concurrent request contexts are isolated. Raw query strings, request bodies, authorization material, cookies, tokens, passwords, credentials, and secrets are not structured log fields.

## Producer correlation precedence

At queue publication, the first valid value wins:

1. Payload `correlationId`.
2. Payload `requestId`.
3. Current request-context `requestId`.
4. Generated UUID.

The producer writes that value to payload `correlationId`, AMQP `correlationId`, and AMQP header `correlationId`.

## Worker correlation precedence

At worker ingress, the first valid value wins:

1. AMQP `correlationId`.
2. AMQP header `correlationId`.
3. Payload `correlationId`.
4. Payload `requestId`.
5. Generated UUID.

When valid carriers disagree, the worker selects the highest-precedence value, emits `correlation_context_mismatch`, rewrites the job's canonical `correlationId`, and continues processing. Retry and DLQ publications copy the canonical value into their payload, AMQP property, and header.

## Worker logging fields

Shared worker lifecycle events include `queue`, `jobType`, `attempt`, `correlationId`, and `failureStage`. Current failure stages are `none`, `parse`, `handler`, `retry_publish`, and `dlq_publish`. Logging is best-effort: logger or context failures never change request responses, publication confirmation, processing, retry, DLQ, or acknowledgement behavior.
