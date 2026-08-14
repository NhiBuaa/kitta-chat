const crypto = require("node:crypto");
const { executeRun } = require("./runner");

function createProductionPhaseExecutor({ setup, warmup, measure, teardown }) {
  for (const [name, fn] of Object.entries({ setup, warmup, measure, teardown })) if (typeof fn !== "function") throw new Error(`production phase executor requires ${name}`);
  return async (phase, context) => {
    if (phase === "setup/seed") return setup(context);
    if (phase === "warm-up") return warmup(context);
    if (phase === "measurement") return measure(context);
    if (phase === "teardown") return teardown(context);
    throw new Error(`unknown K4 phase: ${phase}`);
  };
}

async function runProductionPlan({ plan, phases, observation, intervalMs = 1000, executeRunFn = executeRun }) {
  if (!plan?.workload?.scenario || !plan?.topology) throw new Error("production run requires an approved resolved workload and topology");
  if (!observation) throw new Error("production run requires an injected production observation lifecycle");
  return executeRunFn(plan, {
    executePhase: createProductionPhaseExecutor(phases),
    observation,
  });
}

function runScopedSecrets(environment = process.env) {
  return {
    observerToken: environment.K4_OBSERVER_TOKEN || crypto.randomBytes(32).toString("hex"),
  };
}

function createProductionRunComposition({ setup, warmup, workloads, teardown, observationFactory = createProductionMeasurementObservation, executeRunFn = executeRun }) {
  return async ({ plan, intervalMs = 1000 }) => {
    const measure = workloads?.[plan.workload.scenario];
    if (typeof measure !== "function") throw new Error(`production workload adapter is unavailable for ${plan.workload.scenario}`);
    return runProductionPlan({ plan, intervalMs, observation: observationFactory({ intervalMs }), phases: { setup, warmup, measure, teardown }, executeRunFn });
  };
}

module.exports = { createProductionPhaseExecutor, createProductionRunComposition, runProductionPlan, runScopedSecrets };
