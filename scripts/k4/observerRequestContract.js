const OPERATIONS = Object.freeze(["metrics", "logs", "stats", "identity", "runner-cgroup"]);
const CGROUP_PATHS = Object.freeze(["cpu.stat", "cpu.max", "cpuset.cpus.effective", "memory.max", "memory.events"]);
const COMMON_FIELDS = Object.freeze(["runId", "project", "role", "target"]);
const OPERATION_FIELDS = Object.freeze({
  metrics: COMMON_FIELDS,
  identity: COMMON_FIELDS,
  logs: [...COMMON_FIELDS, "measurementStart", "measurementEnd"],
  stats: [...COMMON_FIELDS, "slotTimestamp"],
  "runner-cgroup": [...COMMON_FIELDS, "path", "paths", "slotTimestamp", "measurementStart", "measurementEnd"],
});

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
}

function assertOptionalTimestamp(value, field) {
  if (value !== undefined && (typeof value !== "string" || !Number.isFinite(Date.parse(value)))) throw new Error(`${field} must be an ISO timestamp`);
}

function validateObserverRequest(value, expected = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("observer request must be an object");
  const { operation, payload } = value;
  if (!OPERATIONS.includes(operation)) throw new Error("operation is not observation-only");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("observer payload must be an object");
  const allowed = new Set(OPERATION_FIELDS[operation]);
  for (const field of Object.keys(payload)) {
    if (!allowed.has(field)) throw new Error(`unexpected field: ${field}`);
  }
  for (const field of COMMON_FIELDS) assertNonEmptyString(payload[field], field);
  if (expected.runId && payload.runId !== expected.runId) throw new Error("observer request run ownership mismatch");
  if (expected.project && payload.project !== expected.project) throw new Error("observer request project ownership mismatch");
  if (operation === "logs") {
    assertOptionalTimestamp(payload.measurementStart, "measurementStart");
    assertOptionalTimestamp(payload.measurementEnd, "measurementEnd");
  }
  if (operation === "stats") assertOptionalTimestamp(payload.slotTimestamp, "slotTimestamp");
  if (operation === "runner-cgroup") {
    if (payload.role !== "runner" || payload.target !== "runner") throw new Error("runner cgroup target is invalid");
    if (!CGROUP_PATHS.includes(payload.path)) throw new Error("cgroup path is not allowlisted");
    if (payload.paths !== undefined && (!Array.isArray(payload.paths) || payload.paths.some((entry) => !CGROUP_PATHS.includes(entry)))) {
      throw new Error("cgroup paths are not allowlisted");
    }
    for (const field of ["slotTimestamp", "measurementStart", "measurementEnd"]) assertOptionalTimestamp(payload[field], field);
  }
  return { operation, payload: { ...payload } };
}

module.exports = { CGROUP_PATHS, OPERATIONS, validateObserverRequest };
