const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");

const {
  BASELINE_MATRIX,
  createBaselineMatrix,
  executeBaselineEvidenceChain,
  validateBaselineMatrix,
  validateBaselineCell,
  validatePrerequisiteEvidenceSet,
  validatePrerequisiteFreshness,
} = require("../../k4/baselineEvidence");
const { executeRun } = require("../../k4/runner");
const { K4_DATASET_DECLARATION } = require("../../k4/preflight");
const { finalizeRunArtifacts } = require("../../k4/runArtifacts");

const syntheticArtifactDirectories = new Set();
test.after(() => {
  for (const directory of syntheticArtifactDirectories) fs.rmSync(directory, { recursive: true, force: true });
});

const RAW_BODY = "{}\n";
const RAW_DIGEST = `sha256:${crypto.createHash("sha256").update(RAW_BODY).digest("hex")}`;

function attributionSource(cell, overrides = {}) {
  const rawSources = [{
    sourceIdentity: "retained-measurement-events",
    sourceDigest: RAW_DIGEST,
    body: RAW_BODY,
    truncated: false,
    rotationGap: false,
    ambiguousClock: false,
    coverageGaps: [],
    parseDiagnostics: [],
  }];
  return {
    schema: "k4-measurement-attribution-v1",
    runId: `${cell.cellId}-attempt-1`,
    scenario: cell.scenario,
    workloadDigest: cell.workload.digest,
    profileDigest: cell.profile.digest,
    topologyMembership: cell.topology === "single-replica" ? ["backend-1"] : ["backend-1", "backend-2", "backend-3"],
    sourceIdentity: "retained-measurement-events",
    sourceDigest: `sha256:${crypto.createHash("sha256").update(RAW_DIGEST).digest("hex")}`,
    parserVersion: "v1",
    measurementStart: "2026-08-16T00:00:02Z",
    measurementEnd: "2026-08-16T00:00:03Z",
    truncated: false,
    rotationGap: false,
    ambiguousClock: false,
    coverageGaps: [],
    parseDiagnostics: [],
    rawSources,
    ...overrides,
  };
}

function completeArtifactMetadata(cell) {
  const replicaCount = cell.topology === "single-replica" ? 1 : 3;
  const membership = cell.topology === "single-replica" ? ["backend-1"] : ["backend-1", "backend-2", "backend-3"];
  const effectiveRuntimeEvidence = {
    schema: "k4-effective-runtime-attestation-v1",
    status: "ATTESTED",
    source: "effective-runtime-attestation",
    resolvedTopology: { status: "ATTESTED", profile: cell.topology, backendReplicaCount: replicaCount, backendUpstreamMembership: membership, source: "effective-runtime-attestation" },
    observerBoundary: {
      status: "ATTESTED",
      source: "effective-runtime-attestation",
      observerIdentity: "container:observer-1",
      helperIdentity: "k4-observer:run",
      helperPolicyVersion: "k4-observer-helper-v1",
      helperSchemaVersion: "k4-observer-request-v1",
      observationNetworkMembership: { observer: ["k4-observation"], helper: ["k4-observation", "k4-backend"], runner: ["k4-workload"] },
      effectiveInspection: {
        runner: { containerId: "runner-1", mountTargets: [], environmentKeys: ["K4_BENCHMARK_PASSWORD"] },
        observer: { containerId: "observer-1", mountTargets: [], environmentKeys: ["K4_OBSERVER_TOKEN"] },
        helper: { containerId: "helper-1", mountTargets: [{ type: "bind", destination: "/var/run/docker.sock", readOnly: true }], environmentKeys: ["K4_OBSERVER_TOKEN"] },
      },
      deniedOperationDiagnostics: [
        { operation: "runner-backend-direct", status: "DENIED", source: "runner-diagnostic", observed: false },
        { operation: "runner-docker-api", status: "DENIED", source: "runner-diagnostic", observed: false },
        { operation: "runner-docker-socket", status: "DENIED", source: "docker-inspect", observed: false },
        { operation: "runner-observer-network", status: "DENIED", source: "docker-inspect", observed: false },
        { operation: "runner-observer-credential", status: "DENIED", source: "docker-inspect", observed: false },
      ],
      runnerAccess: { helper: false, helperCredential: false, dockerSocket: false, dockerApi: false, backend: false },
    },
  };
  return {
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    hardware: { hostname: "host", cpuModel: "cpu", logicalProcessors: 4, memoryBytes: 1024 },
    toolVersions: { node: "v22.14.0", k6: "not-used" },
    resolvedTopology: effectiveRuntimeEvidence.resolvedTopology,
    dependencyTopology: { mongo: "mongo:7", redis: "redis:alpine", rabbitmq: "rabbitmq:3-management-alpine", nginx: "repository-nginx", backend: "server:prod" },
    runnerPlacement: { service: "runner", network: "k4-workload", workloadTarget: "http://nginx" },
    runtimeConfiguration: { phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"], ingress: "nginx", imageSet: "fixed-images" },
    observerBoundary: effectiveRuntimeEvidence.observerBoundary,
    runtimeEvidenceArtifact: "runtime-provenance.raw.json",
    effectiveRuntimeEvidence,
  };
}

function measuredCell(cell, overrides = {}, artifactMetadata = completeArtifactMetadata(cell), runnerConfiguration = {}) {
  const runId = `${cell.cellId}-attempt-1`;
  const phases = {
    "setup/seed": {
      started: true, startedAt: "2026-08-16T00:00:00Z", completed: true, completedAt: "2026-08-16T00:00:01Z",
      output: { resourcesCreated: true, runScoped: true, cleanInitialState: true, datasetLifecycle: { status: "VERIFIED", runId, runScoped: true, ownerRunId: runId, initialState: "CLEAN", cleanInitialState: true, create: "completed", migrate: "completed", seed: "completed", verify: "VERIFIED" }, setupPreflight: { status: "WARMUP_ADMITTED", warmupAdmission: "WARMUP_ADMITTED", verification: { status: "VERIFIED" }, dataset: { declared: { generatorVersion: "k4-v1", schemaVersion: "schema-v1", contentSeed: "seed-v1", cardinalities: { users: 2 }, fingerprint: "sha256:dataset" }, observed: { generatorVersion: "k4-v1", schemaVersion: "schema-v1", contentSeed: "seed-v1", cardinalities: { users: 2 }, fingerprint: "sha256:dataset" } } } },
    },
    "warm-up": { started: true, startedAt: "2026-08-16T00:00:01Z", completed: true, completedAt: "2026-08-16T00:00:02Z" },
    measurement: { started: true, startedAt: "2026-08-16T00:00:02Z", completed: true, completedAt: "2026-08-16T00:00:03Z", measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" }, output: { numbers: { p95: 42 }, measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" } } },
    teardown: { started: true, startedAt: "2026-08-16T00:00:03Z", completed: true, completedAt: "2026-08-16T00:00:04Z" },
  };
  const base = {
    ...cell,
    attemptId: runId,
    outcome: "MEASURED",
    artifact_status: "COMPLETED",
    execution_outcome: "MEASURED",
    qualification_flags: [],
    phases,
    measurement: { rawArtifact: `${cell.cellId}.raw.json`, numbers: { p95: 42 }, window: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" } },
    artifacts: { sourceInventorySha256: "sha256:source", bundleInventorySha256: "sha256:bundle" },
    marker: { artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [], source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle" },
    bundle: { entries: [{ path: "source-inventory.json" }, { path: "report.json" }] },
    sourceInventory: { entries: [{ path: "manifest.json", sha256: "sha256:manifest" }, { path: "measurement.raw.json", sha256: "sha256:raw" }] },
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
    provenance: {
      commit: "commit-1",
      hardware: { cpu: "cpu-1", memory: "memory-1" },
      runnerPlacement: "k4-runner",
      nonTopologyConfiguration: { env: "same" },
    },
    ...overrides,
  };
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-cell-"));
  syntheticArtifactDirectories.add(resultDirectory);
  fs.writeFileSync(path.join(resultDirectory, "measurement.raw.json"), "{}\n", { flag: "wx" });
  const artifacts = finalizeRunArtifacts({
    plan: {
      runId,
      resultDirectory,
      profile: cell.topology,
      topology: { profile: cell.topology, backendReplicaCount: cell.topology === "single-replica" ? 1 : 3, backendUpstreamMembership: cell.topology === "single-replica" ? ["backend-1"] : ["backend-1", "backend-2", "backend-3"] },
      workload: { scenario: cell.scenario, version: 2, digest: cell.profile.digest, snapshot: cell.profile.snapshot },
      runner: { placement: "k4-runner", workloadTarget: "http://nginx", dockerManagement: false, ...runnerConfiguration },
      phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"],
    },
    result: { artifact_status: base.artifact_status, execution_outcome: base.execution_outcome, qualificationFlags: base.qualification_flags, phases: base.phases, cleanup: { attempted: true, completed: true, ownershipSafe: true } },
    metadata: artifactMetadata,
  });
  const read = (name) => JSON.parse(fs.readFileSync(path.join(resultDirectory, name), "utf8"));
  const manifest = read("manifest.json");
  return {
    ...base,
    dataset: { ...manifest.dataset, digest: manifest.dataset.digest || manifest.dataset.fingerprint },
    provenance: {
      commit: manifest.commitSha,
      hardware: manifest.testMachine,
      runnerPlacement: manifest.configuration.runnerPlacement || manifest.configuration.runner?.placement || manifest.configuration.runner,
      nonTopologyConfiguration: manifest.configuration,
    },
    resultDirectory,
    artifacts: { ...base.artifacts, ...artifacts, verification: artifacts.verification },
    artifactVerification: artifacts.verification,
    marker: read("COMPLETED"),
    bundle: read("bundle-inventory.json"),
    sourceInventory: read("source-inventory.json"),
  };
}

test("Issue 89 baseline matrix resolves all six mandatory profile/topology cells", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89" });
  assert.equal(matrix.length, 6);
  assert.deepEqual(matrix.map((cell) => cell.cellId), BASELINE_MATRIX.map((cell) => cell.cellId));
  for (const cell of matrix) {
    assert.match(cell.attemptId, /^issue89-/);
    assert.equal(cell.profile.scenario, cell.scenario);
    assert.equal(cell.profile.version, 2);
    assert.match(cell.profile.digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(cell.workload.digest, cell.profile.digest);
  }
});

test("Issue 89 matrix rejects an omitted cell and rejects copied single topology evidence", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89" });
  const records = matrix.map((cell) => measuredCell(cell));
  const missing = validateBaselineMatrix(records.slice(0, -1));
  assert.equal(missing.valid, false);
  assert.match(missing.diagnostics.join(" "), /missing/i);

  const multi = records.find((record) => record.topology === "multi-replica");
  multi.topologyEvidence = { replicaCount: 1, upstreamMembership: ["backend-1"] };
  const invalid = validateBaselineMatrix(records);
  assert.equal(invalid.valid, false);
  assert.match(invalid.diagnostics.join(" "), /topology|replica|equivalent/i);
});

