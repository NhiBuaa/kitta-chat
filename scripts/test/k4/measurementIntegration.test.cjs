const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { executeRun } = require("../../k4/runner");
const { createMeasurementObservation } = require("../../k4/measurementObservation");

function histogram(count) {
  return { metric: "kittachat_message_persistence_duration_seconds", labels: { outcome: "success" }, buckets: [{ le: "1", count }, { le: "+Inf", count }], count, sum: count / 10 };
}

function resourceSamples(containers, start) {
  return Object.fromEntries(containers.map((container) => [container, [0, 1000].map((offset) => ({
    timestamp: new Date(Date.parse(start) + offset).toISOString(), status: "success", sample: { container, cpu: 1 },
  }))]));
}

function plan(profile, replicas, resultDirectory) {
  return {
    runId: `${profile}-integration`, resultDirectory,
    topology: { profile, backendUpstreamMembership: replicas },
    phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"],
  };
}

test("runner lifecycle collects and persists topology-scoped observation artifacts for single and multi replica runs", async () => {
  for (const [profile, replicas] of [["single-replica", ["backend-1"]], ["multi-replica", ["backend-1", "backend-2"]]]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-observation-"));
    const startedAt = "2026-08-13T00:00:00.000Z";
    const endedAt = "2026-08-13T00:00:02.000Z";
    const requiredContainers = ["nginx", ...replicas, "runner"];
    const observation = createMeasurementObservation({
      intervalMs: 1000,
      clock: (() => { const values = [startedAt, endedAt]; return () => values.shift(); })(),
      captureStart: () => ({ histogram: { resolvedBackendReplicas: replicas, snapshots: Object.fromEntries(replicas.map((replica) => [replica, { before: histogram(1) }])) }, replicaAttribution: { replicas } }),
      captureEnd: () => ({ histogram: { snapshots: Object.fromEntries(replicas.map((replica) => [replica, { after: histogram(2) }])) }, resource: { observations: resourceSamples(requiredContainers, startedAt) }, loadGenerator: { shortfall: null, runner: { cgroupVersion: "v2", sourcePaths: {}, limits: {}, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } } }, claimEvidence: { endToEndDelivery: true, targetConcurrency: true, multiReplica: replicas.length > 1, crossReplica: replicas.length > 1 } }),
    });
    const result = await executeRun(plan(profile, replicas, directory), {
      observation,
      executePhase: async (phase) => {
        if (phase === "setup/seed") return { resourcesCreated: true };
        if (phase === "measurement") return { numbers: { requests: 2 } };
        return {};
      },
    });
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation.json"), "utf8"));
    assert.deepEqual(persisted.resourceEvidence.requiredContainers, requiredContainers);
    assert.deepEqual(result.qualificationFlags, []);
    assert.equal(result.claimEligibility.cpu.eligible, true);
    assert.equal(persisted.histogramEvidence.resolvedBackendReplicas.length, replicas.length);
    assert.equal(fs.existsSync(path.join(directory, "measurement-observation.raw.json")), true);
  }
});

test("measurement observation retains partial raw evidence and leaves teardown semantics intact when final capture fails", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-observation-failure-"));
  const observation = createMeasurementObservation({ intervalMs: 1000, clock: () => "2026-08-13T00:00:00.000Z", captureStart: () => ({ replicaAttribution: { replicas: ["backend-1"] } }), captureEnd: () => { throw new Error("resource collector unavailable"); } });
  const result = await executeRun(plan("single-replica", ["backend-1"], directory), {
    observation,
    executePhase: async (phase) => phase === "setup/seed" ? { resourcesCreated: true } : phase === "measurement" ? { numbers: { requests: 2 } } : {},
  });
  assert.equal(result.failure.phase, "measurement");
  assert.equal(result.teardown.attempted, true);
  assert.equal(fs.existsSync(path.join(directory, "measurement-observation.raw.json")), true);
});

test("cadence stays anchored, records overlap as missing, and finalize joins in-flight sampling", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-observation-cadence-"));
  let scheduled;
  let release;
  let sampleCalls = 0;
  const observation = createMeasurementObservation({
    intervalMs: 1000,
    clock: (() => { const values = ["2026-08-13T00:00:00.000Z", "2026-08-13T00:00:03.000Z"]; return () => values.shift(); })(),
    setIntervalFn: (callback) => { scheduled = callback; return "cadence"; },
    clearIntervalFn: (handle) => assert.equal(handle, "cadence"),
    captureStart: () => ({ histogram: { resolvedBackendReplicas: ["backend-1"], snapshots: { "backend-1": { before: histogram(1) } } } }),
    captureSample: async (_plan, { slotTimestamp }) => {
      sampleCalls += 1;
      if (sampleCalls === 2) await new Promise((resolve) => { release = resolve; });
      return { resources: resourceSamples(["nginx", "backend-1", "runner"], slotTimestamp) };
    },
    captureEnd: (_plan, { samples }) => ({
      histogram: { snapshots: { "backend-1": { after: histogram(2) } } },
      resource: { observations: Object.fromEntries(["nginx", "backend-1", "runner"].map((container) => [container, samples.flatMap((sample) => sample.value?.resources?.[container] || [])])) },
      loadGenerator: { shortfall: null, runner: { cgroupVersion: "v2", sourcePaths: {}, limits: {}, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } } },
    }),
  });

  const runPlan = plan("single-replica", ["backend-1"], directory);
  await observation.start(runPlan);
  const inFlight = scheduled();
  await scheduled();
  const finalize = observation.finalize(runPlan, {});
  let finalized = false;
  finalize.then(() => { finalized = true; });
  await Promise.resolve();
  assert.equal(finalized, false);
  release();
  await inFlight;
  await finalize;

  const raw = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation-final.raw.json"), "utf8"));
  assert.deepEqual(raw.samples.map(({ slotIndex, timestamp, status }) => ({ slotIndex, timestamp, status })), [
    { slotIndex: 0, timestamp: "2026-08-13T00:00:00.000Z", status: "success" },
    { slotIndex: 1, timestamp: "2026-08-13T00:00:01.000Z", status: "success" },
    { slotIndex: 2, timestamp: "2026-08-13T00:00:02.000Z", status: "missing" },
  ]);
});

