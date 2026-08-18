const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  REPORT_FILE,
  SOURCE_INVENTORY_FILE,
  digestBytes,
  deriveReport,
  validateReportClaims,
  verifySourceInventory,
} = require("./provenance");

const BUNDLE_INVENTORY_FILE = "bundle-inventory.json";
const COMPLETED_MARKER_FILE = "COMPLETED";
const COMPLETION_MARKER_FILE = COMPLETED_MARKER_FILE;
const INCOMPLETE_STATUS = "INCOMPLETE";
const COMPLETED_STATUS = "COMPLETED";
const EXECUTION_OUTCOMES = Object.freeze(["MEASURED", "NOT_RUN", "FAILED_SETUP"]);

function immutableJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function resolveInside(root, candidate) {
  const absolute = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) throw new Error("artifact must remain inside the result directory");
  return { absolute, relative };
}

function bundleEntries({ resultDirectory, sourceInventoryPath = SOURCE_INVENTORY_FILE, reportPath = REPORT_FILE, derivedArtifacts = [] }) {
  const root = path.resolve(resultDirectory || "");
  const inventoryLocation = resolveInside(root, sourceInventoryPath);
  let sourceMembers = [];
  if (fs.existsSync(inventoryLocation.absolute)) {
    try {
      const inventory = JSON.parse(fs.readFileSync(inventoryLocation.absolute, "utf8"));
      sourceMembers = (inventory.entries || []).map((entry) => ({ path: entry.path, type: entry.type || "source-artifact" }));
    } catch { sourceMembers = []; }
  }
  const candidates = [sourceInventoryPath, reportPath, ...sourceMembers, ...derivedArtifacts];
  const seen = new Set();
  return candidates.map((candidate) => {
    const location = resolveInside(root, typeof candidate === "string" ? candidate : candidate.path);
    if (seen.has(location.relative)) throw new Error(`duplicate bundle member: ${location.relative}`);
    seen.add(location.relative);
    if ([BUNDLE_INVENTORY_FILE, COMPLETED_MARKER_FILE].includes(location.relative)) throw new Error("bundle inventory and COMPLETED marker are non-inventoried");
    if (!fs.existsSync(location.absolute) || !fs.statSync(location.absolute).isFile()) throw new Error(`bundle member is missing: ${location.relative}`);
    const bytes = fs.readFileSync(location.absolute);
    return { path: location.relative, type: typeof candidate === "string" ? "derived-artifact" : (candidate.type || "derived-artifact"), byteSize: bytes.byteLength, sha256: digestBytes(bytes) };
  });
}

function assertStatusAxes({ artifactStatus, executionOutcome, qualificationFlags }) {
  if (![COMPLETED_STATUS, INCOMPLETE_STATUS].includes(artifactStatus)) throw new Error("artifact_status must be COMPLETED or INCOMPLETE");
  if (!EXECUTION_OUTCOMES.includes(executionOutcome)) throw new Error("execution_outcome must be MEASURED, NOT_RUN, or FAILED_SETUP");
  if (!Array.isArray(qualificationFlags)) throw new Error("qualification_flags must be an array");
}

