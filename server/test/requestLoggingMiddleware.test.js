const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");

const {
  createRequestLoggingMiddleware,
} = require("../src/middlewares/requestLogging");

const createServer = async ({ logger, handler, requestIdGenerator } = {}) => {
  const app = express();
  app.use(
    createRequestLoggingMiddleware({
      logger,
      requestIdGenerator,
    }),
  );
  app.get("/public", handler || ((req, res) => res.json({ ok: true })));
  app.get("/me", (req, res) => {
    req.user = { id: "user-1" };
    res.json({ ok: true });
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

test("request logging preserves an incoming x-request-id and returns it", async () => {
  const logs = [];
  const server = await createServer({
    logger: {
      info(event, fields) {
        logs.push({ event, fields });
      },
    },
  });

  try {
    const response = await fetch(`${server.baseUrl}/public`, {
      headers: {
        "x-request-id": "req-client-1",
        authorization: "Bearer secret-token",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "req-client-1");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].event, "http_request");
    assert.equal(logs[0].fields.requestId, "req-client-1");
    assert.equal(logs[0].fields.method, "GET");
    assert.equal(logs[0].fields.path, "/public");
    assert.equal(logs[0].fields.status, 200);
    assert.equal(typeof logs[0].fields.latencyMs, "number");
    assert.equal("authorization" in logs[0].fields, false);
    assert.equal(JSON.stringify(logs[0].fields).includes("secret-token"), false);
  } finally {
    await server.close();
  }
});

test("request logging generates an x-request-id when the client omits it", async () => {
  const logs = [];
  const server = await createServer({
    requestIdGenerator: () => "generated-req-1",
    logger: {
      info(event, fields) {
        logs.push({ event, fields });
      },
    },
  });

  try {
    const response = await fetch(`${server.baseUrl}/public`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "generated-req-1");
    assert.equal(logs[0].fields.requestId, "generated-req-1");
  } finally {
    await server.close();
  }
});

test("request logging includes userId when authentication middleware sets req.user", async () => {
  const logs = [];
  const server = await createServer({
    logger: {
      info(event, fields) {
        logs.push({ event, fields });
      },
    },
  });

  try {
    const response = await fetch(`${server.baseUrl}/me`, {
      headers: {
        "x-request-id": "req-user-1",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(logs[0].fields.requestId, "req-user-1");
    assert.equal(logs[0].fields.userId, "user-1");
  } finally {
    await server.close();
  }
});
