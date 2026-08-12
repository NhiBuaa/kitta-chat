const assert = require("node:assert/strict");
const test = require("node:test");

const authRouterPath = require.resolve("../src/routes/auth");
const requestLoggingPath = require.resolve("../src/middlewares/requestLogging");

test("reset route accepts token only in the JSON body and has no legacy token path route", () => {
  delete require.cache[authRouterPath];
  const router = require(authRouterPath);
  const resetRoutes = router.stack
    .filter((layer) => layer.route?.methods.post)
    .map((layer) => layer.route.path)
    .filter((path) => path.startsWith("/reset-password"));

  assert.deepEqual(resetRoutes, ["/reset-password/:id"]);
});

test("request logging never records a reset token sent in the body", async () => {
  delete require.cache[requestLoggingPath];
  const { createRequestLoggingMiddleware } = require(requestLoggingPath);
  const entries = [];
  const middleware = createRequestLoggingMiddleware({
    logger: { info: (_event, fields) => entries.push(fields) },
    requestIdGenerator: () => "request-id",
  });
  const listeners = {};
  const req = {
    method: "POST",
    originalUrl: "/api/auth/reset-password/user-1",
    headers: {},
    body: { token: "synthetic-reset-token" },
  };
  const res = {
    statusCode: 400,
    setHeader() {},
    on(event, listener) { listeners[event] = listener; },
  };

  middleware(req, res, () => {});
  listeners.finish();

  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "/api/auth/reset-password/user-1");
  assert.equal(JSON.stringify(entries[0]).includes("synthetic-reset-token"), false);
});