function finalizeRun({ resultDirectory, runId, sourceInventoryPath = SOURCE_INVENTORY_FILE, sourceInventorySha256, reportPath = REPORT_FILE, derivedArtifacts = [], artifactStatus, executionOutcome, qualificationFlags, report, reportClaims }) {
  if (!runId) throw new Error("run ID is required for finalization");
  const root = path.resolve(resultDirectory || "");
  const source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedDigest: sourceInventorySha256, expectedRunId: runId });
  let resolvedReportPath = reportPath;
  let reportEvidence;
  const requestedIncomplete = artifactStatus === INCOMPLETE_STATUS || (executionOutcome && executionOutcome !== "MEASURED");
  if (report && !requestedIncomplete) {
    const derived = deriveReport({ resultDirectory: root, sourceInventoryPath, sourceInventorySha256: source.sourceInventorySha256, reportPath, report, claims: reportClaims });
    resolvedReportPath = derived.reportPath;
    reportEvidence = derived.report;
  }
  const finalArtifactStatus = artifactStatus || reportEvidence?.artifact_status || COMPLETED_STATUS;
  const finalExecutionOutcome = executionOutcome || reportEvidence?.execution_outcome || "MEASURED";
  const finalQualificationFlags = qualificationFlags || reportEvidence?.qualification_flags || [];
  assertStatusAxes({ artifactStatus: finalArtifactStatus, executionOutcome: finalExecutionOutcome, qualificationFlags: finalQualificationFlags });
  if ((finalArtifactStatus !== COMPLETED_STATUS || finalExecutionOutcome !== "MEASURED") && reportEvidence) throw new Error("incomplete finalization cannot include report.json");
  const includeReport = finalArtifactStatus === COMPLETED_STATUS && finalExecutionOutcome === "MEASURED";
  const entries = includeReport
    ? bundleEntries({ resultDirectory: root, sourceInventoryPath, reportPath: resolvedReportPath, derivedArtifacts })
    : [
      { path: sourceInventoryPath, type: "source-inventory", ...(() => { const bytes = fs.readFileSync(path.join(root, sourceInventoryPath)); return { byteSize: bytes.byteLength, sha256: digestBytes(bytes) }; })() },
      ...source.entries,
      ...derivedArtifacts.map((candidate) => {
        const location = resolveInside(root, typeof candidate === "string" ? candidate : candidate.path);
        const bytes = fs.readFileSync(location.absolute);
        return { path: location.relative, type: typeof candidate === "string" ? "derived-artifact" : (candidate.type || "derived-artifact"), byteSize: bytes.byteLength, sha256: digestBytes(bytes) };
      }),
    ];
  const bundle = {
    schema: "k4-bundle-inventory-v1",
    runId: String(runId),
    source_inventory_sha256: source.sourceInventorySha256,
    entries,
  };
  const bundlePath = path.join(root, BUNDLE_INVENTORY_FILE);
  immutableJson(bundlePath, bundle);
  const bundleInventorySha256 = digestBytes(fs.readFileSync(bundlePath));
  const marker = {
    schema: "k4-completion-marker-v1",
    runId: String(runId),
    artifact_status: finalArtifactStatus,
    execution_outcome: finalExecutionOutcome,
    qualification_flags: [...new Set(finalQualificationFlags)],
    source_inventory_sha256: source.sourceInventorySha256,
    bundle_inventory_sha256: bundleInventorySha256,
  };
  const markerPath = path.join(root, COMPLETED_MARKER_FILE);
  immutableJson(markerPath, marker);
  return { status: COMPLETED_STATUS, bundle, bundlePath, bundleInventorySha256, sourceInventorySha256: source.sourceInventorySha256, marker, markerPath };
}

function verifyBundle({ resultDirectory, marker, expectedRunId, bundlePath = BUNDLE_INVENTORY_FILE, sourceInventoryPath = SOURCE_INVENTORY_FILE, requireReport = false, reportPath = REPORT_FILE }) {
  const root = path.resolve(resultDirectory || "");
  const loadedPath = path.isAbsolute(bundlePath) ? bundlePath : path.join(root, bundlePath);
  if (!fs.existsSync(loadedPath)) throw new Error("bundle inventory is missing");
  let bundle;
  try { bundle = JSON.parse(fs.readFileSync(loadedPath, "utf8")); } catch { throw new Error("bundle inventory is not valid JSON"); }
  if (expectedRunId && bundle.runId !== String(expectedRunId)) throw new Error("bundle inventory run ID does not match the requested run");
  const source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedRunId });
  if (bundle.source_inventory_sha256 !== source.sourceInventorySha256) throw new Error("bundle inventory source digest does not match the verified source inventory");
  const entries = Array.isArray(bundle.entries) ? bundle.entries : [];
  if (requireReport && entries.length === 0) throw new Error("bundle inventory must contain source and derived members");
  const requiredMembers = requireReport
    ? [resolveInside(root, sourceInventoryPath).relative, resolveInside(root, reportPath).relative]
    : [];
  if (requiredMembers.some((member) => !entries.some((entry) => entry?.path === member))) throw new Error("bundle inventory must include source inventory and derived report");
  const sourceMembers = [
    resolveInside(root, sourceInventoryPath).relative,
    ...source.entries.map((entry) => resolveInside(root, entry.path).relative),
  ];
  const allowedMembers = new Set(sourceMembers);
  const reportLocation = resolveInside(root, reportPath);
  if (fs.existsSync(reportLocation.absolute)) {
    allowedMembers.add(reportLocation.relative);
    try {
      const persistedReport = JSON.parse(fs.readFileSync(reportLocation.absolute, "utf8"));
      const declaredDerived = [
        persistedReport.profileArtifact || persistedReport.profile_artifact || persistedReport.environmentManifestArtifact || persistedReport.environment_manifest,
        ...(Array.isArray(persistedReport.rawResultArtifacts || persistedReport.raw_result_artifacts || persistedReport.rawArtifacts)
          ? (persistedReport.rawResultArtifacts || persistedReport.raw_result_artifacts || persistedReport.rawArtifacts)
          : []),
        ...(Array.isArray(persistedReport.derivedArtifacts || persistedReport.derived_artifacts)
          ? (persistedReport.derivedArtifacts || persistedReport.derived_artifacts)
          : []),
      ].filter(Boolean);
      for (const member of declaredDerived) allowedMembers.add(resolveInside(root, typeof member === "string" ? member : member.path).relative);
    } catch {
      // validateRunArtifacts reports an invalid report after bundle membership is checked.
    }
  }
  const bundledMembers = new Set(entries.map((entry) => entry?.path));
  const missingSourceMembers = sourceMembers.filter((member) => !bundledMembers.has(member));
  if (missingSourceMembers.length) throw new Error(`bundle inventory is missing source-inventory member: ${missingSourceMembers[0]}`);
  const seen = new Set();
  for (const entry of entries) {
    const location = resolveInside(root, entry.path);
    if (entry.path !== location.relative) throw new Error(`bundle member path is not canonical: ${entry.path}`);
    if (seen.has(location.relative)) throw new Error(`duplicate bundle member: ${location.relative}`);
    seen.add(location.relative);
    if (!allowedMembers.has(location.relative)) throw new Error(`bundle member is undeclared: ${location.relative}`);
    if ([BUNDLE_INVENTORY_FILE, COMPLETED_MARKER_FILE].includes(location.relative)) throw new Error("bundle inventory must exclude itself and COMPLETED");
    if (!fs.existsSync(location.absolute)) throw new Error(`bundle member is missing: ${location.relative}`);
    const bytes = fs.readFileSync(location.absolute);
    const byteSize = entry.byteSize ?? entry.byte_size ?? entry.bytes;
    if (byteSize !== bytes.byteLength || entry.sha256 !== digestBytes(bytes)) throw new Error(`bundle member integrity mismatch: ${location.relative}`);
  }
  const digest = digestBytes(fs.readFileSync(loadedPath));
  if (marker?.bundle_inventory_sha256 !== digest) throw new Error("bundle inventory digest does not match COMPLETED marker");
  return { status: "VERIFIED", bundle, digest, bundlePath: loadedPath };
}