test("Issue 89 lifecycle validation is fail-closed for FAILED_SETUP and NOT_RUN", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89" });
  const failedSetup = {
    ...matrix[0],
    attemptId: "issue89-failed-1",
    outcome: "FAILED_SETUP",
    artifact_status: "INCOMPLETE",
    execution_outcome: "FAILED_SETUP",
    qualification_flags: [],
    failure: { phase: "setup/seed", reason: "seed unavailable" },
    cleanup: { attempted: true, completed: true, ownershipSafe: true },
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
    provenance: { commit: "commit-1", hardware: { cpu: "cpu-1" }, runnerPlacement: "k4-runner", nonTopologyConfiguration: { env: "same" } },
  };
  assert.equal(validateBaselineCell(failedSetup).valid, true);

  const notRun = {
    ...matrix[1],
    attemptId: "issue89-not-run-1",
    outcome: "NOT_RUN",
    artifact_status: "INCOMPLETE",
    execution_outcome: "NOT_RUN",
    qualification_flags: [],
    reason: "multi-replica image set unavailable",
    cleanup: { attempted: true, completed: true, ownershipSafe: true, noResources: true },
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
  };
  assert.equal(validateBaselineCell(notRun).valid, true);
  assert.equal(validateBaselineCell({ ...notRun, measurement: { p95: 12 } }).valid, false);
});

test("Issue 89 qualification flags are claim-type specific and topology claims require observation evidence", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-claims" })[0];
  const record = measuredCell(cell, {
    qualification_flags: ["TARGET_NOT_REACHED", "LOAD_GENERATOR_LIMITED"],
    phases: {
      ...measuredCell(cell).phases,
      measurement: { ...measuredCell(cell).phases.measurement, output: { numbers: { p95: 42 }, observation: { claimEvidence: { multiReplica: false } } } },
    },
    measurement: { numbers: { p95: 42 } },
    marker: { ...measuredCell(cell).marker, qualification_flags: ["TARGET_NOT_REACHED", "LOAD_GENERATOR_LIMITED"] },
  });
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(record, "latency").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(record, "targetConcurrency").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(record, "bottleneck").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(record, "multiReplica").eligible, false);
});

test("Issue 89 attribution claims fail closed without complete production attribution evidence", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-attribution" })[0];
  const record = measuredCell(cell, {
    topology: "multi-replica",
    topologyEvidence: { replicaCount: 3, upstreamMembership: ["backend-1", "backend-2", "backend-3"] },
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          numbers: { p95: 42 },
          observation: {
            replicaAttribution: {
              replicas: ["backend-1", "backend-2"],
              correlations: [{ senderReplica: "backend-1", receiverReplica: "backend-2", sampleEligible: true, deliveryEligible: true }],
            },
            claimEvidence: { multiReplica: true, crossReplica: true },
          },
        },
      },
    },
  });
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(record, "multiReplica").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell({ ...record, scenario: "message", domain: "message" }, "crossReplica").eligible, false);
});

