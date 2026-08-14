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
    assert.equal(validateRunArtifacts({ resultDirectory: directory, expectedRunId: "issue85-final" }).status, "PUBLISHABLE");
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
  const common = { profile: "single-replica", workload: "sidebar:v2", dataset: "k4-demo", topology: "single-replica", hardware: "cpu-1", runnerPlacement: "k4-runner", nonTreatmentConfiguration: "default", bundle_inventory_sha256: "sha256:bundle" };
  const optimization = validateExperimentComparison({
    experimentType: "optimization",
    baseline: { ...common, commit: "a", source_inventory_sha256: "sha256:baseline" },
    candidate: { ...common, commit: "b", source_inventory_sha256: "sha256:candidate" },
    bottleneckEvidence: { digest: "sha256:bottleneck" },
    treatment: { name: "index-tuning", digest: "sha256:treatment" },
  });
  assert.equal(optimization.status, "ACCEPTED");
  const invalidTopology = validateExperimentComparison({
    experimentType: "topology",
    baseline: { ...common, commit: "a", source_inventory_sha256: "sha256:baseline" },
    candidate: { ...common, commit: "a", topology: "multi-replica", workload: "message:v2", source_inventory_sha256: "sha256:candidate" },
  });
  assert.equal(invalidTopology.status, "REJECTED");
  assert.deepEqual(invalidTopology.differences, ["workload"]);
});
