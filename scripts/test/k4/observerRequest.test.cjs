const assert = require("node:assert/strict");
const test = require("node:test");

const { executeObserverRequest } = require("../../k4/observerRequest");

test("observer executable resolves token and helper URL only from its service environment", async () => {
  const seen = [];
  const response = await executeObserverRequest({
    env: {
      K4_RUN_ID: "run-84",
      K4_PROJECT_NAME: "kittachat-k4-run-84",
      K4_OBSERVER_TOKEN: "service-only-token",
      K4_OBSERVER_HELPER_URL: "http://observer-helper:8080",
    },
    request: {
      operation: "logs",
      payload: {
        runId: "run-84",
        project: "kittachat-k4-run-84",
        role: "nginx",
        target: "nginx",
        measurementStart: "2026-08-13T00:00:00.000Z",
        measurementEnd: "2026-08-13T00:00:10.000Z",
      },
    },
    helper: { logs: async (payload) => { seen.push(payload); return { body: "bounded logs" }; } },
  });
  assert.equal(response.body, "bounded logs");
  assert.equal(seen[0].target, "nginx");
});

test("observer executable enforces run ownership and does not expose generic helper calls", async () => {
  const helper = { metrics: async () => assert.fail("ownership mismatch must fail first") };
  await assert.rejects(executeObserverRequest({
    env: { K4_RUN_ID: "run-84", K4_PROJECT_NAME: "kittachat-k4-run-84" },
    request: { operation: "metrics", payload: { runId: "foreign", project: "kittachat-k4-run-84", role: "backend", target: "backend-1" } },
    helper,
  }), /run ownership mismatch/);
  await assert.rejects(executeObserverRequest({
    env: { K4_RUN_ID: "run-84", K4_PROJECT_NAME: "kittachat-k4-run-84" },
    request: { operation: "exec", payload: { runId: "run-84", project: "kittachat-k4-run-84", role: "backend", target: "backend-1" } },
    helper,
  }), /operation is not observation-only/);
});
