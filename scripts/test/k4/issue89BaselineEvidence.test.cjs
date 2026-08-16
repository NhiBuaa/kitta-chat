const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  BASELINE_MATRIX,
  createBaselineMatrix,
  executeBaselineEvidenceChain,
  validateBaselineMatrix,
  validateBaselineCell,
  validatePrerequisiteEvidenceSet,
  validatePrerequisiteFreshness,
} = require("../../k4/baselineEvidence");
const { executeRun } = require("../../k4/runner");

function measuredCell(cell, overrides = {}) {
  return {
    ...cell,
    attemptId: `${cell.cellId}-attempt-1`,
    outcome: "MEASURED",
    artifact_status: "COMPLETED",
    execution_outcome: "MEASURED",
    qualification_flags: [],
    phases: {
      "setup/seed": { started: true, startedAt: "2026-08-16T00:00:00Z", completed: true, completedAt: "2026-08-16T00:00:01Z" },
      "warm-up": { started: true, startedAt: "2026-08-16T00:00:01Z", completed: true, completedAt: "2026-08-16T00:00:02Z" },
      measurement: { started: true, startedAt: "2026-08-16T00:00:02Z", completed: true, completedAt: "2026-08-16T00:00:03Z", measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" } },
      teardown: { started: true, startedAt: "2026-08-16T00:00:03Z", completed: true, completedAt: "2026-08-16T00:00:04Z" },
    },
    measurement: { rawArtifact: `${cell.cellId}.raw.json` },
    artifacts: { sourceInventorySha256: "sha256:source", bundleInventorySha256: "sha256:bundle" },
    marker: { artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [], source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle" },
    bundle: { entries: [{ path: "source-inventory.json" }, { path: "report.json" }] },
    sourceInventory: { entries: [{ path: "manifest.json" }, { path: "measurement.raw.json" }] },
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
    provenance: {
      commit: "commit-1",
      hardware: { cpu: "cpu-1", memory: "memory-1" },
      runnerPlacement: "k4-runner",
      nonTopologyConfiguration: { env: "same" },
    },
    ...overrides,
  };
}

test("Issue 89 baseline matrix resolves all six mandatory profile/topology cells", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89" });
  assert.equal(matrix.length, 6);
  assert.deepEqual(matrix.map((cell) => cell.cellId), BASELINE_MATRIX.map((cell) => cell.cellId));
  for (const cell of matrix) {
    assert.match(cell.attemptId, /^issue89-/);
    assert.equal(cell.profile.scenario, cell.scenario);
    assert.equal(cell.profile.version, 2);
    assert.match(cell.profile.digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(cell.workload.digest, cell.profile.digest);
  }
});

test("Issue 89 matrix rejects an omitted cell and rejects copied single topology evidence", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89" });
  const records = matrix.map((cell) => measuredCell(cell));
  const missing = validateBaselineMatrix(records.slice(0, -1));
  assert.equal(missing.valid, false);
  assert.match(missing.diagnostics.join(" "), /missing/i);

  const multi = records.find((record) => record.topology === "multi-replica");
  multi.topologyEvidence = { replicaCount: 1, upstreamMembership: ["backend-1"] };
  const invalid = validateBaselineMatrix(records);
  assert.equal(invalid.valid, false);
  assert.match(invalid.diagnostics.join(" "), /topology|replica|equivalent/i);
});

test("Issue 89 lifecycle validation is fail-closed for FAILED_SETUP and NOT_RUN", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89" });
  const failedSetup = {
    ...matrix[0],
    attemptId: "issue89-failed-1",
    outcome: "FAILED_SETUP",
    artifact_status: "INCOMPLETE",
    execution_outcome: "FAILED_SETUP",
    qualification_flags: [],
    failure: { phase: "setup/seed", reason: "seed unavailable" },
    cleanup: { attempted: true, completed: true },
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
    provenance: { commit: "commit-1", hardware: { cpu: "cpu-1" }, runnerPlacement: "k4-runner", nonTopologyConfiguration: { env: "same" } },
    artifacts: { sourceInventorySha256: "sha256:source", bundleInventorySha256: "sha256:bundle" },
    marker: { artifact_status: "INCOMPLETE", execution_outcome: "FAILED_SETUP", qualification_flags: [], source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle" },
    bundle: { entries: [{ path: "source-inventory.json" }] },
    sourceInventory: { entries: [{ path: "manifest.json" }] },
  };
  assert.equal(validateBaselineCell(failedSetup).valid, true);

  const notRun = {
    ...matrix[1],
    attemptId: "issue89-not-run-1",
    outcome: "NOT_RUN",
    artifact_status: "INCOMPLETE",
    execution_outcome: "NOT_RUN",
    qualification_flags: [],
    reason: "multi-replica image set unavailable",
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
  };
  assert.equal(validateBaselineCell(notRun).valid, true);
  assert.equal(validateBaselineCell({ ...notRun, measurement: { p95: 12 } }).valid, false);
});

test("Issue 89 prerequisite reuse requires pinned freshness and unchanged relevant lineage", () => {
  const base = {
    guideRevision: "k4-issue-85-r3",
    evaluationRunId: "tc85r3-human-approved-20260814",
    evaluationStatus: "PASSED",
    implementationIdentity: "merge-85",
    sourcePaths: ["scripts/k4/provenance.js"],
    sourceDigests: { "scripts/k4/provenance.js": "sha256:provenance" },
    contract: { name: "claim-eligibility-v1", digest: "sha256:contract" },
    current: {
      headCommit: "issue89-head",
      sourceDigests: { "scripts/k4/provenance.js": "sha256:provenance" },
      contract: { name: "claim-eligibility-v1", digest: "sha256:contract" },
      changedPaths: [],
    },
  };
  assert.equal(validatePrerequisiteFreshness(base).status, "FRESH");
  const stale = validatePrerequisiteFreshness({ ...base, current: { ...base.current, changedPaths: ["scripts/k4/provenance.js"] } });
  assert.equal(stale.status, "STALE");
  assert.equal(stale.reusable, false);
  const refreshed = validatePrerequisiteFreshness({ ...base, current: { ...base.current, changedPaths: ["scripts/k4/provenance.js"], sourceDigests: { "scripts/k4/provenance.js": "sha256:new-provenance" } }, regression: { status: "PASSED", runId: "regression-89" } });
  assert.equal(refreshed.status, "FRESH_WITH_REGRESSION");
  assert.equal(refreshed.reusable, true);
  const set = validatePrerequisiteEvidenceSet({ prerequisites: [base], current: base.current });
  assert.equal(set.status, "FRESH");
  assert.equal(set.reusable, true);
});

test("Issue 89 runner retains setup failure reason and attempts cleanup even before resource admission", async () => {
  const trace = [];
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-cleanup-"));
  try {
    const result = await executeRun({ runId: "issue89-cleanup", resultDirectory, phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"] }, {
      executePhase: async (phase) => {
        trace.push(phase);
        if (phase === "setup/seed") throw new Error("seed failed before resource registration");
        if (phase === "teardown") return { cleanup: "attempted" };
        return {};
      },
    });
    assert.deepEqual(trace, ["setup/seed", "teardown"]);
    assert.equal(result.execution_outcome, "FAILED_SETUP");
    assert.equal(result.failure.error, "seed failed before resource registration");
    assert.equal(result.cleanup.attempted, true);
    assert.equal(result.cleanup.completed, true);
    const status = JSON.parse(fs.readFileSync(path.join(resultDirectory, "run-status.json"), "utf8"));
    assert.equal(status.failure.error, "seed failed before resource registration");
    assert.equal(status.cleanup.completed, true);
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("Issue 89 runner marks explicit NOT_RUN without a measurement claim", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-not-run-"));
  try {
    const result = await executeRun({ runId: "issue89-not-run", resultDirectory }, {
      executePhase: async (phase) => {
        if (phase === "setup/seed") return { resourcesCreated: true };
        if (phase === "measurement") return { executionOutcome: "NOT_RUN", artifactStatus: "COMPLETED", numbers: { requests: 99 } };
        return {};
      },
    });
    assert.equal(result.execution_outcome, "NOT_RUN");
    assert.equal(result.publishable, undefined);
    const marker = JSON.parse(fs.readFileSync(path.join(resultDirectory, "COMPLETED"), "utf8"));
    assert.equal(marker.execution_outcome, "NOT_RUN");
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("Issue 89 CLI exposes mandatory matrix and fail-closed dossier seams", async () => {
  const original = process.argv;
  const originalWrite = process.stdout.write;
  const writes = [];
  process.stdout.write = (value) => { writes.push(value); return true; };
  try {
    process.argv = [process.execPath, "cli.js", "baseline-matrix", "--run-id-prefix", "issue89"];
    const { main } = require("../../k4/cli");
    await main();
    const matrixOutput = JSON.parse(writes.pop());
    assert.equal(matrixOutput.matrix.length, 6);
    process.argv = [process.execPath, "cli.js", "bottleneck-dossier", "--candidates-json", "[]"];
    await main();
    const dossierOutput = JSON.parse(writes.pop());
    assert.equal(dossierOutput.optimizationGate, "CLOSED");
  } finally {
    process.argv = original;
    process.stdout.write = originalWrite;
  }
});

test("Issue 89 evidence chain links matrix validation, report claims, and fail-closed interpretation", async () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89-chain" });
  const chain = await executeBaselineEvidenceChain({
    matrix,
    runCell: async (cell) => measuredCell(cell),
    candidates: [{
      id: "message-persistence",
      cellId: "message:single-replica",
      claimType: "latency",
      claimEligibility: { eligible: true },
      evidence: { digest: "sha256:message", source: "message.raw.json", measurementWindow: { start: "2026-08-16T00:00:00Z", end: "2026-08-16T00:00:01Z" }, provenance: { commit: "commit-1" } },
      proposedTreatment: { name: "inspect-persistence-path" },
    }],
    selectedCandidateId: "message-persistence",
  });
  assert.equal(chain.matrix.valid, true);
  assert.equal(chain.report.baselineMatrix.length, 6);
  assert.equal(chain.dossier.primaryBottleneckCandidate.id, "message-persistence");
  assert.equal(chain.dossier.proposedTreatments.length, 1);
});

test("Issue 89 execute-baseline drives every matrix cell through the production seam", async () => {
  const { executeBaseline } = require("../../k4/cli");
  const calls = [];
  const phase = (start, end, output = {}) => ({ started: true, startedAt: start, completed: true, completedAt: end, output });
  const result = await executeBaseline({
    runIdPrefix: "issue89-exec",
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
    executeProduction: async ({ plan }) => {
      calls.push({ runId: plan.runId, profile: plan.profile, scenario: plan.workload.scenario, digest: plan.workload.digest });
      return {
        artifact_status: "COMPLETED",
        execution_outcome: "MEASURED",
        qualification_flags: [],
        provenance: { commit: "commit-1", hardware: { cpu: "cpu-1" }, runnerPlacement: "k4-runner", nonTopologyConfiguration: { env: "same" } },
        phases: {
          "setup/seed": phase("2026-08-16T00:00:00Z", "2026-08-16T00:00:01Z"),
          "warm-up": phase("2026-08-16T00:00:01Z", "2026-08-16T00:00:02Z"),
          measurement: phase("2026-08-16T00:00:02Z", "2026-08-16T00:00:03Z", { measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" }, numbers: { requests: 1 } }),
          teardown: phase("2026-08-16T00:00:03Z", "2026-08-16T00:00:04Z"),
        },
        artifacts: { sourceInventorySha256: "sha256:source", bundleInventorySha256: "sha256:bundle" },
        marker: { artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [], source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle" },
        bundle: { entries: [{ path: "source-inventory.json" }, { path: "report.json" }] },
        sourceInventory: { entries: [{ path: "manifest.json" }, { path: "measurement.raw.json" }] },
      };
    },
  });
  assert.equal(calls.length, 6);
  assert.deepEqual(new Set(calls.map((call) => call.scenario)), new Set(["sidebar", "message", "socket-concurrency"]));
  assert.equal(result.matrix.cells.length, 6);
  assert.equal(result.dossier.optimizationGate, "CLOSED");
});

test("Issue 89 accepts a retained runner artifact chain only when marker and inventories are linked", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-chain-artifacts-"));
  try {
    const cell = createBaselineMatrix({ runIdPrefix: "issue89-artifact" })[0];
    const result = await executeRun({
      runId: cell.attemptId,
      resultDirectory,
      profile: cell.topology,
      topology: { profile: cell.topology, backendUpstreamMembership: cell.topology === "single-replica" ? ["backend-1"] : ["backend-1", "backend-2", "backend-3"] },
      runner: { workloadTarget: "http://nginx", placement: "k4-runner" },
      workload: { ...cell.workload, digest: cell.profile.digest },
    }, {
      artifactMetadata: { commitSha: "0123456789abcdef0123456789abcdef01234567", hardware: { hostname: "host", cpuModel: "cpu", logicalProcessors: 4, memoryBytes: 1024 } },
      executePhase: async (phase) => {
        if (phase === "setup/seed") return { resourcesCreated: true, setupPreflight: { dataset: { identity: "dataset-1", fingerprint: "sha256:dataset", size: { totalDocuments: 10 } } } };
        if (phase === "measurement") return { measurementWindow: { start: "2026-08-16T00:00:00Z", end: "2026-08-16T00:00:01Z" }, numbers: { requests: 1 } };
        return {};
      },
    });
    const read = (name) => JSON.parse(fs.readFileSync(path.join(resultDirectory, name), "utf8"));
    const validation = validateBaselineCell({
      ...cell,
      ...result,
      dataset: { identity: "dataset-1", fingerprint: "sha256:dataset", size: { totalDocuments: 10 } },
      artifacts: result.artifacts,
      manifest: read("manifest.json"),
      marker: read("COMPLETED"),
      bundle: read("bundle-inventory.json"),
      sourceInventory: read("source-inventory.json"),
    });
    assert.equal(validation.valid, true, validation.diagnostics.join("; "));
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});
