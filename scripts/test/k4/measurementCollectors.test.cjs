const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectMeasurementEvidence,
  deriveHistogramEvidence,
  deriveResourceQualification,
  deriveActiveSocketGaugeEvidence,
  evaluateLoadGeneratorLimitation,
} = require("../../k4/measurementCollectors");

const window = { measurementStart: "2026-08-13T00:00:00.000Z", measurementEnd: "2026-08-13T00:00:10.000Z", intervalMs: 2500 };

function resourceSamples(containers, status = "success") {
  return Object.fromEntries(containers.map((container) => [container, [0, 2500, 5000, 7500].map((offset) => ({
    timestamp: new Date(Date.parse(window.measurementStart) + offset).toISOString(),
    status,
    ...(status === "success" ? { sample: { cpuUsageUsec: offset + 1, memoryBytes: 42 } } : { error: "collector unavailable" }),
  }))]));
}

function histogram(count) {
  return {
    metric: "kittachat_message_persistence_duration_seconds",
    labels: { outcome: "success" },
    buckets: [{ le: "0.1", count }, { le: "+Inf", count }],
    sum: count / 10,
    count,
  };
}

test("resource qualification applies the authority coverage contract to every topology container", () => {
  for (const topology of [
    { profile: "single-replica", backendUpstreamMembership: ["backend-1"] },
    { profile: "multi-replica", backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"] },
  ]) {
    const requiredContainers = ["nginx", ...topology.backendUpstreamMembership, "runner"];
    const result = deriveResourceQualification({ ...window, requiredContainers, observations: resourceSamples(requiredContainers) });
    assert.deepEqual(result.requiredContainers, requiredContainers);
    assert.equal(result.expectedCount, 4);
    assert.equal(result.qualificationFlags.includes("OBSERVATION_INCOMPLETE"), false);
  }
});

test("resource qualification retains error and missing slots and flags insufficient coverage", () => {
  const result = deriveResourceQualification({
    ...window,
    requiredContainers: ["nginx"],
    observations: { nginx: [
      { timestamp: "2026-08-13T00:00:00.000Z", status: "success", sample: { cpuUsageUsec: 1 } },
      { timestamp: "2026-08-13T00:00:02.500Z", status: "error", error: "read failed" },
    ] },
  });

  assert.deepEqual(result.byContainer.nginx.counts, { successful: 1, error: 1, missing: 2, expected: 4 });
  assert.deepEqual(result.qualificationFlags, ["OBSERVATION_INCOMPLETE"]);
  assert.equal(result.byContainer.nginx.errors[0].error, "read failed");
});

test("load-generator limitation requires shortfall and objective overlapping cgroup-v2 evidence", () => {
  const limited = evaluateLoadGeneratorLimitation({
    shortfall: { model: "closed", start: "2026-08-13T00:00:02.000Z", end: "2026-08-13T00:00:07.000Z", requested: 100, achieved: 80 },
    runner: {
      cgroupVersion: "v2", sourcePaths: { cpuStat: "/sys/fs/cgroup/cpu.stat", cpuMax: "/sys/fs/cgroup/cpu.max", memoryEvents: "/sys/fs/cgroup/memory.events" },
      limits: { cpu: "1", cpuset: "0", memory: "512MiB" },
      cpuSamples: [
        { start: "2026-08-13T00:00:02.000Z", end: "2026-08-13T00:00:06.500Z", normalizedUtilization: 0.95, throttled: true },
      ],
      memoryEvents: { oomDelta: 0, oomKillDelta: 0 },
    },
  });
  assert.equal(limited.limited, true);
  assert.equal(limited.reason, "CPU_THROTTLING_AT_RUNNER_LIMIT");

  const genericTimeout = evaluateLoadGeneratorLimitation({
    shortfall: { model: "closed", start: "2026-08-13T00:00:02.000Z", end: "2026-08-13T00:00:07.000Z", requested: 100, achieved: 80 },
    runner: { cgroupVersion: "v2", genericTimeout: true, sourcePaths: {}, limits: {}, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } },
  });
  assert.equal(genericTimeout.limited, false);
});

