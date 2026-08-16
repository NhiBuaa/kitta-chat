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
  const candidates = [sourceInventoryPath, reportPath, ...derivedArtifacts];
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
  const source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedDigest: sourceInventorySha256 });
  let resolvedReportPath = reportPath;
  let reportEvidence;
  if (report) {
    const derived = deriveReport({ resultDirectory: root, sourceInventoryPath, sourceInventorySha256: source.sourceInventorySha256, reportPath, report, claims: reportClaims });
    resolvedReportPath = derived.reportPath;
    reportEvidence = derived.report;
  }
  const finalArtifactStatus = artifactStatus || reportEvidence?.artifact_status || COMPLETED_STATUS;
  const finalExecutionOutcome = executionOutcome || reportEvidence?.execution_outcome || "MEASURED";
  const finalQualificationFlags = qualificationFlags || reportEvidence?.qualification_flags || [];
  assertStatusAxes({ artifactStatus: finalArtifactStatus, executionOutcome: finalExecutionOutcome, qualificationFlags: finalQualificationFlags });
  const entries = bundleEntries({ resultDirectory: root, sourceInventoryPath, reportPath: resolvedReportPath, derivedArtifacts });
  const bundle = { schema: "k4-bundle-inventory-v1", runId: String(runId), entries };
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

function verifyBundle({ resultDirectory, marker, bundlePath = BUNDLE_INVENTORY_FILE }) {
  const root = path.resolve(resultDirectory || "");
  const loadedPath = path.isAbsolute(bundlePath) ? bundlePath : path.join(root, bundlePath);
  if (!fs.existsSync(loadedPath)) throw new Error("bundle inventory is missing");
  let bundle;
  try { bundle = JSON.parse(fs.readFileSync(loadedPath, "utf8")); } catch { throw new Error("bundle inventory is not valid JSON"); }
  const seen = new Set();
  for (const entry of bundle.entries || []) {
    const location = resolveInside(root, entry.path);
    if (seen.has(location.relative)) throw new Error(`duplicate bundle member: ${location.relative}`);
    seen.add(location.relative);
    if ([BUNDLE_INVENTORY_FILE, COMPLETED_MARKER_FILE].includes(location.relative)) throw new Error("bundle inventory must exclude itself and COMPLETED");
    if (!fs.existsSync(location.absolute)) throw new Error(`bundle member is missing: ${location.relative}`);
    const bytes = fs.readFileSync(location.absolute);
    if (entry.byteSize !== bytes.byteLength || entry.sha256 !== digestBytes(bytes)) throw new Error(`bundle member integrity mismatch: ${location.relative}`);
  }
  const digest = digestBytes(fs.readFileSync(loadedPath));
  if (marker?.bundle_inventory_sha256 !== digest) throw new Error("bundle inventory digest does not match COMPLETED marker");
  return { status: "VERIFIED", bundle, digest, bundlePath: loadedPath };
}

