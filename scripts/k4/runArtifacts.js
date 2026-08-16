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
};