function verifyNonMeasuredRunArtifacts({ root, marker, expectedRunId, markerPath, sourceInventoryPath, bundlePath = BUNDLE_INVENTORY_FILE }) {
  const resolvedRunId = String(expectedRunId || marker.runId || "");
  if (!resolvedRunId || String(marker.runId) !== resolvedRunId) throw new Error("non-measured marker run ID is missing or does not match the requested run");
  if (![COMPLETED_STATUS, INCOMPLETE_STATUS].includes(marker.artifact_status)) throw new Error("non-measured artifact status is invalid");
  if (!["FAILED_SETUP", "NOT_RUN"].includes(marker.execution_outcome)) throw new Error("canonical loading requires FAILED_SETUP or NOT_RUN outcome");
  if (!Array.isArray(marker.qualification_flags)) throw new Error("non-measured marker qualification flags are missing");
  const result = {
    status: marker.artifact_status === COMPLETED_STATUS ? "VERIFIED" : INCOMPLETE_STATUS,
    artifactStatus: marker.artifact_status,
    executionOutcome: marker.execution_outcome,
    qualificationFlags: marker.qualification_flags,
    publishable: false,
    incompleteVerified: true,
    outcomeOnlyVerified: true,
    marker,
    markerPath,
  };
  const sourceLocation = resolveInside(root, sourceInventoryPath);
  const bundleLocation = resolveInside(root, bundlePath);
  if (!fs.existsSync(sourceLocation.absolute)) throw new Error("non-measured source inventory is missing");
  if (!fs.existsSync(bundleLocation.absolute)) throw new Error("non-measured bundle inventory is missing");
  result.source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedDigest: marker.source_inventory_sha256, expectedRunId: resolvedRunId });
  result.bundle = verifyBundle({ resultDirectory: root, marker, expectedRunId: resolvedRunId, bundlePath });
  const sourceEntries = new Map(result.source.entries.map((entry) => [entry.path, entry]));
  const sourceMember = (relativePath) => {
    if (!sourceEntries.has(relativePath)) throw new Error(`non-measured source inventory is missing ${relativePath}`);
    const location = resolveInside(root, relativePath);
    try { return JSON.parse(fs.readFileSync(location.absolute, "utf8")); }
    catch { throw new Error(`non-measured retained artifact is not valid JSON: ${relativePath}`); }
  };
  const manifest = sourceMember("manifest.json");
  const runStatus = sourceMember("run-status.json");
  for (const [label, artifact] of [["manifest", manifest], ["run status", runStatus]]) {
    if (String(artifact.runId) !== resolvedRunId) throw new Error(`non-measured ${label} run ID does not match the requested run`);
    if (artifact.artifact_status !== marker.artifact_status || artifact.execution_outcome !== marker.execution_outcome || JSON.stringify([...(artifact.qualification_flags || [])].sort()) !== JSON.stringify([...marker.qualification_flags].sort())) {
      throw new Error(`non-measured ${label} status axes do not match the completion marker`);
    }
  }
  if (!result.bundle.bundle.entries.some((entry) => entry.path === sourceInventoryPath)) throw new Error("non-measured bundle inventory must include source inventory");
  const cleanup = runStatus.cleanup || runStatus.teardown;
  if (!cleanup || cleanup.attempted !== true || typeof cleanup.completed !== "boolean" || cleanup.ownershipSafe !== true) throw new Error("non-measured run cleanup evidence is missing or unsafe");
  const failure = runStatus.failure;
  const reason = runStatus.reason || failure?.reason || failure?.error || runStatus.phases?.measurement?.output?.reason;
  if (typeof reason !== "string" || !reason.trim()) throw new Error("non-measured run failure reason is missing");
  if (marker.execution_outcome === "FAILED_SETUP" && (!failure?.phase || !["setup/seed", "warm-up"].includes(failure.phase))) throw new Error("FAILED_SETUP failure point is missing or invalid");
  result.manifest = manifest;
  result.runStatus = runStatus;
  result.report = null;
  return result;
}

