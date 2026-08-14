const assert = require("node:assert/strict");
const test = require("node:test");

const { createObserverComposeBridge } = require("../../k4/observerComposeBridge");

const plan = {
  projectName: "kittachat-k4-run-84",
  composeFile: "docker-compose.k4.yml",
  runId: "run-84",
};

test("host bridge execs only the typed observer executable and sends request data on stdin", async () => {
  const calls = [];
  const bridge = createObserverComposeBridge({
    plan,
    environment: { K4_OBSERVER_TOKEN: "host-memory-secret" },
    dockerCommand(args, options) {
      calls.push({ args, options });
      return JSON.stringify({ body: "metric bytes" });
    },
  });

  const result = await bridge.metrics({
    runId: "run-84",
    project: "kittachat-k4-run-84",
    role: "backend",
    target: "backend-1",
  });

  assert.equal(result.body, "metric bytes");
  assert.deepEqual(calls[0].args.slice(-5), ["exec", "-T", "observer", "node", "/opt/k4/observerRequest.js"]);
  assert.deepEqual(JSON.parse(calls[0].options.input), {
    operation: "metrics",
    payload: { runId: "run-84", project: "kittachat-k4-run-84", role: "backend", target: "backend-1" },
  });
  assert.doesNotMatch(JSON.stringify(calls[0].args), /host-memory-secret|backend-1/);
  assert.equal(calls[0].options.env.K4_OBSERVER_TOKEN, "host-memory-secret");
});

test("bridge exposes a closed operation and payload contract", async () => {
  const bridge = createObserverComposeBridge({
    plan,
    environment: {},
    dockerCommand: () => assert.fail("invalid request must not reach Docker Compose"),
  });

  assert.equal(bridge.exec, undefined);
  assert.equal(bridge.request, undefined);
  await assert.rejects(
    bridge.metrics({ runId: "run-84", project: "kittachat-k4-run-84", role: "backend", target: "backend-1", command: "id" }),
    /unexpected field: command/,
  );
  await assert.rejects(
    bridge.runnerCgroup({ runId: "run-84", project: "kittachat-k4-run-84", role: "runner", target: "runner", path: "/host/arbitrary" }),
    /cgroup path is not allowlisted/,
  );
});

test("bridge rejects malformed observer output", async () => {
  const bridge = createObserverComposeBridge({ plan, environment: {}, dockerCommand: () => "not-json" });
  await assert.rejects(
    bridge.identity({ runId: "run-84", project: "kittachat-k4-run-84", role: "backend", target: "backend-1" }),
    /malformed response/,
  );
});

test("concurrent resource calls are not serialized by the host bridge", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started = 0;
  const bridge = createObserverComposeBridge({
    plan,
    environment: {},
    dockerCommand: async () => {
      started += 1;
      await gate;
      return JSON.stringify({ sample: { ok: true } });
    },
  });

  const first = bridge.stats({ runId: "run-84", project: "kittachat-k4-run-84", role: "backend", target: "backend-1", slotTimestamp: "2026-08-13T00:00:00.000Z" });
  const second = bridge.stats({ runId: "run-84", project: "kittachat-k4-run-84", role: "backend", target: "backend-2", slotTimestamp: "2026-08-13T00:00:00.000Z" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, 2);
  release();
  await Promise.all([first, second]);
});
