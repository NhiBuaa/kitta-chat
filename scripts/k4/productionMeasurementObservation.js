const { createMeasurementObservation } = require("./measurementObservation");
const { requiredContainersForTopology } = require("./measurementCollectors");

function resolvedTopology(plan) {
  const topology = plan?.topology || { backendUpstreamMembership: plan?.backendUpstreamMembership };
  const replicas = topology?.backendUpstreamMembership;
  if (!Array.isArray(replicas) || replicas.length === 0) throw new Error("resolved topology backend replicas are required for production observation");
  return { topology, replicas: [...replicas] };
}

function requirePort(port, name) {
  if (typeof port?.[name] !== "function") throw new Error(`production observation runtime port.${name} is required`);
}

function scenarioOf(plan) {
  return plan?.workload?.scenario || plan?.workload?.snapshot?.scenario;
}

async function captureActiveSocketGauge(runtimePort, { plan, replicas, point, measurementStart, measurementEnd, slotIndex, slotTimestamp }) {
  if (scenarioOf(plan) !== "socket-concurrency") return undefined;
  if (typeof runtimePort?.snapshotActiveSocketGauge !== "function") {
    return {
      point,
      capability: "unavailable",
      complete: false,
      aggregate: null,
      replicas: replicas.map((replica) => ({ replica, status: "unavailable", error: "active socket gauge capability is unavailable" })),
      ...(slotIndex === undefined ? {} : { slotIndex, slotTimestamp }),
    };
  }
  const values = await Promise.all(replicas.map(async (replica) => {
    try {
      const value = await runtimePort.snapshotActiveSocketGauge({ plan, replica, point, measurementStart, measurementEnd, slotIndex, slotTimestamp });
      const rawActiveConnections = value && typeof value === "object" ? value.activeConnections : value;
      if (rawActiveConnections === undefined || rawActiveConnections === null || rawActiveConnections === "") throw new Error("active socket gauge is absent or malformed");
      const activeConnections = Number(rawActiveConnections);
      if (!Number.isFinite(activeConnections) || activeConnections < 0) throw new Error("active socket gauge is absent or malformed");
      return { ...(value && typeof value === "object" ? value : {}), replica, status: "success", activeConnections };
    } catch (error) {
      return { replica, status: "error", error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const complete = values.every((value) => value.status === "success" && Number.isFinite(value.activeConnections));
  return {
    point,
    capability: "available",
    complete,
    replicas: values,
    aggregate: complete ? values.reduce((total, value) => total + value.activeConnections, 0) : null,
    ...(slotIndex === undefined ? {} : { slotIndex, slotTimestamp }),
  };
}

/**
 * Builds the repository-owned observation adapter. The runtime port is an
 * infrastructure seam only: it can read internal replica evidence and runner
 * cgroup files, but it has no workload or routing operation.
 */
function createProductionMeasurementObservation({ intervalMs, runtimePort, clock, setIntervalFn, clearIntervalFn }) {
  for (const name of ["snapshotPersistenceHistogram", "captureReplicaAttribution", "collectResourceSamples", "captureRunnerCgroupEvidence", "captureRunnerShortfall"]) requirePort(runtimePort, name);

  return createMeasurementObservation({
    intervalMs,
    clock,
    setIntervalFn,
    clearIntervalFn,
    async captureStart(plan, measurementStart) {
      const { replicas } = resolvedTopology(plan);
      const snapshots = {};
      for (const replica of replicas) snapshots[replica] = { before: await runtimePort.snapshotPersistenceHistogram({ plan, replica, point: "before", measurementStart }) };
      const activeSocketGauge = await captureActiveSocketGauge(runtimePort, { plan, replicas, point: "before", measurementStart });
      return {
        histogram: { resolvedBackendReplicas: replicas, snapshots },
        replicaAttribution: await runtimePort.captureReplicaAttribution({ plan, point: "before", measurementStart, replicas }),
        ...(activeSocketGauge ? { activeSocketGauge: { before: activeSocketGauge } } : {}),
      };
    },
    async captureSample(plan, { measurementStart, slotIndex, slotTimestamp }) {
      const { topology, replicas } = resolvedTopology(plan);
      const requiredContainers = requiredContainersForTopology(topology);
      const [resources, cgroup, activeSocketGauge] = await Promise.all([
        runtimePort.collectResourceSamples({ plan, measurementStart, intervalMs, requiredContainers, slotIndex, slotTimestamp }),
        runtimePort.captureRunnerCgroupEvidence({ plan, measurementStart, slotIndex, slotTimestamp }),
        captureActiveSocketGauge(runtimePort, { plan, replicas, point: "sample", measurementStart, slotIndex, slotTimestamp }),
      ]);
      return { resources, cgroup, ...(activeSocketGauge ? { activeSocketGauge } : {}) };
    },
    async captureEnd(plan, { measurementStart, measurementEnd, measurementOutput, samples = [] }) {
      const { topology, replicas } = resolvedTopology(plan);
      const requiredContainers = requiredContainersForTopology(topology);
      const snapshots = {};
      for (const replica of replicas) snapshots[replica] = { after: await runtimePort.snapshotPersistenceHistogram({ plan, replica, point: "after", measurementStart, measurementEnd }) };
      const activeSocketGauge = await captureActiveSocketGauge(runtimePort, { plan, replicas, point: "after", measurementStart, measurementEnd });
      const [attribution, observations, runner, shortfall] = await Promise.all([
        runtimePort.captureReplicaAttribution({ plan, point: "after", measurementStart, measurementEnd, replicas, measurementOutput }),
        runtimePort.collectResourceSamples({ plan, measurementStart, measurementEnd, intervalMs, requiredContainers }),
        runtimePort.captureRunnerCgroupEvidence({ plan, measurementStart, measurementEnd }),
        runtimePort.captureRunnerShortfall({ plan, measurementStart, measurementEnd, measurementOutput, samples }),
      ]);
      const claimEvidence = claimEvidenceFromMeasurement({ plan, measurementOutput, attribution });
      const attributionFlags = attribution?.complete === false
        ? ["OBSERVATION_INCOMPLETE"]
        : attribution?.topologyNotExercised === true ? ["TOPOLOGY_NOT_EXERCISED"] : [];
      return {
        histogram: { snapshots },
        ...(activeSocketGauge ? { activeSocketGauge: { after: activeSocketGauge, samples: samples.map((sample) => sample.value?.activeSocketGauge).filter(Boolean) } } : {}),
        replicaAttribution: attribution,
        resource: { observations: mergeResourceSamples(samples, observations, requiredContainers) },
        loadGenerator: { shortfall, runner: { ...runner, samples: samples.map((sample) => sample.value?.cgroup).filter(Boolean) } },
        claimEvidence,
        qualificationFlags: [...new Set([...(measurementOutput?.qualificationFlags || []), ...attributionFlags])],
      };
    },
  });
}

function mergeResourceSamples(samples, finalObservations, requiredContainers) {
  return Object.fromEntries(requiredContainers.map((container) => [container, [
    ...samples.flatMap((sample) => sample.value?.resources?.[container] || []),
    ...(finalObservations?.[container] || []),
  ]]));
}

function claimEvidenceFromMeasurement({ plan, measurementOutput, attribution }) {
  const evidence = { ...(measurementOutput?.claimEvidence || {}) };
  const scenario = scenarioOf(plan);
  if (["sidebar", "socket-concurrency", "message"].includes(scenario)) {
    evidence.multiReplica = attribution?.claimEligible === true;
  }
  if (scenario === "socket-concurrency") {
    const target = plan.workload?.snapshot?.loadModel?.targetConcurrency;
    const activeCount = measurementOutput?.activeCountEvidence;
    const activeCountComplete = activeCount?.complete === true;
    const targetHeld = activeCount?.targetHeldThroughMeasurement === true;
    const admitted = measurementOutput?.measurementAdmitted === true
      && (activeCount?.measurementAdmitted === undefined || activeCount.measurementAdmitted === true);
    const flags = new Set(Array.isArray(measurementOutput?.qualificationFlags) ? measurementOutput.qualificationFlags : []);
    evidence.targetConcurrency = Number.isInteger(target)
      && measurementOutput?.targetReachedAt != null
      && measurementOutput?.targetConcurrency === target
      && admitted
      && activeCountComplete
      && targetHeld
      && !flags.has("TARGET_NOT_REACHED")
      && !flags.has("OBSERVATION_INCOMPLETE");
  }
  if (scenario === "message") {
    evidence.endToEndDelivery = attribution?.claimEligible === true;
    evidence.crossReplica = attribution?.claimEligible === true;
  }
  return evidence;
}

module.exports = { captureActiveSocketGauge, createProductionMeasurementObservation, resolvedTopology, mergeResourceSamples, claimEvidenceFromMeasurement };
