const assert = require("node:assert/strict");
const test = require("node:test");

const { createApp } = require("../../src/app");

test("createApp composes a MetricsModule for the Socket.IO startup seam", () => {
  const app = createApp({
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  });

  assert.equal(typeof app.get("metrics")?.observeSocketConnection, "function");
});
