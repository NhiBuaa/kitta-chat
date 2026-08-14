"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildSourceInventory,
  deriveReport,
  validateReportClaims,
} = require("../scripts/k4/provenance");
const { finalizeRun, validateRunArtifacts } = require("../scripts/k4/runArtifacts");
const { deriveResourceQualification } = require("../scripts/k4/measurementCollectors");
const {
  crossReplicaAttribution,
  sidebarAttribution,
  socketAttribution,
} = require("../scripts/k4/measurementAttribution");

const MEASUREMENT_START = "2026-08-14T00:00:00.000Z";
const MEASUREMENT_END = "2026-08-14T00:00:10.000Z";
const SCOPE = Object.freeze({ workload: "sidebar:v2", topology: "single-replica" });
const BASE_REPORT = Object.freeze({
  artifact_status: "COMPLETED",
  execution_outcome: "MEASURED",
  qualification_flags: [],
  profile: "sidebar:v2",
  measuredScope: SCOPE,
  hardwareLimits: { cpu: "1", memory: "512MiB" },
  profileArtifact: "manifest.json",
  rawResultArtifacts: ["raw.bin"],
});

function fixture(label, overrides = {}, claims = []) {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `k4-issue85-${label}-`));
  fs.writeFileSync(path.join(resultDirectory, "manifest.json"), Buffer.from('{"profile":"sidebar:v2","topology":"single-replica"}\n', "utf8"));
  fs.writeFileSync(path.join(resultDirectory, "raw.bin"), Buffer.from([0, 1, 255, 10]));
  const runId = `tc85-${label}`;
  const inventory = buildSourceInventory({
    resultDirectory,
    runId,
    sourceArtifacts: ["manifest.json", "raw.bin"],
  });
  const report = deriveReport({
    resultDirectory,
    sourceInventorySha256: inventory.sourceInventorySha256,
    report: { ...BASE_REPORT, ...overrides, claims },
    strictClaims: false,
  });
  const finalized = finalizeRun({
    resultDirectory,
    runId,
    sourceInventorySha256: inventory.sourceInventorySha256,
    reportPath: "report.json",
    artifactStatus: report.artifact_status,
    executionOutcome: report.execution_outcome,
    qualificationFlags: report.qualification_flags,
  });
  const validation = validateRunArtifacts({ resultDirectory, expectedRunId: runId });
  return { resultDirectory, runId, inventory, report, finalized, validation };
}

function claimMatrix(report, claims) {
  return validateReportClaims({ report, claims });
}

function metadata(overrides = {}) {
  return {
    runId: "tc85-attribution",
    sourceIdentity: "backend-logs",
    sourceDigest: "sha256:source",
    parserVersion: "k4-attribution-log-parser-v1",
    measurementStart: MEASUREMENT_START,
    measurementEnd: MEASUREMENT_END,
    ...overrides,
  };
}

function resourceSamples(seconds) {
  return seconds.map((offset) => ({
    timestamp: new Date(Date.parse(MEASUREMENT_START) + offset * 1000).toISOString(),
    status: "success",
    sample: { cpuUsageUsec: offset + 1, memoryBytes: 42 },
  }));
}

