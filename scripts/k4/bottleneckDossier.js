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

function digestValue(value, keys = []) {
  for (const key of keys) if (value?.[key]) return value[key];
  return undefined;
}

function rawDigestMap(value) {
  const entries = value?.rawArtifactDigests || value?.raw_artifact_digests || value?.rawArtifacts || [];
  return new Map((Array.isArray(entries) ? entries : []).map((entry) => [entry?.path || entry?.relativePath, entry?.sha256 || entry?.digest]).filter(([path, sha256]) => path && sha256));
}

function baselineValidationFor(input) {
  const supplied = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  const records = Array.isArray(input) ? input : (supplied?.cells || supplied?.baselineMatrix || []);
  const { validateBaselineMatrix } = require("./baselineEvidence");
  const validation = validateBaselineMatrix(records);
  if (supplied?.status !== undefined && supplied.status !== "VALID") validation.diagnostics.push("supplied baseline validation status is not VALID");
  if (supplied?.valid !== undefined && supplied.valid !== true) validation.diagnostics.push("supplied baseline validation is not valid");
  return { records, validation };
}

function gateInputDiagnostics({ baselineMatrix, baselineValidation, claimMatrix, historyScope } = {}) {
  const diagnostics = [];
  const baseline = baselineValidationFor(baselineValidation || baselineMatrix);
  if (!baseline.records.length) diagnostics.push("verified baseline matrix is required");
  if (baseline.records.length !== 6) diagnostics.push("complete six-cell baseline matrix is required");
  if (!baseline.validation.valid) diagnostics.push(...baseline.validation.diagnostics.map((reason) => `baseline matrix: ${reason}`));
  if (!Array.isArray(claimMatrix) || claimMatrix.length === 0) diagnostics.push("verified claim matrix is required");
  else if (!claimMatrix.some((claim) => claim?.verified === true)) diagnostics.push("claim matrix verification is missing");
  if (!historyScope || historyScope.status !== "SCOPED") diagnostics.push("scoped Issue 89 history is required");
  const lineage = historyScope?.lineage;
  if (historyScope?.status === "SCOPED") {
    if (lineage?.status !== "VERIFIED") diagnostics.push("Issue 89 history lineage is not independently verified");
    if (!historyScope.mergeBase || !historyScope.head || historyScope.mergeBase === historyScope.head) diagnostics.push("Issue 89 history merge-base/head range is invalid");
    if (!Array.isArray(historyScope.commits) || historyScope.commits.length === 0) diagnostics.push("Issue 89 history commit range is empty");
    if (!Array.isArray(historyScope.artifacts) || historyScope.artifacts.length === 0) diagnostics.push("Issue 89 history artifact range is empty");
    if (lineage && (lineage.mergeBase !== historyScope.mergeBase || lineage.head !== historyScope.head)) diagnostics.push("Issue 89 history lineage does not match the scoped range");
  }
  return diagnostics;
}

function candidateEvidence(candidate, { cell, claim } = {}) {
  const evidence = candidate?.evidence;
  if (!evidence || typeof evidence !== "object" || !evidence.digest) return { complete: false, reasons: ["candidate evidence digest is missing"] };
  if (evidence.complete === false || evidence.status === "INCOMPLETE") return { complete: false, reasons: ["candidate evidence is incomplete"] };
  if (!evidence.source && !evidence.sourcePath && !evidence.rawArtifacts && !evidence.rawResultArtifacts && !evidence.artifacts && !evidence.raw) return { complete: false, reasons: ["candidate raw evidence source is missing"] };
  if (!evidence.measurementWindow && !evidence.window && !(evidence.measurementStart && evidence.measurementEnd)) return { complete: false, reasons: ["candidate measurement window is missing"] };
  if (!evidence.provenance && !evidence.manifest && !evidence.commit && !evidence.commitSha && !evidence.source_inventory_sha256 && !evidence.sourceInventorySha256) return { complete: false, reasons: ["candidate provenance is missing"] };
  const evidenceProvenance = { ...evidence, ...(evidence.provenance || {}) };
  const verificationStatuses = [evidenceProvenance.verification?.status, evidence.verification?.status];
  if (!verificationStatuses.some((status) => ["VERIFIED", "PUBLISHABLE"].includes(status))) return { complete: false, reasons: ["candidate artifact verification is missing"] };
  const cellSource = digestValue(cell?.provenance, ["source_inventory_sha256", "sourceInventorySha256"])
    || digestValue(cell?.artifacts, ["source_inventory_sha256", "sourceInventorySha256"]);
  const cellBundle = digestValue(cell?.provenance, ["bundle_inventory_sha256", "bundleInventorySha256"])
    || digestValue(cell?.artifacts, ["bundle_inventory_sha256", "bundleInventorySha256"]);
  const evidenceSource = digestValue(evidenceProvenance, ["source_inventory_sha256", "sourceInventorySha256"]);
  const evidenceBundle = digestValue(evidenceProvenance, ["bundle_inventory_sha256", "bundleInventorySha256"]);
  const reasons = [];
  if (!cellSource || !cellBundle || !evidenceSource || evidenceSource !== cellSource) reasons.push("candidate source inventory digest is not linked to the retained baseline cell");
  if (!evidenceBundle || evidenceBundle !== cellBundle) reasons.push("candidate bundle inventory digest is not linked to the retained baseline cell");
  const expectedRaw = rawDigestMap(cell?.provenance).size > 0 ? rawDigestMap(cell?.provenance) : rawDigestMap(claim);
  const actualRaw = rawDigestMap(evidenceProvenance);
  if (expectedRaw.size === 0 || actualRaw.size === 0) reasons.push("candidate raw artifact digests are missing from the retained claim evidence");
  if (expectedRaw.size > 0 || actualRaw.size > 0) {
    if (expectedRaw.size !== actualRaw.size) reasons.push("candidate raw artifact digest set is incomplete or contains unexpected artifacts");
    for (const [path, sha256] of expectedRaw) if (actualRaw.get(path) !== sha256) reasons.push(`candidate raw artifact digest is not linked: ${path}`);
    for (const path of actualRaw.keys()) if (!expectedRaw.has(path)) reasons.push(`candidate raw artifact is unexpected: ${path}`);
  }
  const expectedRunId = cell?.attemptId || cell?.provenance?.runId || claim?.runId;
  const actualRunId = evidenceProvenance.runId || evidenceProvenance.attemptId;
  if (!expectedRunId || !actualRunId || String(expectedRunId) !== String(actualRunId)) reasons.push("candidate evidence run ID is not linked to the retained baseline cell");
  if (claim && claim.verified !== true) reasons.push("candidate is not linked to a verified claim-matrix entry");
  if (claim && claim.eligible !== true) reasons.push("candidate linked claim is not eligible");
  return { complete: reasons.length === 0, reasons };
}

