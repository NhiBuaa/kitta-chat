const assert = require("node:assert/strict");
const test = require("node:test");

const { createApp } = require("../src/app");

const quietLogger = { info() {}, warn() {}, error() {} };

const withServer = async (capabilities, callback) => {
  let limiterCalls = 0;
  const app = createApp({
    capabilities,
    logger: quietLogger,
    rateLimiter: {
      async admit() {
        limiterCalls += 1;
        return { allowed: true };
      },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback({
      origin: `http://127.0.0.1:${server.address().port}`,
      limiterCalls: () => limiterCalls,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const disabledCapabilities = Object.freeze({
  calls: false,
  googleLogin: false,
  issue61Measurement: false,
  recovery: false,
  syntheticSignupOnly: true,
  upload: false,
});

const request = (origin, method, path, body = "{not-json") => fetch(`${origin}${path}`, {
  method,
  headers: {
    "content-type": "application/json",
    "x-request-id": "k6-113-safe-request-id",
  },
  body: method === "GET" ? undefined : body,
});

test("disabled auth, upload, and call HTTP routes fail closed before parsing or limiting", async () => {
  const inventory = [
    ["POST", "/api/auth/forgot-password"],
    ["POST", "/api/auth/reset-password/safe-id"],
    ["POST", "/api/auth/google"],
    ["POST", "/api/files/init"],
    ["POST", "/api/files/get-presigned-url"],
    ["POST", "/api/files/complete"],
    ["POST", "/api/files/upload-single"],
    ["GET", "/api/calls/history"],
    ["GET", "/api/calls/missed"],
    ["POST", "/api/calls/safe-id/read"],
    ["POST", "/api/calls/read-all"],
  ];

  await withServer(disabledCapabilities, async ({ origin, limiterCalls }) => {
    for (const [method, path] of inventory) {
      const response = await request(origin, method, path);
      const body = await response.json();
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.deepEqual(Object.keys(body).sort(), ["error", "message", "requestId", "success"]);
      assert.deepEqual(body.error, {
        code: "CAPABILITY_DISABLED",
        message: "Feature unavailable",
      });
      assert.equal(body.success, false);
      assert.equal(body.message, "Feature unavailable");
      assert.equal(body.requestId, "k6-113-safe-request-id");
      assert.equal(response.headers.get("x-request-id"), body.requestId);
    }
    assert.equal(limiterCalls(), 0);
  });
});

test("private download is not controlled by the upload mutation capability", async () => {
  await withServer(disabledCapabilities, async ({ origin }) => {
    const response = await request(origin, "POST", "/api/files/file-id/download-url", "{}");
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.notEqual(body.error?.code, "CAPABILITY_DISABLED");
  });
});

test("enabled and legacy capability state preserves normal route processing", async () => {
  const enabled = { ...disabledCapabilities, recovery: true, googleLogin: true, upload: true, calls: true };
  await withServer(enabled, async ({ origin }) => {
    const response = await request(origin, "POST", "/api/auth/forgot-password");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "BAD_JSON");
  });
});
