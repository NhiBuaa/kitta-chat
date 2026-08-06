const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canonicalizeRequestId,
  isValidCorrelationId,
} = require("../../src/observability/correlation/idPolicy");
const {
  runWithCorrelationContext,
} = require("../../src/observability/correlation/asyncContext");
const { logger } = require("../../src/utils/logger");
const {
  buildProducerCarrier,
  resolveWorkerCarrier,
} = require("../../src/observability/correlation/carrierPolicy");

test("request ID policy preserves only the approved bounded ASCII set", () => {
  const generated = [];
  const generator = () => {
    const value = `generated-${generated.length + 1}`;
    generated.push(value);
    return value;
  };

  assert.equal(canonicalizeRequestId("Valid.id_1:-", generator), "Valid.id_1:-");

  for (const invalid of [
    undefined,
    "",
    "a".repeat(129),
    ["one", "two"],
    "one, two",
    "line\nbreak",
    "contains space",
    "unicode-đ",
  ]) {
    const result = canonicalizeRequestId(invalid, generator);
    assert.equal(isValidCorrelationId(result), true);
    assert.notDeepEqual(result, invalid);
  }

  assert.equal(generated.length, 8);
});

test("canonical logger emits isolated JSON lines and omits sensitive fields", async () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);

  try {
    await Promise.all([
      runWithCorrelationContext({ requestId: "request-a", correlationId: "correlation-a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        logger.info("request_a_finished", {
          path: "/public?token=secret-query",
          token: "secret-token",
          metadata: {
            authorization: "sensitive-authorization",
            safeSibling: "keep-me",
          },
          nestedArray: [{ cookie: "sensitive-cookie", other: "keep-array-value" }],
        });
      }),
      runWithCorrelationContext({ requestId: "request-b", correlationId: "correlation-b" }, async () => {
        await Promise.resolve();
        logger.info("request_b_finished", { userId: "user-b" });
      }),
    ]);
  } finally {
    console.log = originalLog;
  }

  assert.equal(lines.length, 2);
  const entries = lines.map((line) => JSON.parse(line));
  const first = entries.find((entry) => entry.event === "request_a_finished");
  const second = entries.find((entry) => entry.event === "request_b_finished");
  assert.deepEqual(
    { level: first.level, requestId: first.requestId, correlationId: first.correlationId, path: first.path },
    { level: "info", requestId: "request-a", correlationId: "correlation-a", path: "/public" },
  );
  assert.equal(typeof first.timestamp, "string");
  assert.equal(JSON.stringify(first).includes("secret"), false);
  assert.deepEqual(first.metadata, { safeSibling: "keep-me" });
  assert.deepEqual(first.nestedArray, [{ other: "keep-array-value" }]);
  assert.equal(second.requestId, "request-b");
  assert.equal(second.correlationId, "correlation-b");
  assert.equal("userId" in first, false);
});

test("existing logger levels each emit exactly one parseable JSON object", () => {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = (line) => lines.push(line);
  console.warn = (line) => lines.push(line);
  console.error = (line) => lines.push(line);

  try {
    logger.info("info_event", { value: 1 });
    logger.warn("warn_event", { value: 2 });
    logger.error("error_event", { value: 3 });
  } finally {
    Object.assign(console, original);
  }

  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((line) => JSON.parse(line).level), ["info", "warn", "error"]);
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(typeof parsed.timestamp, "string");
    assert.equal(typeof parsed.event, "string");
    assert.equal(line.includes("\n"), false);
  }
});

test("producer correlation precedence writes one canonical value to every carrier", () => {
  const generated = () => "generated-id";
  const explicit = buildProducerCarrier({
    payload: { type: "chat-image", correlationId: "explicit-id", requestId: "request-id" },
    context: { requestId: "context-id" },
    generator: generated,
  });
  const requestFallback = buildProducerCarrier({
    payload: { type: "chat-image", requestId: "request-id" },
    context: { requestId: "context-id" },
    generator: generated,
  });
  const contextFallback = buildProducerCarrier({
    payload: { type: "chat-image", correlationId: "invalid value" },
    context: { requestId: "context-id" },
    generator: generated,
  });

  assert.equal(explicit.correlationId, "explicit-id");
  assert.equal(requestFallback.correlationId, "request-id");
  assert.equal(contextFallback.correlationId, "context-id");
  for (const carrier of [explicit, requestFallback, contextFallback]) {
    assert.equal(carrier.payload.correlationId, carrier.correlationId);
    assert.equal(carrier.properties.correlationId, carrier.correlationId);
    assert.equal(carrier.properties.headers.correlationId, carrier.correlationId);
  }
});

test("worker carrier precedence selects AMQP property and warns on valid disagreement", () => {
  const warnings = [];
  const resolved = resolveWorkerCarrier({
    job: { type: "chat-image", correlationId: "payload-id", requestId: "request-id" },
    message: {
      properties: {
        correlationId: "property-id",
        headers: { correlationId: "header-id" },
      },
    },
    logger: { warn: (event, fields) => warnings.push({ event, fields }) },
    generator: () => "generated-id",
  });

  assert.equal(resolved.correlationId, "property-id");
  assert.equal(resolved.job.correlationId, "property-id");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, "correlation_context_mismatch");
  assert.deepEqual(warnings[0].fields.carriers, [
    "amqp.correlationId",
    "amqp.headers.correlationId",
    "payload.correlationId",
    "payload.requestId",
  ]);
});
