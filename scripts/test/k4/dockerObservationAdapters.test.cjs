const assert = require("node:assert/strict");
const test = require("node:test");
const { createDockerObservationAdapters } = require("../../k4/dockerObservationAdapters");

const activeRun = {
  runId: "run-84",
  project: "kittachat-k4-run-84",
  roles: { backend: ["backend-1"], nginx: ["nginx"], runner: ["runner"] },
  targets: {
    "backend-1": { id: "backend-id", role: "backend", addresses: ["10.4.0.12"] },
    nginx: { id: "nginx-id", role: "nginx" },
    runner: { id: "runner-id", role: "runner" },
  },
};

test("Docker adapters expose fixed observation requests and retain bounded raw provenance", async () => {
  const calls = [];
  const engine = {
    async request(request) {
      calls.push(request);
      if (request.path.endsWith("/json")) {
        const id = request.path.split("/")[2];
        const role = id.replace("-id", "");
        return { Id: id, Config: { Labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "run-84", "com.docker.compose.project": "kittachat-k4-run-84", "com.docker.compose.service": role } } };
      }
      if (request.path.includes("/stats")) return { cpu_stats: { cpu_usage: { total_usage: 4 } }, memory_stats: { usage: 8 } };
      if (request.path.includes("/logs")) return Buffer.from("2026-08-13T00:00:01Z line\n");
      if (request.path.includes("/archive")) return Buffer.from("fixed-cgroup-evidence");
      throw new Error(`unexpected ${request.path}`);
    },
  };
  const fetchFn = async (url) => ({ ok: true, text: async () => `metric from ${url}` });
  const adapters = createDockerObservationAdapters({ activeRun, engine, fetchFn });

  assert.equal((await adapters.identity({ role: "backend", target: "backend-1" })).containerId, "backend-id");
  assert.match((await adapters.metrics({ role: "backend", target: "backend-1" })).body, /metric/);
  assert.equal((await adapters.stats({ role: "backend", target: "backend-1" })).sample.memoryUsageBytes, 8);
  const logs = await adapters.logs({ role: "nginx", target: "nginx", measurementStart: "2026-08-13T00:00:00Z", measurementEnd: "2026-08-13T00:00:02Z" });
  assert.match(logs.sourceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(logs.truncated, false);
  const cgroup = await adapters["runner-cgroup"]({ role: "runner", target: "runner", paths: ["cpu.stat", "memory.events"] });
  assert.deepEqual(Object.keys(cgroup.sources), ["cpu.stat", "memory.events"]);
  assert.equal(calls.some(({ path }) => /\/exec|\/start|\/stop|\/update|\/remove/.test(path)), false);
  assert.equal(calls.filter(({ path }) => path.includes("/archive")).length, 2);
});

test("Docker adapters reject targets whose current labels contradict the active run", async () => {
  const engine = { request: async () => ({ Id: "backend-id", Config: { Labels: { "io.kittachat.k4.run_id": "foreign" } } }) };
  const adapters = createDockerObservationAdapters({ activeRun, engine, fetchFn: async () => ({ ok: true, text: async () => "" }) });
  await assert.rejects(adapters.identity({ role: "backend", target: "backend-1" }), /ownership labels/);
});
