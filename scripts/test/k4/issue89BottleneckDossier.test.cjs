const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildBottleneckDossier,
  candidateEvidence,
  scopeIssue89History,
} = require("../../k4/bottleneckDossier");
const { executeRun } = require("../../k4/runner");

function eligibleCandidate(overrides = {}) {
  return {
    id: "sidebar-upstream-latency",
    claimEligibility: { eligible: true, reasons: [] },
    cellId: "sidebar:single-replica",
    claimType: "latency",
    evidence: { digest: "sha256:evidence", source: "sidebar.raw.json", measurementWindow: { start: "2026-08-16T00:00:00Z", end: "2026-08-16T00:00:01Z" }, provenance: { commit: "commit-1" }, verification: { status: "VERIFIED" }, source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle", rawArtifactDigests: [{ path: "sidebar.raw.json", sha256: "sha256:raw" }] },
    proposedTreatment: { name: "review-sidebar-query-plan", rationale: "inspect the measured query path" },
    assumptions: ["measurement window is representative"],
    alternativeExplanations: ["runner ingress variance"],
    ...overrides,
  };
}

function gateEvidence() {
  return {
    baselineMatrix: [{ cellId: "sidebar:single-replica", valid: true, provenance: { source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle" } }],
    claimMatrix: [{ cellId: "sidebar:single-replica", name: "latency", eligible: true, verified: true, source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle", rawArtifactDigests: [{ path: "sidebar.raw.json", sha256: "sha256:raw" }] }],
    historyScope: { status: "SCOPED", mergeBase: "base-89", head: "head-89", commits: [{ sha: "new", issue89: true }], artifacts: [{ path: ".k4-results/issue89/report.json", issue89: true }], lineage: { status: "VERIFIED", mergeBase: "base-89", head: "head-89", commits: [{ sha: "new" }], changedPaths: ["scripts/k4/baselineEvidence.js"] } },
  };
}

test("Issue 89 dossier blocks a partial baseline before selecting a treatment", () => {
  const dossier = buildBottleneckDossier({
    candidates: [eligibleCandidate(), eligibleCandidate({ id: "other", evidence: { digest: "sha256:other" } })],
    selectedCandidateId: "sidebar-upstream-latency",
    humanGate: "pending",
    ...gateEvidence(),
  });
  assert.equal(dossier.status, "BLOCKED");
  assert.equal(dossier.primaryBottleneckCandidate, null);
  assert.equal(dossier.proposedTreatments.length, 0);
  assert.equal(dossier.optimizationGate, "CLOSED");
});

test("Issue 89 dossier fails closed when no candidate is claim-eligible", () => {
  const dossier = buildBottleneckDossier({
    candidates: [eligibleCandidate({ claimEligibility: { eligible: false, reasons: ["OBSERVATION_INCOMPLETE"] }, proposedTreatment: undefined })],
  });
  assert.equal(dossier.status, "BLOCKED");
  assert.equal(dossier.primaryBottleneckCandidate, null);
  assert.equal(dossier.proposedTreatments.length, 0);
  assert.equal(dossier.optimizationGate, "CLOSED");
});

test("Issue 89 history scope excludes pre-issue optimization history", () => {
  const scoped = scopeIssue89History({
    mergeBase: "base-89",
    head: "head-89",
    commits: [
      { sha: "old", issue89: false, message: "historical optimization" },
      { sha: "new", issue89: true, message: "baseline dossier" },
    ],
    artifacts: [
      { path: ".k4-results/issue89/report.json", issue89: true },
      { path: ".k4-results/old/report.json", issue89: false },
    ],
    lineage: { status: "VERIFIED", mergeBase: "base-89", head: "head-89", commits: [{ sha: "old" }, { sha: "new" }], changedPaths: ["scripts/k4/bottleneckDossier.js"] },
  });
  assert.deepEqual(scoped.commits.map((commit) => commit.sha), ["new"]);
  assert.deepEqual(scoped.artifacts.map((artifact) => artifact.path), [".k4-results/issue89/report.json"]);
  assert.deepEqual(scoped.excludedCommitShas, ["old"]);
});

test("Issue 89 dossier fails closed without verified claim matrix, scoped lineage, and candidate linkage", () => {
  const candidate = eligibleCandidate();
  const missing = buildBottleneckDossier({ candidates: [candidate] });
  assert.equal(missing.status, "BLOCKED");
  assert.match(missing.candidateGate.diagnostics.join(" "), /claim matrix|history|scope/i);
  const unlinked = buildBottleneckDossier({ candidates: [candidate], ...gateEvidence(), claimMatrix: [{ cellId: "other", name: "latency", eligible: true, verified: true }] });
  assert.equal(unlinked.status, "BLOCKED");
  assert.match(unlinked.candidateGate.diagnostics.join(" "), /linked|source|digest/i);
});

test("Issue 89 candidate evidence rejects a partial retained raw-artifact set", () => {
  const candidate = eligibleCandidate({ evidence: { ...eligibleCandidate().evidence, runId: "run-1", provenance: { runId: "run-1", source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle", rawArtifactDigests: [{ path: "raw-a.json", sha256: "sha256:a" }] }, rawArtifactDigests: [{ path: "raw-a.json", sha256: "sha256:a" }] } });
  const result = candidateEvidence(candidate, {
    cell: { attemptId: "run-1", provenance: { runId: "run-1", source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle", rawArtifactDigests: [{ path: "raw-a.json", sha256: "sha256:a" }, { path: "raw-b.json", sha256: "sha256:b" }] } },
    claim: { verified: true, eligible: true },
  });
  assert.equal(result.complete, false);
  assert.match(result.reasons.join(" "), /raw artifact/i);
});

test("Issue 89 candidate evidence accepts canonical artifact-boundary digests", () => {
  const candidate = eligibleCandidate({
    evidence: {
      ...eligibleCandidate().evidence,
      runId: "run-artifact-boundary",
      provenance: {
        runId: "run-artifact-boundary",
        source_inventory_sha256: "sha256:source-boundary",
        bundle_inventory_sha256: "sha256:bundle-boundary",
        rawArtifactDigests: [{ path: "raw-boundary.json", sha256: "sha256:raw-boundary" }],
      },
    },
  });
  const result = candidateEvidence(candidate, {
    cell: {
      attemptId: "run-artifact-boundary",
      artifacts: {
        source_inventory_sha256: "sha256:source-boundary",
        bundle_inventory_sha256: "sha256:bundle-boundary",
      },
    },
    claim: {
      verified: true,
      eligible: true,
      rawArtifactDigests: [{ path: "raw-boundary.json", sha256: "sha256:raw-boundary" }],
    },
  });
  assert.deepEqual(result, { complete: true, reasons: [] });
});

test("Issue 89 candidate evidence accepts canonical PUBLISHABLE retained runs and rejects invalid status", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-dossier-"));
  const runId = "issue89-canonical-publishable";
  try {
    const run = await executeRun({ runId, resultDirectory }, {
      artifactMetadata: {
        commitSha: "0123456789abcdef0123456789abcdef01234567",
        hardware: { hostname: "host", cpuModel: "cpu", logicalProcessors: 2, memoryBytes: 1024 },
      },
      executePhase: async (phase) => phase === "setup/seed"
        ? { resourcesCreated: true }
        : phase === "measurement"
          ? { numbers: { p95: 42 }, measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" } }
          : {},
    });
    const verification = run.artifacts.verification;
    assert.equal(verification.status, "PUBLISHABLE");
    const rawArtifactDigests = verification.source.entries.map((entry) => ({ path: entry.path, sha256: entry.sha256 }));
    const provenance = {
      runId,
      source_inventory_sha256: verification.source.sourceInventorySha256,
      bundle_inventory_sha256: verification.bundle.digest,
      rawArtifactDigests,
    };
    const candidate = eligibleCandidate({
      evidence: {
        digest: "sha256:canonical-evidence",
        source: "canonical-retained-run",
        measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" },
        provenance,
        verification: { status: verification.status },
      },
    });
    const linkage = { cell: { attemptId: runId, provenance }, claim: { verified: true, eligible: true } };
    assert.deepEqual(candidateEvidence(candidate, linkage), { complete: true, reasons: [] });
    const invalidStatus = candidateEvidence({ ...candidate, evidence: { ...candidate.evidence, verification: { status: "INVALID" } } }, linkage);
    assert.equal(invalidStatus.complete, false);
    assert.match(invalidStatus.reasons.join(" "), /verification/i);
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});
