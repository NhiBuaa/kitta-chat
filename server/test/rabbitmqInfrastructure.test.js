const assert = require("node:assert/strict");
const test = require("node:test");

const { IMAGE_JOB_QUEUE } = require("../src/queues/imageJobs");
const { createImageQueue } = require("../src/queues/imageQueue");
const { createRabbitConnectionManager } = require("../src/queues/connectionManager");
const { createProducer } = require("../src/queues/producer");
const { startQueueWorker } = require("../src/workers/workerRuntime");
const { getRabbitUrl } = require("../src/queues/connectionManager");

const createFakeAmqp = () => {
  const calls = {
    connect: [],
    assertQueue: [],
    sendToQueue: [],
    consume: [],
    prefetch: [],
    ack: [],
    nack: [],
  };

  const channel = {
    async assertQueue(queueName, options) {
      calls.assertQueue.push({ queueName, options });
    },
    sendToQueue(queueName, buffer, options) {
      calls.sendToQueue.push({
        queueName,
        payload: JSON.parse(buffer.toString("utf8")),
        options,
      });
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
    async close() {},
  };

  const connection = {
    async createChannel() {
      return channel;
    },
    on() {},
    async close() {},
  };

  return {
    calls,
    channel,
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
  assert.deepEqual(amqp.calls.assertQueue, [
    { queueName: "image.process", options: { durable: true } },
  ]);
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

test("worker bootstrap dead-letters failed jobs without requeueing", async () => {
  const amqp = createFakeAmqp();
  const manager = createRabbitConnectionManager({
    amqp,
    url: "amqp://test",
    queues: [{ name: IMAGE_JOB_QUEUE, options: { durable: true } }],
  });

  await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager: manager,
    processJob: async () => {
      throw new Error("boom");
    },
    logger: { error() {} },
  });

  const message = {
    content: Buffer.from(JSON.stringify({ type: "chat-image", requestId: "req-1" })),
  };
  await amqp.calls.consume[0].handler(message);

  assert.deepEqual(amqp.calls.ack, []);
  assert.deepEqual(amqp.calls.nack, [{ message, allUpTo: false, requeue: false }]);
});
