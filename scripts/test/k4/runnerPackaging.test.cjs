const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const runnerDir = path.resolve(__dirname, "../../k4/runner");

test("runner image packages the socket-concurrency dependency required by workload", () => {
  const workload = fs.readFileSync(path.join(runnerDir, "workload.js"), "utf8");
  const dockerfile = fs.readFileSync(path.join(runnerDir, "Dockerfile"), "utf8");

  assert.match(workload, /require\(["']\.\/socketConcurrency["']\)/);
  assert.match(dockerfile, /^COPY socketConcurrency\.js \.\/socketConcurrency\.js$/m);
});
