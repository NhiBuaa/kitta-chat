const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_SCENARIOS = Object.freeze([
  "rest-origin",
  "socket-reconnect",
  "backend-down",
  "route-matrix",
  "spa-precedence",
]);

const TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion",
  "scenario",
  "candidateTree",
  "commands",
  "http",
  "headerChecks",
  "socket",
  "upstreamCounterScope",
  "artifactChecks",
  "externalProviderRequestCount",
  "providerMutationCount",
  "cleanup",
]);
const COMMAND_FIELDS = Object.freeze(["name", "exitCode"]);
const HTTP_FIELDS = Object.freeze([
  "method",
  "path",
  "status",
  "contentCategory",
  "upstreamHitCountBefore",
  "upstreamHitCountAfter",
  "upstreamHitDelta",
]);
const HEADER_FIELDS = Object.freeze([
  "seam",
  "originEqual",
  "originAbsent",
  "hostPresent",
  "realIpPresent",
  "forwardedForPresent",
  "forwardedProtoPresent",
  "forbiddenSubstitutionAbsent",
]);
const SOCKET_FIELDS = Object.freeze([
  "pollingConnected",
  "upgraded",
  "reconnected",
  "originEqual",
  "originAbsent",
  "upgradeHeaderConformant",
  "connectionHeaderConformant",
  "payloadDigestEqual",
]);
const ARTIFACT_FIELDS = Object.freeze(["name", "matched"]);
const CLEANUP_FIELDS = Object.freeze(["portReleased", "containerCount", "networkCount"]);

class EdgeAcceptanceInputError extends Error {}
class EdgeObservationError extends Error {}

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EdgeObservationError(`EDGE_OBSERVATION_ERROR=${label}_NOT_OBJECT`);
  }
  const actual = Object.keys(value).sort();
  const locked = [...expected].sort();
  if (actual.length !== locked.length || actual.some((key, index) => key !== locked[index])) {
    throw new EdgeObservationError(`EDGE_OBSERVATION_ERROR=${label}_FIELDS`);
  }
};

const requireBooleanFields = (value, fields, label) => {
  for (const field of fields) {
    if (typeof value[field] !== "boolean") {
      throw new EdgeObservationError(`EDGE_OBSERVATION_ERROR=${label}_${field}`);
    }
  }
};

const requireSafeName = (value, label) => {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) {
    throw new EdgeObservationError(`EDGE_OBSERVATION_ERROR=${label}`);
  }
};

const createObservation = (scenario, candidateTree) => ({
  schemaVersion: 1,
  scenario,
  candidateTree,
  commands: [],
  http: [],
  headerChecks: [],
  socket: {
    pollingConnected: false,
    upgraded: false,
    reconnected: false,
    originEqual: false,
    originAbsent: false,
    upgradeHeaderConformant: false,
    connectionHeaderConformant: false,
    payloadDigestEqual: false,
  },
  upstreamCounterScope: "per-request",
  artifactChecks: [],
  externalProviderRequestCount: 0,
  providerMutationCount: 0,
  cleanup: {
    portReleased: false,
    containerCount: 0,
    networkCount: 0,
  },
});

const validateCommandRows = (commands) => {
  if (!Array.isArray(commands)) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=COMMANDS");
  }
  for (const command of commands) {
    exactKeys(command, COMMAND_FIELDS, "COMMAND");
    requireSafeName(command.name, "COMMAND_NAME");
    if (!Number.isInteger(command.exitCode)) {
      throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=COMMAND_EXIT");
    }
  }
};

const validateHttpRows = (requests) => {
  if (!Array.isArray(requests)) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=HTTP");
  }
  for (const request of requests) {
    exactKeys(request, HTTP_FIELDS, "HTTP_ROW");
    if (!/^(GET|POST)$/.test(request.method)) {
      throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=HTTP_METHOD");
    }
    if (typeof request.path !== "string" || !request.path.startsWith("/") || request.path.length > 256) {
      throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=HTTP_PATH");
    }
    requireSafeName(request.contentCategory, "CONTENT_CATEGORY");
    for (const field of ["status", "upstreamHitCountBefore", "upstreamHitCountAfter", "upstreamHitDelta"]) {
      if (!Number.isInteger(request[field]) || request[field] < 0) {
        throw new EdgeObservationError(`EDGE_OBSERVATION_ERROR=HTTP_${field}`);
      }
    }
    if (request.upstreamHitCountAfter - request.upstreamHitCountBefore !== request.upstreamHitDelta) {
      throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=HTTP_COUNTER_DELTA");
    }
  }
};

