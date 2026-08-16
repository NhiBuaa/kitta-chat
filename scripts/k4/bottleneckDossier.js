const crypto = require("node:crypto");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function candidateEligibility(candidate, claimMatrix) {
  const supplied = candidate?.claimEligibility || candidate?.eligibility || {};
  const reasons = supplied.reasons || candidate?.eligibilityReasons || [];
  if (Array.isArray(claimMatrix)) {
    if (!candidate?.cellId || !candidate?.claimType) return { eligible: false, reasons: [...reasons, "candidate must link to a TC-89-02 claim matrix entry"] };
    const linked = claimMatrix.find((entry) => entry.cellId === candidate.cellId && entry.name === candidate.claimType);
    if (!linked || linked.eligible !== true) return { eligible: false, reasons: [...reasons, ...(linked?.reasons || ["linked TC-89-02 claim is not eligible"])] };
    return { eligible: true, reasons: [] };
  }
  if (supplied.eligible === true || supplied.bottleneck?.eligible === true || supplied.primaryBottleneck?.eligible === true || candidate?.claimEligible === true) return { eligible: true, reasons: [] };
  return { eligible: false, reasons: reasons.length ? reasons : ["candidate claim eligibility is not proven"] };
}

function candidateEvidence(candidate) {
  const evidence = candidate?.evidence;
  if (!evidence || typeof evidence !== "object" || !evidence.digest) return { complete: false, reasons: ["candidate evidence digest is missing"] };
  if (evidence.complete === false || evidence.status === "INCOMPLETE") return { complete: false, reasons: ["candidate evidence is incomplete"] };
  if (!evidence.source && !evidence.sourcePath && !evidence.rawArtifacts && !evidence.rawResultArtifacts && !evidence.artifacts && !evidence.raw) return { complete: false, reasons: ["candidate raw evidence source is missing"] };
  if (!evidence.measurementWindow && !evidence.window && !(evidence.measurementStart && evidence.measurementEnd)) return { complete: false, reasons: ["candidate measurement window is missing"] };
  if (!evidence.provenance && !evidence.manifest && !evidence.commit && !evidence.commitSha && !evidence.source_inventory_sha256 && !evidence.sourceInventorySha256) return { complete: false, reasons: ["candidate provenance is missing"] };
  return { complete: true, reasons: [] };
}

