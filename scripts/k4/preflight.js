const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DATASET_FIELDS = ["generatorVersion", "schemaVersion", "contentSeed", "cardinalities", "fingerprint"];

function stableContent(value) {
  if (Array.isArray(value)) return value.map(stableContent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableContent(value[key])]));
}

const { canonicalDatasetFingerprint, datasetContent, datasetDeclaration } = require("../../server/src/demo/k4DatasetContract");
const K4_DATASET_CONTENT = datasetContent();
const K4_DATASET_DECLARATION = Object.freeze(datasetDeclaration());

function verifyDatasetContract(declared, observed) {
  for (const field of DATASET_FIELDS) {
    if (observed?.[field] === undefined || observed?.[field] === null) {
      return { status: "FAILED_SETUP", reason: `dataset ${field} is missing from production verification` };
    }
    if (JSON.stringify(stableContent(observed[field])) !== JSON.stringify(stableContent(declared?.[field]))) {
      return {
        status: "FAILED_SETUP",
        reason: field === "fingerprint"
          ? "dataset fingerprint does not match the declared contract"
          : `dataset ${field} does not match the declared contract`,
      };
    }
  }
  return { status: "VERIFIED" };
}

function classifySetupFailure(prerequisite, { warmupAdmitted = false } = {}) {
  if (warmupAdmitted) throw new Error("setup/preflight cannot emit FAILED_SETUP after warm-up admission");
  if (!prerequisite) throw new Error("setup/preflight failure requires a concrete prerequisite");
  return { status: "FAILED_SETUP", phase: "setup/preflight" };
}

function admitWarmup(verification) {
  if (verification?.status !== "VERIFIED") return verification;
  return { status: "WARMUP_ADMITTED" };
}

function compareDatasetVerificationRecords(left, right) {
  if (left?.verification?.status !== "VERIFIED" || right?.verification?.status !== "VERIFIED") {
    return { status: "ACCEPTANCE_FAILED", reason: "each run must independently pass production dataset verification" };
  }
  if (JSON.stringify(stableContent(left.declared)) !== JSON.stringify(stableContent(right.declared))) {
    return { status: "ACCEPTANCE_FAILED", reason: "declared dataset inputs differ" };
  }
  if (left.observed.fingerprint !== right.observed.fingerprint) {
    return { status: "ACCEPTANCE_FAILED", reason: "canonical dataset fingerprints differ" };
  }
  return { status: "EQUIVALENT" };
}

function validateOwnershipDiscovery(resources, runId, ownsResource) {
  const foreign = resources.filter((resource) => !ownsResource(resource, runId));
  return foreign.length
    ? { status: "FAILED_SETUP", reason: "production discovery found a resource not owned by the active K4 run" }
    : { status: "CLEAN" };
}

function assertFreshRunTargets(preview) {
  const existing = Object.entries(preview?.targets || {}).flatMap(([targetClass, targets]) =>
    Array.isArray(targets) && targets.length ? [`${targetClass}:${targets.length}`] : []);
  if (existing.length) throw new Error(`K4 run identity already owns resources and cannot be reused: ${existing.join(", ")}`);
  return { status: "FRESH" };
}

function scanRetainedEvidence(inventory, canaries, readArtifact) {
  if (!Array.isArray(inventory) || !inventory.length) throw new Error("retained-evidence inventory is required");
  if (!Array.isArray(canaries)) throw new Error("canary material must be an array");
  let matches = 0;
  for (const artifact of inventory) {
    const content = readArtifact(artifact);
    for (const canary of canaries) if (canary && String(content).includes(canary)) matches += 1;
  }
  return { status: matches === 0 ? "CLEAR" : "ACCEPTANCE_FAILED", scannedArtifacts: inventory.length, matches };
}

function retainedEvidenceInventory(resultDirectory) {
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
  const artifacts = walk(resultDirectory).sort();
  if (!artifacts.length) throw new Error("retained-evidence inventory is empty");
  return artifacts;
}

function scanRetainedEvidenceDirectory(resultDirectory, canaries) {
  const inventory = retainedEvidenceInventory(resultDirectory);
  const result = scanRetainedEvidence(inventory, canaries, (artifact) => fs.readFileSync(artifact));
  return {
    ...result,
    inventoryFingerprint: `sha256:${crypto.createHash("sha256").update(inventory.map((artifact) => path.relative(resultDirectory, artifact)).join("\n")).digest("hex")}`,
  };
}

function setupPreflightCommands(plan) {
  const compose = ["compose", "--project-name", plan.projectName, "--file", plan.composeFile];
  return [
    { prerequisite: "create", args: [...compose, "up", "--detach", "--scale", `backend=${plan.backendReplicaCount}`] },
    { prerequisite: "migrate", args: [...compose, "exec", "-T", "backend", "npm", "run", "migrate:k4"] },
    { prerequisite: "seed", args: [...compose, "exec", "-T", "backend", "npm", "run", "seed:demo"] },
    { prerequisite: "verification", args: [...compose, "exec", "-T", "backend", "node", "scripts/k4VerifyDataset.js"] },
    { prerequisite: "health", args: [...compose, "exec", "-T", "runner", "node", "-e", "fetch('http://nginx/backend-healthz').then((r) => { if (!r.ok) process.exit(1); })"] },
    { prerequisite: "login", args: [...compose, "exec", "-T", "runner", "node", "-e", "fetch('http://nginx/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.K4_BENCHMARK_EMAIL, password: process.env.K4_BENCHMARK_PASSWORD }) }).then(async (r) => { if (!r.ok) process.exit(1); const body = await r.json(); process.stdout.write(JSON.stringify({ token: body.token })); })"] },
    { prerequisite: "socket-auth", args: [...compose, "exec", "-T", "-e", "K4_BENCHMARK_TOKEN", "runner", "node", "-e", "const { io } = require('socket.io-client'); const token = process.env.K4_BENCHMARK_TOKEN; const socket = io('http://nginx', { path: '/socket.io/', auth: { token }, transports: ['websocket'], timeout: 5000 }); socket.on('connect', () => { socket.disconnect(); process.stdout.write('socket-authenticated'); }); socket.on('connect_error', () => process.exit(1));"] },
  ];
}

module.exports = {
  K4_DATASET_CONTENT,
  K4_DATASET_DECLARATION,
  assertFreshRunTargets,
  admitWarmup,
  canonicalDatasetFingerprint,
  classifySetupFailure,
  compareDatasetVerificationRecords,
  scanRetainedEvidence,
  scanRetainedEvidenceDirectory,
  retainedEvidenceInventory,
  setupPreflightCommands,
  validateOwnershipDiscovery,
  verifyDatasetContract,
};