function verifyIncompleteRunArtifacts({ root, marker, expectedRunId, markerPath, sourceInventoryPath, bundlePath = BUNDLE_INVENTORY_FILE }) {
  const resolvedRunId = String(expectedRunId || marker.runId || "");
  if (!resolvedRunId || String(marker.runId) !== resolvedRunId) throw new Error("incomplete marker run ID is missing or does not match the requested run");
  if (marker.artifact_status !== INCOMPLETE_STATUS) throw new Error("incomplete artifact verification requires artifact_status INCOMPLETE");
  const result = {
    status: INCOMPLETE_STATUS,
    artifactStatus: marker.artifact_status,
    executionOutcome: marker.execution_outcome,
    qualificationFlags: marker.qualification_flags,
    publishable: false,
    incompleteVerified: true,
    marker,
    markerPath,
  };
  const sourceLocation = resolveInside(root, sourceInventoryPath);
  const bundleLocation = resolveInside(root, bundlePath);
  if (fs.existsSync(sourceLocation.absolute)) result.source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedDigest: marker.source_inventory_sha256, expectedRunId: resolvedRunId });
  if (fs.existsSync(bundleLocation.absolute)) result.bundle = verifyBundle({ resultDirectory: root, marker, expectedRunId: resolvedRunId, bundlePath });
  return result;
}

