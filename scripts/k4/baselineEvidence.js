const crypto = require("node:crypto");
const { approvedWorkloadProfile } = require("./workloadProfiles");

const BASELINE_DOMAINS = Object.freeze([
  Object.freeze({ domain: "sidebar", label: "Sidebar latency", scenario: "sidebar", profileName: "sidebar:2" }),
  Object.freeze({ domain: "message", label: "Message persistence and recipient delivery", scenario: "message", profileName: "message:2" }),
  Object.freeze({ domain: "socket-concurrency", label: "Socket.IO concurrency", scenario: "socket-concurrency", profileName: "socket-concurrency:2" }),
]);
const BASELINE_TOPOLOGIES = Object.freeze(["single-replica", "multi-replica"]);
const BASELINE_MATRIX = Object.freeze(BASELINE_DOMAINS.flatMap((domain) => BASELINE_TOPOLOGIES.map((topology) => Object.freeze({
  cellId: `${domain.domain}:${topology}`,
  domain: domain.domain,
  label: domain.label,
  scenario: domain.scenario,
  profileName: domain.profileName,
  topology,
  required: true,
}))));
const PHASES = Object.freeze(["setup/seed", "warm-up", "measurement", "teardown"]);
const OUTCOMES = Object.freeze(["MEASURED", "FAILED_SETUP", "NOT_RUN"]);
const QUALIFICATION_FLAGS = Object.freeze([
  "TARGET_NOT_REACHED",
  "TOPOLOGY_NOT_EXERCISED",
  "OBSERVATION_INCOMPLETE",
  "LOAD_GENERATOR_LIMITED",
]);
const TOPOLOGY_FIELDS = Object.freeze([
  { label: "commit", paths: ["commit", "commitSha", "commit_sha", "provenance.commit", "provenance.commitSha"] },
  { label: "hardware", paths: ["hardware", "hardwareLimits", "testMachine", "provenance.hardware", "provenance.hardwareLimits"] },
  { label: "runner placement", paths: ["runnerPlacement", "testRunnerPlacement", "provenance.runnerPlacement", "configuration.runnerPlacement", "configuration.runner"] },
  { label: "non-topology runtime configuration", paths: ["nonTopologyConfiguration", "nonTreatmentConfiguration", "runtimeConfiguration", "configuration", "provenance.nonTopologyConfiguration"] },
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    if (Buffer.isBuffer(value)) return value.toString("base64");
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(stable(value)));
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function valueAt(value, paths) {
  for (const path of paths) {
    const result = path.split(".").reduce((current, key) => current?.[key], value);
    if (result !== undefined && result !== null) return result;
  }
  return undefined;
}

function profileEvidence(domain, profileResolver = approvedWorkloadProfile) {
  const resolved = profileResolver(domain.scenario, 2);
  const representation = resolved.representation || (resolved.bytes && Buffer.from(resolved.bytes).toString("utf8"));
  const profileDigest = resolved.digest && String(resolved.digest).startsWith("sha256:") ? resolved.digest : `sha256:${resolved.digest || digest(representation).slice(7)}`;
  return {
    name: domain.profileName,
    scenario: domain.scenario,
    version: 2,
    digest: profileDigest,
    bytes: representation,
    representation,
    snapshot: resolved.snapshot,
  };
}

function createBaselineMatrix({ runIdPrefix = "k4-issue89", profileResolver = approvedWorkloadProfile, dataset, provenance = {}, attemptFactory } = {}) {
  const prefix = String(runIdPrefix || "k4-issue89");
  return BASELINE_MATRIX.map((cell, index) => {
    const profile = profileEvidence(cell, profileResolver);
    const attemptId = attemptFactory ? attemptFactory(cell, index) : `${prefix}-${cell.domain}-${cell.topology}`;
    return {
      ...cell,
      attemptId: String(attemptId),
      profile,
      profileDigest: profile.digest,
      workload: {
        scenario: cell.scenario,
        version: profile.version,
        identity: cell.profileName,
        digest: profile.digest,
        snapshot: profile.snapshot,
      },
      workloadIdentity: cell.profileName,
      workloadDigest: profile.digest,
      topologyEvidence: expectedTopologyEvidence(cell.topology),
      ...(dataset ? { dataset: stable(dataset) } : {}),
      ...(Object.keys(provenance).length ? { provenance: stable(provenance) } : {}),
    };
  });
}

function canonicalOutcome(record) {
  const value = record?.outcome || record?.execution_outcome || record?.executionOutcome;
  if (OUTCOMES.includes(value)) return value;
  if (record?.failure?.phase === "setup/seed" || record?.failure?.phase === "warm-up") return "FAILED_SETUP";
  if (record?.phases?.measurement?.completed === true) return "MEASURED";
  return "NOT_RUN";
}

function normalizeBaselineRecord(input = {}) {
  const manifest = input.manifest || input.runManifest || {};
  const marker = input.marker || input.completionMarker || {};
  const topologyEvidence = input.topologyEvidence || input.topologyDetails || manifest.topology;
  const workload = input.workload || manifest.workload;
  const dataset = input.dataset || manifest.dataset;
  return {
    ...input,
    cellId: input.cellId || input.cell?.cellId,
    attemptId: input.attemptId || input.attempt_id || manifest.runId || marker.runId,
    topology: input.topology || topologyEvidence?.profile || manifest.plan?.profile,
    topologyEvidence,
    profile: input.profile || {
      name: input.profileName || workload?.identity || workload?.scenario && `${workload.scenario}:${workload.version}`,
      scenario: workload?.scenario,
      version: workload?.version,
      digest: input.profileDigest || workload?.digest,
      bytes: input.profileBytes || workload?.representation,
    },
    workload,
    dataset: dataset ? { ...dataset, digest: dataset.digest || dataset.fingerprint } : dataset,
    provenance: input.provenance || {
      commit: manifest.commitSha,
      hardware: manifest.testMachine,
      runnerPlacement: manifest.configuration?.runnerPlacement || manifest.configuration?.runner?.placement || manifest.configuration?.runner || manifest.plan?.runner,
      nonTopologyConfiguration: manifest.configuration || manifest.plan,
    },
    artifact_status: input.artifact_status ?? input.artifactStatus ?? marker.artifact_status ?? manifest.artifact_status,
    execution_outcome: input.execution_outcome ?? input.executionOutcome ?? marker.execution_outcome ?? manifest.execution_outcome,
    qualification_flags: input.qualification_flags ?? input.qualificationFlags ?? marker.qualification_flags ?? manifest.qualification_flags,
  };
}

function phaseComplete(phase) {
  return phase?.started === true && phase?.completed === true;
}

function phaseTimingComplete(phase) {
  const startedAt = phase?.startedAt || phase?.started_at || phase?.start;
  const completedAt = phase?.completedAt || phase?.completed_at || phase?.endedAt || phase?.end;
  return Boolean(startedAt && completedAt);
}

function reasonFrom(record) {
  return record?.reason || record?.failure?.reason || record?.failure?.error || record?.error || record?.limitation?.reason;
}

function hasMeasurementClaim(record) {
  const output = record?.phases?.measurement?.output;
  return Boolean(record?.measurement || record?.measurementEvidence || record?.measurementWindow || record?.publishable
    || output?.numbers !== undefined || output?.measurementWindow || output?.measurementStart || output?.measurementEnd);
}

function validateArtifactBoundary(record) {
  const diagnostics = [];
  const artifacts = record?.artifacts || record?.artifactEvidence || {};
  const marker = record?.marker || record?.completionMarker || artifacts.marker;
  const bundle = record?.bundle || record?.bundleInventory || artifacts.bundle;
  const source = record?.sourceInventory || record?.source_inventory || artifacts.sourceInventory;
  const sourceDigest = record?.source_inventory_sha256 || record?.sourceInventorySha256 || artifacts.sourceInventorySha256;
  const bundleDigest = record?.bundle_inventory_sha256 || record?.bundleInventorySha256 || artifacts.bundleInventorySha256;
  if (!sourceDigest) diagnostics.push("source inventory digest is missing");
  if (!bundleDigest) diagnostics.push("bundle inventory digest is missing");
  if (!marker || typeof marker !== "object") diagnostics.push("completion marker evidence is missing");
  else {
    for (const field of ["artifact_status", "execution_outcome", "qualification_flags", "source_inventory_sha256", "bundle_inventory_sha256"]) if (marker[field] === undefined) diagnostics.push(`completion marker field is missing: ${field}`);
    if (marker.source_inventory_sha256 !== sourceDigest) diagnostics.push("completion marker source inventory digest is not linked");
    if (marker.bundle_inventory_sha256 !== bundleDigest) diagnostics.push("completion marker bundle inventory digest is not linked");
    const artifactAxis = record?.artifact_status ?? record?.artifactStatus;
    const executionAxis = record?.execution_outcome ?? record?.executionOutcome;
    const flags = record?.qualification_flags ?? record?.qualificationFlags;
    if (artifactAxis !== undefined && marker.artifact_status !== artifactAxis) diagnostics.push("completion marker artifact status does not match the retained run");
    if (executionAxis !== undefined && marker.execution_outcome !== executionAxis) diagnostics.push("completion marker execution outcome does not match the retained run");
    if (Array.isArray(flags) && JSON.stringify([...new Set(flags)].sort()) !== JSON.stringify([...new Set(marker.qualification_flags || [])].sort())) diagnostics.push("completion marker qualification flags do not match the retained run");
  }
  if (!bundle || !Array.isArray(bundle.entries)) diagnostics.push("bundle inventory evidence is missing");
  else {
    if (bundle.entries.some((entry) => ["bundle-inventory.json", "COMPLETED"].includes(entry.path))) diagnostics.push("bundle inventory must exclude itself and the non-inventoried completion marker");
    if (bundle.source_inventory_sha256 !== undefined && bundle.source_inventory_sha256 !== sourceDigest) diagnostics.push("bundle inventory source digest is not linked");
  }
  if (!source || !Array.isArray(source.entries)) diagnostics.push("source inventory evidence is missing");
  else if (source.entries.some((entry) => ["source-inventory.json", "bundle-inventory.json", "COMPLETED"].includes(entry.path))) diagnostics.push("source inventory must exclude inventories and the completion marker");
  return { valid: diagnostics.length === 0, diagnostics };
}

function validateBaselineCell(record) {
  record = normalizeBaselineRecord(record);
  const diagnostics = [];
  const outcome = canonicalOutcome(record);
  if (!record?.cellId) diagnostics.push("cell identity is required");
  if (!record?.attemptId) diagnostics.push("attempt identity is required");
  if (!record?.topology || !BASELINE_TOPOLOGIES.includes(record.topology)) diagnostics.push("approved topology is required");
  if (!record?.profile?.digest) diagnostics.push("resolved profile digest is required");
  if (!record?.workload?.digest) diagnostics.push("workload identity/digest is required");
  if (!record?.dataset?.identity && !record?.dataset?.fingerprint) diagnostics.push("dataset identity is required");
  if (!record?.dataset?.size || typeof record.dataset.size !== "object") diagnostics.push("dataset size is required");
  if (!record?.dataset?.digest && !record?.dataset?.fingerprint) diagnostics.push("dataset digest is required");

  const artifactAxis = record?.artifact_status ?? record?.artifactStatus;
  const executionAxis = record?.execution_outcome ?? record?.executionOutcome;
  const flags = record?.qualification_flags ?? record?.qualificationFlags;
  if (artifactAxis === undefined) diagnostics.push("artifact_status axis is required");
  if (executionAxis === undefined) diagnostics.push("execution_outcome axis is required");
  if (!Array.isArray(flags)) diagnostics.push("qualification_flags axis is required");
  else for (const flag of flags) if (!QUALIFICATION_FLAGS.includes(flag)) diagnostics.push(`unknown qualification flag: ${flag}`);
  if (outcome !== "NOT_RUN") for (const field of TOPOLOGY_FIELDS) if (topologyValue(record, field) === undefined) diagnostics.push(`${field.label} provenance is required`);

  if (!OUTCOMES.includes(outcome)) diagnostics.push("outcome must be MEASURED, FAILED_SETUP, or NOT_RUN");
  if (outcome === "MEASURED") {
    if (artifactAxis !== undefined && artifactAxis !== "COMPLETED") diagnostics.push("MEASURED run artifact status is not COMPLETED");
    if (executionAxis !== undefined && executionAxis !== "MEASURED") diagnostics.push("MEASURED run execution outcome is not MEASURED");
    for (const phase of PHASES) {
      if (!phaseComplete(record.phases?.[phase])) diagnostics.push(`MEASURED run is missing completed ${phase}`);
      else if (!phaseTimingComplete(record.phases?.[phase])) diagnostics.push(`MEASURED run is missing timestamps for ${phase}`);
    }
    const measurementOutput = record.phases?.measurement?.output || {};
    const window = record.measurementWindow || record.phases?.measurement?.measurementWindow || record.measurement?.window || measurementOutput.measurementWindow || measurementOutput.observation?.measurementWindow
      || (measurementOutput.measurementStart && measurementOutput.measurementEnd ? { start: measurementOutput.measurementStart, end: measurementOutput.measurementEnd } : undefined);
    if (!window?.start || !window?.end) diagnostics.push("MEASURED run requires a measurement window");
    if (!record.measurement && !record.phases?.measurement?.output && !record.measurementEvidence) diagnostics.push("MEASURED run requires measurement evidence");
    diagnostics.push(...validateArtifactBoundary(record).diagnostics);
  }
  if (outcome === "FAILED_SETUP") {
    if (executionAxis !== undefined && executionAxis !== "FAILED_SETUP") diagnostics.push("FAILED_SETUP execution outcome axis is inconsistent");
    if (artifactAxis !== undefined && artifactAxis !== "INCOMPLETE") diagnostics.push("FAILED_SETUP artifact status must be INCOMPLETE");
    const phase = record.failure?.phase || record.failurePhase;
    if (!phase || !["setup/seed", "warm-up"].includes(phase)) diagnostics.push("FAILED_SETUP requires the actual setup or warm-up failure point");
    if (!reasonFrom(record)) diagnostics.push("FAILED_SETUP requires a concrete reason");
    const cleanup = record.cleanup || record.teardown;
    if (!cleanup || cleanup.attempted !== true || typeof cleanup.completed !== "boolean") diagnostics.push("FAILED_SETUP requires retained cleanup evidence");
    if (hasMeasurementClaim(record)) diagnostics.push("FAILED_SETUP cannot contain a measurement claim");
    diagnostics.push(...validateArtifactBoundary(record).diagnostics);
  }
  if (outcome === "NOT_RUN") {
    if (executionAxis !== undefined && executionAxis !== "NOT_RUN") diagnostics.push("NOT_RUN execution outcome axis is inconsistent");
    if (!reasonFrom(record)) diagnostics.push("NOT_RUN requires a concrete unavailable reason");
    const measurementPhase = record.phases?.measurement;
    if (measurementPhase?.started === true || measurementPhase?.completed === true) diagnostics.push("NOT_RUN cannot reach the measurement phase");
    if (hasMeasurementClaim(record)) diagnostics.push("NOT_RUN cannot contain a measurement claim");
  }
  return { valid: diagnostics.length === 0, outcome, diagnostics };
}

function topologyValue(record, field) {
  const value = valueAt(record, field.paths);
  if (field.label !== "non-topology runtime configuration" || !value || typeof value !== "object") return value;
  const topologyKeys = new Set(["topology", "profile", "replicaCount", "backendReplicaCount", "backend_replica_count", "upstreamMembership", "backendUpstreamMembership", "backend_upstream_membership", "projectName", "runId", "resultDirectory", "K4_RUN_ID", "K4_PROJECT_NAME"]);
  const stripTopology = (current) => {
    if (Array.isArray(current)) return current.map(stripTopology);
    if (!current || typeof current !== "object") return current;
    return Object.fromEntries(Object.entries(current).filter(([key]) => !topologyKeys.has(key)).map(([key, child]) => [key, stripTopology(child)]));
  };
  return stripTopology(value);
}

function profilePairDiagnostics(left, right) {
  const diagnostics = [];
  if (left.profile?.digest !== right.profile?.digest) diagnostics.push("topology pair profile digest differs");
  if (left.profile?.bytes !== undefined && right.profile?.bytes !== undefined && left.profile.bytes !== right.profile.bytes) diagnostics.push("topology pair profile bytes differ");
  if (JSON.stringify(stable(left.workload)) !== JSON.stringify(stable(right.workload))) diagnostics.push("topology pair workload identity differs");
  const leftDataset = left.dataset || {};
  const rightDataset = right.dataset || {};
  const leftDatasetIdentity = leftDataset.identity || leftDataset.fingerprint;
  const rightDatasetIdentity = rightDataset.identity || rightDataset.fingerprint;
  if (leftDatasetIdentity !== rightDatasetIdentity) diagnostics.push("topology pair dataset identity differs");
  if (JSON.stringify(stable(leftDataset.size)) !== JSON.stringify(stable(rightDataset.size))) diagnostics.push("topology pair dataset size differs");
  if (leftDataset.digest !== rightDataset.digest) diagnostics.push("topology pair dataset digest differs");
  for (const field of TOPOLOGY_FIELDS) {
    if (JSON.stringify(stable(topologyValue(left, field))) !== JSON.stringify(stable(topologyValue(right, field)))) diagnostics.push(`topology pair ${field.label} differs`);
  }
  return diagnostics;
}

function expectedTopologyEvidence(topology) {
  return topology === "single-replica" ? { replicaCount: 1, upstreamMembership: ["backend-1"] } : { replicaCount: 3, upstreamMembership: ["backend-1", "backend-2", "backend-3"] };
}

function validateBaselineMatrix(records, { expectedMatrix = createBaselineMatrix() } = {}) {
  const list = Array.isArray(records) ? records : records?.cells;
  const diagnostics = [];
  if (!Array.isArray(list)) return { valid: false, status: "INVALID", diagnostics: ["baseline matrix records are required"], cells: [] };
  const byId = new Map();
  for (const record of list) {
    const normalized = normalizeBaselineRecord(record);
    if (!normalized?.cellId) diagnostics.push("record without cell identity");
    else if (byId.has(normalized.cellId)) diagnostics.push(`duplicate baseline cell: ${normalized.cellId}`);
    else byId.set(normalized.cellId, normalized);
  }
  const cells = expectedMatrix.map((expected) => {
    const record = byId.get(expected.cellId);
    if (!record) {
      diagnostics.push(`missing mandatory baseline cell: ${expected.cellId}`);
      return { ...expected, valid: false, outcome: "NOT_RUN", diagnostics: ["mandatory cell has no retained attempt"] };
    }
    if (record.topology !== expected.topology || record.domain !== expected.domain || record.scenario !== expected.scenario) diagnostics.push(`baseline cell identity mismatch: ${expected.cellId}`);
    if (record.profile?.name && record.profile.name !== expected.profile?.name) diagnostics.push(`${expected.cellId}: profile name does not match the approved scenario:version`);
    if (record.profile?.scenario && record.profile.scenario !== expected.scenario) diagnostics.push(`${expected.cellId}: profile scenario does not match the baseline domain`);
    if (record.profile?.version !== undefined && record.profile.version !== 2) diagnostics.push(`${expected.cellId}: profile version is not the approved v2 profile`);
    if (expected.profile?.digest && record.profile?.digest !== expected.profile.digest) diagnostics.push(`${expected.cellId}: profile digest does not match the approved profile bytes`);
    if (record.workload?.digest && record.profile?.digest && record.workload.digest !== record.profile.digest) diagnostics.push(`${expected.cellId}: workload digest does not match resolved profile digest`);
    const validation = validateBaselineCell(record);
    diagnostics.push(...validation.diagnostics.map((reason) => `${expected.cellId}: ${reason}`));
    const topology = record.topologyEvidence || record.topologyDetails;
    const expectedTopology = expectedTopologyEvidence(expected.topology);
    if (topology?.replicaCount !== undefined && topology.replicaCount !== expectedTopology.replicaCount) diagnostics.push(`${expected.cellId}: topology replica count does not match ${expected.topology}`);
    if (topology?.upstreamMembership && JSON.stringify(topology.upstreamMembership) !== JSON.stringify(expectedTopology.upstreamMembership)) diagnostics.push(`${expected.cellId}: topology upstream membership does not match ${expected.topology}`);
    return { ...record, ...validation, expectedTopology };
  });
  for (const record of list) if (!expectedMatrix.some((expected) => expected.cellId === record?.cellId)) diagnostics.push(`unexpected baseline cell: ${record?.cellId || "unknown"}`);
  for (const domain of BASELINE_DOMAINS) {
    const left = byId.get(`${domain.domain}:single-replica`);
    const right = byId.get(`${domain.domain}:multi-replica`);
    if (left && right) diagnostics.push(...profilePairDiagnostics(left, right).map((reason) => `${domain.domain}: ${reason}`));
  }
  const valid = diagnostics.length === 0;
  return {
    valid,
    status: valid ? "VALID" : "INVALID",
    diagnostics,
    cells,
    pairs: BASELINE_DOMAINS.map((domain) => ({
      domain: domain.domain,
      singleReplica: byId.get(`${domain.domain}:single-replica`) || null,
      multiReplica: byId.get(`${domain.domain}:multi-replica`) || null,
      equivalent: Boolean(byId.get(`${domain.domain}:single-replica`) && byId.get(`${domain.domain}:multi-replica`) && profilePairDiagnostics(byId.get(`${domain.domain}:single-replica`), byId.get(`${domain.domain}:multi-replica`)).length === 0),
    })),
  };
}

function claimEligibilityForCell(record, claim = "latency") {
  const outcome = canonicalOutcome(record);
  const flags = new Set(record?.qualification_flags || record?.qualificationFlags || []);
  const reasons = [];
  const lifecycle = validateBaselineCell(record);
  if (!lifecycle.valid) reasons.push(...lifecycle.diagnostics);
  if (outcome !== "MEASURED") reasons.push(`execution outcome is ${outcome}`);
  if (record?.artifact_status && record.artifact_status !== "COMPLETED") reasons.push("artifact status is not COMPLETED");
  if (["topology", "multiReplica", "crossReplica"].includes(claim) && flags.has("TOPOLOGY_NOT_EXERCISED")) reasons.push("TOPOLOGY_NOT_EXERCISED");
  if (["target", "targetConcurrency", "latency", "scalable", "high-performance", "production-ready"].includes(claim) && flags.has("TARGET_NOT_REACHED")) reasons.push("TARGET_NOT_REACHED");
  if (["resource", "cpu", "memory", "bottleneck", "bottleneckSutCeiling"].includes(claim) && flags.has("OBSERVATION_INCOMPLETE")) reasons.push("OBSERVATION_INCOMPLETE");
  if (["bottleneck", "bottleneckSutCeiling"].includes(claim) && flags.has("LOAD_GENERATOR_LIMITED")) reasons.push("LOAD_GENERATOR_LIMITED");
  const supplied = record?.claimEligibility?.[claim] || record?.claim_eligibility?.[claim];
  if (supplied && supplied.eligible === false) reasons.push(...(supplied.reasons || ["claim validator rejected claim"]));
  return { eligible: reasons.length === 0, reasons };
}

function buildBaselineReport({ matrix, interpretationInputs = [], claimsByCell = {} } = {}) {
  const validation = validateBaselineMatrix(matrix);
  const cells = validation.cells.map((cell) => {
    const claims = claimsByCell[cell.cellId] || (cell.domain === "sidebar"
      ? ["latency", "multiReplica", "resource", "bottleneck"]
      : cell.domain === "message"
        ? ["latency", "endToEndDelivery", "crossReplica", "multiReplica", "resource", "bottleneck"]
        : ["targetConcurrency", "multiReplica", "resource", "bottleneck"]);
    const claimEligibility = Object.fromEntries(claims.map((claim) => [claim, claimEligibilityForCell(cell, claim)]));
    const outcome = canonicalOutcome(cell);
    return {
      cellId: cell.cellId,
      attemptId: cell.attemptId,
      domain: cell.domain,
      topology: cell.topology,
      profileDigest: cell.profile?.digest,
      workloadDigest: cell.workload?.digest,
      dataset: cell.dataset || null,
      outcome,
      artifact_status: cell.artifact_status,
      execution_outcome: cell.execution_outcome || cell.executionOutcome || outcome,
      qualification_flags: [...new Set(cell.qualification_flags || cell.qualificationFlags || [])],
      limitation: outcome === "MEASURED" ? null : { reason: reasonFrom(cell), failure: cell.failure || null, cleanup: cell.cleanup || cell.teardown || null },
      claimEligibility,
      ...(cell.measurement ? { measurement: cell.measurement } : {}),
    };
  });
  const claims = cells.flatMap((cell) => Object.entries(cell.claimEligibility).map(([name, eligibility]) => ({ cellId: cell.cellId, name, ...eligibility })));
  return {
    schema: "k4-baseline-report-v1",
    status: validation.valid ? "VALID" : "INVALID",
    valid: validation.valid,
    baselineMatrix: cells,
    topologyPairs: validation.pairs,
    claims,
    interpretationInputs,
    diagnostics: validation.diagnostics,
  };
}

function validatePrerequisiteFreshness({ guideRevision, evaluationRunId, evaluationStatus, implementationIdentity, sourcePaths, sourceDigests, contract, current, regression } = {}) {
  const reasons = [];
  if (!guideRevision) reasons.push("prerequisite guide revision is not pinned");
  if (!evaluationRunId) reasons.push("prerequisite Evaluation run identity is not pinned");
  if (evaluationStatus !== "PASSED") reasons.push("prerequisite Evaluation is not PASSED");
  if (!implementationIdentity) reasons.push("prerequisite implementation identity is not pinned");
  if (!Array.isArray(sourcePaths) || !sourcePaths.length) reasons.push("prerequisite relevant source paths are not pinned");
  if (!sourceDigests || typeof sourceDigests !== "object") reasons.push("prerequisite source digests are not pinned");
  if (!contract?.name || !contract?.digest) reasons.push("claim-eligibility/report-validator contract identity is not pinned");
  if (!current?.headCommit) reasons.push("Issue 89 HEAD identity is required");
  const changedPaths = Array.isArray(current?.changedPaths) ? current.changedPaths : [];
  const relevantPaths = new Set([...(sourcePaths || []), ...(contract.paths || [])]);
  const relevantChangedPaths = changedPaths.filter((path) => relevantPaths.has(path));
  const currentDigests = current?.sourceDigests || {};
  const missingCurrentPaths = (sourcePaths || []).filter((sourcePath) => currentDigests?.[sourcePath] === undefined);
  const changedDigestPaths = (sourcePaths || []).filter((sourcePath) => currentDigests?.[sourcePath] !== undefined && sourceDigests?.[sourcePath] !== currentDigests?.[sourcePath]);
  for (const sourcePath of missingCurrentPaths) reasons.push(`current relevant implementation path digest is missing: ${sourcePath}`);
  for (const sourcePath of changedDigestPaths) reasons.push(`relevant implementation path changed: ${sourcePath}`);
  const contractMissing = !current?.contract?.name || !current?.contract?.digest;
  const contractChanged = !contractMissing && (contract?.digest !== current.contract.digest || contract?.name !== current.contract.name);
  if (contractMissing) reasons.push("current claim-eligibility/report-validator contract identity is missing");
  else if (contractChanged) reasons.push("claim-eligibility/report-validator contract changed");
  const changed = relevantChangedPaths.length > 0 || changedDigestPaths.length > 0 || contractChanged;
  if (changed) {
    if (regression?.status !== "PASSED") reasons.push("relevant regression must pass before prerequisite evidence can be reused");
    else {
      reasons.splice(0, reasons.length, ...reasons.filter((reason) => !/^relevant implementation path changed:/.test(reason) && reason !== "claim-eligibility/report-validator contract changed"));
      reasons.push("relevant regression was rerun after lineage change");
    }
  }
  const blockingReasons = reasons.filter((reason) => !reason.startsWith("relevant regression was rerun"));
  const reusable = blockingReasons.length === 0;
  return {
    status: reusable ? (changed ? "FRESH_WITH_REGRESSION" : "FRESH") : "STALE",
    fresh: reusable,
    reusable,
    reasons,
    changed,
    relevantChangedPaths,
    pinned: { guideRevision, evaluationRunId, evaluationStatus, implementationIdentity, sourcePaths, sourceDigests, contract },
    current: current || null,
  };
}

function validatePrerequisiteEvidenceSet({ prerequisites = [], current, regressionByEvaluation = {} } = {}) {
  const checks = prerequisites.map((prerequisite) => validatePrerequisiteFreshness({
    ...prerequisite,
    current: prerequisite.current || current,
    regression: prerequisite.regression || regressionByEvaluation[prerequisite.evaluationRunId],
  }));
  const reusable = checks.length > 0 && checks.every((check) => check.reusable);
  return {
    status: reusable ? "FRESH" : "STALE",
    reusable,
    checks,
    diagnostics: checks.flatMap((check) => check.reusable ? [] : check.reasons),
  };
}

async function runBaselineMatrix({ runCell, matrix = createBaselineMatrix(), onCell } = {}) {
  if (typeof runCell !== "function") throw new Error("runCell seam is required");
  const cells = [];
  for (const cell of matrix) {
    const attempt = { ...cell, attemptId: cell.attemptId || `${cell.cellId}-attempt-1` };
    let result;
    try {
      result = await runCell(attempt);
    } catch (error) {
      result = {
        ...attempt,
        outcome: "FAILED_SETUP",
        artifact_status: "INCOMPLETE",
        execution_outcome: "FAILED_SETUP",
        failure: { phase: "setup/seed", reason: error.message },
        cleanup: { attempted: false, completed: false, reason: "cleanup hook was not provided after executor failure" },
      };
    }
    if (!result) result = { ...attempt, outcome: "NOT_RUN", artifact_status: "INCOMPLETE", execution_outcome: "NOT_RUN", reason: "baseline executor returned no retained outcome" };
    const retained = { ...attempt, ...result, cellId: attempt.cellId, attemptId: result.attemptId || attempt.attemptId };
    cells.push(retained);
    if (onCell) await onCell(retained);
  }
  return { ...validateBaselineMatrix(cells, { expectedMatrix: matrix }), cells };
}

async function executeBaselineEvidenceChain({ runCell, matrix = createBaselineMatrix(), claimsByCell, candidates = [], selectedCandidateId, humanGate, historyScope, interpretationInputs = [] } = {}) {
  const matrixResult = await runBaselineMatrix({ runCell, matrix });
  const report = buildBaselineReport({ matrix: matrixResult.cells, claimsByCell, interpretationInputs });
  const { buildBottleneckDossier } = require("./bottleneckDossier");
  const dossier = buildBottleneckDossier({
    candidates: matrixResult.valid ? candidates : [],
    selectedCandidateId,
    humanGate,
    baselineMatrix: report.baselineMatrix,
    claimMatrix: report.claims,
    historyScope,
  });
  return {
    status: matrixResult.valid ? dossier.status : "BLOCKED",
    matrix: matrixResult,
    report,
    dossier,
  };
}

module.exports = {
  BASELINE_DOMAINS,
  BASELINE_MATRIX,
  BASELINE_TOPOLOGIES,
  OUTCOMES,
  PHASES,
  QUALIFICATION_FLAGS,
  buildBaselineReport,
  claimEligibilityForCell,
  createBaselineMatrix,
  digest,
  executeBaselineEvidenceChain,
  normalizeBaselineRecord,
  runBaselineMatrix,
  validateArtifactBoundary,
  validateBaselineCell,
  validateBaselineMatrix,
  validatePrerequisiteEvidenceSet,
  validatePrerequisiteFreshness,
};