test("Issue 89 attribution rejects complete-shaped evidence from another run or window", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-attribution-boundary" })[0];
  const record = measuredCell(cell, {
    topology: "multi-replica",
    topologyEvidence: { replicaCount: 3, upstreamMembership: ["backend-1", "backend-2", "backend-3"] },
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          numbers: { p95: 42 },
          measuredRequestIds: ["r1", "r2"],
          observation: {
            replicaAttribution: {
              schema: "k4-measurement-attribution-v1",
              complete: true,
              source: {
                runId: "foreign-run",
                sourceIdentity: "nginx",
                sourceDigest: "sha256:source",
                parserVersion: "v1",
                measurementStart: "2026-08-15T00:00:00Z",
                measurementEnd: "2026-08-15T00:00:01Z",
                truncated: false,
                rotationGap: false,
                parseDiagnostics: [],
              },
              replicas: ["backend-1", "backend-2"],
              supportingRecords: [{ requestId: "r1" }],
            },
          },
        },
      },
    },
  });
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(record, "multiReplica").eligible, false);
});

test("Issue 89 measured admission requires every clean lifecycle step", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-lifecycle-proof" })[0];
  const valid = measuredCell(cell);
  for (const missing of ["create", "migrate", "seed", "verify"]) {
    const lifecycle = { ...valid.phases["setup/seed"].output.datasetLifecycle };
    delete lifecycle[missing];
    const invalid = { ...valid, phases: { ...valid.phases, "setup/seed": { ...valid.phases["setup/seed"], output: { ...valid.phases["setup/seed"].output, datasetLifecycle: lifecycle } } } };
    assert.equal(validateBaselineCell(invalid).valid, false, missing);
  }
});

test("Issue 89 lifecycle rejects missing deterministic seed verification and malformed phase order", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-lifecycle" })[0];
  const valid = measuredCell(cell);
  const missingSeed = {
    ...valid,
    resultDirectory: undefined,
    artifacts: { ...valid.artifacts, resultDirectory: undefined },
    phases: { ...valid.phases, "setup/seed": { ...valid.phases["setup/seed"], output: { resourcesCreated: true, setupPreflight: { verification: { status: "VERIFIED" }, dataset: { identity: "only-size", size: { totalDocuments: 1 } } } } } },
  };
  const missingSeedValidation = validateBaselineCell(missingSeed);
  assert.equal(missingSeedValidation.valid, false);
  assert.equal(missingSeedValidation.outcome, "FAILED_SETUP");
  assert.match(missingSeedValidation.diagnostics.join(" "), /dataset|seed|generator/i);
  const malformed = {
    ...valid,
    resultDirectory: undefined,
    artifacts: { ...valid.artifacts, resultDirectory: undefined },
    phases: { ...valid.phases, teardown: { ...valid.phases.teardown, startedAt: "2026-08-16T00:00:01Z", completedAt: "2026-08-16T00:00:01.500Z" } },
  };
  assert.equal(validateBaselineCell(malformed).valid, false);
  assert.match(validateBaselineCell(malformed).diagnostics.join(" "), /order|teardown|measurement/i);
});

test("Issue 89 deterministic dataset evidence requires the current run owner", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-owner" })[0];
  const valid = measuredCell(cell);
  const foreignOwner = {
    ...valid,
    phases: {
      ...valid.phases,
      "setup/seed": {
        ...valid.phases["setup/seed"],
        output: {
          ...valid.phases["setup/seed"].output,
          datasetLifecycle: { runScoped: true, ownerRunId: "foreign-run", initialState: "CLEAN" },
        },
      },
    },
  };
  assert.equal(validateBaselineCell(foreignOwner).valid, false);
  assert.match(validateBaselineCell(foreignOwner).diagnostics.join(" "), /owner|run/i);
});

test("Issue 89 report retains measurement numbers and per-cell source/bundle/raw provenance", () => {
  const cell = measuredCell(createBaselineMatrix({ runIdPrefix: "issue89-report" })[0]);
  const report = require("../../k4/baselineEvidence").buildBaselineReport({ matrix: [cell, ...createBaselineMatrix({ runIdPrefix: "issue89-report" }).slice(1).map((entry) => measuredCell(entry))] });
  const output = report.baselineMatrix[0];
  assert.deepEqual(output.measurement.numbers, { p95: 42 });
  assert.equal(output.provenance.runId, output.attemptId);
  assert.match(output.provenance.source_inventory_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(output.provenance.bundle_inventory_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Array.isArray(output.provenance.rawArtifactDigests), true);
});

test("Issue 89 baseline admission rejects a completion marker from another run", () => {
  const cell = measuredCell(createBaselineMatrix({ runIdPrefix: "issue89-cross-run" })[0]);
  const invalid = validateBaselineCell({ ...cell, marker: { ...cell.marker, runId: "foreign-run" } });
  assert.equal(invalid.valid, false);
  assert.match(invalid.diagnostics.join(" "), /run ID|canonical/i);
});

test("Issue 89 measured admission requires canonical result-directory artifact verification", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-unbound" })[0];
  const invalid = measuredCell(cell);
  delete invalid.resultDirectory;
  delete invalid.artifacts;
  delete invalid.marker;
  delete invalid.bundle;
  delete invalid.sourceInventory;
  invalid.artifactVerification = { status: "VERIFIED", runId: `${cell.cellId}-attempt-1` };
  assert.equal(validateBaselineCell(invalid).valid, false);
  assert.match(validateBaselineCell(invalid).diagnostics.join(" "), /result directory|canonical|artifact/i);
});

test("Issue 89 topology equivalence preserves nested non-topology profile configuration", () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89-topology-profile" }).map((cell) => measuredCell(
    cell,
    {},
    completeArtifactMetadata(cell),
    { profile: cell.topology === "single-replica" ? "runner-a" : "runner-b" },
  ));
  const validation = validateBaselineMatrix(matrix);
  assert.equal(validation.valid, false);
  assert.match(validation.diagnostics.join(" "), /non-topology|configuration|profile/i);
});

test("Issue 89 prerequisite reuse requires pinned freshness and unchanged relevant lineage", () => {
  const base = {
    guideRevision: "k4-issue-85-r3",
    evaluationRunId: "tc85r3-human-approved-20260814",
    evaluationStatus: "PASSED",
    implementationIdentity: "merge-85",
    sourcePaths: ["scripts/k4/provenance.js"],
    sourceDigests: { "scripts/k4/provenance.js": "sha256:provenance" },
    contract: { name: "claim-eligibility-v1", digest: "sha256:contract" },
    current: {
      headCommit: "issue89-head",
      sourceDigests: { "scripts/k4/provenance.js": "sha256:provenance" },
      contract: { name: "claim-eligibility-v1", digest: "sha256:contract" },
      changedPaths: [],
      lineage: { status: "VERIFIED", mergeBase: "issue89-base", head: "issue89-head", commits: [{ sha: "issue89-commit" }], changedPaths: ["scripts/k4/provenance.js"] },
    },
  };
  assert.equal(validatePrerequisiteFreshness(base).status, "FRESH");
  const stale = validatePrerequisiteFreshness({ ...base, current: { ...base.current, changedPaths: ["scripts/k4/provenance.js"] } });
  assert.equal(stale.status, "STALE");
  assert.equal(stale.reusable, false);
  const refreshed = validatePrerequisiteFreshness({ ...base, current: { ...base.current, changedPaths: ["scripts/k4/provenance.js"], sourceDigests: { "scripts/k4/provenance.js": "sha256:new-provenance" } }, regression: { status: "PASSED", runId: "regression-89" } });
  assert.equal(refreshed.status, "FRESH_WITH_REGRESSION");
  assert.equal(refreshed.reusable, true);
  const set = validatePrerequisiteEvidenceSet({ prerequisites: [base], current: base.current });
  assert.equal(set.status, "FRESH");
  assert.equal(set.reusable, true);
});