function validateRunArtifacts({ resultDirectory, expectedRunId, markerPath = COMPLETED_MARKER_FILE, sourceInventoryPath = SOURCE_INVENTORY_FILE, reportPath = REPORT_FILE, requireReport = true, allowIncomplete = false, strictIncomplete = false }) {
  const root = path.resolve(resultDirectory || "");
  const resolvedMarker = path.isAbsolute(markerPath) ? markerPath : path.join(root, markerPath);
  if (!fs.existsSync(resolvedMarker)) return { status: INCOMPLETE_STATUS, artifactStatus: INCOMPLETE_STATUS, publishable: false, reason: "COMPLETED marker is absent" };
  let marker;
  try { marker = JSON.parse(fs.readFileSync(resolvedMarker, "utf8")); } catch { return { status: INCOMPLETE_STATUS, artifactStatus: INCOMPLETE_STATUS, publishable: false, reason: "COMPLETED marker is invalid" }; }
  if (expectedRunId && String(marker.runId) !== String(expectedRunId)) throw new Error("completion marker run ID does not match the requested run");
  assertStatusAxes({ artifactStatus: marker.artifact_status, executionOutcome: marker.execution_outcome, qualificationFlags: marker.qualification_flags });
  if (marker.artifact_status !== COMPLETED_STATUS) {
    if (allowIncomplete) return (strictIncomplete ? verifyNonMeasuredRunArtifacts : verifyIncompleteRunArtifacts)({ root, marker, expectedRunId, markerPath: resolvedMarker, sourceInventoryPath });
    return { status: INCOMPLETE_STATUS, artifactStatus: marker.artifact_status, executionOutcome: marker.execution_outcome, qualificationFlags: marker.qualification_flags, publishable: false };
  }
  const resolvedRunId = String(expectedRunId || marker.runId);
  const source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedDigest: marker.source_inventory_sha256, expectedRunId: resolvedRunId });
  const reportLocation = resolveInside(root, reportPath);
  if (!fs.existsSync(reportLocation.absolute)) {
    if (requireReport) throw new Error("derived report is missing");
    try {
      const bundle = verifyBundle({ resultDirectory: root, marker, expectedRunId: resolvedRunId, sourceInventoryPath, requireReport: false, reportPath });
      if (allowIncomplete && marker.execution_outcome !== "MEASURED" && strictIncomplete) return verifyNonMeasuredRunArtifacts({ root, marker, expectedRunId, markerPath: resolvedMarker, sourceInventoryPath });
      return { status: "INCOMPLETE", artifactStatus: marker.artifact_status, publishable: false, marker, source, bundle, report: null, reason: "derived report is missing" };
    } catch (error) {
      return { status: "INCOMPLETE", artifactStatus: marker.artifact_status, publishable: false, marker, source, report: null, reason: error.message };
    }
  }
  const bundle = verifyBundle({ resultDirectory: root, marker, expectedRunId: resolvedRunId, sourceInventoryPath, requireReport, reportPath });
  let report;
  try { report = JSON.parse(fs.readFileSync(reportLocation.absolute, "utf8")); } catch { throw new Error("derived report is not valid JSON"); }
  if (report.runId !== resolvedRunId) throw new Error("report run ID does not match the requested run");
  if (report.source_inventory_sha256 !== source.sourceInventorySha256) throw new Error("report source inventory digest mismatch");
  if (report.bundle_inventory_sha256 && report.bundle_inventory_sha256 !== bundle.digest) throw new Error("report bundle inventory digest mismatch");
  if (!Array.isArray(report.sourceDigests) || report.sourceDigests.length === 0) throw new Error("report source digests are missing");
  if (report.sourceDigests.length !== source.entries.length) throw new Error("report source digests do not exactly match the source inventory");
  for (const entry of source.entries) {
    const linked = report.sourceDigests.find((digest) => digest?.path === entry.path);
    if (!linked || linked.sha256 !== entry.sha256) throw new Error(`report source digest is not linked: ${entry.path}`);
  }
  const declaredDerived = [
    report.profileArtifact || report.profile_artifact || report.environmentManifestArtifact || report.environment_manifest,
    ...(Array.isArray(report.rawResultArtifacts || report.raw_result_artifacts || report.rawArtifacts) ? (report.rawResultArtifacts || report.raw_result_artifacts || report.rawArtifacts) : []),
    ...(Array.isArray(report.derivedArtifacts || report.derived_artifacts) ? (report.derivedArtifacts || report.derived_artifacts) : []),
  ].filter(Boolean).map((entry) => typeof entry === "string" ? entry : entry.path);
  if (declaredDerived.some((member) => !bundle.bundle.entries.some((entry) => entry.path === member))) throw new Error("bundle inventory is missing a report-declared derived member");
  const reportFlags = [...new Set(report.qualification_flags || report.qualificationFlags || [])].sort();
  const markerFlags = [...new Set(marker.qualification_flags || [])].sort();
  if ((report.artifact_status || report.artifactStatus) !== marker.artifact_status
    || (report.execution_outcome || report.executionOutcome) !== marker.execution_outcome
    || JSON.stringify(reportFlags) !== JSON.stringify(markerFlags)) {
    return { status: "UNPUBLISHABLE", publishable: false, reason: "report status axes do not match the completion marker", marker, report, source, bundle };
  }
  const claims = validateReportClaims({ report, claims: report.claims || [] });
  if (!claims.publishable) return { status: "UNPUBLISHABLE", publishable: false, marker, report, claimEligibility: claims.claimEligibility, source, bundle };
  return {
    status: "PUBLISHABLE",
    publishable: true,
    marker,
    report,
    claimEligibility: claims.claimEligibility,
    source,
    bundle,
};
}

function loadCanonicalRetainedRun({ resultDirectory, expectedRunId } = {}) {
  const verification = validateRunArtifacts({ resultDirectory, expectedRunId, requireReport: false, allowIncomplete: true, strictIncomplete: true });
  if (!verification || (!["VERIFIED", "PUBLISHABLE"].includes(verification.status) && verification.incompleteVerified !== true)) {
    throw new Error(`canonical retained run is not verified: ${verification?.status || "missing verification"}`);
  }
  const root = path.resolve(resultDirectory || "");
  const sourceEntries = new Map(verification.source.entries.map((entry) => [entry.path, entry]));
  const readInventoriedJson = (relativePath) => {
    if (!sourceEntries.has(relativePath)) throw new Error(`canonical retained artifact is not source-inventoried: ${relativePath}`);
    const location = resolveInside(root, relativePath);
    try { return JSON.parse(fs.readFileSync(location.absolute, "utf8")); }
    catch { throw new Error(`canonical retained artifact is not valid JSON: ${relativePath}`); }
  };
  const manifest = verification.manifest || readInventoriedJson("manifest.json");
  const runStatus = verification.runStatus || readInventoriedJson("run-status.json");
  const runId = String(expectedRunId || verification.marker.runId);
  if (String(manifest.runId) !== runId || String(runStatus.runId) !== runId) throw new Error("canonical retained run identity mismatch");
  return {
    runId,
    resultDirectory: root,
    verification,
    manifest,
    runStatus,
    report: verification.report,
    marker: verification.marker,
    sourceInventory: verification.source.inventory,
    sourceInventorySha256: verification.source.sourceInventorySha256,
    bundleInventory: verification.bundle?.bundle,
    bundleInventorySha256: verification.bundle?.digest,
  };
}