test("resource cadence binds to the declared runner measurement window", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-observation-declared-window-"));
  const declaredWindow = {
    start: "2026-08-13T00:00:01.000Z",
    end: "2026-08-13T00:00:03.000Z",
    boundary: "[phase_start, phase_end)",
  };
  let captureEndInput;
  const containers = ["nginx", "backend-1", "runner"];
  const observations = Object.fromEntries(containers.map((container) => [container, [0, 1].map((offset) => ({
    timestamp: new Date(Date.parse(declaredWindow.start) + offset * 1000).toISOString(),
    status: "success",
    sample: { container, cpu: offset + 1 },
  }))]));
  const observation = createMeasurementObservation({
    intervalMs: 1000,
    clock: (() => {
      const values = ["2026-08-13T00:00:00.000Z", "2026-08-13T00:00:03.500Z"];
      return () => values.shift();
    })(),
    captureStart: () => ({ histogram: { resolvedBackendReplicas: ["backend-1"], snapshots: { "backend-1": { before: histogram(1) } } } }),
    captureEnd: (_plan, input) => {
      captureEndInput = input;
      return {
        histogram: { snapshots: { "backend-1": { after: histogram(2) } } },
        resource: { observations },
        loadGenerator: { shortfall: null, runner: { cgroupVersion: "v2", sourcePaths: {}, limits: {}, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } } },
      };
    },
  });

  await executeRun(plan("single-replica", ["backend-1"], directory), {
    observation,
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true };
      if (phase === "measurement") return { measurementWindow: declaredWindow, numbers: { requests: 2 } };
      return {};
    },
  });

  const persisted = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation.json"), "utf8"));
  assert.equal(captureEndInput.measurementStart, declaredWindow.start);
  assert.equal(captureEndInput.measurementEnd, declaredWindow.end);
  assert.deepEqual(persisted.resourceEvidence.measurementWindow, {
    start: declaredWindow.start,
    end: declaredWindow.end,
    boundary: "[measurement_start, measurement_end)",
  });
  assert.equal(persisted.resourceEvidence.expectedCount, 2);
  assert.deepEqual(persisted.resourceEvidence.byContainer.nginx.counts, { successful: 2, error: 0, missing: 0, expected: 2 });
  assert.deepEqual(persisted.qualificationFlags, []);
});

test("socket runner epoch measurement bounds are normalized and bind resource cadence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-observation-socket-epoch-window-"));
  const startMs = Date.parse("2026-08-13T00:00:01.000Z");
  const endMs = Date.parse("2026-08-13T00:00:03.000Z");
  const observations = Object.fromEntries(["nginx", "backend-1", "runner"].map((container) => [container, [0, 1].map((offset) => ({
    timestamp: new Date(startMs + offset * 1000).toISOString(),
    status: "success",
    sample: { container, cpu: offset + 1 },
  }))]));
  const observation = createMeasurementObservation({
    intervalMs: 1000,
    clock: (() => {
      const values = ["2026-08-13T00:00:00.000Z", "2026-08-13T00:00:03.500Z"];
      return () => values.shift();
    })(),
    captureStart: () => ({ histogram: { resolvedBackendReplicas: ["backend-1"], snapshots: { "backend-1": { before: histogram(1) } } } }),
    captureEnd: (_plan, input) => ({
      histogram: { snapshots: { "backend-1": { after: histogram(2) } } },
      resource: { observations },
      loadGenerator: { shortfall: null, runner: { cgroupVersion: "v2", sourcePaths: {}, limits: {}, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } } },
      capturedWindow: { start: input.measurementStart, end: input.measurementEnd },
    }),
  });

  await executeRun(plan("single-replica", ["backend-1"], directory), {
    observation,
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true };
      if (phase === "measurement") return { measurementStart: startMs, measurementEnd: endMs, numbers: { requests: 2 } };
      return {};
    },
  });

  const persisted = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation.json"), "utf8"));
  const raw = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation-final.raw.json"), "utf8"));
  assert.deepEqual(raw.measurementWindow, {
    start: "2026-08-13T00:00:01.000Z",
    end: "2026-08-13T00:00:03.000Z",
    boundary: "[phase_start, phase_end)",
    source: "runner",
  });
  assert.deepEqual(persisted.resourceEvidence.measurementWindow, {
    start: "2026-08-13T00:00:01.000Z",
    end: "2026-08-13T00:00:03.000Z",
    boundary: "[measurement_start, measurement_end)",
  });
  assert.equal(persisted.resourceEvidence.expectedCount, 2);
  assert.deepEqual(persisted.resourceEvidence.byContainer.runner.counts, { successful: 2, error: 0, missing: 0, expected: 2 });
});
