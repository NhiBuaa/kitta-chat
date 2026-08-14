const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { executeRun } = require("../../k4/runner");
const { createProductionMeasurementObservation, claimEvidenceFromMeasurement } = require("../../k4/productionMeasurementObservation");

function histogram(count) {
  return { metric: "kittachat_message_persistence_duration_seconds", labels: { outcome: "success" }, buckets: [{ le: "1", count }, { le: "+Inf", count }], count, sum: count / 10 };
}

function plan(replicas, directory) {
  return { runId: "production-observation", resultDirectory: directory, topology: { profile: replicas.length === 1 ? "single-replica" : "multi-replica", backendUpstreamMembership: replicas } };
}

function runtimePort(calls, { failAfter = false } = {}) {
  return {
    async snapshotPersistenceHistogram({ replica, point }) { calls.push(["histogram", replica, point]); if (failAfter && point === "after") throw new Error("metrics read unavailable"); return histogram(point === "before" ? 1 : 2); },
    async captureReplicaAttribution(input) { calls.push(["attribution", input.point, input.replicas]); return { point: input.point, replicas: input.replicas }; },
    async collectResourceSamples({ requiredContainers, measurementStart }) { calls.push(["resources", requiredContainers]); return Object.fromEntries(requiredContainers.map((container) => [container, [{ timestamp: measurementStart, status: "success", sample: { container } }]])); },
    async captureRunnerCgroupEvidence() { calls.push(["cgroup"]); return { cgroupVersion: "v2", sourcePaths: { cpuStat: "/sys/fs/cgroup/cpu.stat", cpuMax: "/sys/fs/cgroup/cpu.max", memoryEvents: "/sys/fs/cgroup/memory.events" }, limits: { cpu: "1", cpuset: "0", memory: "512MiB" }, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } }; },
    async captureRunnerShortfall() { calls.push(["shortfall"]); return null; },
  };
}

test("claim eligibility derives each topology claim from the matching observation oracle", () => {
  const sidebar = claimEvidenceFromMeasurement({ plan: { workload: { scenario: "sidebar" } }, measurementOutput: {}, attribution: { claimEligible: true } });
  assert.equal(sidebar.multiReplica, true);
  assert.equal(sidebar.crossReplica, undefined);

  const message = claimEvidenceFromMeasurement({ plan: { workload: { scenario: "message" } }, measurementOutput: {}, attribution: { claimEligible: true } });
  assert.deepEqual(message, { multiReplica: true, endToEndDelivery: true, crossReplica: true });

  const incomplete = claimEvidenceFromMeasurement({ plan: { workload: { scenario: "message" } }, measurementOutput: {}, attribution: { claimEligible: false } });
  assert.deepEqual(incomplete, { multiReplica: false, endToEndDelivery: false, crossReplica: false });

  const socket = claimEvidenceFromMeasurement({
    plan: { workload: { scenario: "socket-concurrency", snapshot: { loadModel: { targetConcurrency: 4 } } } },
    measurementOutput: { targetReachedAt: 1, targetConcurrency: 4 },
    attribution: { claimEligible: true },
  });
  assert.equal(socket.targetConcurrency, true);
  const shortSocket = claimEvidenceFromMeasurement({
    plan: { workload: { scenario: "socket-concurrency", snapshot: { loadModel: { targetConcurrency: 4 } } } },
    measurementOutput: { targetReachedAt: 1, targetConcurrency: 3 },
    attribution: { claimEligible: true },
  });
  assert.equal(shortSocket.targetConcurrency, false);
});

test("production observation maps runtime-port captures into topology-scoped persisted artifacts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-production-observation-"));
  const calls = [];
  const observation = createProductionMeasurementObservation({ intervalMs: 1000, runtimePort: runtimePort(calls), clock: (() => { const points = ["2026-08-13T00:00:00.000Z", "2026-08-13T00:00:01.000Z"]; return () => points.shift(); })() });
  const result = await executeRun(plan(["backend-1", "backend-2"], directory), { observation, executePhase: async (phase) => phase === "setup/seed" ? { resourcesCreated: true } : phase === "measurement" ? { numbers: { requests: 2 }, claimEvidence: { endToEndDelivery: true } } : {} });
  const derived = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation.json"), "utf8"));
  const raw = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation-final.raw.json"), "utf8"));
  assert.deepEqual(calls.filter(([kind]) => kind === "resources")[0][1], ["nginx", "backend-1", "backend-2", "runner"]);
  assert.deepEqual(derived.histogramEvidence.resolvedBackendReplicas, ["backend-1", "backend-2"]);
  assert.deepEqual(raw.replicaAttribution.before.replicas, ["backend-1", "backend-2"]);
  assert.deepEqual(raw.replicaAttribution.after.replicas, ["backend-1", "backend-2"]);
  assert.equal(result.claimEligibility.endToEndDelivery.eligible, true);
});

test("production observation retains partial raw evidence, fails measurement, and leaves teardown running when runtime capture fails", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-production-observation-failure-"));
  const observation = createProductionMeasurementObservation({ intervalMs: 1000, runtimePort: runtimePort([], { failAfter: true }), clock: () => "2026-08-13T00:00:00.000Z" });
  const result = await executeRun(plan(["backend-1"], directory), { observation, executePhase: async (phase) => phase === "setup/seed" ? { resourcesCreated: true } : {} });
  assert.equal(result.failure.phase, "measurement");
  assert.equal(result.teardown.attempted, true);
  assert.equal(fs.existsSync(path.join(directory, "measurement-observation.raw.json")), true);
  assert.equal(fs.existsSync(path.join(directory, "measurement-observation.error.json")), true);
});

test("production observation samples resource and cgroup evidence during measurement, retaining slot errors", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-production-cadence-"));
  const calls = [];
  let scheduled;
  const observation = createProductionMeasurementObservation({
    intervalMs: 1000,
    runtimePort: runtimePort(calls),
    clock: (() => { const points = ["2026-08-13T00:00:00.000Z", "2026-08-13T00:00:02.000Z"]; return () => points.shift() || "2026-08-13T00:00:02.000Z"; })(),
    setIntervalFn: (callback) => { scheduled = callback; return "timer"; },
    clearIntervalFn: (timer) => assert.equal(timer, "timer"),
  });
  const runPromise = executeRun(plan(["backend-1"], directory), { observation, executePhase: async (phase) => {
    if (phase === "setup/seed") return { resourcesCreated: true };
    if (phase === "measurement") { await scheduled(); return { numbers: { requests: 2 } }; }
    return {};
  } });
  await runPromise;
  const raw = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation-final.raw.json"), "utf8"));
  assert.equal(raw.samples.length, 2);
  assert.equal(raw.samples.every((sample) => sample.status === "success"), true);
  assert.equal(calls.filter(([kind]) => kind === "resources").length, 3);
  assert.equal(calls.filter(([kind]) => kind === "cgroup").length, 3);
});
