const assert = require("node:assert/strict");
const test = require("node:test");
const { runProductionPlan } = require("../../k4/productionRun");

test("production entry invokes approved lifecycle and injects observation", async () => {
  const trace = [];
  const observation = { start: async () => trace.push("observe:start"), finalize: async () => ({ qualificationFlags: [], claimEligibility: { cpu: { eligible: true } } }) };
  const result = await runProductionPlan({
    plan: { runId: "run-84", workload: { scenario: "sidebar" }, topology: { backendUpstreamMembership: ["backend-1"] } },
    observation,
    phases: {
      setup: async () => { trace.push("setup"); return { resourcesCreated: true }; },
      warmup: async () => { trace.push("warmup"); return {}; },
      measure: async () => { trace.push("measure"); return { numbers: { requests: 1 } }; },
      teardown: async () => { trace.push("teardown"); return {}; },
    },
  });
  assert.deepEqual(trace, ["setup", "warmup", "observe:start", "measure", "teardown"]);
  assert.equal(result.executionOutcome, "COMPLETED");
});
