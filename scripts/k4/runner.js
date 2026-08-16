const { finalizeRunArtifacts } = require("./runArtifacts");

/**
 * Execute a resolved K4 run plan through its lifecycle. The phase executor is
 * intentionally injectable for deterministic tests; production callers supply
 * the repository-owned phase implementation.
 */
function canonicalMeasurementOutcome(output) {
  const outcome = output?.executionOutcome ?? output?.execution_outcome;
  return outcome === "NOT_RUN" ? "NOT_RUN" : "MEASURED";
}

function canonicalArtifactStatus(output) {
  const status = output?.artifactStatus ?? output?.artifact_status;
  if (status === undefined) return "COMPLETED";
  return status === "COMPLETED" ? "COMPLETED" : "INCOMPLETE";
}

function phaseTimestamp(clock) {
  const value = clock();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return String(value);
}

async function executeRun(plan, { executePhase, observation, artifactMetadata, clock = () => new Date() } = {}) {
  if (!plan || typeof plan !== "object") throw new Error("run plan is required");
  if (typeof executePhase !== "function") throw new Error("executePhase seam is required");
  const phases = {};
  let resourcesCreated = false;
  const ownedResources = [];
  const registerOwnedResource = (resource) => {
    if (!resource || typeof resource !== "object") throw new Error("owned resource must be an object");
    ownedResources.push(resource);
    resourcesCreated = true;
  };
  let context = { plan, registerOwnedResource, ownedResources: () => [...ownedResources] };
  let status = "FAILED_SETUP";
  let executionOutcome = "NOT_RUN";
  let artifactStatus = "INCOMPLETE";
  let qualification = { complete: false, qualified: false };
  let publishable;
  let rawMeasurement;
  let failed;

  const runPhase = async (name) => {
    const started = true;
    const startedAt = phaseTimestamp(clock);
    try {
      if (name === "measurement" && observation) await observation.start(plan);
      const output = await executePhase(name, context);
      const observationEvidence = name === "measurement" && observation ? await observation.finalize(plan, output) : undefined;
      const measurementOutput = observationEvidence ? {
        ...output,
        observation: observationEvidence,
        qualificationFlags: observationEvidence.qualificationFlags,
        claimEligibility: observationEvidence.claimEligibility,
      } : output;
      qualification = name === "measurement"
        ? (Array.isArray(measurementOutput.qualificationFlags)
          ? { complete: !measurementOutput.qualificationFlags.includes("OBSERVATION_INCOMPLETE"), qualified: !measurementOutput.qualificationFlags.includes("OBSERVATION_INCOMPLETE") }
          : (measurementOutput.qualificationFlags || { complete: true, qualified: true }))
        : qualification;
      phases[name] = { started, startedAt, completed: true, completedAt: phaseTimestamp(clock), qualified: name === "measurement" && qualification.qualified === true, publishable: false, output: measurementOutput };
      if (name === "measurement") {
        artifactStatus = canonicalArtifactStatus(measurementOutput);
        executionOutcome = canonicalMeasurementOutcome(measurementOutput);
      }
      context = { ...context, ...measurementOutput };
      if (name === "setup/seed" && measurementOutput?.resourcesCreated === true) registerOwnedResource({ class: "run", id: plan.runId });
      if (name === "measurement" && executionOutcome === "MEASURED") publishable = measurementOutput?.numbers === undefined ? undefined : { numbers: measurementOutput.numbers };
      return true;
    } catch (error) {
      phases[name] = { started, startedAt, completed: false, completedAt: phaseTimestamp(clock), qualified: false, publishable: false, error: error.message };
      if (!failed) failed = { phase: name, error: error.message };
      if (name === "setup/seed" || name === "warm-up") executionOutcome = "FAILED_SETUP";
      if (name === "measurement") executionOutcome = "NOT_RUN";
      if (name === "measurement") rawMeasurement = { error: error.message };
      if (name === "measurement") artifactStatus = "INCOMPLETE";
      if (name === "teardown") phases[name].teardownError = error.message;
      return false;
    }
  };

  const setupOk = await runPhase("setup/seed");
  if (setupOk) {
    const warmupOk = await runPhase("warm-up");
    if (warmupOk) {
      status = "WARMUP_ADMITTED";
      await runPhase("measurement");
    }
  }

  // Every attempted run retains cleanup evidence. Production teardown remains
  // ownership-aware, so invoking it after an early setup failure is safe.
  const shouldTeardown = setupOk || Boolean(failed);
  if (shouldTeardown) {
    const teardownOk = await runPhase("teardown");
    phases.teardown.attempted = true;
    phases.teardown.completed = teardownOk;
  } else {
    phases.teardown = { attempted: false, completed: false, qualified: false, publishable: false };
  }

  const cleanup = { attempted: shouldTeardown, completed: phases.teardown.completed, ...(phases.teardown.teardownError ? { error: phases.teardown.teardownError } : {}) };
  const result = { status, phases, teardown: cleanup, cleanup };
  if (publishable && qualification.complete !== false && qualification.qualified !== false) result.publishable = publishable;
  if (rawMeasurement) result.rawMeasurement = rawMeasurement;
  if (failed) result.failure = failed;
  result.executionOutcome = executionOutcome;
  result.artifactStatus = artifactStatus;
  result.execution_outcome = executionOutcome;
  result.artifact_status = artifactStatus;
  result.qualification = qualification;
  if (context.observation) {
    result.qualificationFlags = context.observation.qualificationFlags;
    result.claimEligibility = context.observation.claimEligibility;
  }
  const artifacts = finalizeRunArtifacts({ plan, result, metadata: artifactMetadata });
  if (artifacts) result.artifacts = artifacts;
  return result;
}

module.exports = { executeRun };