test("Issue 89 runner retains setup failure reason and attempts cleanup even before resource admission", async () => {
  const trace = [];
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-cleanup-"));
  try {
    const result = await executeRun({ runId: "issue89-cleanup", resultDirectory, phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"] }, {
      executePhase: async (phase) => {
        trace.push(phase);
        if (phase === "setup/seed") throw new Error("seed failed before resource registration");
        if (phase === "teardown") return { cleanup: "attempted" };
        return {};
      },
    });
    assert.deepEqual(trace, ["setup/seed", "teardown"]);
    assert.equal(result.execution_outcome, "FAILED_SETUP");
    assert.equal(result.failure.error, "seed failed before resource registration");
    assert.equal(result.cleanup.attempted, true);
    assert.equal(result.cleanup.completed, true);
    assert.deepEqual(result.qualification_flags, []);
    const status = JSON.parse(fs.readFileSync(path.join(resultDirectory, "run-status.json"), "utf8"));
    assert.equal(status.failure.error, "seed failed before resource registration");
    assert.equal(status.cleanup.completed, true);
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("Issue 89 canonical retained loading accepts verified persisted FAILED_SETUP evidence", async () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-persisted-failed-setup" })[0];
  const runId = `${cell.cellId}-attempt-1`;
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-persisted-failed-setup-"));
  syntheticArtifactDirectories.add(resultDirectory);
  const plan = {
    runId,
    resultDirectory,
    profile: cell.topology,
    topology: {
      profile: cell.topology,
      backendReplicaCount: 1,
      backendUpstreamMembership: ["backend-1"],
    },
    workload: {
      scenario: cell.scenario,
      version: 2,
      digest: cell.profile.digest,
      snapshot: cell.profile.snapshot,
    },
    runner: { placement: "k4-runner", workloadTarget: "http://nginx", dockerManagement: false },
    phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"],
  };

  await executeRun(plan, {
    artifactMetadata: completeArtifactMetadata(cell),
    executePhase: async (phase) => {
      if (phase === "setup/seed") throw new Error("deterministic seed failed");
      if (phase === "teardown") return { cleanup: "attempted" };
      return {};
    },
  });

  const validation = validateBaselineCell({
    ...cell,
    attemptId: runId,
    resultDirectory,
  });
  assert.equal(validation.outcome, "FAILED_SETUP");
  assert.equal(validation.valid, true, validation.diagnostics.join("; "));
});

test("Issue 89 canonical retained loading accepts verified persisted NOT_RUN evidence", async () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-persisted-not-run" })[1];
  const runId = `${cell.cellId}-attempt-1`;
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-persisted-not-run-"));
  syntheticArtifactDirectories.add(resultDirectory);
  finalizeRunArtifacts({
    plan: {
      runId,
      resultDirectory,
      profile: cell.topology,
      topology: { profile: cell.topology, backendReplicaCount: 3, backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"] },
      workload: { scenario: cell.scenario, version: 2, digest: cell.profile.digest, snapshot: cell.profile.snapshot },
      runner: { placement: "k4-runner", workloadTarget: "http://nginx", dockerManagement: false },
      phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"],
    },
    result: {
      artifact_status: "INCOMPLETE",
      execution_outcome: "NOT_RUN",
      qualificationFlags: [],
      reason: "requested environment was unavailable",
      phases: {
        "setup/seed": { started: false, completed: false },
        "warm-up": { started: false, completed: false },
        measurement: { started: false, completed: false },
        teardown: { started: true, completed: true },
      },
      cleanup: { attempted: true, completed: true, ownershipSafe: true, noResources: true },
    },
    metadata: completeArtifactMetadata(cell),
  });

  const validation = validateBaselineCell({ ...cell, attemptId: runId, resultDirectory });
  assert.equal(validation.outcome, "NOT_RUN");
  assert.equal(validation.valid, true, validation.diagnostics.join("; "));
});

test("Issue 89 canonical retained loading rejects a forged NOT_RUN bundle-to-source link", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-forged-not-run-link" })[1];
  const runId = `${cell.cellId}-attempt-1`;
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-forged-not-run-link-"));
  syntheticArtifactDirectories.add(resultDirectory);
  finalizeRunArtifacts({
    plan: {
      runId,
      resultDirectory,
      profile: cell.topology,
      topology: { profile: cell.topology, backendReplicaCount: 3, backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"] },
      workload: { scenario: cell.scenario, version: 2, digest: cell.profile.digest, snapshot: cell.profile.snapshot },
      runner: { placement: "k4-runner", workloadTarget: "http://nginx", dockerManagement: false },
      phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"],
    },
    result: {
      artifact_status: "INCOMPLETE",
      execution_outcome: "NOT_RUN",
      qualificationFlags: [],
      reason: "requested environment was unavailable",
      phases: {
        "setup/seed": { started: false, completed: false },
        "warm-up": { started: false, completed: false },
        measurement: { started: false, completed: false },
        teardown: { started: true, completed: true },
      },
      cleanup: { attempted: true, completed: true, ownershipSafe: true, noResources: true },
    },
    metadata: completeArtifactMetadata(cell),
  });

  const bundlePath = path.join(resultDirectory, "bundle-inventory.json");
  const markerPath = path.join(resultDirectory, "COMPLETED");
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  bundle.source_inventory_sha256 = "sha256:forged-source-link";
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  const bundleDigest = `sha256:${crypto.createHash("sha256").update(fs.readFileSync(bundlePath)).digest("hex")}`;
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  marker.bundle_inventory_sha256 = bundleDigest;
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

  const validation = validateBaselineCell({ ...cell, attemptId: runId, resultDirectory });
  assert.equal(validation.valid, false);
  assert.match(validation.diagnostics.join(" "), /bundle.*source|source.*bundle|canonical artifact/i);
});

test("Issue 89 baseline matrix does not self-attest cleanup after an executor exception", async () => {
  const { runBaselineMatrix } = require("../../k4/baselineEvidence");
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89-executor-error" });
  const result = await runBaselineMatrix({ matrix, runCell: async () => { throw new Error("executor exploded"); } });
  assert.equal(result.valid, false);
  const failed = result.cells[0];
  assert.equal(failed.execution_outcome, "FAILED_SETUP");
  assert.equal(failed.cleanup.attempted, false);
  assert.equal(failed.cleanup.completed, false);
  assert.equal(failed.cleanup.ownershipSafe, false);
  assert.match(failed.cleanup.reason, /cleanup evidence was available/i);
});

test("Issue 89 runner marks explicit NOT_RUN without a measurement claim", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-not-run-"));
  try {
    const result = await executeRun({ runId: "issue89-not-run", resultDirectory }, {
      executePhase: async (phase) => {
        if (phase === "setup/seed") return { resourcesCreated: true };
        if (phase === "measurement") return { executionOutcome: "NOT_RUN", artifactStatus: "COMPLETED", numbers: { requests: 99 } };
        return {};
      },
    });
    assert.equal(result.execution_outcome, "NOT_RUN");
    assert.equal(result.publishable, undefined);
    const marker = JSON.parse(fs.readFileSync(path.join(resultDirectory, "COMPLETED"), "utf8"));
    assert.equal(marker.execution_outcome, "NOT_RUN");
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("Issue 89 CLI exposes mandatory matrix and fail-closed dossier seams", async () => {
  const original = process.argv;
  const originalWrite = process.stdout.write;
  const writes = [];
  process.stdout.write = (value) => { writes.push(value); return true; };
  try {
    process.argv = [process.execPath, "cli.js", "baseline-matrix", "--run-id-prefix", "issue89"];
    const { main } = require("../../k4/cli");
    await main();
    const matrixOutput = JSON.parse(writes.pop());
    assert.equal(matrixOutput.matrix.length, 6);
    process.argv = [process.execPath, "cli.js", "bottleneck-dossier", "--candidates-json", "[]"];
    await main();
    const dossierOutput = JSON.parse(writes.pop());
    assert.equal(dossierOutput.optimizationGate, "CLOSED");
  } finally {
    process.argv = original;
    process.stdout.write = originalWrite;
  }
});

test("Issue 89 evidence chain links matrix validation, report claims, and fail-closed interpretation", async () => {
  const matrix = createBaselineMatrix({ runIdPrefix: "issue89-chain" });
  const candidateCell = measuredCell(matrix.find((cell) => cell.cellId === "message:single-replica"), {
    phases: {
      ...measuredCell(matrix.find((cell) => cell.cellId === "message:single-replica")).phases,
      measurement: {
        ...measuredCell(matrix.find((cell) => cell.cellId === "message:single-replica")).phases.measurement,
        output: {
          ...measuredCell(matrix.find((cell) => cell.cellId === "message:single-replica")).phases.measurement.output,
          histogramEvidence: { snapshots: { backend: { before: {}, after: {} } }, aggregate: { buckets: [{ le: "1", count: 1 }], count: 1, sum: 0.5 } },
        },
      },
    },
  });
  const candidateRaw = candidateCell.sourceInventory.entries;
  const chain = await executeBaselineEvidenceChain({
    matrix,
    runCell: async (cell) => cell.cellId === candidateCell.cellId ? candidateCell : measuredCell(cell),
    candidates: [{
      id: "message-persistence",
      cellId: "message:single-replica",
      claimType: "latency",
      claimEligibility: { eligible: true },
      evidence: { digest: "sha256:message", source: "measurement.raw.json", runId: candidateCell.attemptId, measurementWindow: { start: "2026-08-16T00:00:00Z", end: "2026-08-16T00:00:01Z" }, provenance: { commit: "commit-1", runId: candidateCell.attemptId, source_inventory_sha256: candidateCell.artifacts.sourceInventorySha256, bundle_inventory_sha256: candidateCell.artifacts.bundleInventorySha256, rawArtifactDigests: candidateRaw }, verification: { status: "VERIFIED" }, source_inventory_sha256: candidateCell.artifacts.sourceInventorySha256, bundle_inventory_sha256: candidateCell.artifacts.bundleInventorySha256, rawArtifactDigests: candidateRaw },
      proposedTreatment: { name: "inspect-persistence-path" },
    }],
    selectedCandidateId: "message-persistence",
    historyScope: { status: "SCOPED", mergeBase: "base-89", head: "head-89", commits: [{ sha: "issue89" }], artifacts: [{ path: "report.json" }], lineage: { status: "VERIFIED", mergeBase: "base-89", head: "head-89", commits: [{ sha: "issue89" }], changedPaths: ["scripts/k4/baselineEvidence.js"] } },
  });
  assert.equal(chain.matrix.valid, true);
  assert.equal(chain.report.baselineMatrix.length, 6);
  assert.ok(chain.dossier.primaryBottleneckCandidate, JSON.stringify(chain.dossier));
  assert.equal(chain.dossier.primaryBottleneckCandidate.id, "message-persistence");
  assert.equal(chain.dossier.proposedTreatments.length, 1);
});

test("Issue 89 execute-baseline drives every matrix cell through the production seam", async () => {
  const { executeBaseline } = require("../../k4/cli");
  const calls = [];
  const phase = (start, end, output = {}) => ({ started: true, startedAt: start, completed: true, completedAt: end, output });
  const result = await executeBaseline({
    runIdPrefix: "issue89-exec",
    dataset: { identity: "dataset-1", size: { totalDocuments: 10 }, digest: "sha256:dataset" },
    executeProduction: async ({ plan }) => {
      calls.push({ runId: plan.runId, profile: plan.profile, scenario: plan.workload.scenario, digest: plan.workload.digest, topology: plan.topology });
      return {
        artifact_status: "COMPLETED",
        execution_outcome: "MEASURED",
        qualification_flags: [],
        provenance: { commit: "commit-1", hardware: { cpu: "cpu-1" }, runnerPlacement: "k4-runner", nonTopologyConfiguration: { env: "same" } },
        phases: {
          "setup/seed": phase("2026-08-16T00:00:00Z", "2026-08-16T00:00:01Z"),
          "warm-up": phase("2026-08-16T00:00:01Z", "2026-08-16T00:00:02Z"),
          measurement: phase("2026-08-16T00:00:02Z", "2026-08-16T00:00:03Z", { measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z" }, numbers: { requests: 1 } }),
          teardown: phase("2026-08-16T00:00:03Z", "2026-08-16T00:00:04Z"),
        },
        artifacts: { sourceInventorySha256: "sha256:source", bundleInventorySha256: "sha256:bundle" },
        marker: { artifact_status: "COMPLETED", execution_outcome: "MEASURED", qualification_flags: [], source_inventory_sha256: "sha256:source", bundle_inventory_sha256: "sha256:bundle" },
        bundle: { entries: [{ path: "source-inventory.json" }, { path: "report.json" }] },
        sourceInventory: { entries: [{ path: "manifest.json" }, { path: "measurement.raw.json" }] },
      };
    },
  });
  assert.equal(calls.length, 6);
  assert.deepEqual(new Set(calls.map((call) => call.scenario)), new Set(["sidebar", "message", "socket-concurrency"]));
  assert.deepEqual(calls.filter((call) => call.profile === "single-replica").map((call) => call.topology), [
    { profile: "single-replica", backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"] },
    { profile: "single-replica", backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"] },
    { profile: "single-replica", backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"] },
  ]);
  assert.deepEqual(calls.filter((call) => call.profile === "multi-replica").map((call) => call.topology), [
    { profile: "multi-replica", backendReplicaCount: 3, backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"] },
    { profile: "multi-replica", backendReplicaCount: 3, backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"] },
    { profile: "multi-replica", backendReplicaCount: 3, backendUpstreamMembership: ["backend-1", "backend-2", "backend-3"] },
  ]);
  assert.equal(result.matrix.cells.length, 6);
  assert.equal(result.dossier.optimizationGate, "CLOSED");
});

test("Issue 89 accepts a retained runner artifact chain only when marker and inventories are linked", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-issue89-chain-artifacts-"));
  try {
    const cell = createBaselineMatrix({ runIdPrefix: "issue89-artifact" })[0];
    const result = await executeRun({
      runId: cell.attemptId,
      resultDirectory,
      profile: cell.topology,
      topology: { profile: cell.topology, backendReplicaCount: cell.topology === "single-replica" ? 1 : 3, backendUpstreamMembership: cell.topology === "single-replica" ? ["backend-1"] : ["backend-1", "backend-2", "backend-3"] },
      runner: { workloadTarget: "http://nginx", placement: "k4-runner" },
      workload: { ...cell.workload, digest: cell.profile.digest },
    }, {
      artifactMetadata: completeArtifactMetadata(cell),
      executePhase: async (phase) => {
        if (phase === "setup/seed") return { resourcesCreated: true, runScoped: true, cleanInitialState: true, datasetLifecycle: { status: "VERIFIED", runId: cell.attemptId, runScoped: true, ownerRunId: cell.attemptId, initialState: "CLEAN", cleanInitialState: true, create: "completed", migrate: "completed", seed: "completed", verify: "VERIFIED" }, setupPreflight: { verification: { status: "VERIFIED" }, dataset: { identity: "dataset-1", fingerprint: K4_DATASET_DECLARATION.fingerprint, declared: K4_DATASET_DECLARATION, observed: K4_DATASET_DECLARATION, size: { cardinalities: K4_DATASET_DECLARATION.cardinalities, totalDocuments: 10 } } } };
        if (phase === "measurement") return { measurementWindow: { start: "2026-08-16T00:00:04Z", end: "2026-08-16T00:00:05Z" }, numbers: { requests: 1 }, claimEligibility: {} };
        return {};
      },
      clock: (() => { let tick = 0; return () => `2026-08-16T00:00:0${tick++}Z`; })(),
    });
    const read = (name) => JSON.parse(fs.readFileSync(path.join(resultDirectory, name), "utf8"));
    const validation = validateBaselineCell({
      ...cell,
      ...result,
      dataset: { identity: "dataset-1", fingerprint: "sha256:dataset", size: { totalDocuments: 10 } },
      artifacts: result.artifacts,
      manifest: read("manifest.json"),
      marker: read("COMPLETED"),
      bundle: read("bundle-inventory.json"),
      sourceInventory: read("source-inventory.json"),
    });
    assert.equal(validation.valid, true, validation.diagnostics.join("; "));
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("Issue 89 rejects in-memory claim overlays that differ from the verified retained run", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-canonical-overlay" })[0];
  const retained = measuredCell(cell);
  const forged = {
    ...retained,
    phases: {
      ...retained.phases,
      measurement: {
        ...retained.phases.measurement,
        output: { ...retained.phases.measurement.output, numbers: { p95: 9999 } },
      },
    },
    claimEligibility: { latency: { eligible: true, reasons: [] } },
  };
  const validation = validateBaselineCell(forged);
  assert.equal(validation.valid, false);
  assert.match(validation.diagnostics.join(" "), /canonical|retained|overlay/i);
});

test("Issue 89 claim eligibility requires claim-specific oracle evidence", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-oracle" }).find((entry) => entry.cellId === "message:single-replica");
  const generic = measuredCell(cell);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(generic, "latency").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(generic, "endToEndDelivery").eligible, false);
  const incompleteManifest = { ...generic, manifest: { ...generic.manifest, provenance: { status: "INCOMPLETE" }, commitSha: "unresolved", testMachine: {} } };
  assert.equal(validateBaselineCell(incompleteManifest).valid, false);
});

test("Issue 89 measured admission requires the complete environment and observer-boundary manifest", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-manifest" })[0];
  const complete = completeArtifactMetadata(cell);
  const valid = measuredCell(cell, {}, complete);
  assert.equal(validateBaselineCell(valid).valid, true, validateBaselineCell(valid).diagnostics.join("; "));

  for (const field of ["toolVersions", "resolvedTopology", "dependencyTopology", "runnerPlacement", "runtimeConfiguration", "observerBoundary", "effectiveRuntimeEvidence"]) {
    const incomplete = { ...complete };
    delete incomplete[field];
    const validation = validateBaselineCell(measuredCell(cell, {}, incomplete));
    assert.equal(validation.valid, false, `${field} omission must fail closed`);
    assert.ok(validation.diagnostics.length > 0, `${field} omission must retain a concrete diagnostic`);
  }

  const contradictory = {
    ...complete,
    observerBoundary: { ...complete.observerBoundary, runnerAccess: { helper: true, dockerSocket: false, dockerApi: false } },
  };
  const contradiction = validateBaselineCell(measuredCell(cell, {}, contradictory));
  assert.equal(contradiction.valid, false);
  assert.match(contradiction.diagnostics.join(" "), /runner.*helper|observer.*boundary/i);
});

test("Issue 89 sidebar multi-replica attribution binds measured request IDs and resolved membership", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-sidebar-attribution" }).find((entry) => entry.cellId === "sidebar:multi-replica");
  const valid = measuredCell(cell, {
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          ...measuredCell(cell).phases.measurement.output,
          measuredRequestIds: ["r1", "r2"],
          observation: {
            replicaAttribution: {
              schema: "k4-measurement-attribution-v1", complete: true,
              source: attributionSource(cell),
              replicas: ["backend-1", "backend-2"],
              supportingRecords: [{ requestId: "r1", nodeName: "backend-1", timestamp: "2026-08-16T00:00:02.100Z" }, { requestId: "r2", nodeName: "backend-2", timestamp: "2026-08-16T00:00:02.200Z" }],
            },
          },
        },
      },
    },
  });
  const eligibility = require("../../k4/baselineEvidence").claimEligibilityForCell(valid, "multiReplica");
  assert.equal(eligibility.eligible, true, eligibility.reasons.join("; "));
  const partial = { ...valid, phases: { ...valid.phases, measurement: { ...valid.phases.measurement, output: { ...valid.phases.measurement.output, measuredRequestIds: ["r1", "r2"], observation: { ...valid.phases.measurement.output.observation, replicaAttribution: { ...valid.phases.measurement.output.observation.replicaAttribution, supportingRecords: [valid.phases.measurement.output.observation.replicaAttribution.supportingRecords[0]] } } } } } };
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(partial, "multiReplica").eligible, false);
  const foreign = { ...valid, phases: { ...valid.phases, measurement: { ...valid.phases.measurement, output: { ...valid.phases.measurement.output, measuredRequestIds: ["foreign"] } } } };
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(foreign, "multiReplica").eligible, false);
});

test("Issue 89 attribution requires full half-open measurement coverage and timestamped sidebar requests", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-window" }).find((entry) => entry.cellId === "sidebar:multi-replica");
  const recordFor = (sourceOverrides, supportingRecords) => measuredCell(cell, {
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          ...measuredCell(cell).phases.measurement.output,
          measuredRequestIds: ["r1"],
          measuredActors: ["alice"],
          observation: {
            replicaAttribution: {
              schema: "k4-measurement-attribution-v1",
              complete: true,
              source: attributionSource(cell, sourceOverrides),
              replicas: ["backend-1", "backend-2"],
              supportingRecords,
            },
          },
        },
      },
    },
  });
  const rows = [{ requestId: "r1", actorRef: "alice", nodeName: "backend-1", timestamp: "2026-08-16T00:00:02.400Z" }, { requestId: "r2", actorRef: "alice", nodeName: "backend-2", timestamp: "2026-08-16T00:00:02.500Z" }];
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor({ measurementStart: "2026-08-16T00:00:02.250Z" }, rows), "multiReplica").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor({ coverageGaps: [{ start: "2026-08-16T00:00:02.400Z", end: "2026-08-16T00:00:02.500Z" }] }, rows), "multiReplica").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor({}, [{ ...rows[0], timestamp: undefined }, rows[1]]), "multiReplica").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor({}, [{ ...rows[0], timestamp: "2026-08-16T00:00:03Z" }, rows[1]]), "multiReplica").eligible, false);
});

