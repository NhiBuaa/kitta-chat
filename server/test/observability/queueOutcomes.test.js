const assert = require("node:assert/strict");
const test = require("node:test");

const { createInMemoryMetricsAdapter, createMetricsModule } = require("../../src/observability/metrics");
const { IMAGE_JOB_QUEUE } = require("../../src/queues/imageJobs");
const { startQueueWorker } = require("../../src/workers/workerRuntime");

const createWorkerFixture = ({
  metrics,
  onPublish,
  processJob,
  logger,
  maxAttempts = 3,
} = {}) => {
  const calls = {
    ack: [],
    consume: [],
    nack: [],
    prefetch: [],
    sendToQueue: [],
  };

  const channel = {
    async prefetch(count) {
      calls.prefetch.push(count);
    },
    async consume(queueName, handler, options) {
      calls.consume.push({ queueName, handler, options });
    },
    sendToQueue(queueName, buffer, options, callback) {
      const payload = JSON.parse(buffer.toString("utf8"));
      calls.sendToQueue.push({
        options,
        payload,
        queueName,
      });
      if (onPublish) {
        onPublish({ callback, options, payload, queueName });
      } else {
        callback?.(null);
      }
      return true;
    },
    ack(message) {
      calls.ack.push(message);
    },
    nack(message, allUpTo, requeue) {
      calls.nack.push({ allUpTo, message, requeue });
    },
    on() {},
    once() {},
  };

  const connectionManager = {
    async close() {},
    async getChannel() {
      return channel;
    },
  };

  return {
    calls,
    async deliver(message) {
      await calls.consume[0].handler(message);
    },
    async start() {
      await startQueueWorker({
        connectionManager,
        logger,
        maxAttempts,
        metrics,
        processJob,
        queueName: IMAGE_JOB_QUEUE,
      });
    },
  };
};

const createLogger = (events = []) => ({
  error: (...args) => events.push(["error", ...args]),
  info: (...args) => events.push(["info", ...args]),
  warn: (...args) => events.push(["warn", ...args]),
});

const createMessage = (overrides = {}) => ({
  content: Buffer.from(JSON.stringify({
    correlationId: "corr-47-01",
    requestId: "req-47-01",
    type: "chat-image",
  })),
  properties: {
    correlationId: "corr-47-01",
    headers: { correlationId: "corr-47-01" },
  },
  ...overrides,
});

test("worker records exactly one processed outcome after successful terminal disposition", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const logger = createLogger();
  const metrics = createMetricsModule({ adapter, logger });
  const processed = [];
  const fixture = createWorkerFixture({
    logger,
    metrics,
    processJob: async (job) => {
      processed.push(job);
    },
  });

  await fixture.start();
  const message = createMessage();
  await fixture.deliver(message);

  const snapshot = adapter.snapshot();
  assert.deepEqual(processed, [{
    correlationId: "corr-47-01",
    requestId: "req-47-01",
    type: "chat-image",
  }]);
  assert.deepEqual(snapshot.kittachat_queue_jobs_total, [{
    labels: {
      job_type: "chat-image",
      outcome: "processed",
      queue: "image",
    },
    value: 1,
  }]);
  assert.equal(snapshot.kittachat_queue_dead_lettered_total, undefined);
  assert.deepEqual(fixture.calls.ack, [message]);
  assert.deepEqual(fixture.calls.nack, []);
});

test("worker records retried only after confirmed retry publication", async () => {
  let confirmRetry;
  const adapter = createInMemoryMetricsAdapter();
  const logger = createLogger();
  const metrics = createMetricsModule({ adapter, logger });
  const fixture = createWorkerFixture({
    logger,
    metrics,
    onPublish: ({ callback, queueName }) => {
      assert.equal(queueName, `${IMAGE_JOB_QUEUE}.retry`);
      confirmRetry = callback;
    },
    processJob: async () => {
      throw new Error("handler failed");
    },
  });

  await fixture.start();
  const message = createMessage();
  const delivery = fixture.deliver(message);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(adapter.snapshot().kittachat_queue_jobs_total, undefined);
  assert.equal(adapter.snapshot().kittachat_queue_dead_lettered_total, undefined);
  assert.equal(fixture.calls.ack.length, 0);

  confirmRetry(null);
  await delivery;

  assert.deepEqual(adapter.snapshot().kittachat_queue_jobs_total, [{
    labels: {
      job_type: "chat-image",
      outcome: "retried",
      queue: "image",
    },
    value: 1,
  }]);
  assert.equal(adapter.snapshot().kittachat_queue_dead_lettered_total, undefined);
  assert.deepEqual(fixture.calls.ack, [message]);
});

