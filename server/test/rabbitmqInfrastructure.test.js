const assert = require("node:assert/strict");
const test = require("node:test");

const { IMAGE_JOB_QUEUE } = require("../src/queues/imageJobs");
const { createImageQueue } = require("../src/queues/imageQueue");
const { createRabbitConnectionManager } = require("../src/queues/connectionManager");
const { createProducer } = require("../src/queues/producer");
const { startQueueWorker } = require("../src/workers/workerRuntime");
const { getRabbitUrl } = require("../src/queues/connectionManager");
const { getRetryDelayMs, QUEUE_TOPOLOGY } = require("../src/queues/topology");

const createFakeAmqp = () => {
  const calls = {
    connect: [],
    createConfirmChannel: 0,
    assertQueue: [],
    sendToQueue: [],
    consume: [],
    prefetch: [],
    ack: [],
    nack: [],
  };

  const createChannel = () => {
    const handlers = {};

    return {
      async assertQueue(queueName, options) {
        calls.assertQueue.push({ queueName, options });
      },
      sendToQueue(queueName, buffer, options, callback) {
        calls.sendToQueue.push({
          queueName,
          payload: JSON.parse(buffer.toString("utf8")),
          options,
        });
        if (callback) callback(null);
        return true;
      },
      async prefetch(count) {
        calls.prefetch.push(count);
      },
      async consume(queueName, handler, options) {
        calls.consume.push({ queueName, handler, options });
      },
      ack(message) {
        calls.ack.push(message);
      },
      nack(message, allUpTo, requeue) {
        calls.nack.push({ message, allUpTo, requeue });
      },
      on(eventName, handler) {
        handlers[eventName] = handlers[eventName] || [];
        handlers[eventName].push(handler);
      },
      once(eventName, handler) {
        this.on(eventName, handler);
      },
      emit(eventName, payload) {
        for (const handler of handlers[eventName] || []) {
          handler(payload);
        }
      },
      async close() {
        this.emit("close");
      },
    };
  };

  const channels = [];
  const channel = createChannel();
  channels.push(channel);

  const connection = {
    async createConfirmChannel() {
      calls.createConfirmChannel += 1;
      if (channels.length < calls.createConfirmChannel) {
        channels.push(createChannel());
      }
      return channels[calls.createConfirmChannel - 1];
    },
    on() {},
    async close() {},
  };

  return {
    calls,
    channel,
    channels,
    async connect(url) {
      calls.connect.push(url);
      return connection;
    },
  };
};

test("RabbitMQ connection manager connects once and asserts configured queues", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  const firstChannel = await manager.getChannel();
  const secondChannel = await manager.getChannel();

  assert.equal(firstChannel, secondChannel);
  assert.deepEqual(amqp.calls.connect, ["amqp://test"]);
  assert.equal(amqp.calls.createConfirmChannel, 1);
  assert.deepEqual(amqp.calls.assertQueue, [
    { queueName: "image.process", options: { durable: true } },
  ]);
});

test("RabbitMQ connection manager reports connected health after channel setup", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  assert.deepEqual(await manager.checkStatus(), { status: "connected" });
});

test("RabbitMQ connection manager reports unavailable health when broker connection fails", async () => {
  const manager = createRabbitConnectionManager({
    amqp: {
      async connect() {
        throw new Error("rabbit down");
      },
    },
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  assert.deepEqual(await manager.checkStatus(), {
    status: "unavailable",
    error: "rabbit down",
  });
});

test("RabbitMQ URL defaults to localhost for local server runs", () => {
  const previousUrl = process.env.RABBITMQ_URL;
  delete process.env.RABBITMQ_URL;

  try {
    assert.equal(getRabbitUrl(), "amqp://guest:guest@localhost:5672");
  } finally {
    if (previousUrl === undefined) {
      delete process.env.RABBITMQ_URL;
    } else {
      process.env.RABBITMQ_URL = previousUrl;
    }
  }
});

test("RabbitMQ topology includes retry and dead-letter queues for background jobs", () => {
  const queueNames = QUEUE_TOPOLOGY.map((queue) => queue.name);
  const imageRetryQueue = QUEUE_TOPOLOGY.find((queue) => queue.name === "image.process.retry");

  assert.ok(queueNames.includes("image.process.dlq"));
  assert.ok(queueNames.includes("notification.email.dlq"));
  assert.ok(queueNames.includes("audit.events.dlq"));
  assert.ok(queueNames.includes("image.process.retry"));
  assert.ok(queueNames.includes("notification.email.retry"));
  assert.ok(queueNames.includes("audit.events.retry"));
  assert.deepEqual(imageRetryQueue.options, {
    durable: true,
    messageTtl: getRetryDelayMs(),
    deadLetterExchange: "",
    deadLetterRoutingKey: "image.process",
  });
});

test("producer publishes JSON jobs as persistent messages", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });
  const producer = createProducer({ connectionManager: manager });

  await producer.publish(IMAGE_JOB_QUEUE, { type: "chat-image", requestId: "req-1" });

  assert.deepEqual(amqp.calls.sendToQueue, [
    {
      queueName: "image.process",
      payload: { type: "chat-image", requestId: "req-1" },
      options: {
        contentType: "application/json",
        persistent: true,
      },
    },
  ]);
});