const REQUIRED_MACHINE_FIELDS = Object.freeze(["hostname", "cpuModel", "logicalProcessors", "memoryBytes"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
}

function sanitize(value, key = "") {
  if (/(?:secret|password|token|authorization|cookie)/i.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((child) => sanitize(child));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .map(([childKey, child]) => [childKey, sanitize(child, childKey)])
    .filter(([, child]) => child !== undefined));
}

function writeImmutable(directory, name, value) {
  const bytes = jsonBytes(value);
  fs.writeFileSync(path.join(directory, name), bytes, { flag: "wx" });
  return bytes;
}

function machineHardware(explicit = {}) {
  const supplied = explicit && typeof explicit === "object" ? { ...explicit } : {};
  const unresolved = REQUIRED_MACHINE_FIELDS.filter((field) => supplied[field] === undefined || supplied[field] === null || supplied[field] === "");
  return {
    ...supplied,
    evidenceStatus: unresolved.length ? "INCOMPLETE" : "COMPLETE",
    unresolved,
  };
}

function commitShaEvidence(plan, metadata = {}) {
  const candidate = metadata.commitSha ?? plan.commitSha;
  return /^[0-9a-f]{40}$/i.test(String(candidate || "")) ? String(candidate) : "unresolved";
}

function provenanceEvidence(commitSha, testMachine) {
  const unresolved = [];
  if (commitSha === "unresolved") unresolved.push("commitSha");
  if (testMachine.evidenceStatus !== "COMPLETE") unresolved.push("testMachine");
  return {
    status: unresolved.length ? "INCOMPLETE" : "COMPLETE",
    unresolved,
  };
}

function runnerLimitsFromResult(result, directory) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(directory, "measurement-observation-final.raw.json"), "utf8"));
    const runner = raw.loadGenerator?.runner;
    if (!runner) return undefined;
    return {
      cgroupVersion: runner.cgroupVersion,
      sourcePaths: runner.sourcePaths,
      limits: runner.limits,
    };
  } catch {
    return undefined;
  }
}

function totalCardinality(cardinalities) {
  if (!cardinalities || typeof cardinalities !== "object") return undefined;
  return Object.values(cardinalities).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0);
}

function datasetEvidence(plan, result, metadata = {}) {
  const setup = result.phases?.["setup/seed"]?.output?.setupPreflight;
  const supplied = metadata.dataset || setup?.dataset || {};
  const observed = supplied.observed || supplied;
  const declared = supplied.declared;
  const cardinalities = supplied.size?.cardinalities || observed.cardinalities || declared?.cardinalities;
  const identity = supplied.identity || observed.fingerprint || declared?.fingerprint || plan.workload?.datasetIdentity;
  return sanitize({
    identity: identity || "unresolved",
    fingerprint: observed.fingerprint || identity || "unresolved",
    size: {
      cardinalities: cardinalities || null,
      totalDocuments: supplied.size?.totalDocuments ?? totalCardinality(cardinalities),
    },
    declared: declared || null,
    observed: supplied.observed || (Object.keys(observed).length ? observed : null),
  });
}

function workloadEvidence(plan) {
  const workload = plan.workload || {};
  return sanitize({
    scenario: workload.scenario,
    version: workload.version,
    digest: workload.digest || workload.profileDigest,
    snapshot: workload.snapshot || null,
    representation: workload.representation || null,
  });
}

function topologyEvidence(plan) {
  const topology = plan.topology || {};
  return {
    profile: topology.profile || plan.profile,
    backendReplicaCount: topology.backendReplicaCount ?? plan.backendReplicaCount,
    backendUpstreamMembership: topology.backendUpstreamMembership || plan.backendUpstreamMembership || [],
  };
}

function configurationEvidence(plan, metadata = {}) {
  return sanitize({
    projectName: plan.projectName,
    composeFile: plan.composeFile,
    profile: plan.profile,
    phaseSettings: plan.phaseSettings,
    nginx: plan.nginx,
    backend: plan.backend,
    dependencies: plan.dependencies,
    runner: plan.runner,
    resourceAllocation: plan.resourceAllocation,
    networkIngress: plan.networkIngress,
    imageSet: metadata.imageSet || plan.imageSet,
  });
}