test("Issue 89 attribution rejects omitted completeness diagnostics on source or raw source", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-completeness-fields" })
    .find((entry) => entry.cellId === "sidebar:multi-replica");
  const base = measuredCell(cell);
  const withAttribution = (source) => measuredCell(cell, {
    phases: {
      ...base.phases,
      measurement: {
        ...base.phases.measurement,
        output: {
          ...base.phases.measurement.output,
          measuredRequestIds: ["r1"],
          observation: {
            replicaAttribution: {
              schema: "k4-measurement-attribution-v1",
              complete: true,
              source,
              replicas: ["backend-1", "backend-2"],
              supportingRecords: [{ requestId: "r1", nodeName: "backend-1", timestamp: "2026-08-16T00:00:02.400Z" }],
            },
          },
        },
      },
    },
  });
  const valid = attributionSource(cell);
  const { parseDiagnostics: _sourceDiagnostics, ...sourceWithoutDiagnostics } = valid;
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(withAttribution(sourceWithoutDiagnostics), "multiReplica").eligible, false);

  const rawWithoutRotation = valid.rawSources.map(({ rotationGap: _rotationGap, ...raw }) => raw);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(
    withAttribution({ ...valid, rawSources: rawWithoutRotation }),
    "multiReplica",
  ).eligible, false);

  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(
    withAttribution({ ...valid, parseDiagnostics: [{ kind: "aggregate-only-diagnostic" }] }),
    "multiReplica",
  ).eligible, false);
});

