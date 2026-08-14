const { composeArgs, dockerAsync } = require("./lifecycle");
const { validateObserverRequest } = require("./observerRequestContract");

const OBSERVER_EXECUTABLE = "/opt/k4/observerRequest.js";

function createObserverComposeBridge({ plan, environment = process.env, dockerCommand = dockerAsync } = {}) {
  if (!plan?.runId || !plan?.projectName) throw new Error("resolved run plan is required for observer bridge");

  const invoke = async (operation, payload) => {
    const request = validateObserverRequest({ operation, payload }, { runId: plan.runId, project: plan.projectName });
    const output = await dockerCommand(composeArgs(plan, ["exec", "-T", "observer", "node", OBSERVER_EXECUTABLE]), {
      env: environment,
      input: JSON.stringify(request),
    });
    try {
      return JSON.parse(String(output));
    } catch {
      throw new Error(`observer ${operation} returned malformed response`);
    }
  };

  return Object.freeze({
    metrics: (payload) => invoke("metrics", payload),
    logs: (payload) => invoke("logs", payload),
    stats: (payload) => invoke("stats", payload),
    identity: (payload) => invoke("identity", payload),
    runnerCgroup: (payload) => invoke("runner-cgroup", payload),
  });
}

module.exports = { OBSERVER_EXECUTABLE, createObserverComposeBridge };