const validateHeaderRows = (checks) => {
  if (!Array.isArray(checks)) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=HEADER_CHECKS");
  }
  for (const check of checks) {
    exactKeys(check, HEADER_FIELDS, "HEADER_CHECK");
    requireSafeName(check.seam, "HEADER_SEAM");
    requireBooleanFields(check, HEADER_FIELDS.slice(1), "HEADER");
  }
};

const validateArtifactRows = (checks) => {
  if (!Array.isArray(checks)) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=ARTIFACT_CHECKS");
  }
  for (const check of checks) {
    exactKeys(check, ARTIFACT_FIELDS, "ARTIFACT_CHECK");
    requireSafeName(check.name, "ARTIFACT_NAME");
    if (typeof check.matched !== "boolean") {
      throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=ARTIFACT_MATCH");
    }
  }
};

const validateObservation = (observation) => {
  exactKeys(observation, TOP_LEVEL_FIELDS, "TOP_LEVEL");
  if (observation.schemaVersion !== 1) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=SCHEMA_VERSION");
  }
  if (!SUPPORTED_SCENARIOS.includes(observation.scenario)) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=SCENARIO");
  }
  if (!/^[0-9a-f]{40}$/.test(observation.candidateTree)) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=CANDIDATE_TREE");
  }
  if (observation.upstreamCounterScope !== "per-request") {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=COUNTER_SCOPE");
  }
  if (observation.externalProviderRequestCount !== 0 || observation.providerMutationCount !== 0) {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=D2_MUTATION_COUNT");
  }

  validateCommandRows(observation.commands);
  validateHttpRows(observation.http);
  validateHeaderRows(observation.headerChecks);

  exactKeys(observation.socket, SOCKET_FIELDS, "SOCKET");
  requireBooleanFields(observation.socket, SOCKET_FIELDS, "SOCKET");

  validateArtifactRows(observation.artifactChecks);

  exactKeys(observation.cleanup, CLEANUP_FIELDS, "CLEANUP");
  if (typeof observation.cleanup.portReleased !== "boolean") {
    throw new EdgeObservationError("EDGE_OBSERVATION_ERROR=CLEANUP_PORT");
  }
  for (const field of ["containerCount", "networkCount"]) {
    if (!Number.isInteger(observation.cleanup[field]) || observation.cleanup[field] < 0) {
      throw new EdgeObservationError(`EDGE_OBSERVATION_ERROR=CLEANUP_${field}`);
    }
  }
  return observation;
};

const parseArguments = (argv) => {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!option || !option.startsWith("--") || value === undefined || values.has(option)) {
      throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=ARGUMENTS");
    }
    values.set(option, value);
  }
  const allowed = new Set(["--scenario", "--edge-port", "--output"]);
  if (values.size !== allowed.size || [...values.keys()].some((key) => !allowed.has(key))) {
    throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=ARGUMENTS");
  }

  const scenario = values.get("--scenario");
  if (!SUPPORTED_SCENARIOS.includes(scenario)) {
    throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=unsupported scenario");
  }
  if (values.get("--edge-port") !== "4182") {
    throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=EDGE_PORT_MUST_BE_4182");
  }
  const output = path.resolve(values.get("--output"));
  if (!path.isAbsolute(values.get("--output"))) {
    throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=OUTPUT_MUST_BE_ABSOLUTE");
  }
  if (!fs.existsSync(path.dirname(output))) {
    throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=OUTPUT_PARENT_MISSING");
  }
  if (fs.existsSync(output)) {
    throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=OUTPUT_ALREADY_EXISTS");
  }
  return { scenario, edgePort: 4182, output };
};

const gitObjectDigest = (type, content) => {
  const header = Buffer.from(`${type} ${content.length}\0`);
  return crypto.createHash("sha1").update(header).update(content).digest();
};

const computeFilesystemGitTree = (root) => {
  const hashDirectory = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
      .sort((left, right) => Buffer.from(`${left.name}${left.isDirectory() ? "/" : ""}`)
        .compare(Buffer.from(`${right.name}${right.isDirectory() ? "/" : ""}`)));
    const encoded = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new EdgeAcceptanceInputError("EDGE_ACCEPTANCE_INPUT_ERROR=SYMLINK_UNSUPPORTED");
      }
      const mode = entry.isDirectory() ? "40000" : "100644";
      const digest = entry.isDirectory()
        ? hashDirectory(entryPath)
        : gitObjectDigest("blob", fs.readFileSync(entryPath));
      encoded.push(Buffer.from(`${mode} ${entry.name}\0`), digest);
    }
    return gitObjectDigest("tree", Buffer.concat(encoded));
  };
  return hashDirectory(path.resolve(root)).toString("hex");
};

module.exports = {
  EdgeAcceptanceInputError,
  EdgeObservationError,
  SUPPORTED_SCENARIOS,
  computeFilesystemGitTree,
  createObservation,
  parseArguments,
  validateObservation,
};
