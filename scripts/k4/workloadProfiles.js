const crypto = require("node:crypto");

const OPERATIONAL_METADATA_KEYS = Object.freeze(["label", "notes", "owner"]);
const APPROVED_PROFILES = Object.freeze({
  "sidebar:1": Object.freeze({ scenario: "sidebar", version: 1, loadModel: { type: "fixed-rate", ratePerSecond: 2 }, pageSize: 20, pagination: { mode: "page", pageSize: 20 } }),
  "message:1": Object.freeze({ scenario: "message", version: 1, loadModel: { type: "fixed-rate", ratePerSecond: 1 }, messageSizeBytes: 128, senderCount: 1, recipientCount: 1, ackMode: "required", deliveryTimeoutMs: 5000 }),
  "socket-concurrency:1": Object.freeze({ scenario: "socket-concurrency", version: 1, loadModel: { type: "concurrency", concurrency: 4 }, clientCount: 4, targetConcurrency: 4, ramp: { mode: "immediate" }, settling: { durationMs: 1000 }, plateau: { durationMs: 2000 } }),
});
const SCHEMAS = Object.freeze({
  sidebar: {
    required: ["scenario", "version", "loadModel", "pageSize", "pagination"],
    allowed: ["scenario", "version", "loadModel", "pageSize", "pagination"],
    validate: (p) => p.version === 1 && Number.isInteger(p.pageSize) && p.pageSize > 0 && p.pagination?.mode === "page" && p.pagination.pageSize === p.pageSize && p.loadModel.type === "fixed-rate" && Number.isFinite(p.loadModel.ratePerSecond) && p.loadModel.ratePerSecond > 0,
  },
  message: {
    required: ["scenario", "version", "loadModel", "messageSizeBytes", "senderCount", "recipientCount", "ackMode", "deliveryTimeoutMs"],
    allowed: ["scenario", "version", "loadModel", "messageSizeBytes", "senderCount", "recipientCount", "ackMode", "deliveryTimeoutMs"],
    validate: (p) => p.version === 1 && Number.isInteger(p.messageSizeBytes) && p.messageSizeBytes > 0 && Number.isInteger(p.senderCount) && Number.isInteger(p.recipientCount) && p.senderCount > 0 && p.recipientCount > 0 && p.ackMode === "required" && Number.isFinite(p.deliveryTimeoutMs) && p.deliveryTimeoutMs > 0 && p.loadModel.type === "fixed-rate" && Number.isFinite(p.loadModel.ratePerSecond) && p.loadModel.ratePerSecond > 0,
  },
  "socket-concurrency": {
    required: ["scenario", "version", "loadModel", "clientCount", "targetConcurrency", "ramp", "settling", "plateau"],
    allowed: ["scenario", "version", "loadModel", "clientCount", "targetConcurrency", "ramp", "settling", "plateau"],
    validate: (p) => p.version === 1 && Number.isInteger(p.clientCount) && p.clientCount > 0 && p.targetConcurrency === p.clientCount && p.ramp?.mode === "immediate" && Number.isFinite(p.settling?.durationMs) && Number.isFinite(p.plateau?.durationMs) && p.settling.durationMs >= 0 && p.plateau.durationMs >= 0 && p.loadModel.type === "concurrency" && Number.isInteger(p.loadModel.concurrency) && p.loadModel.concurrency === p.clientCount,
  },
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function authoritativeRepresentation(snapshot) {
  return `${JSON.stringify(stable(snapshot))}\n`;
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function resolveWorkloadProfile(input, metadata = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("workload profile must be an object");
  const scenario = input.scenario;
  const schema = SCHEMAS[scenario];
  if (!schema) throw new Error(`unsupported workload scenario: ${scenario}`);
  const unknown = Object.keys(input).filter((key) => !schema.allowed.includes(key));
  if (unknown.length) throw new Error(`unknown ${scenario} workload fields: ${unknown.join(", ")}`);
  for (const key of schema.required) if (input[key] === undefined) throw new Error(`${scenario} workload field is required: ${key}`);
  if (!input.loadModel || typeof input.loadModel !== "object" || Array.isArray(input.loadModel)) throw new Error(`${scenario} loadModel must be explicit`);
  if (!schema.validate(input)) throw new Error(`invalid ${scenario} workload schema or approved version/load model`);
  const snapshot = stable({ scenario: input.scenario, version: input.version, loadModel: input.loadModel, ...Object.fromEntries(schema.required.filter((key) => !["scenario", "version", "loadModel"].includes(key)).map((key) => [key, input[key]])) });
  const bytes = Buffer.from(authoritativeRepresentation(snapshot), "utf8");
  const digest = sha256Bytes(bytes);
  const acceptedMetadata = {};
  for (const key of Object.keys(metadata)) {
    if (!OPERATIONAL_METADATA_KEYS.includes(key) || (metadata[key] && typeof metadata[key] === "object")) throw new Error(`unsupported operational metadata: ${key}`);
    acceptedMetadata[key] = metadata[key];
  }
  return { scenario, version: input.version, snapshot, representation: authoritativeRepresentation(snapshot), bytes, digest, metadata: acceptedMetadata };
}

function approvedWorkloadProfile(scenario, version = 1, metadata = {}) {
  if (!Number.isInteger(version) || version !== 1) throw new Error("workload version is not approved");
  const profile = APPROVED_PROFILES[`${scenario}:${version}`];
  if (!profile) throw new Error(`workload profile is not approved: ${scenario}:${version}`);
  return resolveWorkloadProfile(profile, metadata);
}

module.exports = { APPROVED_PROFILES, OPERATIONAL_METADATA_KEYS, approvedWorkloadProfile, authoritativeRepresentation, resolveWorkloadProfile, sha256Bytes };
