const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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
  assert.equal(result.executionOutcome, "MEASURED");
  assert.equal(result.artifactStatus, "COMPLETED");
  assert.equal(["MEASURED", "NOT_RUN", "FAILED_SETUP"].includes(result.execution_outcome), true);
  assert.equal(["COMPLETED", "INCOMPLETE"].includes(result.artifact_status), true);
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
    assert.equal(result.executionOutcome, "NOT_RUN");
    assert.equal(result.artifactStatus, "INCOMPLETE");
    assert.equal(["MEASURED", "NOT_RUN", "FAILED_SETUP"].includes(result.execution_outcome), true);
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

test("runner keeps warm-up status evidence out of the final execution and artifact axes", async () => {
  const result = await executeRun(plan(), {
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true, executionOutcome: "FAILED_SETUP", artifactStatus: "RETAINED" };
      if (phase === "warm-up") return { executionOutcome: "NOT_RUN", artifactStatus: "NONE" };
      if (phase === "measurement") return { numbers: { requests: 1 } };
      return {};
    },
  });
  assert.equal(result.execution_outcome, "MEASURED");
  assert.equal(result.artifact_status, "COMPLETED");
  assert.equal(result.phases["warm-up"].output.executionOutcome, "NOT_RUN");
  assert.equal(result.phases["warm-up"].output.artifactStatus, "NONE");
});

test("runner emits FAILED_SETUP only for setup or warm-up prerequisite failures", async () => {
  for (const fault of ["setup/seed", "warm-up"]) {
    const result = await executeRun(plan(), { executePhase: executor([], { [fault]: "blocked" }) });
    assert.equal(result.execution_outcome, "FAILED_SETUP");
    assert.equal(result.artifact_status, "INCOMPLETE");
  }
});

test("runner normalizes legacy measurement markers onto the canonical final axes", async () => {
  const result = await executeRun(plan(), {
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true };
      if (phase === "measurement") return { executionOutcome: "COMPLETED", artifactStatus: "RETAINED" };
      return {};
    },
  });
  assert.equal(result.execution_outcome, "MEASURED");
  assert.equal(result.artifact_status, "INCOMPLETE");
  assert.equal(["MEASURED", "NOT_RUN", "FAILED_SETUP"].includes(result.execution_outcome), true);
  assert.equal(["COMPLETED", "INCOMPLETE"].includes(result.artifact_status), true);
});

test("completed run persists a provenance manifest, inventories, and non-inventoried completion marker", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-run-artifacts-"));
  const dataset = {
    generatorVersion: "k4-fixture-v1",
    schemaVersion: "kittachat-schema-v1",
    contentSeed: "k4-content-seed-v1",
    cardinalities: { users: 2, messages: 3 },
    fingerprint: "sha256:dataset-fingerprint",
    password: "must-not-be-retained",
  };
  const result = await executeRun({
    runId: "artifact-run",
    resultDirectory,
    profile: "single-replica",
    backendReplicaCount: 1,
    backendUpstreamMembership: ["backend-1"],
    topology: { profile: "single-replica", backendUpstreamMembership: ["backend-1"] },
    workload: {
      scenario: "sidebar",
      version: 2,
      digest: "profile-digest",
      snapshot: { scenario: "sidebar", version: 2, request: { method: "GET", path: "/api/sidebar/conversations" } },
    },
    credentials: { password: "must-not-be-retained" },
  }, {
    artifactMetadata: {
      commitSha: "0123456789abcdef0123456789abcdef01234567",
      hardware: { hostname: "runner-host", cpuModel: "CPU", logicalProcessors: 12, memoryBytes: 16384 },
      runnerLimits: { cgroupVersion: "v2", limits: { cpu: "2", memory: "1GiB" } },
    },
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true, setupPreflight: { verification: { status: "VERIFIED" }, dataset } };
      if (phase === "measurement") return { numbers: { requests: 1 } };
      return { phase };
    },
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(resultDirectory, "manifest.json"), "utf8"));
  const sourceInventory = JSON.parse(fs.readFileSync(path.join(resultDirectory, "source-inventory.json"), "utf8"));
  const bundleInventory = JSON.parse(fs.readFileSync(path.join(resultDirectory, "bundle-inventory.json"), "utf8"));
  const marker = JSON.parse(fs.readFileSync(path.join(resultDirectory, "COMPLETED"), "utf8"));

  assert.equal(manifest.runId, "artifact-run");
  assert.equal(manifest.commitSha, "0123456789abcdef0123456789abcdef01234567");
  assert.equal(manifest.testMachine.hostname, "runner-host");
  assert.equal(manifest.testMachine.runnerLimits.limits.cpu, "2");
  assert.equal(manifest.dataset.identity, dataset.fingerprint);
  assert.deepEqual(manifest.dataset.size.cardinalities, dataset.cardinalities);
  assert.equal(manifest.plan.runId, "artifact-run");
  assert.equal(manifest.plan.credentials.password, undefined);
  assert.equal(manifest.dataset.observed.password, undefined);
  assert.equal(manifest.topology.profile, "single-replica");
  assert.equal(manifest.workload.digest, "profile-digest");
  assert.equal(JSON.stringify(manifest).includes("password"), false);
  assert.equal(sourceInventory.entries.some(({ path: entryPath }) => entryPath === "manifest.json"), true);
  assert.equal(sourceInventory.entries.some(({ path: entryPath }) => ["source-inventory.json", "bundle-inventory.json", "COMPLETED"].includes(entryPath)), false);
  assert.equal(bundleInventory.entries.some(({ path: entryPath }) => entryPath === "source-inventory.json"), true);
  const digest = (name) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(path.join(resultDirectory, name))).digest("hex")}`;
  assert.equal(marker.source_inventory_sha256, digest("source-inventory.json"));
  assert.equal(marker.bundle_inventory_sha256, digest("bundle-inventory.json"));
  assert.equal(fs.existsSync(path.join(resultDirectory, "COMPLETED")), true);
  assert.equal(result.artifacts.sourceInventoryPath, "source-inventory.json");
});

test("manifest records unresolved commit and machine provenance when metadata is not injected", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-run-unresolved-provenance-"));
  const result = await executeRun({
    runId: "unresolved-provenance-run",
    resultDirectory,
    topology: { profile: "single-replica", backendUpstreamMembership: ["backend-1"] },
    workload: { scenario: "sidebar", version: 2, digest: "profile-digest" },
  }, {
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true };
      if (phase === "measurement") return { numbers: { requests: 1 } };
      return { phase };
    },
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(resultDirectory, "manifest.json"), "utf8"));

  assert.equal(manifest.commitSha, "unresolved");
  assert.equal(manifest.testMachine.evidenceStatus, "INCOMPLETE");
  assert.deepEqual(manifest.testMachine.unresolved, ["hostname", "cpuModel", "logicalProcessors", "memoryBytes"]);
  assert.equal(manifest.provenance.status, "INCOMPLETE");
  assert.deepEqual(manifest.provenance.unresolved, ["commitSha", "testMachine"]);
});