test("producer resolves only after broker confirms the published job", async () => {
  let confirmPublish;
  const amqp = createFakeAmqp();
  amqp.channel.sendToQueue = (queueName, buffer, options, callback) => {
    amqp.calls.sendToQueue.push({
      queueName,
      payload: JSON.parse(buffer.toString("utf8")),
      options,
    });
    confirmPublish = callback;
    return true;
  };

  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });
  const producer = createProducer({ connectionManager: manager });

  let resolved = false;
  const publishPromise = producer
    .publish(IMAGE_JOB_QUEUE, { type: "chat-image", requestId: "req-confirm-1" })
    .then(() => {
      resolved = true;
    });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolved, false);

  confirmPublish(null);
  await publishPromise;

  assert.equal(resolved, true);
});

test("image queue publishes image jobs to the image processing queue", async () => {
  const published = [];
  const imageQueue = createImageQueue({
    producer: {
      async publish(queueName, job) {
        published.push({ queueName, job });
      },
    },
  });

  await imageQueue.publishImageJob({ type: "avatar-image", requestId: "req-2" });

  assert.deepEqual(published, [
    {
      queueName: IMAGE_JOB_QUEUE,
      job: { type: "avatar-image", requestId: "req-2" },
    },
  ]);
});

test("worker bootstrap consumes JSON jobs and acks successful processing", async () => {
  const amqp = createFakeAmqp();
  const processed = [];
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager: manager,
    prefetch: 3,
    processJob: async (job) => {
      processed.push(job);
    },
  });

  const message = {
    content: Buffer.from(JSON.stringify({ type: "chat-image", requestId: "req-1" })),
  };
  await amqp.calls.consume[0].handler(message);

  assert.deepEqual(amqp.calls.prefetch, [3]);
  assert.equal(amqp.calls.consume[0].queueName, IMAGE_JOB_QUEUE);
  assert.deepEqual(processed, [{ type: "chat-image", requestId: "req-1" }]);
  assert.deepEqual(amqp.calls.ack, [message]);
  assert.deepEqual(amqp.calls.nack, []);
});

test("worker bootstrap publishes failed jobs to the retry queue before max attempts", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager: manager,
    maxAttempts: 3,
    processJob: async () => {
      throw new Error("boom");
    },
    logger: { error() {} },
  });

  const message = {
    content: Buffer.from(JSON.stringify({ type: "chat-image", requestId: "req-1" })),
  };
  await amqp.calls.consume[0].handler(message);

  assert.equal(amqp.calls.sendToQueue[0].queueName, "image.process.retry");
  assert.deepEqual(amqp.calls.sendToQueue[0].payload, {
    type: "chat-image",
    requestId: "req-1",
    attempts: 1,
  });
  assert.equal(amqp.calls.sendToQueue[0].options.headers.attempts, 1);
  assert.deepEqual(amqp.calls.ack, [message]);
  assert.deepEqual(amqp.calls.nack, []);
});

test("worker bootstrap publishes failed jobs to DLQ at max attempts", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager: manager,
    maxAttempts: 3,
    processJob: async () => {
      throw new Error("boom");
    },
    logger: { error() {}, warn() {} },
  });

  const message = {
    content: Buffer.from(JSON.stringify({ type: "chat-image", requestId: "req-1", attempts: 3 })),
    properties: { headers: { attempts: 3 } },
  };
  await amqp.calls.consume[0].handler(message);

  assert.equal(amqp.calls.sendToQueue[0].queueName, "image.process.dlq");
  assert.deepEqual(amqp.calls.sendToQueue[0].payload.job, {
    type: "chat-image",
    requestId: "req-1",
    attempts: 3,
  });
  assert.equal(amqp.calls.sendToQueue[0].payload.error.message, "boom");
  assert.equal(amqp.calls.sendToQueue[0].payload.error.originalQueue, IMAGE_JOB_QUEUE);
  assert.match(amqp.calls.sendToQueue[0].payload.error.failedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(amqp.calls.ack, [message]);
  assert.deepEqual(amqp.calls.nack, []);
});

test("worker bootstrap leaves the original job unacked when retry publish fails", async () => {
  const amqp = createFakeAmqp();
  amqp.channel.sendToQueue = (queueName, buffer, options, callback) => {
    amqp.calls.sendToQueue.push({
      queueName,
      payload: JSON.parse(buffer.toString("utf8")),
      options,
    });
    callback(new Error("dlq down"));
    return true;
  };

  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager: manager,
    maxAttempts: 3,
    processJob: async () => {
      throw new Error("boom");
    },
    logger: { error() {} },
  });

  const message = {
    content: Buffer.from(JSON.stringify({ type: "chat-image", requestId: "req-1" })),
  };
  await amqp.calls.consume[0].handler(message);

  assert.equal(amqp.calls.sendToQueue[0].queueName, "image.process.retry");
  assert.deepEqual(amqp.calls.ack, []);
  assert.deepEqual(amqp.calls.nack, []);
});

test("worker bootstrap re-registers the consumer after channel close", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  const worker = await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager: manager,
    reconnectDelayMs: 1,
    processJob: async () => {},
    logger: { error() {}, warn() {}, log() {} },
  });

  amqp.channels[0].emit("close");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(amqp.calls.createConfirmChannel, 2);
  assert.equal(amqp.calls.consume.length, 2);
  assert.equal(amqp.calls.consume[1].queueName, IMAGE_JOB_QUEUE);

  await worker.stop();
});
