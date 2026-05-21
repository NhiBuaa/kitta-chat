const assert = require("node:assert/strict");
const test = require("node:test");

const { createApp } = require("../src/app");

const createServer = async ({ mongoStatus, redisStatus, rabbitmqStatus }) => {
  const logs = [];
  const app = createApp({
    logger: {
      info(event, fields) {
        logs.push({ event, fields });
      },
    },
    healthChecks: {
      mongo: async () => mongoStatus,
      redis: async () => redisStatus,
      rabbitmq: async () => rabbitmqStatus,
    },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    logs,
    async get(path) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: { "x-request-id": `req-${path}` },
      });
      return { response, body: await response.json() };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

test("/healthz returns healthy when Mongo, Redis, and RabbitMQ are connected", async () => {
  const server = await createServer({
    mongoStatus: { status: "connected" },
    redisStatus: { status: "connected" },
    rabbitmqStatus: { status: "connected" },
  });

  try {
    const { response, body } = await server.get("/healthz");

    assert.equal(response.status, 200);
    assert.equal(body.status, "healthy");
    assert.equal(body.services.mongo.status, "connected");
    assert.equal(body.services.redis.status, "connected");
    assert.equal(body.services.rabbitmq.status, "connected");
    assert.equal(typeof body.instance.uptime, "number");
    assert.ok(body.timestamp);
  } finally {
    await server.close();
  }
});

test("/healthz returns degraded when optional RabbitMQ is unavailable", async () => {
  const server = await createServer({
    mongoStatus: { status: "connected" },
    redisStatus: { status: "connected" },
    rabbitmqStatus: { status: "unavailable", error: "rabbit down" },
  });

  try {
    const { response, body } = await server.get("/healthz");

    assert.equal(response.status, 200);
    assert.equal(body.status, "degraded");
    assert.equal(body.services.rabbitmq.status, "unavailable");
  } finally {
    await server.close();
  }
});

test("/healthz returns unhealthy when a required dependency is unavailable", async () => {
  const server = await createServer({
    mongoStatus: { status: "disconnected" },
    redisStatus: { status: "connected" },
    rabbitmqStatus: { status: "connected" },
  });

  try {
    const { response, body } = await server.get("/healthz");

    assert.equal(response.status, 503);
    assert.equal(body.status, "unhealthy");
    assert.equal(body.services.mongo.status, "disconnected");
  } finally {
    await server.close();
  }
});

test("/readyz reports ready only when required startup dependencies are connected", async () => {
  const readyServer = await createServer({
    mongoStatus: { status: "connected" },
    redisStatus: { status: "connected" },
    rabbitmqStatus: { status: "unavailable", error: "rabbit down" },
  });

  try {
    const { response, body } = await readyServer.get("/readyz");

    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.services.mongo.status, "connected");
    assert.equal(body.services.redis.status, "connected");
    assert.equal(body.services.rabbitmq.status, "unavailable");
  } finally {
    await readyServer.close();
  }

  const notReadyServer = await createServer({
    mongoStatus: { status: "connected" },
    redisStatus: { status: "unavailable", error: "redis down" },
    rabbitmqStatus: { status: "connected" },
  });

  try {
    const { response, body } = await notReadyServer.get("/readyz");

    assert.equal(response.status, 503);
    assert.equal(body.status, "not_ready");
    assert.equal(body.services.redis.status, "unavailable");
  } finally {
    await notReadyServer.close();
  }
});
