/**
 * Execute a resolved K4 run plan through its lifecycle. The phase executor is
 * intentionally injectable for deterministic tests; production callers supply
 * the repository-owned phase implementation.
 */
async function executeRun(plan, { executePhase, observation } = {}) {
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
  let executionOutcome = "FAILED";
  let artifactStatus = "NONE";
  let qualification = { complete: false, qualified: false };
  let publishable;
  let rawMeasurement;
  let failed;

  const runPhase = async (name) => {
    const started = true;
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
      phases[name] = { started, completed: true, qualified: name === "measurement" && qualification.qualified === true, publishable: false, output: measurementOutput };
      artifactStatus = "RETAINED";
      if (name !== "teardown") executionOutcome = "COMPLETED";
      context = { ...context, ...measurementOutput };
      if (name === "setup/seed" && measurementOutput?.resourcesCreated === true) registerOwnedResource({ class: "run", id: plan.runId });
      if (name === "measurement") publishable = measurementOutput?.numbers === undefined ? undefined : { numbers: measurementOutput.numbers };
      return true;
    } catch (error) {
      phases[name] = { started, completed: false, qualified: false, publishable: false, error: error.message };
      if (!failed) failed = { phase: name, error: error.message };
      if (name !== "teardown") executionOutcome = "FAILED";
      if (name === "measurement") rawMeasurement = { error: error.message };
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

  const shouldTeardown = resourcesCreated;
  if (shouldTeardown) {
    const teardownOk = await runPhase("teardown");
    phases.teardown.attempted = true;
    phases.teardown.completed = teardownOk;
  } else {
    phases.teardown = { attempted: false, completed: false, qualified: false, publishable: false };
  }

  const result = { status, phases, teardown: { attempted: shouldTeardown, completed: phases.teardown.completed, ...(phases.teardown.teardownError ? { error: phases.teardown.teardownError } : {}) } };
  if (publishable && qualification.complete !== false && qualification.qualified !== false) result.publishable = publishable;
  if (rawMeasurement) result.rawMeasurement = rawMeasurement;
  if (failed) result.failure = failed;
  result.executionOutcome = executionOutcome;
  result.artifactStatus = artifactStatus;
  result.qualification = qualification;
  if (context.observation) {
    result.qualificationFlags = context.observation.qualificationFlags;
    result.claimEligibility = context.observation.claimEligibility;
  }
  return result;
}

module.exports = { executeRun };
