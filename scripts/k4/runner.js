/**
 * Execute a resolved K4 run plan through its lifecycle. The phase executor is
 * intentionally injectable for deterministic tests; production callers supply
 * the repository-owned phase implementation.
 */
async function executeRun(plan, { executePhase } = {}) {
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
      const output = await executePhase(name, context);
      qualification = name === "measurement" ? (output.qualificationFlags || { complete: true, qualified: true }) : qualification;
      phases[name] = { started, completed: true, qualified: name === "measurement" && qualification.qualified === true, publishable: false, output };
      artifactStatus = "RETAINED";
      if (name !== "teardown") executionOutcome = "COMPLETED";
      context = { ...context, ...output };
      if (name === "setup/seed" && output?.resourcesCreated === true) registerOwnedResource({ class: "run", id: plan.runId });
      if (name === "measurement") publishable = output?.numbers === undefined ? undefined : { numbers: output.numbers };
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
  return result;
}

module.exports = { executeRun };
