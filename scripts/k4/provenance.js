const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE_INVENTORY_FILE = "source-inventory.json";
const REPORT_FILE = "report.json";
const WHOLE_FILE_BOUNDARY = "whole-file-bytes";
const QUALIFICATION_FLAGS = Object.freeze([
  "TARGET_NOT_REACHED",
  "TOPOLOGY_NOT_EXERCISED",
  "OBSERVATION_INCOMPLETE",
  "LOAD_GENERATOR_LIMITED",
]);
const MARKETING_CLAIMS = Object.freeze(["scalable", "high-performance", "production-ready"]);

function digestBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function digestFile(filePath) {
  return digestBytes(fs.readFileSync(filePath));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeImmutable(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes, { flag: "wx" });
  return filePath;
}

function normalizedRelativePath(root, candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) throw new Error("artifact path is required");
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  if (!relative || relative === "." || relative.startsWith("../") || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("source artifact must remain inside the result directory");
  }
  return { absolute, relative };
}

function artifactType(relativePath, supplied) {
  if (supplied) return String(supplied);
  if (relativePath.includes("manifest")) return "environment-manifest";
  if (relativePath.includes("runner")) return "runner-result";
  return "source-artifact";
}

function artifactInputs({ resultDirectory, sourceArtifacts, artifacts, environmentManifestPath }) {
  const root = path.resolve(resultDirectory || "");
  if (!resultDirectory) throw new Error("result directory is required");
  const inputs = [...(sourceArtifacts || artifacts || [])];
  if (environmentManifestPath) inputs.push({ path: environmentManifestPath, type: "environment-manifest" });
  if (!inputs.length) throw new Error("finalized source artifacts are required");
  const seen = new Set();
  return inputs.map((item) => {
    const descriptor = typeof item === "string" ? { path: item } : item;
    const location = normalizedRelativePath(root, descriptor.path || descriptor.relativePath);
    if (seen.has(location.relative)) throw new Error(`duplicate source artifact: ${location.relative}`);
    seen.add(location.relative);
    if (!fs.existsSync(location.absolute) || !fs.statSync(location.absolute).isFile()) throw new Error(`source artifact is missing: ${location.relative}`);
    const bytes = fs.readFileSync(location.absolute);
    return {
      path: location.relative,
      type: artifactType(location.relative, descriptor.type || descriptor.artifactType),
      byteSize: bytes.byteLength,
      sha256: digestBytes(bytes),
    };
  });
}

function requireDeclaredBoundary(inventory) {
  const boundary = inventory?.representation || inventory?.byteBoundary || WHOLE_FILE_BOUNDARY;
  if (boundary === WHOLE_FILE_BOUNDARY) return boundary;
  const authority = inventory?.authority || inventory?.schemaAuthority;
  if (!authority) throw new Error("BLOCKED: alternate source-inventory byte boundary requires an authority or schema");
  return boundary;
}

function buildSourceInventory({ resultDirectory, runId, profile, topology, sourceArtifacts, artifacts, environmentManifestPath, representation = WHOLE_FILE_BOUNDARY, authority, schema, inventoryName = SOURCE_INVENTORY_FILE }) {
  if (!runId) throw new Error("run ID is required for source inventory");
  if (representation !== WHOLE_FILE_BOUNDARY && !authority && !schema) throw new Error("BLOCKED: alternate source-inventory byte boundary requires an authority or schema");
  const root = path.resolve(resultDirectory || "");
  const entries = artifactInputs({ resultDirectory: root, sourceArtifacts, artifacts, environmentManifestPath });
  if (entries.some((entry) => [inventoryName, REPORT_FILE, "bundle-inventory.json", "COMPLETED"].includes(entry.path))) {
    throw new Error("source inventory cannot include derived report, bundle inventory, or completion marker");
  }
  const inventory = {
    schema: "k4-source-inventory-v1",
    runId: String(runId),
    ...(profile ? { profile } : {}),
    ...(topology ? { topology } : {}),
    representation,
    ...(authority ? { authority } : {}),
    ...(schema ? { schemaAuthority: schema } : {}),
    entries,
  };
  const inventoryPath = path.join(root, inventoryName);
  writeImmutable(inventoryPath, jsonBytes(inventory));
  const sourceInventorySha256 = digestFile(inventoryPath);
  return {
    inventory,
    inventoryPath,
    sourceInventorySha256,
    source_inventory_sha256: sourceInventorySha256,
  };
}

function readInventory({ resultDirectory, inventoryPath = SOURCE_INVENTORY_FILE }) {
  const root = path.resolve(resultDirectory || path.dirname(inventoryPath));
  const resolved = normalizedRelativePath(root, inventoryPath).absolute;
  if (!fs.existsSync(resolved)) throw new Error(`source inventory is missing: ${inventoryPath}`);
  const bytes = fs.readFileSync(resolved);
  let inventory;
  try { inventory = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("source inventory is not valid JSON"); }
  return { root, resolved, bytes, inventory, digest: digestBytes(bytes) };
}