test("worker records failed when retry publication fails without a dead-letter reason", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const events = [];
  const logger = createLogger(events);
  const metrics = createMetricsModule({ adapter, logger });
  const fixture = createWorkerFixture({
    logger,
    metrics,
    onPublish: ({ callback }) => {
      callback(new Error("retry broker unavailable"));
    },
    processJob: async () => {
      throw new Error("handler failed");
    },
  });

  await fixture.start();
  const message = createMessage();
  await fixture.deliver(message);

  assert.deepEqual(adapter.snapshot().kittachat_queue_jobs_total, [{
    labels: {
      job_type: "chat-image",
      outcome: "failed",
      queue: "image",
    },
    value: 1,
  }]);
  assert.equal(adapter.snapshot().kittachat_queue_dead_lettered_total, undefined);
  assert.deepEqual(fixture.calls.ack, []);
  assert.deepEqual(fixture.calls.nack, []);
  const routingFailure = events.find((entry) => entry[1] === "worker_failure_routing_publish_failed");
  assert.equal(routingFailure[2].attempt, 0);
  assert.equal(routingFailure[2].failureStage, "retry_publish");
});

test("worker records failed and retry_exhausted after a confirmed terminal DLQ handoff", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const logger = createLogger();
  const metrics = createMetricsModule({ adapter, logger });
  const fixture = createWorkerFixture({
    logger,
    metrics,
    processJob: async () => {
      throw new Error("handler failed");
    },
  });

  await fixture.start();
  const message = createMessage({
    content: Buffer.from(JSON.stringify({
      attempts: 3,
      correlationId: "corr-47-04",
      requestId: "req-47-04",
      type: "chat-image",
    })),
    properties: {
      correlationId: "corr-47-04",
      headers: {
        attempts: 3,
        correlationId: "corr-47-04",
      },
    },
  });
  await fixture.deliver(message);

  const snapshot = adapter.snapshot();
  assert.deepEqual(snapshot.kittachat_queue_jobs_total, [{
    labels: {
      job_type: "chat-image",
      outcome: "failed",
      queue: "image",
    },
    value: 1,
  }]);
  assert.deepEqual(snapshot.kittachat_queue_dead_lettered_total, [{
    labels: {
      job_type: "chat-image",
      queue: "image",
      reason: "retry_exhausted",
    },
    value: 1,
  }]);
  assert.equal(fixture.calls.sendToQueue[0].queueName, `${IMAGE_JOB_QUEUE}.dlq`);
  assert.deepEqual(fixture.calls.ack, [message]);
});

test("worker records poison as a dead-letter reason and never as a job type", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const logger = createLogger();
  const metrics = createMetricsModule({ adapter, logger });
  let processJobCalls = 0;
  const fixture = createWorkerFixture({
    logger,
    metrics,
    processJob: async () => {
      processJobCalls += 1;
    },
  });

  await fixture.start();
  const message = createMessage({
    content: Buffer.from("{malformed-json"),
    properties: {
      correlationId: "corr-47-poison",
      headers: { correlationId: "corr-47-poison" },
    },
  });
  await fixture.deliver(message);

  const snapshot = adapter.snapshot();
  assert.equal(processJobCalls, 0);
  assert.deepEqual(snapshot.kittachat_queue_jobs_total, [{
    labels: {
      job_type: "OTHER",
      outcome: "failed",
      queue: "image",
    },
    value: 1,
  }]);
  assert.deepEqual(snapshot.kittachat_queue_dead_lettered_total, [{
    labels: {
      job_type: "OTHER",
      queue: "image",
      reason: "poison",
    },
    value: 1,
  }]);
  assert.equal(fixture.calls.sendToQueue[0].queueName, `${IMAGE_JOB_QUEUE}.dlq`);
  assert.deepEqual(fixture.calls.ack, [message]);
});

