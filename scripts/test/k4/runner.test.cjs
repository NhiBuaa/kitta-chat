const test = require("node:test");
const assert = require("node:assert/strict");
const { executeRun } = require("../../k4/runner");

function plan() { return { runId: "runner-test", workload: { scenario: "message", digest: "abc" }, phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"] }; }
function executor(trace, faults = {}) {
  return async (phase, context) => {
    trace.push(phase);
    if (faults[phase]) { if (phase === "setup/seed") context.registerOwnedResource({ class: "run", id: "fixture" }); throw new Error(faults[phase]); }
    if (phase === "setup/seed") return { resourcesCreated: true, evidence: { seeded: 1 } };
    if (phase === "measurement") return { numbers: { requests: 2 }, raw: { samples: [1, 2] } };
    return { evidence: { phase, ok: true }, ...context };
  };
}

test("executes phases in order and publishes only measurement numbers", async () => {
  const trace = [];
  const result = await executeRun(plan(), { executePhase: executor(trace) });
  assert.deepEqual(trace, ["setup/seed", "warm-up", "measurement", "teardown"]);
  assert.deepEqual(result.publishable, { numbers: { requests: 2 } });
  assert.equal(result.phases["setup/seed"].publishable, false);
  assert.equal(result.phases["warm-up"].publishable, false);
  assert.equal(result.phases.measurement.completed, true);
});

test("short-circuits measurement after setup or warm-up failure and attempts teardown", async () => {
  for (const fault of ["setup/seed", "warm-up"]) {
    const trace = [];
    const result = await executeRun(plan(), { executePhase: executor(trace, { [fault]: "boom" }) });
    assert.equal(trace.at(-1), "teardown");
    assert.equal(trace.includes("measurement"), false);
    assert.equal(result.status, "FAILED_SETUP");
    assert.equal(result.publishable, undefined);
  }
});

test("measurement failure is incomplete/unqualified, retains raw evidence, and tears down", async () => {
  const trace = [];
  const result = await executeRun(plan(), { executePhase: executor(trace, { measurement: "late boom" }) });
  assert.deepEqual(trace, ["setup/seed", "warm-up", "measurement", "teardown"]);
  assert.equal(result.status, "WARMUP_ADMITTED");
  assert.equal(result.phases.measurement.completed, false);
  assert.equal(result.phases.measurement.qualified, false);
  assert.equal(result.publishable, undefined);
  assert.deepEqual(result.rawMeasurement, { error: "late boom" });
  assert.equal(result.teardown.attempted, true);
});

test("teardown is attempted when setup created resources even if teardown itself fails", async () => {
  const trace = [];
  const result = await executeRun(plan(), { executePhase: executor(trace, { "warm-up": "warmup boom", teardown: "cleanup boom" }) });
  assert.deepEqual(trace, ["setup/seed", "warm-up", "teardown"]);
  assert.equal(result.teardown.attempted, true);
  assert.equal(result.teardown.completed, false);
});

test("qualification flags gate publishability and preserve independent axes", async () => {
  const result = await executeRun(plan(), { executePhase: async (phase) => {
    if (phase === "setup/seed") return { resourcesCreated: true };
    if (phase === "measurement") return { numbers: { requests: 2 }, qualificationFlags: { complete: false, qualified: false } };
    return {};
  } });
  assert.equal(result.executionOutcome, "COMPLETED");
  assert.equal(result.artifactStatus, "RETAINED");
  assert.equal(result.qualification.qualified, false);
  assert.equal(result.publishable, undefined);
});

test("primary measurement failure survives teardown failure and partial ownership triggers cleanup", async () => {
  const result = await executeRun(plan(), { executePhase: async (phase, context) => {
    if (phase === "setup/seed") { context.registerOwnedResource({ class: "containers", id: "fixture-partial" }); throw new Error("setup partial"); }
    if (phase === "teardown") throw new Error("cleanup failed");
    return {};
  } });
  assert.equal(result.failure.phase, "setup/seed");
  assert.equal(result.teardown.error, "cleanup failed");
  assert.equal(result.failure.error, "setup partial");
  assert.equal(result.teardown.attempted, true);
});

test("measurement failure keeps the primary execution outcome when teardown succeeds or fails", async () => {
  for (const teardownFails of [false, true]) {
    const result = await executeRun(plan(), { executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true };
      if (phase === "measurement") throw new Error("measurement failed");
      if (phase === "teardown" && teardownFails) throw new Error("teardown failed");
      return {};
    } });
    assert.equal(result.executionOutcome, "FAILED");
    assert.equal(result.failure.phase, "measurement");
    assert.equal(result.teardown.completed, !teardownFails);
  }
});

test("runner-owned acquisition ledger triggers idempotent teardown after setup fails", async () => {
  const trace = [];
  const result = await executeRun(plan(), { executePhase: async (phase, context) => {
    trace.push(phase);
    if (phase === "setup/seed") {
      context.registerOwnedResource({ class: "containers", id: "k4-owned-partial" });
      throw new Error("setup failed after acquisition");
    }
    if (phase === "teardown") return { released: context.ownedResources() };
    return {};
  } });
  assert.deepEqual(trace, ["setup/seed", "teardown"]);
  assert.equal(result.teardown.attempted, true);
  assert.equal(result.teardown.completed, true);
});
