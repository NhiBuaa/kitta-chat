const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildBottleneckDossier,
  scopeIssue89History,
} = require("../../k4/bottleneckDossier");

function eligibleCandidate(overrides = {}) {
  return {
    id: "sidebar-upstream-latency",
    claimEligibility: { eligible: true, reasons: [] },
    evidence: { digest: "sha256:evidence", source: "sidebar.raw.json", measurementWindow: { start: "2026-08-16T00:00:00Z", end: "2026-08-16T00:00:01Z" }, provenance: { commit: "commit-1" } },
    proposedTreatment: { name: "review-sidebar-query-plan", rationale: "inspect the measured query path" },
    assumptions: ["measurement window is representative"],
    alternativeExplanations: ["runner ingress variance"],
    ...overrides,
  };
}

test("Issue 89 dossier selects one eligible primary candidate and exactly one treatment", () => {
  const dossier = buildBottleneckDossier({
    candidates: [eligibleCandidate(), eligibleCandidate({ id: "other", evidence: { digest: "sha256:other" } })],
    selectedCandidateId: "sidebar-upstream-latency",
    humanGate: "pending",
  });
  assert.equal(dossier.status, "READY_FOR_HUMAN_GATE");
  assert.equal(dossier.primaryBottleneckCandidate.id, "sidebar-upstream-latency");
  assert.equal(dossier.proposedTreatments.length, 1);
  assert.equal(dossier.optimizationGate, "OPEN_PENDING_HUMAN_APPROVAL");
  assert.deepEqual(dossier.alternativeExplanations, ["runner ingress variance"]);
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
  });
  assert.deepEqual(scoped.commits.map((commit) => commit.sha), ["new"]);
  assert.deepEqual(scoped.artifacts.map((artifact) => artifact.path), [".k4-results/issue89/report.json"]);
  assert.deepEqual(scoped.excludedCommitShas, ["old"]);
});