test("worker records failed without a dead-letter event when terminal DLQ publication fails", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const logger = createLogger();
  const metrics = createMetricsModule({ adapter, logger });
  const fixture = createWorkerFixture({
    logger,
    metrics,
    onPublish: ({ callback }) => {
      callback(new Error("dlq broker unavailable"));
    },
    processJob: async () => {
      throw new Error("handler failed");
    },
  });

  await fixture.start();
  const message = createMessage({
    content: Buffer.from(JSON.stringify({
      attempts: 3,
      correlationId: "corr-47-dlq-failure",
      type: "chat-image",
    })),
    properties: {
      correlationId: "corr-47-dlq-failure",
      headers: { attempts: 3, correlationId: "corr-47-dlq-failure" },
    },
  });
  await fixture.deliver(message);

  assert.deepEqual(adapter.snapshot().kittachat_queue_jobs_total, [{
    labels: {
      job_type: "chat-image",
      outcome: "failed",
      queue: "image",
    },
    value: 1,
  }]);
  assert.equal(adapter.snapshot().kittachat_queue_dead_lettered_total, undefined);
  assert.deepEqual(fixture.calls.ack, []);
  assert.deepEqual(fixture.calls.nack, []);
});

test("worker preserves the highest-precedence correlation ID through retry and DLQ carriers", async () => {
  const adapter = createInMemoryMetricsAdapter();
  const events = [];
  const logger = createLogger(events);
  const metrics = createMetricsModule({ adapter, logger });
  const fixture = createWorkerFixture({
    logger,
    metrics,
    processJob: async () => {
      throw new Error("handler failed");
    },
  });

  await fixture.start();
  await fixture.deliver(createMessage({
    content: Buffer.from(JSON.stringify({
      correlationId: "corr-47-payload",
      requestId: "corr-47-request",
      type: "chat-image",
    })),
    properties: {
      correlationId: "corr-47-transport",
      headers: { correlationId: "corr-47-header" },
    },
  }));

  const retryPublication = fixture.calls.sendToQueue[0];
  assert.equal(retryPublication.options.correlationId, "corr-47-transport");
  assert.equal(retryPublication.options.headers.correlationId, "corr-47-transport");
  assert.equal(retryPublication.payload.correlationId, "corr-47-transport");
  assert.ok(events.some((entry) => entry[1] === "correlation_context_mismatch"));

  await fixture.deliver({
    content: Buffer.from(JSON.stringify({
      ...retryPublication.payload,
      attempts: 3,
    })),
    properties: {
      correlationId: retryPublication.options.correlationId,
      headers: {
        ...retryPublication.options.headers,
        attempts: 3,
      },
    },
  });

  const dlqPublication = fixture.calls.sendToQueue[1];
  assert.equal(dlqPublication.options.correlationId, "corr-47-transport");
  assert.equal(dlqPublication.options.headers.correlationId, "corr-47-transport");
  assert.equal(dlqPublication.payload.correlationId, "corr-47-transport");
  assert.equal(dlqPublication.payload.job.correlationId, "corr-47-transport");
  assert.deepEqual(adapter.snapshot().kittachat_queue_dead_lettered_total, [{
    labels: {
      job_type: "chat-image",
      queue: "image",
      reason: "retry_exhausted",
    },
    value: 1,
  }]);
});

test("worker metrics observation failures do not change processing or disposition", async () => {
  const events = [];
  const logger = createLogger(events);
  const metrics = {
    observeQueueDeadLettered() {
      throw new Error("metrics unavailable");
    },
    observeQueueJob() {
      throw new Error("metrics unavailable");
    },
  };
  const processed = [];
  const fixture = createWorkerFixture({
    logger,
    metrics,
    processJob: async (job) => {
      processed.push(job.type);
    },
  });

  await fixture.start();
  const message = createMessage();
  await assert.doesNotReject(fixture.deliver(message));

  assert.deepEqual(processed, ["chat-image"]);
  assert.deepEqual(fixture.calls.ack, [message]);
  assert.deepEqual(fixture.calls.nack, []);
  assert.ok(events.some((entry) => (
    entry[1] === "worker_metrics_observation_failed"
    && entry[2].metric === "observeQueueJob"
  )));
});