test("histogram evidence requires compatible snapshots for every resolved backend replica, including zero delta", () => {
  const complete = deriveHistogramEvidence({
    resolvedBackendReplicas: ["backend-1", "backend-2"],
    snapshots: {
      "backend-1": { before: histogram(4), after: histogram(7) },
      "backend-2": { before: histogram(2), after: histogram(2) },
    },
  });
  assert.deepEqual(complete.aggregate.buckets, [{ le: "0.1", count: 3 }, { le: "+Inf", count: 3 }]);
  assert.equal(complete.aggregate.count, 3);
  assert.ok(Math.abs(complete.aggregate.sum - 0.3) < Number.EPSILON);
  assert.deepEqual(complete.snapshots["backend-1"], { before: histogram(4), after: histogram(7) });
  assert.deepEqual(complete.deltas["backend-1"].buckets, [{ le: "0.1", count: 3 }, { le: "+Inf", count: 3 }]);
  assert.equal(complete.deltas["backend-1"].count, 3);
  assert.ok(Math.abs(complete.deltas["backend-1"].sum - 0.3) < Number.EPSILON);
  assert.equal(complete.quantileLabel, "histogram-derived");
  assert.throws(() => deriveHistogramEvidence({ resolvedBackendReplicas: ["backend-1", "backend-2"], snapshots: { "backend-1": { before: histogram(1), after: histogram(2) } } }), /missing snapshot/i);
  assert.throws(() => deriveHistogramEvidence({ resolvedBackendReplicas: ["backend-1"], snapshots: { "backend-1": { before: histogram(2), after: histogram(1) } } }), /decreased/i);
  const mismatchedSnapshots = {
    "backend-1": { before: histogram(1), after: histogram(2) },
    "backend-2": {
      before: { ...histogram(1), labels: { outcome: "failed" } },
      after: { ...histogram(2), labels: { outcome: "failed" } },
    },
  };
  assert.throws(
    () => deriveHistogramEvidence({ resolvedBackendReplicas: ["backend-1", "backend-2"], snapshots: mismatchedSnapshots }),
    /mismatch|success/i,
  );

  const aggregate = deriveHistogramEvidence({
    resolvedBackendReplicas: ["backend-1", "backend-2"],
    aggregateEvidence: {
      members: ["backend-1", "backend-2"],
      seriesByReplica: { "backend-1": true, "backend-2": true },
      before: histogram(3),
      after: histogram(5),
    },
  });
  assert.equal(aggregate.source, "topology-wide-aggregate");
  assert.throws(() => deriveHistogramEvidence({
    resolvedBackendReplicas: ["backend-1", "backend-2"],
    aggregateEvidence: { members: ["backend-1"], seriesByReplica: { "backend-1": true }, before: histogram(1), after: histogram(2) },
  }), /coverage/i);
  assert.throws(() => deriveHistogramEvidence({
    resolvedBackendReplicas: ["backend-1"],
    snapshots: {
      "backend-1": {
        before: { ...histogram(1), labels: { outcome: "failed" } },
        after: { ...histogram(2), labels: { outcome: "failed" } },
      },
    },
  }), /success/i);
});

test("collector preserves valid latency evidence while claim eligibility is determined per locked claim type", () => {
  const evidence = collectMeasurementEvidence({
    topology: { backendUpstreamMembership: ["backend-1"] },
    resource: { ...window, observations: resourceSamples(["nginx", "backend-1", "runner"]) },
    histogram: { resolvedBackendReplicas: ["backend-1"], snapshots: { "backend-1": { before: histogram(1), after: histogram(2) } } },
    loadGenerator: { shortfall: null, runner: { cgroupVersion: "v2", sourcePaths: {}, limits: {}, cpuSamples: [], memoryEvents: { oomDelta: 0, oomKillDelta: 0 } } },
    qualificationFlags: ["TOPOLOGY_NOT_EXERCISED"],
    claimEvidence: { endToEndDelivery: true, targetConcurrency: true, multiReplica: false, crossReplica: false },
  });
  assert.equal(evidence.claimEligibility.persistenceHistogramDerivedLatency.eligible, true);
  assert.equal(evidence.claimEligibility.cpu.eligible, true);
  assert.equal(evidence.claimEligibility.multiReplica.eligible, false);
  assert.equal(evidence.claimEligibility.crossReplica.eligible, false);
});

