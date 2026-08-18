const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildSourceInventory,
  verifySourceInventory,
  deriveReport,
  finalizeRun,
  validateRunArtifacts,
} = require("../../k4/provenance");
const { validateExperimentComparison } = require("../../k4/experimentValidator");
const { createResultDirectory } = require("../../k4/lifecycle");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue85-"));
  fs.writeFileSync(path.join(directory, "manifest.json"), Buffer.from('{"commitSha":"abc"}\r\n', "utf8"));
  fs.writeFileSync(path.join(directory, "raw.bin"), Buffer.from([0, 1, 255, 10]));
  return directory;
}

function digest(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

test("source inventory hashes exact persisted bytes and detects byte mutation", () => {
  const directory = fixture();
  try {
    const built = buildSourceInventory({
      resultDirectory: directory,
      runId: "issue85-source",
      sourceArtifacts: ["manifest.json", { path: "raw.bin", type: "raw-result" }],
    });
    assert.match(built.sourceInventorySha256, /^sha256:[a-f0-9]{64}$/);
    const verified = verifySourceInventory({ resultDirectory: directory, expectedDigest: built.sourceInventorySha256 });
    assert.equal(verified.status, "VERIFIED");
    assert.equal(verified.entries[1].byteSize, 4);
    fs.appendFileSync(path.join(directory, "raw.bin"), Buffer.from([2]));
    assert.throws(() => verifySourceInventory({ resultDirectory: directory, expectedDigest: built.sourceInventorySha256 }), /digest|byte|integrity/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("source inventory whole-file boundary does not require schema, while alternate boundary is blocked without authority", () => {
  const directory = fixture();
  try {
    const built = buildSourceInventory({ resultDirectory: directory, runId: "issue85-boundary", sourceArtifacts: ["manifest.json"] });
    assert.equal(verifySourceInventory({ resultDirectory: directory, expectedDigest: built.sourceInventorySha256 }).boundary, "whole-file-bytes");
    const inventoryPath = path.join(directory, "source-inventory.json");
    const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
    inventory.representation = "canonical-json";
    fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory)}\n`);
    assert.throws(() => verifySourceInventory({ resultDirectory: directory }), /BLOCKED|authority|schema/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("report derivation locks source digest and report-level claim guardrails", () => {
  const directory = fixture();
  try {
    const inventory = buildSourceInventory({ resultDirectory: directory, runId: "issue85-report", sourceArtifacts: ["manifest.json", "raw.bin"] });
    const report = deriveReport({
      resultDirectory: directory,
      sourceInventorySha256: inventory.sourceInventorySha256,
      report: {
        runId: "issue85-report",
        artifact_status: "COMPLETED",
        execution_outcome: "MEASURED",
        qualification_flags: [],
        profile: "single-replica",
        measuredScope: { workload: "sidebar:v2", topology: "single-replica" },
        hardwareLimits: { cpu: "1", memory: "512MiB" },
        profileArtifact: "manifest.json",
        rawResultArtifacts: ["raw.bin"],
        claims: [{ name: "high-performance", scope: { workload: "sidebar:v2", topology: "single-replica" } }],
      },
    });
    assert.equal(report.source_inventory_sha256, inventory.sourceInventorySha256);
    assert.equal(report.claimEligibility["high-performance"].eligible, true);
    assert.equal(report.claims[0].eligible, true);
    assert.throws(() => deriveReport({
      resultDirectory: directory,
      sourceInventorySha256: inventory.sourceInventorySha256,
      report: { ...report, claims: [{ name: "production-ready", scope: { workload: "other:v1", topology: "multi-replica" } }] },
      reportPath: "report-tampered.json",
    }), /scope|claim|provenance/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("finalization creates non-self-hashing bundle and validates completion marker", () => {
  const directory = fixture();
  try {
    const inventory = buildSourceInventory({ resultDirectory: directory, runId: "issue85-final", sourceArtifacts: ["manifest.json", "raw.bin"] });
    const report = deriveReport({
      resultDirectory: directory,
      sourceInventorySha256: inventory.sourceInventorySha256,
      report: {
        runId: "issue85-final", artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [],
        profile: "single-replica", measuredScope: { workload: "sidebar:v2", topology: "single-replica" }, hardwareLimits: { cpu: "1" },
      },
    });
    const finalized = finalizeRun({ resultDirectory: directory, runId: "issue85-final", sourceInventorySha256: inventory.sourceInventorySha256, reportPath: report.reportPath });
    assert.match(finalized.bundleInventorySha256, /^sha256:[a-f0-9]{64}$/);
    const bundle = JSON.parse(fs.readFileSync(path.join(directory, "bundle-inventory.json"), "utf8"));
    assert.equal(bundle.entries.some((entry) => entry.path === "bundle-inventory.json"), false);
    assert.equal(bundle.entries.some((entry) => entry.path === "COMPLETED"), false);
    assert.equal(bundle.entries.every((entry) => Number.isInteger(entry.byteSize)), true);
    assert.equal(validateRunArtifacts({ resultDirectory: directory, expectedRunId: "issue85-final" }).status, "PUBLISHABLE");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bundle verification rejects omitted or non-canonical source-inventory members", () => {
  const directory = fixture();
  try {
    const inventory = buildSourceInventory({ resultDirectory: directory, runId: "issue89-bundle-completeness", sourceArtifacts: ["manifest.json", "raw.bin"] });
    const report = deriveReport({
      resultDirectory: directory,
      sourceInventorySha256: inventory.sourceInventorySha256,
      report: {
        runId: "issue89-bundle-completeness", artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [],
        profile: "single-replica", measuredScope: { workload: "sidebar:v2", topology: "single-replica" }, hardwareLimits: { cpu: "1" },
      },
    });
    const finalized = finalizeRun({ resultDirectory: directory, runId: "issue89-bundle-completeness", sourceInventorySha256: inventory.sourceInventorySha256, reportPath: report.reportPath });
    const bundlePath = path.join(directory, "bundle-inventory.json");
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    fs.writeFileSync(bundlePath, `${JSON.stringify({ ...bundle, entries: bundle.entries.filter((entry) => entry.path !== "raw.bin") })}\n`);
    assert.throws(() => validateRunArtifacts({ resultDirectory: directory, expectedRunId: finalized.marker.runId }), /source-inventory member/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("bundle verification rejects an extra undeclared member", () => {
  const directory = fixture();
  try {
    const inventory = buildSourceInventory({ resultDirectory: directory, runId: "issue89-bundle-extra", sourceArtifacts: ["manifest.json", "raw.bin"] });
    const report = deriveReport({
      resultDirectory: directory,
      sourceInventorySha256: inventory.sourceInventorySha256,
      report: {
        runId: "issue89-bundle-extra", artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [],
        profile: "single-replica", measuredScope: { workload: "sidebar:v2", topology: "single-replica" }, hardwareLimits: { cpu: "1" },
      },
    });
    const finalized = finalizeRun({ resultDirectory: directory, runId: "issue89-bundle-extra", sourceInventorySha256: inventory.sourceInventorySha256, reportPath: report.reportPath });
    const bundlePath = path.join(directory, "bundle-inventory.json");
    const markerPath = path.join(directory, "COMPLETED");
    fs.writeFileSync(path.join(directory, "undeclared.bin"), Buffer.from("not-declared", "utf8"));
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
    const extraBytes = fs.readFileSync(path.join(directory, "undeclared.bin"));
    const tamperedBundle = {
      ...bundle,
      entries: [...bundle.entries, { path: "undeclared.bin", type: "raw-result", byteSize: extraBytes.byteLength, sha256: digest(extraBytes) }],
    };
    fs.writeFileSync(bundlePath, `${JSON.stringify(tamperedBundle)}\n`);
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    marker.bundle_inventory_sha256 = digest(fs.readFileSync(bundlePath));
    fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
    assert.throws(() => validateRunArtifacts({ resultDirectory: directory, expectedRunId: finalized.marker.runId }), /bundle member is undeclared/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("finalizeRun retains NOT_RUN and FAILED_SETUP without inventing report.json", () => {
  for (const executionOutcome of ["NOT_RUN", "FAILED_SETUP"]) {
    const directory = fixture();
    try {
      const inventory = buildSourceInventory({ resultDirectory: directory, runId: `issue89-${executionOutcome.toLowerCase()}`, sourceArtifacts: ["manifest.json", "raw.bin"] });
      const finalized = finalizeRun({
        resultDirectory: directory,
        runId: `issue89-${executionOutcome.toLowerCase()}`,
        sourceInventorySha256: inventory.sourceInventorySha256,
        artifactStatus: "INCOMPLETE",
        executionOutcome,
        qualificationFlags: [],
      });
      assert.equal(fs.existsSync(path.join(directory, "report.json")), false);
      assert.equal(finalized.marker.execution_outcome, executionOutcome);
      assert.equal(validateRunArtifacts({ resultDirectory: directory, expectedRunId: finalized.marker.runId, requireReport: false, allowIncomplete: true }).status, "INCOMPLETE");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("report derivation rejects foreign run IDs and non-exact source digest sets before writing", () => {
  const directory = fixture();
  try {
    const inventory = buildSourceInventory({ resultDirectory: directory, runId: "issue89-locked", sourceArtifacts: ["manifest.json", "raw.bin"] });
    assert.throws(() => deriveReport({ resultDirectory: directory, sourceInventorySha256: inventory.sourceInventorySha256, reportPath: "foreign.json", report: { runId: "foreign-run" } }), /run ID/i);
    assert.equal(fs.existsSync(path.join(directory, "foreign.json")), false);
    assert.throws(() => deriveReport({ resultDirectory: directory, sourceInventorySha256: inventory.sourceInventorySha256, reportPath: "forged.json", report: { runId: "issue89-locked", sourceDigests: [{ path: "manifest.json", sha256: "sha256:fake" }] } }), /source digest/i);
    assert.equal(fs.existsSync(path.join(directory, "forged.json")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("runner-produced artifacts use canonical byteSize and exact verification binds every run identity", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-artifacts-"));
  try {
    const { executeRun } = require("../../k4/runner");
    await executeRun({ runId: "issue89-exact", resultDirectory: directory, phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"] }, {
      artifactMetadata: { commitSha: "0123456789abcdef0123456789abcdef01234567", hardware: { hostname: "host", cpuModel: "cpu", logicalProcessors: 2, memoryBytes: 1024 } },
      executePhase: async (phase) => phase === "setup/seed"
        ? { resourcesCreated: true }
        : phase === "measurement"
          ? { numbers: { p95: 42 }, measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" } }
          : {},
    });
    const source = JSON.parse(fs.readFileSync(path.join(directory, "source-inventory.json"), "utf8"));
    const bundle = JSON.parse(fs.readFileSync(path.join(directory, "bundle-inventory.json"), "utf8"));
    assert.equal(source.entries.every((entry) => Number.isInteger(entry.byteSize)), true);
    assert.equal(bundle.entries.every((entry) => Number.isInteger(entry.byteSize)), true);
    assert.equal(validateRunArtifacts({ resultDirectory: directory, expectedRunId: "issue89-exact", requireReport: false }).status, "PUBLISHABLE");
    assert.throws(() => validateRunArtifacts({ resultDirectory: directory, expectedRunId: "other-run", requireReport: false }), /run ID/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("requireReport false cannot verify a measured artifact without a report", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-no-report-"));
  try {
    await require("../../k4/runner").executeRun({ runId: "issue89-no-report", resultDirectory: directory }, {
      executePhase: async (phase) => phase === "setup/seed" ? { resourcesCreated: true } : phase === "measurement" ? { numbers: { p95: 1 } } : {},
    });
    fs.rmSync(path.join(directory, "report.json"));
    assert.equal(validateRunArtifacts({ resultDirectory: directory, expectedRunId: "issue89-no-report", requireReport: false }).status, "INCOMPLETE");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("missing completion marker remains incomplete and run ID collision is rejected", () => {
  const directory = fixture();
  try {
    assert.equal(validateRunArtifacts({ resultDirectory: directory }).status, "INCOMPLETE");
    assert.throws(() => createResultDirectory({ resultDirectory: directory, runId: "issue85-collision" }), /exists|collision|reuse/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("optimization and topology comparison contracts allow only their declared difference", () => {
  const common = { profile: "single-replica", workload: "sidebar:v2", dataset: "k4-demo", topology: "single-replica", hardware: "cpu-1", runnerPlacement: "k4-runner", nonTreatmentConfiguration: "default", replicaCount: 1, backendReplicaCount: 1, upstreamMembership: ["backend-1"], backendUpstreamMembership: ["backend-1"], bundle_inventory_sha256: "sha256:bundle" };
  const optimization = validateExperimentComparison({
    experimentType: "optimization",
    baseline: { ...common, commit: "a", source_inventory_sha256: "sha256:baseline" },
    candidate: { ...common, commit: "b", source_inventory_sha256: "sha256:candidate" },
    bottleneckEvidence: { digest: "sha256:bottleneck", source_inventory_sha256: "sha256:baseline" },
    treatment: { name: "index-tuning", digest: "sha256:treatment", approval: { status: "APPROVED", treatmentName: "index-tuning", treatmentDigest: "sha256:treatment", gateId: "gate-89" } },
  });
  assert.equal(optimization.status, "ACCEPTED");
  const invalidTopology = validateExperimentComparison({
    experimentType: "topology",
    baseline: { ...common, commit: "a", source_inventory_sha256: "sha256:baseline" },
    candidate: { ...common, commit: "a", topology: "multi-replica", workload: "message:v2", source_inventory_sha256: "sha256:candidate" },
  });
  assert.equal(invalidTopology.status, "REJECTED");
  assert.deepEqual(invalidTopology.differences, ["workload"]);

  const invalidOptimizationTopology = validateExperimentComparison({
    experimentType: "optimization",
    baseline: { ...common, commit: "a", backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"], source_inventory_sha256: "sha256:baseline" },
    candidate: { ...common, commit: "b", backendReplicaCount: 2, backendUpstreamMembership: ["backend-1", "backend-2"], source_inventory_sha256: "sha256:candidate" },
    bottleneckEvidence: { digest: "sha256:bottleneck", source_inventory_sha256: "sha256:baseline" },
    treatment: { name: "index-tuning", digest: "sha256:treatment", approval: { status: "APPROVED", treatmentName: "index-tuning", treatmentDigest: "sha256:treatment", gateId: "gate-89" } },
  });
  assert.equal(invalidOptimizationTopology.status, "REJECTED");
  assert.match(invalidOptimizationTopology.diagnostics.join(" "), /replica|upstream|topology/i);
});

test("comparison validators reject null, blank, and empty required equivalence metadata", () => {
  const malformed = { profile: null, workload: "", dataset: {}, topology: "single-replica", hardware: null, runnerPlacement: [], nonTreatmentConfiguration: {}, replicaCount: 1, backendReplicaCount: 1, upstreamMembership: ["backend-1"], backendUpstreamMembership: ["backend-1"], commit: "a", source_inventory_sha256: "sha256:baseline", bundle_inventory_sha256: "sha256:bundle" };
  const candidate = { ...malformed, profile: "single-replica", workload: "sidebar:v2", dataset: "k4-demo", topology: "multi-replica", hardware: "cpu-1", runnerPlacement: "k4-runner", nonTreatmentConfiguration: "default", backendReplicaCount: 3, replicaCount: 3, upstreamMembership: ["backend-1", "backend-2", "backend-3"], backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"], source_inventory_sha256: "sha256:candidate" };
  const result = validateExperimentComparison({ experimentType: "topology", baseline: malformed, candidate });
  assert.equal(result.status, "REJECTED");
  assert.match(result.diagnostics.join(" "), /mandatory comparison field is missing/);
});

test("optimization comparison requires baseline-linked bottleneck evidence and an approved treatment identity", () => {
  const common = { profile: "single-replica", workload: "sidebar:v2", dataset: "k4-demo", topology: "single-replica", hardware: "cpu-1", runnerPlacement: "k4-runner", nonTreatmentConfiguration: "default", replicaCount: 1, backendReplicaCount: 1, upstreamMembership: ["backend-1"], backendUpstreamMembership: ["backend-1"], bundle_inventory_sha256: "sha256:bundle" };
  const baseline = { ...common, commit: "a", source_inventory_sha256: "sha256:baseline" };
  const candidate = { ...common, commit: "b", source_inventory_sha256: "sha256:candidate" };
  const treatment = { name: "index-tuning", digest: "sha256:treatment", approval: { status: "APPROVED", treatmentName: "index-tuning", treatmentDigest: "sha256:treatment", gateId: "gate-89" } };

  const unlinked = validateExperimentComparison({ experimentType: "optimization", baseline, candidate, bottleneckEvidence: { digest: "sha256:bottleneck" }, treatment });
  assert.equal(unlinked.status, "REJECTED");
  assert.match(unlinked.diagnostics.join(" "), /linked|baseline/i);

  const unapproved = validateExperimentComparison({ experimentType: "optimization", baseline, candidate, bottleneckEvidence: { digest: "sha256:bottleneck", source_inventory_sha256: "sha256:baseline" }, treatment: { name: "arbitrary", digest: "sha256:arbitrary" } });
  assert.equal(unapproved.status, "REJECTED");
  assert.match(unapproved.diagnostics.join(" "), /approved|gate/i);

  const contradictoryApproval = validateExperimentComparison({ experimentType: "optimization", baseline, candidate, bottleneckEvidence: { digest: "sha256:bottleneck", source_inventory_sha256: "sha256:baseline" }, treatment: { ...treatment, name: "other" } });
  assert.equal(contradictoryApproval.status, "REJECTED");
  assert.match(contradictoryApproval.diagnostics.join(" "), /identity|approved/i);
});

test("comparison validators reject omitted mandatory equivalence fields", () => {
  const minimal = { source_inventory_sha256: "sha256:a", bundle_inventory_sha256: "sha256:b", commit: "a" };
  const optimization = validateExperimentComparison({ experimentType: "optimization", baseline: minimal, candidate: { ...minimal, commit: "b" }, bottleneckEvidence: { digest: "sha256:bn" }, treatment: { name: "index", digest: "sha256:t" } });
  assert.equal(optimization.status, "REJECTED");
  assert.match(optimization.diagnostics.join(" "), /mandatory|missing/i);
  const topology = validateExperimentComparison({ experimentType: "topology", baseline: minimal, candidate: { ...minimal, topology: "multi-replica" } });
  assert.equal(topology.status, "REJECTED");
  assert.match(topology.diagnostics.join(" "), /mandatory|missing/i);
});