function verifySourceInventory({ resultDirectory, inventoryPath = SOURCE_INVENTORY_FILE, expectedDigest, expectedSourceInventorySha256, expectedSourceArtifacts, representation }) {
  const loaded = readInventory({ resultDirectory, inventoryPath });
  const actualDigest = loaded.digest;
  const expected = expectedDigest || expectedSourceInventorySha256;
  if (expected && expected !== actualDigest) throw new Error(`source inventory digest/integrity mismatch: expected ${expected}, got ${actualDigest}`);
  const boundary = requireDeclaredBoundary(loaded.inventory);
  if (representation && representation !== boundary) throw new Error("source inventory representation does not match the declared contract");
  if (boundary !== WHOLE_FILE_BOUNDARY) throw new Error("BLOCKED: alternate source-inventory representation requires an authority-specific verifier");
  const entries = loaded.inventory.entries;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("source inventory entries are required");
  const seen = new Set();
  for (const entry of entries) {
    const location = normalizedRelativePath(loaded.root, entry.path || entry.relativePath);
    if (seen.has(location.relative)) throw new Error(`duplicate source inventory entry: ${location.relative}`);
    seen.add(location.relative);
    if (!fs.existsSync(location.absolute) || !fs.statSync(location.absolute).isFile()) throw new Error(`source artifact is missing: ${location.relative}`);
    const bytes = fs.readFileSync(location.absolute);
    const byteSize = entry.byteSize ?? entry.byte_size;
    const expectedFileDigest = entry.sha256 || entry.digest;
    if (byteSize !== bytes.byteLength || expectedFileDigest !== digestBytes(bytes)) throw new Error(`source artifact integrity mismatch: ${location.relative}`);
  }
  if (expectedSourceArtifacts) {
    const expectedPaths = new Set(expectedSourceArtifacts.map((item) => typeof item === "string" ? normalizedRelativePath(loaded.root, item).relative : normalizedRelativePath(loaded.root, item.path || item.relativePath).relative));
    if (expectedPaths.size !== seen.size || [...expectedPaths].some((item) => !seen.has(item))) throw new Error("source inventory entry set does not match the expected source artifacts");
  }
  return { status: "VERIFIED", boundary, digest: actualDigest, sourceInventorySha256: actualDigest, entries, inventory: loaded.inventory, inventoryPath: loaded.resolved };
}

function claimScope(report) {
  return report.measuredScope || report.measured_scope || {
    workload: report.workload || report.profile?.workload,
    topology: report.topology || report.profile,
  };
}

function equalScope(left, right) {
  if (!left || !right) return false;
  for (const key of ["workload", "topology", "profile", "dataset"]) {
    if (left[key] !== undefined && right[key] !== undefined && left[key] !== right[key]) return false;
  }
  return true;
}

function claimEligibility({ report, verification, claim }) {
  const name = typeof claim === "string" ? claim : claim?.name;
  if (!name) return { eligible: false, reasons: ["claim name is required"] };
  const flags = new Set(report.qualification_flags || report.qualificationFlags || []);
  const reasons = [];
  const artifactStatus = report.artifact_status || report.artifactStatus;
  const executionOutcome = report.execution_outcome || report.executionOutcome;
  const hardwareLimits = report.hardwareLimits || report.hardware_limits;
  const measured = claimScope(report);
  const profileArtifact = report.profileArtifact || report.profile_artifact || report.environmentManifestArtifact || report.environment_manifest;
  const rawArtifacts = report.rawResultArtifacts || report.raw_result_artifacts || report.rawArtifacts;
  if (artifactStatus !== "COMPLETED") reasons.push("artifact status is not COMPLETED");
  if (executionOutcome !== "MEASURED") reasons.push("execution outcome is not MEASURED");
  if (!report.source_inventory_sha256 && !report.sourceInventorySha256) reasons.push("source inventory digest is missing");
  if (!profileArtifact) reasons.push("profile/environment manifest provenance is missing");
  if (!Array.isArray(rawArtifacts) || rawArtifacts.length === 0) reasons.push("raw result artifact provenance is missing");
  if (!hardwareLimits || typeof hardwareLimits !== "object" || Object.keys(hardwareLimits).length === 0) reasons.push("hardware limits are missing");
  if (!measured || typeof measured !== "object" || !measured.workload || !measured.topology) reasons.push("measured scope is missing");
  const requestedScope = typeof claim === "object" ? claim.scope : undefined;
  if (requestedScope && !equalScope(requestedScope, measured)) reasons.push("claim exceeds measured scope");
  if (["target", "targetConcurrency", "scalable", "high-performance", "production-ready"].includes(name) && flags.has("TARGET_NOT_REACHED")) reasons.push("TARGET_NOT_REACHED");
  if (["scalable", "high-performance", "production-ready"].includes(name) && flags.has("TOPOLOGY_NOT_EXERCISED")) reasons.push("TOPOLOGY_NOT_EXERCISED");
  if (["topology", "multiReplica", "crossReplica"].includes(name) && flags.has("TOPOLOGY_NOT_EXERCISED")) reasons.push("TOPOLOGY_NOT_EXERCISED");
  if (["cpu", "memory", "bottleneck", "bottleneckSutCeiling", "high-performance", "production-ready"].includes(name) && flags.has("OBSERVATION_INCOMPLETE")) reasons.push("OBSERVATION_INCOMPLETE");
  if (["bottleneck", "bottleneckSutCeiling", "sutCeiling", "high-performance", "production-ready"].includes(name) && flags.has("LOAD_GENERATOR_LIMITED")) reasons.push("LOAD_GENERATOR_LIMITED");
  if (MARKETING_CLAIMS.includes(name) && !requestedScope && (!measured.workload || !measured.topology)) reasons.push("marketing claim has no bounded measured scope");
  return { eligible: reasons.length === 0, reasons };
}

