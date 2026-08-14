const assert = require("node:assert/strict");
const test = require("node:test");
const { authorizeObservationRequest } = require("../../k4/observerHelperPolicy");

const activeRun = { runId: "run-84", project: "kittachat-k4", roles: { backend: ["backend-1"], nginx: ["nginx"], runner: ["runner"] } };

test("helper policy permits only current-run typed observation operations", () => {
  assert.equal(authorizeObservationRequest({ activeRun, request: { runId: "run-84", project: "kittachat-k4", operation: "metrics", role: "backend", target: "backend-1" } }).allowed, true);
  for (const request of [
    { runId: "foreign", project: "kittachat-k4", operation: "metrics", role: "backend", target: "backend-1" },
    { runId: "run-84", project: "kittachat-k4", operation: "exec", role: "backend", target: "backend-1" },
    { runId: "run-84", project: "kittachat-k4", operation: "stats", role: "backend", target: "foreign" },
    { runId: "run-84", project: "kittachat-k4", operation: "metrics", role: "backend", target: "backend-1", dockerArgs: ["rm"] },
    { runId: "run-84", project: "kittachat-k4", operation: "runner-cgroup", role: "runner", target: "runner", path: "/etc/passwd" },
  ]) assert.equal(authorizeObservationRequest({ activeRun, request }).allowed, false);
});