function effectiveRuntimeEvidenceReady(metadata = {}) {
  return metadata?.effectiveRuntimeEvidence?.status === "ATTESTED"
    && metadata?.resolvedTopology?.status === "ATTESTED"
    && metadata?.observerBoundary?.status === "ATTESTED";
}

function statusAxes(result, metadata = {}) {
  const phases = result.phases || {};
  const measurementCompleted = phases.measurement?.completed === true;
  const failurePhase = result.failure?.phase;
  const executionOutcome = result.execution_outcome || result.executionOutcome
    || (failurePhase === "setup/seed" || failurePhase === "warm-up"
      ? "FAILED_SETUP"
      : (measurementCompleted ? "MEASURED" : "NOT_RUN"));
  const artifactStatus = result.artifact_status || result.artifactStatus
    || (!result.failure && phases.teardown?.completed === true ? "COMPLETED" : "INCOMPLETE");
  const qualificationFlags = new Set(result.qualificationFlags || []);
  if (executionOutcome === "MEASURED" && !effectiveRuntimeEvidenceReady(metadata)) qualificationFlags.add("OBSERVATION_INCOMPLETE");
  return {
    artifact_status: artifactStatus,
    execution_outcome: executionOutcome,
    qualification_flags: [...qualificationFlags],
  };
}

function createRunManifest({ plan, result, metadata = {} }) {
  const status = statusAxes(result, metadata);
  const runnerLimits = metadata.runnerLimits || (plan.resultDirectory && runnerLimitsFromResult(result, plan.resultDirectory));
  const commitSha = commitShaEvidence(plan, metadata);
  const testMachine = machineHardware({ ...metadata.hardware, ...(runnerLimits ? { runnerLimits } : {}) });
  return {
    schema: "k4-run-manifest-v1",
    runId: plan.runId,
    plan: sanitize(plan),
    commitSha,
    testMachine: sanitize(testMachine),
    provenance: provenanceEvidence(commitSha, testMachine),
    workload: workloadEvidence(plan),
    topology: topologyEvidence(plan),
    resolvedTopology: sanitize(metadata.resolvedTopology || null),
    dataset: datasetEvidence(plan, result, metadata),
    configuration: configurationEvidence(plan, metadata),
    toolVersions: sanitize(metadata.toolVersions || plan.toolVersions || null),
    dependencyTopology: sanitize(metadata.dependencyTopology || plan.dependencyTopology || null),
    runnerPlacement: sanitize(metadata.runnerPlacement || plan.runnerPlacement || null),
    runtimeConfiguration: sanitize(metadata.runtimeConfiguration || plan.runtimeConfiguration || null),
    observerBoundary: sanitize(metadata.observerBoundary || null),
    runtimeEvidenceArtifact: metadata.runtimeEvidenceArtifact || null,
    effectiveRuntimeEvidence: sanitize(metadata.effectiveRuntimeEvidence || null),
    lifecycle: sanitize({
      phases: result.phases,
      failure: result.failure,
      cleanup: result.cleanup || result.teardown,
      qualification: result.qualification,
    }),
    ...status,
  };
}

function walkFiles(directory, current = directory) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    return entry.isDirectory() ? walkFiles(directory, absolute) : [absolute];
  });
}

function artifactType(relativePath) {
  if (relativePath === "manifest.json") return "manifest";
  if (relativePath.endsWith(".raw.json") || relativePath.includes("runner.json")) return "raw";
  return "derived";
}

