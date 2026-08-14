const REQUIRED_CONTAINER_PREFIX = ["nginx"];
const PERSISTENCE_METRIC = "kittachat_message_persistence_duration_seconds";
const LOCKED_CLAIM_TYPES = [
  "persistenceHistogramDerivedLatency",
  "endToEndDelivery",
  "targetConcurrency",
  "multiReplica",
  "crossReplica",
  "cpu",
  "memory",
  "bottleneckSutCeiling",
];

function parseTime(value, field) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be an ISO timestamp`);
  return timestamp;
}

function requiredContainersForTopology(topology) {
  const replicas = topology?.backendUpstreamMembership;
  if (!Array.isArray(replicas) || !replicas.length || replicas.some((replica) => typeof replica !== "string" || !replica)) {
    throw new Error("resolved topology must include every backend replica");
  }
  return [...REQUIRED_CONTAINER_PREFIX, ...replicas, "runner"];
}

function slotStarts({ measurementStart, measurementEnd, intervalMs }) {
  const start = parseTime(measurementStart, "measurementStart");
  const end = parseTime(measurementEnd, "measurementEnd");
  if (end <= start) throw new Error("measurement window must have positive duration");
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("intervalMs must be positive");
  return Array.from({ length: Math.ceil((end - start) / intervalMs) }, (_, index) => start + index * intervalMs);
}

function classifySlots(slots, intervalMs, observations = []) {
  const assigned = new Map();
  for (const observation of observations) {
    const timestamp = parseTime(observation?.timestamp, "observation timestamp");
    const slotIndex = Math.floor((timestamp - slots[0]) / intervalMs);
    if (slotIndex < 0 || slotIndex >= slots.length || assigned.has(slotIndex)) continue;
    if (observation.status === "success" && observation.sample && typeof observation.sample === "object") assigned.set(slotIndex, { status: "success", raw: observation });
    else if (observation.status === "error" && typeof observation.error === "string" && observation.error) assigned.set(slotIndex, { status: "error", error: observation.error, raw: observation });
  }
  return slots.map((start, index) => assigned.get(index) || { status: "missing", slotStart: new Date(start).toISOString() });
}

function deriveResourceQualification({ measurementStart, measurementEnd, intervalMs, requiredContainers, observations }) {
  const slots = slotStarts({ measurementStart, measurementEnd, intervalMs });
  if (!Array.isArray(requiredContainers) || !requiredContainers.length) throw new Error("required container set is required");
  const byContainer = Object.fromEntries(requiredContainers.map((container) => {
    const classified = classifySlots(slots, intervalMs, observations?.[container]);
    const counts = classified.reduce((total, slot) => ({ ...total, [slot.status === "success" ? "successful" : slot.status]: total[slot.status === "success" ? "successful" : slot.status] + 1 }), {
      successful: 0, error: 0, missing: 0, expected: slots.length,
    });
    return [container, {
      slots: classified,
      counts,
      errors: classified.filter((slot) => slot.status === "error"),
      coverage: counts.successful / slots.length,
      sufficient: counts.successful >= 1 && counts.successful / slots.length >= 0.90,
    }];
  }));
  const incomplete = Object.values(byContainer).some((coverage) => !coverage.sufficient);
  return {
    measurementWindow: { start: measurementStart, end: measurementEnd, boundary: "[measurement_start, measurement_end)" },
    intervalMs,
    expectedCount: slots.length,
    requiredContainers: [...requiredContainers],
    byContainer,
    qualificationFlags: incomplete ? ["OBSERVATION_INCOMPLETE"] : [],
  };
}

function equalSchema(left, right) {
  return left?.metric === right?.metric
    && JSON.stringify(left?.labels || {}) === JSON.stringify(right?.labels || {})
    && JSON.stringify((left?.buckets || []).map(({ le }) => le)) === JSON.stringify((right?.buckets || []).map(({ le }) => le));
}

function assertPersistenceHistogram(snapshot, replica) {
  if (snapshot?.metric !== PERSISTENCE_METRIC) throw new Error(`persistence histogram metric mismatch for ${replica}`);
  if (snapshot?.labels?.outcome !== "success") throw new Error(`persistence histogram outcome must be success for ${replica}`);
  if (!Array.isArray(snapshot.buckets) || !snapshot.buckets.length || snapshot.buckets.some(({ le, count }) => typeof le !== "string" || !Number.isFinite(count) || count < 0)) {
    throw new Error(`persistence histogram buckets are malformed for ${replica}`);
  }
  if (!Number.isFinite(snapshot.count) || snapshot.count < 0 || !Number.isFinite(snapshot.sum) || snapshot.sum < 0) {
    throw new Error(`persistence histogram count or sum is malformed for ${replica}`);
  }
}

function subtractHistogram(before, after, replica) {
  assertPersistenceHistogram(before, replica);
  assertPersistenceHistogram(after, replica);
  if (!equalSchema(before, after)) throw new Error(`histogram schema mismatch for ${replica}`);
  const buckets = after.buckets.map((bucket, index) => {
    const delta = bucket.count - before.buckets[index].count;
    if (delta < 0) throw new Error(`histogram bucket decreased for ${replica}`);
    return { le: bucket.le, count: delta };
  });
  const count = after.count - before.count;
  const sum = after.sum - before.sum;
  if (count < 0 || sum < 0) throw new Error(`histogram count or sum decreased for ${replica}`);
  return { buckets, count, sum };
}

function assertAggregateCoverage(resolvedBackendReplicas, aggregateEvidence) {
  const sortedTopology = [...resolvedBackendReplicas].sort();
  const members = [...(aggregateEvidence?.members || [])].sort();
  const series = Object.keys(aggregateEvidence?.seriesByReplica || {}).filter((replica) => aggregateEvidence.seriesByReplica[replica] === true).sort();
  if (JSON.stringify(members) !== JSON.stringify(sortedTopology) || JSON.stringify(series) !== JSON.stringify(sortedTopology)) {
    throw new Error("aggregate histogram coverage does not exactly match resolved topology");
  }
}

function deriveHistogramEvidence({ resolvedBackendReplicas, snapshots: snapshotInput, aggregateEvidence }) {
  if (!Array.isArray(resolvedBackendReplicas) || !resolvedBackendReplicas.length) throw new Error("resolved backend replica inventory is required");
  if (aggregateEvidence) {
    assertAggregateCoverage(resolvedBackendReplicas, aggregateEvidence);
    const delta = subtractHistogram(aggregateEvidence.before, aggregateEvidence.after, "topology-wide aggregate");
    return {
      label: "histogram-derived",
      quantileLabel: "histogram-derived",
      source: "topology-wide-aggregate",
      resolvedBackendReplicas: [...resolvedBackendReplicas],
      snapshots: { aggregate: { before: aggregateEvidence.before, after: aggregateEvidence.after } },
      deltas: { aggregate: delta },
      aggregate: delta,
    };
  }
  const snapshots = Object.fromEntries(resolvedBackendReplicas.map((replica) => {
    const snapshot = snapshotInput?.[replica];
    if (!snapshot?.before || !snapshot?.after) throw new Error(`missing snapshot for resolved replica ${replica}`);
    return [replica, { before: snapshot.before, after: snapshot.after }];
  }));
  const deltas = Object.fromEntries(resolvedBackendReplicas.map((replica) => [replica, subtractHistogram(snapshots[replica].before, snapshots[replica].after, replica)]));
  const referenceSnapshot = snapshots[resolvedBackendReplicas[0]].before;
  for (const replica of resolvedBackendReplicas.slice(1)) {
    if (!equalSchema(referenceSnapshot, snapshots[replica].before)) {
      throw new Error(`histogram schema mismatch across resolved replicas at ${replica}`);
    }
  }
  const first = Object.values(deltas)[0];
  const aggregate = {
    buckets: first.buckets.map(({ le }, index) => ({ le, count: Object.values(deltas).reduce((total, delta) => total + delta.buckets[index].count, 0) })),
    count: Object.values(deltas).reduce((total, delta) => total + delta.count, 0),
    sum: Object.values(deltas).reduce((total, delta) => total + delta.sum, 0),
  };
  return { label: "histogram-derived", quantileLabel: "histogram-derived", source: "per-replica", resolvedBackendReplicas: [...resolvedBackendReplicas], snapshots, deltas, perReplica: deltas, aggregate };
}

function overlap(start, end, windowStart, windowEnd) {
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

function evaluateLoadGeneratorLimitation({ shortfall, runner }) {
  if (!shortfall) return { limited: false, reason: "NO_REQUESTED_LOAD_SHORTFALL" };
  const start = parseTime(shortfall.start, "shortfall start");
  const end = parseTime(shortfall.end, "shortfall end");
  if (!shortfall.model || end <= start || !Number.isFinite(shortfall.requested) || !Number.isFinite(shortfall.achieved) || shortfall.achieved >= shortfall.requested) {
    throw new Error("model-specific requested-load shortfall is required");
  }
  const memoryLimited = (runner?.memoryEvents?.oomDelta || 0) > 0 || (runner?.memoryEvents?.oomKillDelta || 0) > 0;
  const qualifiedOverlap = (runner?.cpuSamples || []).reduce((total, sample) => {
    if (!sample.throttled || sample.normalizedUtilization < 0.90) return total;
    return total + overlap(parseTime(sample.start, "cpu sample start"), parseTime(sample.end, "cpu sample end"), start, end);
  }, 0);
  const cpuLimited = qualifiedOverlap / (end - start) >= 0.80;
  const requiredSources = runner?.cgroupVersion === "v2" && runner?.sourcePaths?.cpuStat && runner?.sourcePaths?.cpuMax && runner?.sourcePaths?.memoryEvents
    && runner?.limits?.cpu && runner?.limits?.cpuset !== undefined && runner?.limits?.memory;
  if (!requiredSources) return { limited: false, reason: "RUNNER_CGROUP_EVIDENCE_INCOMPLETE" };
  return {
    limited: cpuLimited || memoryLimited,
    reason: cpuLimited ? "CPU_THROTTLING_AT_RUNNER_LIMIT" : memoryLimited ? "RUNNER_OOM" : "NO_OBJECTIVE_RUNNER_LIMITATION",
    decisionWindow: { start: shortfall.start, end: shortfall.end },
    qualifiedOverlapMs: qualifiedOverlap,
  };
}

function claimEligibility({ qualificationFlags, histogram, claimEvidence = {} }) {
  const flags = new Set(qualificationFlags);
  const observed = (value) => value === true;
  return {
    persistenceHistogramDerivedLatency: { eligible: Boolean(histogram) },
    endToEndDelivery: { eligible: observed(claimEvidence.endToEndDelivery) },
    targetConcurrency: { eligible: observed(claimEvidence.targetConcurrency) && !flags.has("TARGET_NOT_REACHED") && !flags.has("LOAD_GENERATOR_LIMITED") },
    multiReplica: { eligible: observed(claimEvidence.multiReplica) && !flags.has("TOPOLOGY_NOT_EXERCISED") },
    crossReplica: { eligible: observed(claimEvidence.crossReplica) && !flags.has("TOPOLOGY_NOT_EXERCISED") },
    cpu: { eligible: !flags.has("OBSERVATION_INCOMPLETE") },
    memory: { eligible: !flags.has("OBSERVATION_INCOMPLETE") },
    bottleneckSutCeiling: { eligible: !flags.has("OBSERVATION_INCOMPLETE") && !flags.has("LOAD_GENERATOR_LIMITED") },
  };
}

function collectMeasurementEvidence({ topology, resource, histogram, loadGenerator, claimEvidence, qualificationFlags: inheritedQualificationFlags = [] }) {
  const requiredContainers = requiredContainersForTopology(topology);
  const resourceEvidence = deriveResourceQualification({ ...resource, requiredContainers });
  const histogramEvidence = deriveHistogramEvidence(histogram);
  const loadGeneratorEvidence = evaluateLoadGeneratorLimitation(loadGenerator);
  const qualificationFlags = [...new Set([...inheritedQualificationFlags, ...resourceEvidence.qualificationFlags, ...(loadGeneratorEvidence.limited ? ["LOAD_GENERATOR_LIMITED"] : [])])];
  return {
    resourceEvidence,
    histogramEvidence,
    loadGeneratorEvidence,
    qualificationFlags,
    claimEligibility: claimEligibility({ qualificationFlags, histogram: histogramEvidence, claimEvidence }),
    lockedClaimTypes: LOCKED_CLAIM_TYPES,
  };
}

module.exports = {
  LOCKED_CLAIM_TYPES,
  claimEligibility,
  collectMeasurementEvidence,
  deriveHistogramEvidence,
  deriveResourceQualification,
  evaluateLoadGeneratorLimitation,
  requiredContainersForTopology,
};