function validateReportClaims({ report, verification, claims = report?.claims || [] }) {
  const list = Array.isArray(claims) ? claims : [claims];
  const claimEligibilityByName = Object.fromEntries(list.map((claim) => [typeof claim === "string" ? claim : claim.name, claimEligibility({ report, verification, claim })]));
  return { claimEligibility: claimEligibilityByName, publishable: Object.values(claimEligibilityByName).every(({ eligible }) => eligible) };
}

function deriveReport({ resultDirectory, sourceInventoryPath = SOURCE_INVENTORY_FILE, sourceInventorySha256, reportPath = REPORT_FILE, report = {}, claims, strictClaims = true }) {
  const verification = verifySourceInventory({ resultDirectory, inventoryPath: sourceInventoryPath, expectedDigest: sourceInventorySha256 });
  const candidate = typeof report === "function" ? report(verification) : { ...report };
  const sourceDigest = verification.sourceInventorySha256;
  if (candidate.source_inventory_sha256 && candidate.source_inventory_sha256 !== sourceDigest) throw new Error("report source inventory digest does not match the locked source inventory");
  const normalized = {
    ...candidate,
    runId: candidate.runId || verification.inventory.runId,
    source_inventory_sha256: sourceDigest,
    sourceDigests: candidate.sourceDigests || verification.entries.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    artifact_status: candidate.artifact_status || candidate.artifactStatus || "COMPLETED",
    execution_outcome: candidate.execution_outcome || candidate.executionOutcome || "MEASURED",
    qualification_flags: [...new Set(candidate.qualification_flags || candidate.qualificationFlags || [])],
    measuredScope: claimScope(candidate),
    hardwareLimits: candidate.hardwareLimits || candidate.hardware_limits,
  };
  for (const flag of normalized.qualification_flags) if (!QUALIFICATION_FLAGS.includes(flag)) throw new Error(`unknown qualification flag: ${flag}`);
  const claimResult = validateReportClaims({ report: normalized, verification, claims: claims || normalized.claims || [] });
  normalized.claimEligibility = claimResult.claimEligibility;
  normalized.claims = (Array.isArray(normalized.claims) ? normalized.claims : []).map((claim) => ({ ...(typeof claim === "string" ? { name: claim } : claim), ...claimResult.claimEligibility[typeof claim === "string" ? claim : claim.name] }));
  if (strictClaims && normalized.claims.some((claim) => claim.eligible !== true)) throw new Error(`report claim is not eligible: ${normalized.claims.filter((claim) => !claim.eligible).map((claim) => claim.name).join(", ")}`);
  const resolvedPath = path.isAbsolute(reportPath) ? reportPath : path.join(path.resolve(resultDirectory), reportPath);
  writeImmutable(resolvedPath, jsonBytes(normalized));
  return { ...normalized, report: normalized, reportPath: resolvedPath, sourceInventorySha256: sourceDigest };
}

function finalizeRun(options) {
  return require("./runArtifacts").finalizeRun(options);
}

function validateRunArtifacts(options) {
  return require("./runArtifacts").validateRunArtifacts(options);
}

module.exports = {
  MARKETING_CLAIMS,
  REPORT_FILE,
  SOURCE_INVENTORY_FILE,
  WHOLE_FILE_BOUNDARY,
  buildSourceInventory,
  claimEligibility,
  deriveReport,
  digestBytes,
  digestFile,
  finalizeRun,
  validateReportClaims,
  validateRunArtifacts,
  verifySourceInventory,
};