function validateRunArtifacts({ resultDirectory, expectedRunId, markerPath = COMPLETED_MARKER_FILE, sourceInventoryPath = SOURCE_INVENTORY_FILE, reportPath = REPORT_FILE }) {
  const root = path.resolve(resultDirectory || "");
  const resolvedMarker = path.isAbsolute(markerPath) ? markerPath : path.join(root, markerPath);
  if (!fs.existsSync(resolvedMarker)) return { status: INCOMPLETE_STATUS, artifactStatus: INCOMPLETE_STATUS, publishable: false, reason: "COMPLETED marker is absent" };
  let marker;
  try { marker = JSON.parse(fs.readFileSync(resolvedMarker, "utf8")); } catch { return { status: INCOMPLETE_STATUS, artifactStatus: INCOMPLETE_STATUS, publishable: false, reason: "COMPLETED marker is invalid" }; }
  if (expectedRunId && marker.runId !== expectedRunId) throw new Error("completion marker run ID does not match the requested run");
  assertStatusAxes({ artifactStatus: marker.artifact_status, executionOutcome: marker.execution_outcome, qualificationFlags: marker.qualification_flags });
  if (marker.artifact_status !== COMPLETED_STATUS) return { status: INCOMPLETE_STATUS, artifactStatus: marker.artifact_status, executionOutcome: marker.execution_outcome, qualificationFlags: marker.qualification_flags, publishable: false };
  const source = verifySourceInventory({ resultDirectory: root, inventoryPath: sourceInventoryPath, expectedDigest: marker.source_inventory_sha256 });
  const bundle = verifyBundle({ resultDirectory: root, marker });
  const reportLocation = resolveInside(root, reportPath);
  if (!fs.existsSync(reportLocation.absolute)) throw new Error("derived report is missing");
  const report = JSON.parse(fs.readFileSync(reportLocation.absolute, "utf8"));
  if (report.source_inventory_sha256 !== source.sourceInventorySha256) throw new Error("report source inventory digest mismatch");
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

function statusAxes(result) {
  const phases = result.phases || {};
  const measurementCompleted = phases.measurement?.completed === true;
  const failurePhase = result.failure?.phase;
  const executionOutcome = result.execution_outcome || result.executionOutcome
    || (failurePhase === "setup/seed" || failurePhase === "warm-up"
      ? "FAILED_SETUP"
      : (measurementCompleted ? "MEASURED" : "NOT_RUN"));
  const artifactStatus = result.artifact_status || result.artifactStatus
    || (!result.failure && phases.teardown?.completed === true ? "COMPLETED" : "INCOMPLETE");
  return {
    artifact_status: artifactStatus,
    execution_outcome: executionOutcome,
    qualification_flags: [...new Set(result.qualificationFlags || [])],
  };
}

function createRunManifest({ plan, result, metadata = {} }) {
  const status = statusAxes(result);
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
    dataset: datasetEvidence(plan, result, metadata),
    configuration: configurationEvidence(plan, metadata),
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
      return { path: relativePath, type: artifactType(relativePath), bytes: bytes.length, sha256: sha256(bytes) };
    });
}

function finalizeRunArtifacts({ plan, result, metadata = {} }) {
  if (!plan.resultDirectory) return null;
  fs.mkdirSync(plan.resultDirectory, { recursive: true });
  writeImmutable(plan.resultDirectory, "run-status.json", sanitize({
    schema: "k4-run-status-v1",
    runId: plan.runId,
    artifact_status: result.artifact_status || result.artifactStatus,
    execution_outcome: result.execution_outcome || result.executionOutcome,
    qualification_flags: result.qualificationFlags || [],
    phases: result.phases,
    failure: result.failure,
    cleanup: result.cleanup || result.teardown,
    rawMeasurement: result.rawMeasurement,
  }));
  const manifest = createRunManifest({ plan, result, metadata });
  writeImmutable(plan.resultDirectory, "manifest.json", manifest);

  const sourceInventory = {
    schema: "k4-source-inventory-v1",
    runId: plan.runId,
    entries: sourceEntries(plan.resultDirectory),
  };
  const sourceBytes = writeImmutable(plan.resultDirectory, SOURCE_INVENTORY_FILE, sourceInventory);
  const sourceDigest = sha256(sourceBytes);

  const bundleInventory = {
    schema: "k4-bundle-inventory-v1",
    runId: plan.runId,
    source_inventory_sha256: sourceDigest,
    entries: [
      { path: SOURCE_INVENTORY_FILE, type: "source-inventory", bytes: sourceBytes.length, sha256: sourceDigest },
      ...sourceInventory.entries,
    ],
  };
  const bundleBytes = writeImmutable(plan.resultDirectory, BUNDLE_INVENTORY_FILE, bundleInventory);
  const bundleDigest = sha256(bundleBytes);
  const axes = statusAxes(result);
  writeImmutable(plan.resultDirectory, COMPLETION_MARKER_FILE, {
    schema: "k4-completion-marker-v1",
    runId: plan.runId,
    ...axes,
    source_inventory_sha256: sourceDigest,
    bundle_inventory_sha256: bundleDigest,
  });
  return {
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
  verifyBundle,
  COMPLETION_MARKER_FILE,
  SOURCE_INVENTORY_FILE,
  createRunManifest,
  finalizeRunArtifacts,
  machineHardware,
  sanitize,
  statusAxes,
};
