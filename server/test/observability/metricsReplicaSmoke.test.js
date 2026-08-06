const assert = require("node:assert/strict");
const test = require("node:test");

const { createApp } = require("../../src/app");
const {
  createMetricsModule,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");

const healthChecks = {
  mongo: async () => ({ status: "connected" }),
  redis: async () => ({ status: "connected" }),
  rabbitmq: async () => ({ status: "connected" }),
};

const createReplica = async () => {
  const metrics = createMetricsModule({ adapter: createPromClientMetricsAdapter() });
  const app = createApp({
    healthChecks,
    logger: { info() {}, warn() {}, error() {} },
    metricsModule: metrics,
  });
  app.set("socketio", { of: () => ({ sockets: new Map() }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    metrics,
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

const withMetricsEnabled = async (enabled, callback) => {
  const previous = process.env.METRICS_ENABLED;
  process.env.METRICS_ENABLED = enabled ? "true" : "false";

  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.METRICS_ENABLED;
    else process.env.METRICS_ENABLED = previous;
  }
};

const seedAllMetricFamilies = (metrics) => {
  metrics.observeHttpRequest({
    method: "GET",
    routeTemplate: "/healthz",
    statusClass: "2xx",
    durationSeconds: 0.01,
  });
  metrics.observeSocketConnection({ event: "connected" });
  metrics.observeMessagePersistence({ outcome: "success", durationSeconds: 0.01 });
  metrics.observeRedisOperation({ operation: "get", outcome: "success" });
  metrics.observeCacheFallback({ reason: "miss" });
  metrics.observeQueueJob({ queue: "image", jobType: "chat-image", outcome: "processed" });
  metrics.observeQueueDeadLettered({ queue: "image", jobType: "chat-image", reason: "poison" });
};

const sampleLine = (body, metricName) => body
  .split(/\r?\n/)
  .find((line) => line.startsWith(`${metricName}{`) || line.startsWith(`${metricName} `));

test("monitoring-enabled replicas expose direct, parseable metrics without scrape self-counting", async () => {
  const initialMetricsEnabled = process.env.METRICS_ENABLED;
  await withMetricsEnabled(true, async () => {
    const replicas = await Promise.all([
      createReplica(),
      createReplica(),
      createReplica(),
    ]);

    try {
      for (const replica of replicas) {
        seedAllMetricFamilies(replica.metrics);
        const normalResponse = await fetch(`${replica.url}/healthz`);
        assert.equal(normalResponse.status, 200);

        const first = await fetch(`${replica.url}/metrics`);
        const second = await fetch(`${replica.url}/metrics`);
        const firstBody = await first.text();
        const secondBody = await second.text();

        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.match(first.headers.get("content-type"), /text\/plain/);
        assert.equal(first.headers.get("cache-control"), "no-store");
        for (const metricName of [
          "kittachat_http_requests_total",
          "kittachat_http_request_duration_seconds",
          "kittachat_socket_active_connections",
          "kittachat_message_persistence_duration_seconds",
          "kittachat_redis_operations_total",
          "kittachat_cache_fallbacks_total",
          "kittachat_queue_jobs_total",
          "kittachat_queue_dead_lettered_total",
        ]) {
          assert.match(firstBody, new RegExp(`^# HELP ${metricName} `, "m"));
          assert.match(firstBody, new RegExp(`^# TYPE ${metricName} `, "m"));
        }
        assert.equal(sampleLine(firstBody, "kittachat_http_requests_total"), sampleLine(secondBody, "kittachat_http_requests_total"));
        assert.equal(sampleLine(firstBody, "kittachat_http_request_duration_seconds_count"), sampleLine(secondBody, "kittachat_http_request_duration_seconds_count"));
      }
    } finally {
      await Promise.all(replicas.map((replica) => replica.close()));
    }
  });

  assert.equal(process.env.METRICS_ENABLED, initialMetricsEnabled);
});

test("metrics-disabled replicas keep /metrics unregistered while /ops remains available", async () => {
  await withMetricsEnabled(false, async () => {
    const replica = await createReplica();

    try {
      const metricsResponse = await fetch(`${replica.url}/metrics`);
      const opsResponse = await fetch(`${replica.url}/ops`);

      assert.equal(metricsResponse.status, 404);
      assert.equal(opsResponse.status, 200);
      const opsBody = await opsResponse.json();
      assert.equal(opsBody.monitoring.prometheus, false);
    } finally {
      await replica.close();
    }
  });
});