function buildBottleneckDossier({ candidates = [], selectedCandidateId, humanGate = "pending", baselineMatrix, claimMatrix, historyScope } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (historyScope && historyScope.status !== "SCOPED") {
    return {
      schema: "k4-bottleneck-dossier-v1",
      status: "BLOCKED",
      candidateGate: { status: "BLOCKED", eligibleCandidateCount: 0, diagnostics: ["Issue 89 history scope is not resolved"] },
      primaryBottleneckCandidate: null,
      proposedTreatment: null,
      proposedTreatments: [],
      assumptions: [],
      alternativeExplanations: [],
      optimizationGate: "CLOSED",
      humanGate: "NOT_OPENED",
      historyScope,
    };
  }
  const evaluated = list.map((candidate) => {
    const eligibility = candidateEligibility(candidate, claimMatrix);
    const evidence = candidateEvidence(candidate);
    return { candidate, eligibility, evidence };
  });
  const eligible = evaluated.filter(({ eligibility, evidence }) => eligibility.eligible && evidence.complete);
  if (!eligible.length) {
    const hasKnownViolation = evaluated.some(({ eligibility }) => eligibility.reasons.some((reason) => /prohibited|unsupported|extrapolat|ineligible claim/i.test(reason)));
    return {
      schema: "k4-bottleneck-dossier-v1",
      status: hasKnownViolation ? "FAIL" : "BLOCKED",
      candidateGate: {
        status: hasKnownViolation ? "FAIL" : "BLOCKED",
        eligibleCandidateCount: 0,
        diagnostics: evaluated.flatMap(({ candidate, eligibility, evidence }) => [
          ...(eligibility.reasons || []).map((reason) => `${candidate?.id || "candidate"}: ${reason}`),
          ...(evidence.reasons || []).map((reason) => `${candidate?.id || "candidate"}: ${reason}`),
        ]),
      },
      primaryBottleneckCandidate: null,
      proposedTreatment: null,
      proposedTreatments: [],
      assumptions: [],
      alternativeExplanations: [],
      optimizationGate: "CLOSED",
      humanGate: "NOT_OPENED",
      ...(baselineMatrix ? { baselineMatrix } : {}),
      ...(claimMatrix ? { claimMatrix } : {}),
      ...(historyScope ? { historyScope } : {}),
    };
  }

  const selected = selectedCandidateId === undefined
    ? eligible[0]
    : eligible.find(({ candidate }) => candidate.id === selectedCandidateId);
  if (!selected) {
    return {
      schema: "k4-bottleneck-dossier-v1",
      status: "BLOCKED",
      candidateGate: { status: "BLOCKED", eligibleCandidateCount: eligible.length, diagnostics: ["selected primary candidate is not claim-eligible"] },
      primaryBottleneckCandidate: null,
      proposedTreatment: null,
      proposedTreatments: [],
      assumptions: [],
      alternativeExplanations: [],
      optimizationGate: "CLOSED",
      humanGate: "NOT_OPENED",
    };
  }

  const treatment = selected.candidate.proposedTreatment || selected.candidate.treatment;
  const treatments = treatment ? (Array.isArray(treatment) ? treatment : [treatment]) : [];
  if (treatments.length !== 1 || !treatments[0] || (!treatments[0].name && !treatments[0].description)) {
    return {
      schema: "k4-bottleneck-dossier-v1",
      status: "BLOCKED",
      candidateGate: { status: "BLOCKED", eligibleCandidateCount: eligible.length, diagnostics: ["exactly one proposed treatment is required for an eligible candidate"] },
      primaryBottleneckCandidate: selected.candidate,
      proposedTreatment: null,
      proposedTreatments: [],
      assumptions: selected.candidate.assumptions || [],
      alternativeExplanations: selected.candidate.alternativeExplanations || [],
      optimizationGate: "CLOSED",
      humanGate: "NOT_OPENED",
    };
  }

  return {
    schema: "k4-bottleneck-dossier-v1",
    status: "READY_FOR_HUMAN_GATE",
    candidateGate: { status: "PASS", eligibleCandidateCount: eligible.length, selectedCandidateId: selected.candidate.id, diagnostics: [] },
    primaryBottleneckCandidate: selected.candidate,
    proposedTreatment: treatments[0],
    proposedTreatments: treatments,
    assumptions: selected.candidate.assumptions || [],
    alternativeExplanations: selected.candidate.alternativeExplanations || [],
    optimizationGate: "OPEN_PENDING_HUMAN_APPROVAL",
    humanGate,
    comparison: {
      experimentType: "optimization",
      status: "NOT_RUN",
      wording: "post-treatment/optimization-comparison rerun",
      result: null,
    },
    ...(baselineMatrix ? { baselineMatrix } : {}),
    ...(claimMatrix ? { claimMatrix } : {}),
    ...(historyScope ? { historyScope } : {}),
    dossierDigest: digest({ candidate: selected.candidate, treatment: treatments[0] }),
  };
}

function scopeIssue89History({ mergeBase, head, commits = [], artifacts = [], issue89CommitShas = [], issue89ArtifactPaths = [], changeSet } = {}) {
  const resolvedCommits = commits.length ? commits : (changeSet?.commits || []);
  const resolvedArtifacts = artifacts.length ? artifacts : (changeSet?.artifacts || []);
  const commitSet = new Set(issue89CommitShas);
  const artifactSet = new Set(issue89ArtifactPaths);
  const issue89Commits = resolvedCommits.filter((commit) => commitSet.has(commit?.sha) || commit?.issue89 === true || commit?.introducedByIssue89 === true || commit?.inIssue89ChangeSet === true || commit?.scope === "issue-89");
  const issue89Artifacts = resolvedArtifacts.filter((artifact) => artifactSet.has(artifact?.path) || artifact?.issue89 === true || artifact?.generatedByIssue89 === true || artifact?.inIssue89ChangeSet === true || artifact?.scope === "issue-89");
  return {
    status: mergeBase && head ? "SCOPED" : "INVALID",
    mergeBase: mergeBase || null,
    head: head || null,
    commits: issue89Commits,
    artifacts: issue89Artifacts,
    excludedCommitShas: resolvedCommits.filter((commit) => !issue89Commits.includes(commit)).map((commit) => commit?.sha).filter(Boolean),
    excludedArtifactPaths: resolvedArtifacts.filter((artifact) => !issue89Artifacts.includes(artifact)).map((artifact) => artifact?.path).filter(Boolean),
  };
}

module.exports = {
  buildBottleneckDossier,
  candidateEligibility,
  candidateEvidence,
  digest,
  scopeIssue89History,
};