function buildBottleneckDossier({ candidates = [], selectedCandidateId, humanGate = "pending", baselineMatrix, baselineValidation, claimMatrix, historyScope } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const baseline = baselineValidationFor(baselineValidation || baselineMatrix);
  const resolvedBaselineMatrix = Array.isArray(baselineMatrix)
    ? baselineMatrix
    : (baselineMatrix?.baselineMatrix || baselineMatrix?.cells || baseline.records);
  const gateDiagnostics = gateInputDiagnostics({ baselineMatrix: resolvedBaselineMatrix, baselineValidation: baselineValidation || baselineMatrix, claimMatrix, historyScope });
  if (gateDiagnostics.length) {
    return {
      schema: "k4-bottleneck-dossier-v1",
      status: "BLOCKED",
      candidateGate: { status: "BLOCKED", eligibleCandidateCount: 0, diagnostics: gateDiagnostics },
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
    const linkedCell = resolvedBaselineMatrix.find((cell) => cell?.cellId === candidate?.cellId);
    const linkedClaim = claimMatrix?.find((entry) => entry?.cellId === candidate?.cellId && entry?.name === candidate?.claimType);
    const evidence = candidateEvidence(candidate, { cell: linkedCell, claim: linkedClaim });
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
      ...(resolvedBaselineMatrix.length ? { baselineMatrix: resolvedBaselineMatrix } : {}),
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
    ...(resolvedBaselineMatrix.length ? { baselineMatrix: resolvedBaselineMatrix } : {}),
    ...(claimMatrix ? { claimMatrix } : {}),
    ...(historyScope ? { historyScope } : {}),
    dossierDigest: digest({ candidate: selected.candidate, treatment: treatments[0] }),
  };
}

function scopeIssue89History({ mergeBase, head, commits = [], artifacts = [], issue89CommitShas = [], issue89ArtifactPaths = [], changeSet, lineage } = {}) {
  const resolvedCommits = commits.length ? commits : (changeSet?.commits || []);
  const resolvedArtifacts = artifacts.length ? artifacts : (changeSet?.artifacts || []);
  lineage = lineage || changeSet?.lineage;
  const commitSet = new Set(issue89CommitShas);
  const artifactSet = new Set(issue89ArtifactPaths);
  const issue89Commits = resolvedCommits.filter((commit) => commitSet.has(commit?.sha) || commit?.issue89 === true || commit?.introducedByIssue89 === true || commit?.inIssue89ChangeSet === true || commit?.scope === "issue-89");
  const issue89Artifacts = resolvedArtifacts.filter((artifact) => artifactSet.has(artifact?.path) || artifact?.issue89 === true || artifact?.generatedByIssue89 === true || artifact?.inIssue89ChangeSet === true || artifact?.scope === "issue-89");
  const diagnostics = [];
  if (!mergeBase || !head || mergeBase === head) diagnostics.push("merge-base/head range is missing or empty");
  if (!lineage || lineage.status !== "VERIFIED") diagnostics.push("independently verified lineage is required");
  if (lineage && (lineage.mergeBase !== mergeBase || lineage.head !== head)) diagnostics.push("lineage does not match merge-base/head");
  if (lineage && (!Array.isArray(lineage.commits) || lineage.commits.length === 0)) diagnostics.push("lineage commit inventory is empty");
  if (lineage && (!Array.isArray(lineage.changedPaths) || lineage.changedPaths.length === 0)) diagnostics.push("lineage changed-path inventory is empty");
  if (!resolvedCommits.length || !resolvedArtifacts.length) diagnostics.push("commit and artifact inventories are required");
  if (!issue89Commits.length) diagnostics.push("Issue 89 commit scope is empty");
  if (!issue89Artifacts.length) diagnostics.push("Issue 89 artifact scope is empty");
  return {
    status: diagnostics.length ? "INVALID" : "SCOPED",
    mergeBase: mergeBase || null,
    head: head || null,
    commits: issue89Commits,
    artifacts: issue89Artifacts,
    excludedCommitShas: resolvedCommits.filter((commit) => !issue89Commits.includes(commit)).map((commit) => commit?.sha).filter(Boolean),
    excludedArtifactPaths: resolvedArtifacts.filter((artifact) => !issue89Artifacts.includes(artifact)).map((artifact) => artifact?.path).filter(Boolean),
    lineage: lineage || null,
    diagnostics,
  };
}

module.exports = {
  buildBottleneckDossier,
  candidateEligibility,
  candidateEvidence,
  digest,
  scopeIssue89History,
};
