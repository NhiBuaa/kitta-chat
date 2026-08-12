const crypto = require("node:crypto");
const { buildDemoDataset } = require("./demoDataset");

const RUN_SCOPED_FIELDS = new Set(["_id", "__v", "password"]);

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toHexString === "function") return value.toHexString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => RUN_SCOPED_FIELDS.has(key)
    ? []
    : [[key, canonicalize(value[key])]]));
}

function datasetContent() {
  const dataset = buildDemoDataset({ passwordHash: "k4-fixture-password-hash" });
  return canonicalizeCollections(Object.fromEntries(["users", "groups", "files", "messages", "conversations", "participants"]
    .map((name) => [name, dataset[name]])));
}

function canonicalizeCollections(collections) {
  return Object.fromEntries(Object.entries(collections).sort(([left], [right]) => left.localeCompare(right))
    .map(([name, documents]) => [name, documents.map(canonicalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]));
}

function canonicalDatasetFingerprint(content = datasetContent()) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(content))).digest("hex")}`;
}

function datasetDeclaration() {
  const content = datasetContent();
  return {
    generatorVersion: "k4-fixture-v1",
    schemaVersion: "kittachat-schema-v1",
    contentSeed: "k4-content-seed-v1",
    cardinalities: Object.fromEntries(Object.entries(content).map(([name, documents]) => [name, documents.length])),
    fingerprint: canonicalDatasetFingerprint(content),
  };
}

module.exports = { canonicalDatasetFingerprint, canonicalize, canonicalizeCollections, datasetContent, datasetDeclaration };