function run() {
  const marketingClaims = [
    { name: "scalable", scope: SCOPE },
    { name: "high-performance", scope: SCOPE },
    { name: "production-ready", scope: SCOPE },
  ];
  const valid = fixture("valid", {}, marketingClaims);
  const validClaims = claimMatrix(valid.report, marketingClaims);
  assert.equal(validClaims.publishable, true);
  assert.deepEqual(Object.values(validClaims.claimEligibility).map(({ eligible }) => eligible), [true, true, true]);

  const flagFixtures = {};
  const flagSets = [
    [],
    ["TARGET_NOT_REACHED"],
    ["TOPOLOGY_NOT_EXERCISED"],
    ["OBSERVATION_INCOMPLETE"],
    ["LOAD_GENERATOR_LIMITED"],
    ["TARGET_NOT_REACHED", "OBSERVATION_INCOMPLETE"],
    ["TOPOLOGY_NOT_EXERCISED", "LOAD_GENERATOR_LIMITED"],
  ];
  for (const flags of flagSets) {
    const key = flags.length ? flags.join("+") : "none";
    const runFixture = fixture(`flags-${key.toLowerCase()}`, { qualification_flags: flags });
    const claims = claimMatrix(runFixture.report, [
      "persistenceHistogramDerivedLatency",
      "scalable",
      "high-performance",
      "production-ready",
    ]);
    flagFixtures[key] = {
      flags: runFixture.report.qualification_flags,
      marker: runFixture.finalized.marker,
      artifactValidation: runFixture.validation.status,
      claims,
    };
  }
  assert.deepEqual(flagFixtures["TARGET_NOT_REACHED+OBSERVATION_INCOMPLETE"].flags, ["TARGET_NOT_REACHED", "OBSERVATION_INCOMPLETE"]);
  assert.equal(flagFixtures["TARGET_NOT_REACHED+OBSERVATION_INCOMPLETE"].claims.claimEligibility.persistenceHistogramDerivedLatency.eligible, true);
  assert.equal(flagFixtures["TARGET_NOT_REACHED+OBSERVATION_INCOMPLETE"].claims.claimEligibility["high-performance"].eligible, false);
  assert.equal(flagFixtures["TOPOLOGY_NOT_EXERCISED+LOAD_GENERATOR_LIMITED"].claims.claimEligibility.scalable.eligible, false);

  const unavailable = fixture("not-run-multireplica", {
    execution_outcome: "NOT_RUN",
    notRunReason: "multi-replica environment unavailable: runner placement was not admitted",
    measuredScope: undefined,
    rawResultArtifacts: ["raw.bin"],
  });
  const unavailableClaims = claimMatrix(unavailable.report, [{ name: "multiReplica", scope: { workload: "sidebar:v2", topology: "multi-replica" } }]);
  assert.equal(unavailable.report.execution_outcome, "NOT_RUN");
  assert.match(unavailable.report.notRunReason, /unavailable/);
  assert.equal(Object.prototype.hasOwnProperty.call(unavailable.report, "multiReplicaResult"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(unavailable.report, "singleReplicaResult"), false);
  assert.equal(unavailable.report.claims.length, 0);
  assert.equal(unavailableClaims.claimEligibility.multiReplica.eligible, false);

  const failedSetup = fixture("failed-setup", {
    execution_outcome: "FAILED_SETUP",
    setupFailureReason: "nginx login prerequisite failed",
  });
  const incomplete = fixture("incomplete", { artifact_status: "INCOMPLETE" });
  const nonMeasured = {
    notRun: { report: unavailable.report, marker: unavailable.finalized.marker, validation: unavailable.validation, claims: unavailableClaims },
    failedSetup: { report: failedSetup.report, marker: failedSetup.finalized.marker, validation: failedSetup.validation },
    incomplete: { report: incomplete.report, marker: incomplete.finalized.marker, validation: incomplete.validation },
  };

  const missingProfile = fixture("missing-profile", { profileArtifact: undefined });
  const missingRaw = fixture("missing-raw", { rawResultArtifacts: [] });
  const missingHardware = fixture("missing-hardware", { hardwareLimits: undefined });
  const missingScope = fixture("missing-scope", { measuredScope: undefined });
  const extrapolated = fixture("extrapolated", {}, [{ name: "production-ready", scope: { workload: "message:v2", topology: "multi-replica" } }]);
  const guardrailMatrix = {
    missingProfile: claimMatrix(missingProfile.report, ["scalable"]),
    missingRaw: claimMatrix(missingRaw.report, ["high-performance"]),
    missingHardware: claimMatrix(missingHardware.report, ["production-ready"]),
    missingScope: claimMatrix(missingScope.report, ["scalable"]),
    extrapolated: claimMatrix(extrapolated.report, extrapolated.report.claims),
  };
  for (const result of Object.values(guardrailMatrix)) assert.equal(result.publishable, false);
  assert.ok(guardrailMatrix.extrapolated.claimEligibility["production-ready"].reasons.includes("claim exceeds measured scope"));

  const singleReplica = sidebarAttribution({
    records: [{ requestId: "r1", upstreamAddr: "10.0.0.1:3000" }],
    requestIds: ["r1"],
    replicaAddressMap: { "10.0.0.1:3000": "backend-1" },
    metadata: metadata(),
  });
  const ambiguous = sidebarAttribution({
    records: [{ requestId: "r1", upstreamAddr: "10.0.0.9:3000" }],
    requestIds: ["r1"],
    replicaAddressMap: {},
    metadata: metadata(),
  });
  const multiReplica = sidebarAttribution({
    records: [
      { requestId: "r1", upstreamAddr: "10.0.0.1:3000" },
      { requestId: "r2", upstreamAddr: "10.0.0.2:3000" },
    ],
    requestIds: ["r1", "r2"],
    replicaAddressMap: { "10.0.0.1:3000": "backend-1", "10.0.0.2:3000": "backend-2" },
    metadata: metadata(),
  });
  const sockets = socketAttribution({
    lifecycles: [
      { actorRef: "alice", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-14T00:00:01.000Z", disconnectedAt: "2026-08-14T00:00:08.000Z" },
      { actorRef: "bob", socketId: "s2", nodeName: "backend-2", authenticatedAt: "2026-08-14T00:00:01.000Z", disconnectedAt: "2026-08-14T00:00:08.000Z" },
    ],
    measuredActors: ["alice", "bob"],
    metadata: metadata(),
    measurementStart: MEASUREMENT_START,
    measurementEnd: MEASUREMENT_END,
  });
  const crossReplica = crossReplicaAttribution({
    sender: { actorRef: "alice", replica: "backend-1", correlationId: "c1" },
    acknowledgement: { correlationId: "c1", success: true },
    receiver: { actorRef: "bob", replica: "backend-2", correlationId: "c1" },
    delivery: { correlationId: "c1", success: true },
    measuredActors: { sender: "alice", recipient: "bob" },
    metadata: metadata(),
  });
  const attributionIncomplete = sidebarAttribution({
    records: [{ requestId: "r1", upstreamAddr: "10.0.0.1:3000" }],
    requestIds: ["r1"],
    replicaAddressMap: { "10.0.0.1:3000": "backend-1" },
    metadata: metadata({ truncated: true }),
  });
  assert.equal(singleReplica.complete, true);
  assert.equal(singleReplica.topologyNotExercised, true);
  assert.equal(multiReplica.claimEligible, true);
  assert.equal(sockets.claimEligible, true);
  assert.equal(crossReplica.claimEligible, true);
  assert.equal(ambiguous.topologyNotExercised, false);
  assert.equal(attributionIncomplete.topologyNotExercised, false);

  const resourceBoundary = {
    exact90: deriveResourceQualification({
      measurementStart: MEASUREMENT_START,
      measurementEnd: MEASUREMENT_END,
      intervalMs: 1000,
      requiredContainers: ["nginx"],
      observations: { nginx: resourceSamples([0, 1, 2, 3, 4, 5, 6, 7, 8]) },
    }),
    below90: deriveResourceQualification({
      measurementStart: MEASUREMENT_START,
      measurementEnd: MEASUREMENT_END,
      intervalMs: 1000,
      requiredContainers: ["nginx"],
      observations: { nginx: resourceSamples([0, 1, 2, 3, 4, 5, 6, 7]) },
    }),
    finalPartial: deriveResourceQualification({
      measurementStart: MEASUREMENT_START,
      measurementEnd: "2026-08-14T00:00:02.500Z",
      intervalMs: 1000,
      requiredContainers: ["nginx"],
      observations: { nginx: resourceSamples([0, 1, 2]) },
    }),
    zeroSuccess: deriveResourceQualification({
      measurementStart: MEASUREMENT_START,
      measurementEnd: MEASUREMENT_END,
      intervalMs: 1000,
      requiredContainers: ["nginx"],
      observations: { nginx: [] },
    }),
  };
  assert.equal(resourceBoundary.exact90.byContainer.nginx.sufficient, true);
  assert.equal(resourceBoundary.below90.byContainer.nginx.sufficient, false);
  assert.equal(resourceBoundary.finalPartial.expectedCount, 3);
  assert.equal(resourceBoundary.zeroSuccess.byContainer.nginx.sufficient, false);

  const evidence = {
    schema_version: 1,
    guide_revision: "k4-issue-85-r3",
    generated_at: new Date().toISOString(),
    node: process.version,
    tc85_05: {
      valid: { validation: valid.validation.status, claims: validClaims },
      qualification_matrix: flagFixtures,
      non_measured: nonMeasured,
      report_guardrails: guardrailMatrix,
    },
    tc85_06_boundary: {
      exact90: resourceBoundary.exact90.byContainer.nginx.counts,
      below90: resourceBoundary.below90.byContainer.nginx.counts,
      finalPartial: resourceBoundary.finalPartial.byContainer.nginx.counts,
      zeroSuccess: resourceBoundary.zeroSuccess.byContainer.nginx.counts,
    },
    tc85_07: {
      singleReplica,
      ambiguous,
      multiReplica,
      sockets,
      crossReplica,
      attributionIncomplete,
      unavailableMultiReplica: {
        executionOutcome: unavailable.report.execution_outcome,
        reason: unavailable.report.notRunReason,
        hasSingleReplicaResult: Object.prototype.hasOwnProperty.call(unavailable.report, "singleReplicaResult"),
        hasMultiReplicaResult: Object.prototype.hasOwnProperty.call(unavailable.report, "multiReplicaResult"),
        claimCount: unavailable.report.claims.length,
        claimValidation: unavailableClaims,
      },
    },
  };
  const outputPath = path.join(process.cwd(), ".scratch", "issue85-manual-acceptance-r3.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "w" });
  process.stdout.write(`${JSON.stringify({ outputPath, tempFixtureRoot: path.dirname(valid.resultDirectory), summary: { validClaimsPublishable: validClaims.publishable, flagFixtures: Object.keys(flagFixtures).length, guardrailRejects: Object.keys(guardrailMatrix).length, singleReplicaTopologyNotExercised: singleReplica.topologyNotExercised, multiReplicaClaimEligible: multiReplica.claimEligible, notRunReason: unavailable.report.notRunReason } }, null, 2)}\n`);
}

run();