test("active-socket gauge evidence remains corroborating and preserves replica sums", () => {
  const evidence = deriveActiveSocketGaugeEvidence({
    before: { point: "before", aggregate: 4, replicas: [{ replica: "backend-1", activeConnections: 2 }, { replica: "backend-2", activeConnections: 2 }] },
    samples: [{ point: "sample", slotTimestamp: "2026-08-13T00:00:01.000Z", aggregate: 3, replicas: [{ replica: "backend-1", activeConnections: 1 }, { replica: "backend-2", activeConnections: 2 }] }],
    after: { point: "after", aggregate: 3, replicas: [{ replica: "backend-1", activeConnections: 1 }, { replica: "backend-2", activeConnections: 2 }] },
  });
  assert.equal(evidence.complete, true);
  assert.equal(evidence.minimum, 3);
  assert.equal(evidence.maximum, 4);
  assert.deepEqual(evidence.aggregates.map(({ activeConnections }) => activeConnections), [4, 3, 3]);
  assert.equal(deriveActiveSocketGaugeEvidence({ before: { point: "before", aggregate: 4, replicas: [{ replica: "backend-1", activeConnections: 3 }] } }).complete, false);
});

test("observation incompleteness keeps the target-concurrency claim ineligible", () => {
  const evidence = require("../../k4/measurementCollectors").claimEligibility({
    qualificationFlags: ["OBSERVATION_INCOMPLETE"],
    histogram: { metric: "histogram" },
    claimEvidence: { targetConcurrency: true },
  });
  assert.equal(evidence.targetConcurrency.eligible, false);
});

test("resource coverage counts the final partial slot and enforces the exact ninety-percent boundary", () => {
  const samples = (offsets) => offsets.map((offset) => ({
    timestamp: new Date(Date.parse("2026-08-13T00:00:00.000Z") + offset * 1000).toISOString(),
    status: "success",
    sample: { cpuUsageUsec: offset + 1 },
  }));
  const base = {
    measurementStart: "2026-08-13T00:00:00.000Z",
    measurementEnd: "2026-08-13T00:00:10.000Z",
    intervalMs: 1000,
    requiredContainers: ["nginx"],
  };
  const ninety = deriveResourceQualification({ ...base, observations: { nginx: samples([0, 1, 2, 3, 4, 5, 6, 7, 8]) } });
  assert.deepEqual(ninety.byContainer.nginx.counts, { successful: 9, error: 0, missing: 1, expected: 10 });
  assert.equal(ninety.byContainer.nginx.coverage, 0.9);
  assert.equal(ninety.byContainer.nginx.sufficient, true);
  const below = deriveResourceQualification({ ...base, observations: { nginx: samples([0, 1, 2, 3, 4, 5, 6, 7]) } });
  assert.equal(below.byContainer.nginx.sufficient, false);
  const partial = deriveResourceQualification({
    ...base,
    measurementEnd: "2026-08-13T00:00:02.500Z",
    observations: { nginx: samples([0, 1, 2]) },
  });
  assert.equal(partial.expectedCount, 3);
  assert.deepEqual(partial.byContainer.nginx.counts, { successful: 3, error: 0, missing: 0, expected: 3 });
  const zero = deriveResourceQualification({ ...base, observations: { nginx: [] } });
  assert.deepEqual(zero.byContainer.nginx.counts, { successful: 0, error: 0, missing: 10, expected: 10 });
  assert.equal(zero.byContainer.nginx.sufficient, false);
});