function sourceEntries(directory) {
  return walkFiles(directory)
    .map((absolutePath) => ({ absolutePath, relativePath: path.relative(directory, absolutePath).replaceAll("\\", "/") }))
    .filter(({ relativePath }) => ![SOURCE_INVENTORY_FILE, BUNDLE_INVENTORY_FILE, COMPLETION_MARKER_FILE].includes(relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map(({ absolutePath, relativePath }) => {
      const bytes = fs.readFileSync(absolutePath);
      return { path: relativePath, type: artifactType(relativePath), byteSize: bytes.length, sha256: sha256(bytes) };
    });
}

function finalizeRunArtifacts({ plan, result, metadata = {} }) {
  if (!plan.resultDirectory) return null;
  fs.mkdirSync(plan.resultDirectory, { recursive: true });
  let finalizedMetadata = metadata;
  if (metadata.effectiveRuntimeEvidence) {
    const runtimeEvidenceArtifact = metadata.runtimeEvidenceArtifact || "runtime-provenance.raw.json";
    const { artifactSha256: _ignoredArtifactSha256, ...rawEvidence } = sanitize(metadata.effectiveRuntimeEvidence);
    const rawBytes = jsonBytes(rawEvidence);
    fs.writeFileSync(path.join(plan.resultDirectory, runtimeEvidenceArtifact), rawBytes, { flag: "wx" });
    finalizedMetadata = {
      ...metadata,
      runtimeEvidenceArtifact,
      effectiveRuntimeEvidence: {
        ...rawEvidence,
        artifactSha256: sha256(rawBytes),
      },
    };
  }
  const axes = statusAxes(result, finalizedMetadata);
  writeImmutable(plan.resultDirectory, "run-status.json", sanitize({
    schema: "k4-run-status-v1",
    runId: plan.runId,
    ...axes,
    phases: result.phases,
    failure: result.failure,
    reason: result.reason,
    cleanup: result.cleanup || result.teardown,
    rawMeasurement: result.rawMeasurement,
  }));
  const manifest = createRunManifest({ plan, result, metadata: finalizedMetadata });
  const manifestBytes = writeImmutable(plan.resultDirectory, "manifest.json", manifest);

  const sourceInventory = {
    schema: "k4-source-inventory-v1",
    runId: plan.runId,
    entries: sourceEntries(plan.resultDirectory),
  };
  const sourceBytes = writeImmutable(plan.resultDirectory, SOURCE_INVENTORY_FILE, sourceInventory);
  const sourceDigest = sha256(sourceBytes);
  if (axes.artifact_status === COMPLETED_STATUS && axes.execution_outcome === "MEASURED") {
    deriveReport({
      resultDirectory: plan.resultDirectory,
      sourceInventoryPath: SOURCE_INVENTORY_FILE,
      sourceInventorySha256: sourceDigest,
      reportPath: REPORT_FILE,
      strictClaims: false,
      report: {
        runId: plan.runId,
        artifact_status: axes.artifact_status,
        execution_outcome: axes.execution_outcome,
        qualification_flags: axes.qualification_flags,
        measuredScope: {
          workload: plan.workload?.scenario ? `${plan.workload.scenario}:v${plan.workload.version}` : undefined,
          topology: plan.topology?.profile || plan.profile,
        },
        profileArtifact: "manifest.json",
        rawResultArtifacts: sourceInventory.entries.filter((entry) => entry.type === "raw").map((entry) => entry.path),
        hardwareLimits: {
          ...manifest.testMachine,
          manifestPath: "manifest.json",
          manifestSha256: sha256(manifestBytes),
        },
      },
    });
  }
  const entries = axes.artifact_status === COMPLETED_STATUS && axes.execution_outcome === "MEASURED"
    ? bundleEntries({ resultDirectory: plan.resultDirectory, sourceInventoryPath: SOURCE_INVENTORY_FILE, reportPath: REPORT_FILE, derivedArtifacts: [] })
    : [
      { path: SOURCE_INVENTORY_FILE, type: "source-inventory", byteSize: sourceBytes.length, sha256: sourceDigest },
      ...sourceInventory.entries,
    ];
  const bundleInventory = {
    schema: "k4-bundle-inventory-v1",
    runId: plan.runId,
    source_inventory_sha256: sourceDigest,
    entries,
  };
  const bundleBytes = writeImmutable(plan.resultDirectory, BUNDLE_INVENTORY_FILE, bundleInventory);
  const bundleDigest = sha256(bundleBytes);
  writeImmutable(plan.resultDirectory, COMPLETION_MARKER_FILE, {
    schema: "k4-completion-marker-v1",
    runId: plan.runId,
    ...axes,
    source_inventory_sha256: sourceDigest,
    bundle_inventory_sha256: bundleDigest,
  });
  const verification = validateRunArtifacts({
    resultDirectory: plan.resultDirectory,
    expectedRunId: plan.runId,
    requireReport: false,
  });
  return {
    resultDirectory: plan.resultDirectory,
    verification,
    manifestPath: "manifest.json",
    sourceInventoryPath: SOURCE_INVENTORY_FILE,
    bundleInventoryPath: BUNDLE_INVENTORY_FILE,
    completionMarkerPath: COMPLETION_MARKER_FILE,
    sourceInventorySha256: sourceDigest,
    bundleInventorySha256: bundleDigest,
  };
}

module.exports = {
  BUNDLE_INVENTORY_FILE,
  COMPLETED_MARKER_FILE,
  COMPLETED_STATUS,
  EXECUTION_OUTCOMES,
  INCOMPLETE_STATUS,
  bundleEntries,
  finalizeRun,
  validateRunArtifacts,
  loadCanonicalRetainedRun,
  verifyBundle,
  COMPLETION_MARKER_FILE,
  SOURCE_INVENTORY_FILE,
  createRunManifest,
  finalizeRunArtifacts,
  machineHardware,
  sanitize,
  statusAxes,
};
