const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createApp } = require("../../src/app");
const {
  createHttpMetricsMiddleware,
  getStatusClass,
} = require("../../src/observability/metrics/http/httpMetricsMiddleware");
const {
  createInMemoryMetricsAdapter,
  createMetricsModule,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");

const createHealthChecks = () => ({
  mongo: async () => ({ status: "connected" }),
  redis: async () => ({ status: "connected" }),
  rabbitmq: async () => ({ status: "connected" }),
});

const createServer = async ({ metricsEnabled, metricsModule } = {}) => {
  const logs = [];
  const app = createApp({
    metricsEnabled,
    metricsModule,
    healthChecks: createHealthChecks(),
    logger: {
      info(event, fields) {
        logs.push({ level: "info", event, fields });
      },
      error(event, fields) {
        logs.push({ level: "error", event, fields });
      },
      warn(event, fields) {
        logs.push({ level: "warn", event, fields });
      },
    },
  });
  app.set("socketio", {
    of() {
      return { sockets: new Map() };
    },
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    logs,
    async request(path, options) {
      const response = await fetch(`${this.baseUrl}${path}`, options);
      return { response, text: await response.text() };
    },
    async get(path, options) {
      return this.request(path, options);
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

test("enabled metrics expose an internal Prometheus endpoint", async () => {
  const metrics = createMetricsModule({
    adapter: createPromClientMetricsAdapter(),
  });
  const server = await createServer({
    metricsEnabled: true,
    metricsModule: metrics,
  });

  try {
    const { response, text } = await server.get("/metrics");

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/plain/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(text, /kittachat_http_requests_total/);
    assert.match(text, /kittachat_http_request_duration_seconds/);
  } finally {
    await server.close();
  }
});

test("disabled metrics do not register /metrics and preserve /ops", async () => {
  const metrics = createMetricsModule({
    adapter: createPromClientMetricsAdapter(),
  });
  const server = await createServer({
    metricsEnabled: false,
    metricsModule: metrics,
  });

  try {
    const metricsResponse = await server.get("/metrics");
    const opsResponse = await server.get("/ops");

    assert.equal(metricsResponse.response.status, 404);
    assert.equal(opsResponse.response.status, 200);
    const opsBody = JSON.parse(opsResponse.text);
    assert.equal(opsBody.monitoring.kind, "lightweight-ops");
    assert.equal(opsBody.monitoring.prometheus, false);
  } finally {
    await server.close();
  }
});

test("METRICS_ENABLED controls endpoint registration from the environment", async () => {
  const previousValue = process.env.METRICS_ENABLED;
  const metrics = createMetricsModule({
    adapter: createPromClientMetricsAdapter(),
  });

  try {
    process.env.METRICS_ENABLED = "false";
    const disabledServer = await createServer({ metricsModule: metrics });
    try {
      const { response } = await disabledServer.get("/metrics");
      assert.equal(response.status, 404);
    } finally {
      await disabledServer.close();
    }

    process.env.METRICS_ENABLED = "true";
    const enabledServer = await createServer({ metricsModule: metrics });
    try {
      const { response } = await enabledServer.get("/metrics");
      assert.equal(response.status, 200);
    } finally {
      await enabledServer.close();
    }
  } finally {
    if (previousValue === undefined) {
      delete process.env.METRICS_ENABLED;
    } else {
      process.env.METRICS_ENABLED = previousValue;
    }
  }
});

test("explicit false-like configuration does not enable the endpoint", async () => {
  const metrics = createMetricsModule({
    adapter: createPromClientMetricsAdapter(),
  });
  const server = await createServer({
    metricsEnabled: "false",
    metricsModule: metrics,
  });

  try {
    const { response } = await server.get("/metrics");
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("HTTP metrics observe a canonical request once through response finish", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const server = await createServer({
    metricsEnabled: true,
    metricsModule: metrics,
  });

  try {
    const { response } = await server.get("/healthz?token=redacted", {
      headers: { "x-request-id": "request-49-1" },
    });

    assert.equal(response.status, 200);
    const snapshot = adapter.snapshot();
    assert.equal(snapshot.kittachat_http_requests_total.length, 1);
    assert.equal(snapshot.kittachat_http_request_duration_seconds.length, 1);
    assert.deepEqual(snapshot.kittachat_http_requests_total[0].labels, {
      method: "GET",
      route_template: "/healthz",
      status_class: "2xx",
    });
    assert.equal(snapshot.kittachat_http_requests_total[0].value, 1);
    assert.equal(snapshot.kittachat_http_request_duration_seconds[0].labels.route_template, "/healthz");
    assert.equal(snapshot.kittachat_http_request_duration_seconds[0].labels.status_class, "2xx");
    assert.equal(Number.isFinite(snapshot.kittachat_http_request_duration_seconds[0].value), true);
    assert.equal(snapshot.kittachat_http_request_duration_seconds[0].value >= 0, true);
  } finally {
    await server.close();
  }
});

test("metrics scrapes are excluded while request-context logs remain correlated", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const server = await createServer({
    metricsEnabled: true,
    metricsModule: metrics,
  });

  try {
    const normalResponse = await server.get("/healthz", {
      headers: { "x-request-id": "request-49-normal" },
    });
    const beforeScrapes = adapter.snapshot();
    const scrapeOne = await server.get("/metrics");
    const scrapeTwo = await server.get("/metrics");
    const afterScrapes = adapter.snapshot();

    assert.equal(normalResponse.response.status, 200);
    assert.equal(scrapeOne.response.status, 200);
    assert.equal(scrapeTwo.response.status, 200);
    assert.deepEqual(afterScrapes, beforeScrapes);
    assert.equal(
      server.logs.find((entry) => entry.event === "http_request").fields.requestId,
      "request-49-normal",
    );
  } finally {
    await server.close();
  }
});

test("mounted routers use the mount prefix in the canonical route label", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const server = await createServer({
    metricsEnabled: true,
    metricsModule: metrics,
  });

  try {
    const { response } = await server.get("/api/auth/session", {
      headers: { "x-request-id": "request-49-mounted" },
    });

    assert.equal(response.status, 401);
    const snapshot = adapter.snapshot();
    assert.deepEqual(snapshot.kittachat_http_requests_total[0].labels, {
      method: "GET",
      route_template: "/api/auth/session",
      status_class: "4xx",
    });
  } finally {
    await server.close();
  }
});

test("HTTP labels use NOT_FOUND, UNMAPPED_ROUTE, OTHER, and bounded status classes", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const app = express();
  app.use(createHttpMetricsMiddleware({ metricsModule: metrics }));
  app.all("/healthz", (_req, res) => res.status(204).end());
  app.get("/noncanonical", (_req, res) => res.status(201).end());
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const unsupportedMethod = await new Promise((resolve, reject) => {
      const request = http.request(`${baseUrl}/healthz`, { method: "TRACE" }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      });
      request.once("error", reject);
      request.end();
    });
    const unmatched = await fetch(`${baseUrl}/missing?identifier=raw-value`);
    const noncanonical = await fetch(`${baseUrl}/noncanonical`);

    assert.equal(unsupportedMethod, 204);
    assert.equal(unmatched.status, 404);
    assert.equal(noncanonical.status, 201);

    const samples = adapter.snapshot().kittachat_http_requests_total;
    assert.deepEqual(samples.map(({ labels }) => labels).sort((a, b) => (
      `${a.route_template}-${a.method}`.localeCompare(`${b.route_template}-${b.method}`)
    )), [
      { method: "OTHER", route_template: "/healthz", status_class: "2xx" },
      { method: "GET", route_template: "NOT_FOUND", status_class: "4xx" },
      { method: "GET", route_template: "UNMAPPED_ROUTE", status_class: "2xx" },
    ].sort((a, b) => (
      `${a.route_template}-${a.method}`.localeCompare(`${b.route_template}-${b.method}`)
    )));
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  assert.deepEqual(
    [100, 199, 200, 299, 300, 399, 400, 499, 500, 599].map(getStatusClass),
    ["1xx", "1xx", "2xx", "2xx", "3xx", "3xx", "4xx", "4xx", "5xx", "5xx"],
  );
});

test("response finish is observed exactly once", () => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const request = {
    method: "GET",
    baseUrl: "",
    route: { path: "/healthz" },
    originalUrl: "/healthz",
  };
  const response = new EventEmitter();
  response.statusCode = 200;

  createHttpMetricsMiddleware({ metricsModule: metrics })(request, response, () => {
    response.emit("finish");
    response.emit("finish");
  });

  const snapshot = adapter.snapshot();
  assert.equal(snapshot.kittachat_http_requests_total.length, 1);
  assert.equal(snapshot.kittachat_http_request_duration_seconds.length, 1);
});

test("HTTP error completion logs retain the canonical request ID", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const server = await createServer({
    metricsEnabled: true,
    metricsModule: metrics,
  });

  try {
    const { response } = await server.request("/healthz?token=test-secret", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-49-error",
      },
      body: "{bad json",
    });

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("x-request-id"), "request-49-error");
    const errorLog = server.logs.find((entry) => entry.event === "http_request_error");
    const completionLog = server.logs.find((entry) => entry.event === "http_request");
    assert.equal(errorLog.fields.requestId, "request-49-error");
    assert.equal(completionLog.fields.requestId, "request-49-error");
    assert.equal(JSON.stringify(server.logs).includes("test-secret"), false);
    assert.equal(JSON.stringify(server.logs).includes("{bad json"), false);

    const snapshot = adapter.snapshot();
    assert.equal(snapshot.kittachat_http_requests_total[0].labels.status_class, "4xx");
  } finally {
    await server.close();
  }
});

test("Prometheus exposition keeps HTTP labels bounded and uses approved seconds buckets", async () => {
  const metrics = createMetricsModule({
    adapter: createPromClientMetricsAdapter(),
  });
  const server = await createServer({
    metricsEnabled: true,
    metricsModule: metrics,
  });

  try {
    await server.get("/healthz", {
      headers: { "x-request-id": "request-49-exposition" },
    });
    const { response, text } = await server.get("/metrics");

    assert.equal(response.status, 200);
    assert.match(
      text,
      /kittachat_http_requests_total\{method="GET",route_template="\/healthz",status_class="2xx"\} 1/,
    );
    assert.match(
      text,
      /kittachat_http_request_duration_seconds_count\{method="GET",route_template="\/healthz",status_class="2xx"\} 1/,
    );

    for (const bucket of [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
      assert.match(
        text,
        new RegExp(`kittachat_http_request_duration_seconds_bucket\\{le="${bucket}",method="GET",route_template="/healthz",status_class="2xx"\\}`),
      );
    }

    assert.equal(text.includes("request-49-exposition"), false);
    assert.equal(text.includes("token"), false);
  } finally {
    await server.close();
  }
});