test("Issue 89 sidebar attribution uses retained wrapper timestamp when access time is second-rounded", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-sidebar-wrapper-time" })
    .find((entry) => entry.cellId === "sidebar:single-replica");
  const base = measuredCell(cell);
  const measured = measuredCell(cell, {
    phases: {
      ...base.phases,
      measurement: {
        ...base.phases.measurement,
        measurementWindow: { start: "2026-08-16T00:00:02.250Z", end: "2026-08-16T00:00:03Z" },
        output: {
          ...base.phases.measurement.output,
          measurementWindow: { start: "2026-08-16T00:00:02.250Z", end: "2026-08-16T00:00:03Z" },
          measuredRequestIds: ["request-1", "request-2"],
          measuredActors: ["alice"],
          observation: {
            replicaAttribution: {
              after: {
                schema: "k4-measurement-attribution-v1",
                complete: true,
                claimEligible: true,
                source: attributionSource(cell, { measurementStart: "2026-08-16T00:00:02.250Z" }),
                supportingRecords: [
                  {
                    requestId: "request-1",
                    actorRef: "alice",
                    nodeName: "backend-1",
                    timestamp: "2026-08-16T00:00:02.000Z",
                    wrapperTimestamp: "2026-08-16T00:00:02.300Z",
                  },
                  {
                    requestId: "request-2",
                    actorRef: "alice",
                    nodeName: "backend-1",
                    timestamp: "2026-08-16T00:00:02.800Z",
                    wrapperTimestamp: "2026-08-16T00:00:03.500Z",
                  },
                ],
              },
            },
          },
        },
      },
    },
  });
  const latency = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "latency");
  assert.equal(latency.eligible, true, latency.reasons.join("; "));
});

