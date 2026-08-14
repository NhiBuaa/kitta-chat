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
      return {
        histogram: { resolvedBackendReplicas: replicas, snapshots },
        replicaAttribution: await runtimePort.captureReplicaAttribution({ plan, point: "before", measurementStart, replicas }),
      };
    },
    async captureSample(plan, { measurementStart, slotIndex, slotTimestamp }) {
      const { topology } = resolvedTopology(plan);
      const requiredContainers = requiredContainersForTopology(topology);
      const [resources, cgroup] = await Promise.all([
        runtimePort.collectResourceSamples({ plan, measurementStart, intervalMs, requiredContainers, slotIndex, slotTimestamp }),
        runtimePort.captureRunnerCgroupEvidence({ plan, measurementStart, slotIndex, slotTimestamp }),
      ]);
      return { resources, cgroup };
    },
    async captureEnd(plan, { measurementStart, measurementEnd, measurementOutput, samples = [] }) {
      const { topology, replicas } = resolvedTopology(plan);
      const requiredContainers = requiredContainersForTopology(topology);
      const snapshots = {};
      for (const replica of replicas) snapshots[replica] = { after: await runtimePort.snapshotPersistenceHistogram({ plan, replica, point: "after", measurementStart, measurementEnd }) };
      const [attribution, observations, runner, shortfall] = await Promise.all([
        runtimePort.captureReplicaAttribution({ plan, point: "after", measurementStart, measurementEnd, replicas, measurementOutput }),
        runtimePort.collectResourceSamples({ plan, measurementStart, measurementEnd, intervalMs, requiredContainers }),
        runtimePort.captureRunnerCgroupEvidence({ plan, measurementStart, measurementEnd }),
        runtimePort.captureRunnerShortfall({ plan, measurementStart, measurementEnd, measurementOutput, samples }),
      ]);
      return {
        histogram: { snapshots },
        replicaAttribution: attribution,
        resource: { observations: mergeResourceSamples(samples, observations, requiredContainers) },
        loadGenerator: { shortfall, runner: { ...runner, samples: samples.map((sample) => sample.value?.cgroup).filter(Boolean) } },
        claimEvidence: claimEvidenceFromMeasurement({ plan, measurementOutput, attribution }),
        qualificationFlags: [...new Set([
          ...(measurementOutput?.qualificationFlags || []),
          ...(attribution?.topologyNotExercised === true ? ["TOPOLOGY_NOT_EXERCISED"] : []),
        ])],
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
  const scenario = plan.workload?.scenario || plan.workload?.snapshot?.scenario;
  if (["sidebar", "socket-concurrency", "message"].includes(scenario)) {
    evidence.multiReplica = attribution?.claimEligible === true;
  }
  if (scenario === "socket-concurrency") {
    const target = plan.workload?.snapshot?.loadModel?.targetConcurrency;
    evidence.targetConcurrency = Number.isInteger(target)
      && measurementOutput?.targetReachedAt != null
      && measurementOutput?.targetConcurrency === target;
  }
  if (scenario === "message") {
    evidence.endToEndDelivery = attribution?.deliveryEligible === true || attribution?.claimEligible === true;
    evidence.crossReplica = attribution?.claimEligible === true;
  }
  return evidence;
}

module.exports = { createProductionMeasurementObservation, resolvedTopology, mergeResourceSamples, claimEvidenceFromMeasurement };
