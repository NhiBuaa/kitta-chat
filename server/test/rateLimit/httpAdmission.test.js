const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");

const { createHttpRateLimitMiddleware } = require("../../src/rateLimit/httpAdmissionMiddleware");

const request = async ({ service, result, context }) => {
  const app = express();
  const events = [];
  app.set("rateLimiter", service || { admit: async () => result });
  app.use(createHttpRateLimitMiddleware({
    policyIds: ["auth_entry.aggregate"],
    context,
  }));
  app.use((_req, res) => {
    events.push("handler");
    res.status(200).json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    return { response, body: await response.json(), events };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("HTTP limiter admits before the protected handler", async () => {
  let capturedContext;
  const outcome = await request({
    service: {
      async admit(context) {
        capturedContext = context;
        return { allowed: true };
      },
    },
    context: () => ({ actor: { kind: "network", value: "127.0.0.1" } }),
  });

  assert.equal(outcome.response.status, 200);
  assert.deepEqual(outcome.body, { ok: true });
  assert.deepEqual(capturedContext.actor, { kind: "network", value: "127.0.0.1" });
  assert.deepEqual(outcome.events, ["handler"]);
});

test("HTTP limiter rejects without invoking the protected handler", async () => {
  const outcome = await request({
    result: { allowed: false, retryAfterMs: 4_100, policyId: "auth_entry.aggregate" },
  });

  assert.equal(outcome.response.status, 429);
  assert.equal(outcome.response.headers.get("retry-after"), "5");
  assert.equal(outcome.body.error.code, "RATE_LIMITED");
  assert.deepEqual(outcome.events, []);
});

test("HTTP limiter converts Redis failures to the unavailable contract", async () => {
  const outcome = await request({
    result: { allowed: false, unavailable: true, code: "RATE_LIMIT_UNAVAILABLE" },
  });

  assert.equal(outcome.response.status, 503);
  assert.equal(outcome.body.error.code, "RATE_LIMIT_UNAVAILABLE");
  assert.deepEqual(outcome.events, []);
});

test("HTTP limiter resolves multipart policy membership once before the protected handler", async () => {
  const app = express();
  const calls = [];
  app.set("rateLimiter", {
    async admit(input) {
      calls.push(input);
      return { allowed: true };
    },
  });
  app.use(express.raw({ type: "multipart/form-data" }));
  app.use(createHttpRateLimitMiddleware({
    policyIds: (req) => (String(req.headers["content-type"] || "").startsWith("multipart/form-data")
      ? ["state_mutation.aggregate", "state_mutation.profile", "file_resource.aggregate", "file_resource.upload_control"]
      : ["state_mutation.aggregate", "state_mutation.profile"]),
    context: () => ({ actor: { kind: "user", value: "user-1" } }),
  }));
  app.use((_req, res) => res.status(200).json({ ok: true }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "PUT",
      headers: { "Content-Type": "multipart/form-data; boundary=test" },
      body: "--test--",
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].policyIds, [
      "state_mutation.aggregate",
      "state_mutation.profile",
      "file_resource.aggregate",
      "file_resource.upload_control",
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