test("Issue 89 socket attribution accepts authenticated pre-window lifetimes and rejects disconnect-at-start", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-socket-attribution" }).find((entry) => entry.cellId === "socket-concurrency:multi-replica");
  const recordFor = (lifecycles) => measuredCell(cell, {
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          ...measuredCell(cell).phases.measurement.output,
          measuredActors: ["alice", "bob"],
          measuredConnections: [{ socketId: "socket-a", actorRef: "alice" }, { socketId: "socket-b", actorRef: "bob" }],
          observation: {
            replicaAttribution: {
              schema: "k4-measurement-attribution-v1",
              complete: true,
              source: attributionSource(cell),
              replicas: ["backend-1", "backend-2"],
              supportingRecords: lifecycles,
            },
          },
        },
      },
    },
  });
  const valid = recordFor([
    { socketId: "socket-a", actorRef: "alice", nodeName: "backend-1", authenticatedAt: "2026-08-16T00:00:01Z", disconnectedAt: "2026-08-16T00:00:03Z" },
    { socketId: "socket-b", actorRef: "bob", nodeName: "backend-2", authenticatedAt: "2026-08-16T00:00:01.500Z", disconnectedAt: null, stillConnectedAtWindowEnd: true },
  ]);
  const eligibility = require("../../k4/baselineEvidence").claimEligibilityForCell(valid, "multiReplica");
  assert.equal(eligibility.eligible, true, eligibility.reasons.join("; "));
  const disconnectedAtStart = recordFor([
    { socketId: "socket-a", actorRef: "alice", nodeName: "backend-1", authenticatedAt: "2026-08-16T00:00:01Z", disconnectedAt: "2026-08-16T00:00:02Z" },
    { socketId: "socket-b", actorRef: "bob", nodeName: "backend-2", authenticatedAt: "2026-08-16T00:00:01.500Z", disconnectedAt: null, stillConnectedAtWindowEnd: true },
  ]);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(disconnectedAtStart, "multiReplica").eligible, false);
});

test("Issue 89 target concurrency is derived from the complete measured active-count series", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-target" }).find((entry) => entry.cellId === "socket-concurrency:single-replica");
  const recordFor = (activeConnections) => measuredCell(cell, {
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          ...measuredCell(cell).phases.measurement.output,
          targetConcurrency: 4,
          activeCountEvidence: { complete: true, targetConcurrency: 4, targetHeldThroughMeasurement: true },
          observation: {
            activeSocketGaugeEvidence: {
              complete: true,
              aggregates: activeConnections.map((count, index) => ({ point: `sample-${index}`, timestamp: `2026-08-16T00:00:02.${index + 1}00Z`, activeConnections: count })),
            },
          },
        },
      },
    },
  });
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor([1, 1]), "targetConcurrency").eligible, false);
  const held = require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor([4, 4]), "targetConcurrency");
  assert.equal(held.eligible, true, held.reasons.join("; "));
});

function declaredResourceEvidence(cell, successful = 10) {
  const replicas = cell.topology === "single-replica" ? ["backend-1"] : ["backend-1", "backend-2", "backend-3"];
  const requiredContainers = ["nginx", ...replicas, "runner"];
  const expectedCount = 10;
  const byContainer = Object.fromEntries(requiredContainers.map((container) => [container, {
    counts: { successful, error: 0, missing: expectedCount - successful, expected: expectedCount },
    coverage: successful / expectedCount,
    sufficient: successful >= 1 && successful / expectedCount >= 0.90,
  }]));
  return {
    measurementWindow: { start: "2026-08-16T00:00:02Z", end: "2026-08-16T00:00:03Z", boundary: "[measurement_start, measurement_end)" },
    intervalMs: 100,
    expectedCount,
    requiredContainers,
    byContainer,
    qualificationFlags: successful >= 9 ? [] : ["OBSERVATION_INCOMPLETE"],
  };
}

