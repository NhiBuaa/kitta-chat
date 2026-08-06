const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");

const { createRequestLoggingMiddleware } = require("../../src/middlewares/requestLogging");
const {
  createInMemoryMetricsAdapter,
  createMetricsModule,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");
const { createProducer } = require("../../src/queues/producer");
const { IMAGE_JOB_QUEUE } = require("../../src/queues/imageJobs");
const { startQueueWorker } = require("../../src/workers/workerRuntime");

const saveMessagePath = require.resolve("../../src/utils/saveMessageInBackground");
const messageModelPath = require.resolve("../../src/models/Message");
const redisConfigPath = require.resolve("../../src/config/redis");
const dualWritePath = require.resolve("../../src/services/conversationDualWriteService");

const mockModule = (modulePath, exports) => {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
  };
};

const clearPersistenceModules = () => {
  for (const modulePath of [saveMessagePath, messageModelPath, redisConfigPath, dualWritePath]) {
    delete require.cache[modulePath];
  }
};

const createLogCollector = () => {
  const events = [];
  const logger = {
    error(event, fields) { events.push({ level: "error", event, fields }); },
    info(event, fields) { events.push({ level: "info", event, fields }); },
    warn(event, fields) { events.push({ level: "warn", event, fields }); },
  };
  return { events, logger };
};

const createBrokerFixture = () => {
  const publications = [];
  let handler;

  const channel = {
    ack() {},
    async consume(_queueName, consumer) {
      handler = consumer;
    },
    on() {},
    async prefetch() {},
    sendToQueue(queueName, body, options, callback) {
      publications.push({
        options,
        payload: JSON.parse(body.toString("utf8")),
        queueName,
      });
      callback?.(null);
      return true;
    },
  };

  return {
    connectionManager: {
      async close() {},
      async getChannel() { return channel; },
    },
    async deliver(publication, attempts = 0) {
      await handler({
        content: Buffer.from(JSON.stringify(publication.payload)),
        properties: {
          correlationId: publication.options.correlationId,
          headers: {
            ...publication.options.headers,
            ...(attempts > 0 ? { attempts } : {}),
          },
        },
      });
    },
    publications,
  };
};

const startHttpServer = async (app) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

test("REST publication and worker retry/DLQ logs retain one canonical correlation ID while queue metrics stay aggregate", async () => {
  const { events, logger } = createLogCollector();
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter, logger });
  const broker = createBrokerFixture();
  const producer = createProducer({ connectionManager: broker.connectionManager });
  const worker = await startQueueWorker({
    connectionManager: broker.connectionManager,
    logger,
    maxAttempts: 1,
    metrics,
    processJob: async () => {
      throw new Error("synthetic handler failure");
    },
    queueName: IMAGE_JOB_QUEUE,
  });

  const app = express();
  app.use(express.json());
  app.use(createRequestLoggingMiddleware({ logger }));
  app.post("/jobs", async (_req, res, next) => {
    try {
      await producer.publish(IMAGE_JOB_QUEUE, { type: "chat-image" });
      res.status(202).json({ queued: true });
    } catch (error) {
      next(error);
    }
  });
  app.use((_error, _req, res, _next) => res.status(500).end());
  const server = await startHttpServer(app);

  try {
    const response = await fetch(`${server.url}/jobs`, {
      method: "POST",
      headers: { "x-request-id": "issue52-request-worker" },
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { queued: true });

    const initialPublication = broker.publications[0];
    assert.equal(initialPublication.options.correlationId, "issue52-request-worker");
    assert.equal(initialPublication.options.headers.correlationId, "issue52-request-worker");
    assert.equal(initialPublication.payload.correlationId, "issue52-request-worker");

    await broker.deliver(initialPublication);
    const retryPublication = broker.publications[1];
    assert.equal(retryPublication.queueName, `${IMAGE_JOB_QUEUE}.retry`);
    assert.equal(retryPublication.options.correlationId, "issue52-request-worker");
    assert.equal(retryPublication.payload.correlationId, "issue52-request-worker");

    await broker.deliver(retryPublication, 1);
    const dlqPublication = broker.publications[2];
    assert.equal(dlqPublication.queueName, `${IMAGE_JOB_QUEUE}.dlq`);
    assert.equal(dlqPublication.options.correlationId, "issue52-request-worker");
    assert.equal(dlqPublication.payload.correlationId, "issue52-request-worker");
    assert.equal(dlqPublication.payload.job.correlationId, "issue52-request-worker");

    const correlationEvents = events.filter((entry) => [
      "http_request",
      "worker_job_failed",
      "worker_job_retry",
      "worker_job_dlq",
    ].includes(entry.event));
    assert.equal(correlationEvents.find((entry) => entry.event === "http_request").fields.requestId, "issue52-request-worker");
    for (const event of correlationEvents.filter((entry) => entry.event !== "http_request")) {
      assert.equal(event.fields.correlationId, "issue52-request-worker");
    }

    assert.deepEqual(adapter.snapshot().kittachat_queue_jobs_total, [
      { labels: { job_type: "chat-image", outcome: "retried", queue: "image" }, value: 1 },
      { labels: { job_type: "chat-image", outcome: "failed", queue: "image" }, value: 1 },
    ]);
    assert.deepEqual(adapter.snapshot().kittachat_queue_dead_lettered_total, [
      { labels: { job_type: "chat-image", queue: "image", reason: "retry_exhausted" }, value: 1 },
    ]);
    assert.equal(JSON.stringify(adapter.snapshot()).includes("issue52-request-worker"), false);
  } finally {
    await worker.stop();
    await server.close();
  }
});

test("Mongo-backed persistence changes only aggregate histogram samples and excludes request/message identity", async () => {
  clearPersistenceModules();
  const idempotencyField = ["idempotency", "Key"].join("");
  const fixtureIdempotencyValue = ["issue", "52", String(process.pid)].join("-");
  const insertedDocument = {
    _id: "message-52",
    attachments: [],
    conversationId: "receiver-52_sender-52",
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    hasLink: false,
    [idempotencyField]: fixtureIdempotencyValue,
    isRead: false,
    links: [],
    receiver: "receiver-52",
    sender: "sender-52",
    text: "synthetic message",
    type: "text",
  };

  mockModule(messageModelPath, {
    async findOneAndUpdate() {
      return {
        lastErrorObject: { updatedExisting: false },
        value: insertedDocument,
      };
    },
  });
  mockModule(redisConfigPath, { cacheClient: { isOpen: false } });
  mockModule(dualWritePath, { async dualWriteConfirmedMessage() {} });

  const saveMessageInBackground = require(saveMessagePath);
  const metrics = createMetricsModule({ adapter: createPromClientMetricsAdapter() });
  let clockCalls = 0;
  const clock = () => {
    clockCalls += 1;
    return clockCalls === 1 ? 1_000_000_000n : 1_250_000_000n;
  };

  try {
    const result = await saveMessageInBackground({
      [idempotencyField]: fixtureIdempotencyValue,
      receiverId: "receiver-52",
      sender: { _id: "sender-52" },
      text: "synthetic message",
    }, { clock, metricsModule: metrics });
    const rendered = await metrics.renderPrometheus();

    assert.equal(result.doc, insertedDocument);
    assert.equal(result.isDuplicate, false);
    assert.match(
      rendered.body,
      /kittachat_message_persistence_duration_seconds_count\{outcome="success"\} 1/,
    );
    assert.doesNotMatch(rendered.body, /message-52|sender-52|receiver-52|idempotency-52|synthetic message/);
  } finally {
    clearPersistenceModules();
  }
});
