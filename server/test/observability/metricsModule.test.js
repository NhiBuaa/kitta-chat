const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createMetricsModule,
  createInMemoryMetricsAdapter,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");
const { METRIC_CATALOG } = require("../../src/observability/metrics/metricCatalog");

const createWarningLogger = () => {
  const warnings = [];
  return {
    logger: {
      warn: (event, fields) => warnings.push({ event, ...fields }),
    },
    warnings,
  };
};

test("message persistence histogram has a finite bucket through the configured timeout boundary", () => {
  assert.deepEqual(METRIC_CATALOG.messagePersistenceDuration.buckets, [
    0.001,
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2.5,
    5,
    10,
  ]);
});

test("MetricsModule exposes every semantic observation and async Prometheus exposition", async () => {
  const adapter = createPromClientMetricsAdapter();
  const metrics = createMetricsModule({ adapter });

  metrics.observeHttpRequest({
    method: "GET",
    routeTemplate: "/healthz",
    statusClass: "2xx",
    durationSeconds: 0.012,
  });
  metrics.observeSocketConnection({ event: "connected" });
  metrics.observeMessagePersistence({ outcome: "success", durationSeconds: 0.02 });
  metrics.observeRedisOperation({ operation: "get", outcome: "success" });
  metrics.observeCacheFallback({ reason: "miss" });
  metrics.observeQueueJob({ queue: "image", jobType: "chat-image", outcome: "processed" });
  metrics.observeQueueDeadLettered({
    queue: "image",
    jobType: "chat-image",
    reason: "poison",
  });

  const rendered = await metrics.renderPrometheus();

  assert.equal(typeof rendered.body, "string");
  assert.match(rendered.body, /kittachat_http_requests_total/);
  assert.match(rendered.body, /kittachat_queue_dead_lettered_total/);
  assert.match(rendered.contentType, /text\/plain/);
  assert.equal(typeof metrics.renderPrometheus().then, "function");
});

test("repeated construction reuses identical definitions and conflicting definitions fail fast", () => {
  const adapter = createPromClientMetricsAdapter();
  createMetricsModule({ adapter });
  assert.doesNotThrow(() => createMetricsModule({ adapter }));

  const sharedRegistryAdapter = createPromClientMetricsAdapter();
  createMetricsModule({ adapter: sharedRegistryAdapter });
  assert.doesNotThrow(() => createMetricsModule({
    adapter: createPromClientMetricsAdapter({ registry: sharedRegistryAdapter.registry }),
  }));

  assert.throws(
    () => createMetricsModule({
      adapter,
      metricCatalog: {
        httpRequestDuration: {
          name: "kittachat_http_request_duration_seconds",
          type: "counter",
          labelNames: ["method", "route_template", "status_class"],
        },
      },
    }),
    /conflicting metric definition/i,
  );
});

test("invalid values map to sentinels or are dropped with a structured warning", async () => {
  const { logger, warnings } = createWarningLogger();
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter, logger });

  metrics.observeHttpRequest({
    method: "TRACE",
    routeTemplate: "/not-a-canonical-route",
    statusClass: "2xx",
    durationSeconds: 0.1,
  });
  metrics.observeQueueJob({ queue: "unknown-queue", jobType: "unknown-job", outcome: "processed" });
  metrics.observeQueueJob({ queue: "image", jobType: "chat-image", outcome: "unknown" });

  const snapshot = adapter.snapshot();
  assert.equal(snapshot.kittachat_http_requests_total[0].labels.method, "OTHER");
  assert.equal(snapshot.kittachat_http_requests_total[0].labels.route_template, "UNMAPPED_ROUTE");
  assert.equal(snapshot.kittachat_queue_jobs_total[0].labels.queue, "OTHER");
  assert.equal(snapshot.kittachat_queue_jobs_total[0].labels.job_type, "OTHER");
  assert.equal(snapshot.kittachat_queue_jobs_total.length, 1);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, "metrics_observation_dropped");
});

test("observation adapter failures are best-effort and cannot throw into business callers", () => {
  const { logger, warnings } = createWarningLogger();
  const adapter = {
    registerMetric: () => {},
    observe: () => {
      throw new Error("adapter unavailable");
    },
    render: async () => ({ body: "", contentType: "text/plain" }),
  };
  const metrics = createMetricsModule({ adapter, logger });

  assert.doesNotThrow(() => metrics.observeSocketConnection({ event: "connected" }));
  assert.equal(warnings[0].event, "metrics_observation_failed");

  const failingLoggerMetrics = createMetricsModule({
    adapter,
    logger: {
      warn() {
        throw new Error("logger unavailable");
      },
    },
  });
  assert.doesNotThrow(() => failingLoggerMetrics.observeSocketConnection({ event: "connected" }));
});

test("high-cardinality identifiers are ignored and never become metric labels", () => {
  const { logger, warnings } = createWarningLogger();
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter, logger });

  assert.doesNotThrow(() => metrics.observeHttpRequest({
    method: "GET",
    routeTemplate: "/healthz",
    statusClass: "2xx",
    durationSeconds: 0.01,
    requestId: "request-123",
    correlationId: "correlation-456",
    userId: "user-789",
    messageId: "message-000",
    rawUrl: "/healthz?token=secret",
    cacheKey: "cache-secret",
    errorMessage: "secret error",
  }));

  const snapshot = adapter.snapshot();
  const labels = snapshot.kittachat_http_requests_total[0].labels;
  assert.deepEqual(Object.keys(labels).sort(), ["method", "route_template", "status_class"]);
  assert.equal(JSON.stringify(snapshot).includes("secret"), false);
  assert.equal(warnings.length, 0);
});