test("Issue 89 resource claims fail closed when canonical measurement resource evidence is omitted", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-resource-omitted" }).find((entry) => entry.cellId === "socket-concurrency:single-replica");
  const measured = measuredCell(cell);
  const resource = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "resource");
  assert.equal(resource.eligible, false);
  assert.match(resource.reasons.join(" "), /OBSERVATION_INCOMPLETE|resourceEvidence/i);
  const nonCanonicalOverlay = { ...measured, resourceEvidence: declaredResourceEvidence(cell) };
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(nonCanonicalOverlay, "resource").eligible, false);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "latency").eligible, true);
});

test("Issue 89 resource claims derive OBSERVATION_INCOMPLETE below ninety-percent declared coverage", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-resource-under-coverage" }).find((entry) => entry.cellId === "socket-concurrency:single-replica");
  const base = measuredCell(cell);
  const measured = measuredCell(cell, {
    phases: {
      ...base.phases,
      measurement: {
        ...base.phases.measurement,
        output: {
          ...base.phases.measurement.output,
          observation: { resourceEvidence: declaredResourceEvidence(cell, 8) },
        },
      },
    },
  });
  const resource = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "resource");
  assert.equal(resource.eligible, false);
  assert.match(resource.reasons.join(" "), /OBSERVATION_INCOMPLETE|90%|coverage/i);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "latency").eligible, true);
});

test("Issue 89 OBSERVATION_INCOMPLETE preserves complete black-box message latency evidence", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-latency-observation-gap" }).find((entry) => entry.cellId === "message:single-replica");
  const incompleteRuntime = completeArtifactMetadata(cell);
  incompleteRuntime.effectiveRuntimeEvidence = { schema: "k4-effective-runtime-attestation-v1", status: "INCOMPLETE", source: "effective-runtime-attestation", reason: "observer boundary unavailable" };
  incompleteRuntime.resolvedTopology = { status: "INCOMPLETE", source: "effective-runtime-attestation" };
  incompleteRuntime.observerBoundary = { status: "INCOMPLETE", source: "effective-runtime-attestation" };
  const base = measuredCell(cell);
  const measured = measuredCell(cell, {
    phases: {
      ...base.phases,
      measurement: {
        ...base.phases.measurement,
        output: {
          ...base.phases.measurement.output,
          histogramEvidence: {
            snapshots: { backend: { before: {}, after: {} } },
            aggregate: { buckets: [{ le: "1", count: 1 }], count: 1, sum: 0.5 },
          },
        },
      },
    },
  }, incompleteRuntime);

  assert.equal(validateBaselineCell(measured).valid, false);
  const latency = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "latency");
  assert.equal(latency.eligible, true, latency.reasons.join("; "));
  const resource = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "resource");
  assert.equal(resource.eligible, false);
  assert.match(resource.reasons.join(" "), /OBSERVATION_INCOMPLETE|provenance|resource/i);
});

test("Issue 89 resource claims reject an expectedCount that disagrees with the measurement window cadence", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-resource-cadence" }).find((entry) => entry.cellId === "socket-concurrency:single-replica");
  const resourceEvidence = declaredResourceEvidence(cell, 1);
  resourceEvidence.expectedCount = 1;
  resourceEvidence.byContainer = Object.fromEntries(Object.entries(resourceEvidence.byContainer).map(([container]) => [container, {
    counts: { successful: 1, error: 0, missing: 0, expected: 1 },
    coverage: 1,
    sufficient: true,
  }]));
  resourceEvidence.qualificationFlags = [];
  const base = measuredCell(cell);
  const measured = measuredCell(cell, {
    phases: {
      ...base.phases,
      measurement: {
        ...base.phases.measurement,
        output: {
          ...base.phases.measurement.output,
          observation: { resourceEvidence },
        },
      },
    },
  });
  const resource = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "resource");
  assert.equal(resource.eligible, false);
  assert.match(resource.reasons.join(" "), /expectedCount|cadence|measurement window/i);
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "latency").eligible, true);
});

test("Issue 89 resource window comparison accepts epoch runner bounds against ISO canonical evidence", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-resource-window-representation" })
    .find((entry) => entry.cellId === "socket-concurrency:single-replica");
  const base = measuredCell(cell);
  const start = Date.parse("2026-08-16T00:00:02Z");
  const end = Date.parse("2026-08-16T00:00:03Z");
  const measured = measuredCell(cell, {
    phases: {
      ...base.phases,
      measurement: {
        ...base.phases.measurement,
        measurementWindow: undefined,
        output: {
          measurementStart: start,
          measurementEnd: end,
          observation: { resourceEvidence: declaredResourceEvidence(cell, 10) },
        },
      },
    },
    measurement: { window: undefined },
  });
  const resource = require("../../k4/baselineEvidence").claimEligibilityForCell(measured, "resource");
  assert.equal(resource.eligible, true, resource.reasons.join("; "));
});

test("Issue 89 recipient delivery requires strict sender, success ack realId, receiver, and delivery identity correlation", () => {
  const cell = createBaselineMatrix({ runIdPrefix: "issue89-delivery" }).find((entry) => entry.cellId === "message:single-replica");
  const recordFor = (ids) => measuredCell(cell, {
    phases: {
      ...measuredCell(cell).phases,
      measurement: {
        ...measuredCell(cell).phases.measurement,
        output: {
          ...measuredCell(cell).phases.measurement.output,
          measuredActors: { sender: "alice", recipient: "bob" },
          observation: {
            replicaAttribution: {
              schema: "k4-measurement-attribution-v1",
              complete: true,
              scenario: "message",
              source: attributionSource(cell),
              correlations: [{
                schema: "k4-measurement-attribution-v1",
                complete: true,
                source: attributionSource(cell),
                eventChain: {
                  sender: { event: "message_sender", timestamp: "2026-08-16T00:00:02.100Z", correlationId: "corr-1", actorRef: "alice", recipientRef: "bob", conversationId: "legacy-1", replica: "backend-1" },
                  acknowledgement: { event: "message_acknowledgement", timestamp: "2026-08-16T00:00:02.200Z", correlationId: "corr-1", actorRef: "alice", recipientRef: "bob", conversationId: "legacy-1", success: true, realId: ids.ack },
                  receiver: { event: "message_receiver", timestamp: "2026-08-16T00:00:02.300Z", correlationId: "corr-1", actorRef: "bob", senderRef: "alice", conversationId: "legacy-1", messageId: ids.receiver, replica: "backend-1" },
                  delivery: { event: "getMessage", timestamp: "2026-08-16T00:00:02.400Z", correlationId: "corr-1", senderId: "alice", recipientId: "bob", conversationId: "legacy-1", messageId: ids.delivery, success: true },
                },
              }],
            },
          },
        },
      },
    },
  });
  assert.equal(require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor({ ack: "message-a", receiver: "message-b", delivery: "message-c" }), "endToEndDelivery").eligible, false);
  const matched = require("../../k4/baselineEvidence").claimEligibilityForCell(recordFor({ ack: "message-a", receiver: "message-a", delivery: "message-a" }), "endToEndDelivery");
  assert.equal(matched.eligible, true, matched.reasons.join("; "));
});
