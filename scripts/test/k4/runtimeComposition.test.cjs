const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createRuntimeComposition,
  captureEffectiveRuntimeEvidence,
  executeRunnerWorkload,
  runnerPhaseArgs,
  teardownOwnedRun,
} = require("../../k4/runtimeComposition");
const { executeRun } = require("../../k4/runner");

function plan(scenario = "sidebar") {
  const profile = require("../../k4/workloadProfiles").approvedWorkloadProfile(scenario, 2);
  return {
    runId: "runtime-composition",
    projectName: "kittachat-k4-runtime-composition",
    composeFile: "docker-compose.k4.yml",
    backendReplicaCount: 1,
    backendUpstreamMembership: ["backend-1"],
    topology: {
      profile: "single-replica",
      backendReplicaCount: 1,
      backendUpstreamMembership: ["backend-1"],
    },
    resultDirectory: "C:/tmp/k4/runtime-composition",
    workload: { ...profile, bytes: undefined, metadata: { label: "review" } },
  };
}

function lifecycleEvidence(runId = "runtime-composition") {
  return {
    runId,
    lifecycle: {
      status: "VERIFIED",
      ownerRunId: runId,
      runScoped: true,
      cleanInitialState: true,
      initialState: "CLEAN",
      create: "completed",
      migrate: "completed",
      seed: "completed",
      verify: "VERIFIED",
    },
  };
}

function effectiveSnapshotWithBackendNetwork(networkSet = ["k4-backend"]) {
  const services = {
    runner: { networks: ["k4-workload"] },
    nginx: { networks: ["k4-workload", "k4-backend"] },
    backend: { networks: ["k4-backend"], ports: [] },
    mongo: { networks: ["k4-backend"] },
    redis: { networks: ["k4-backend"] },
    rabbitmq: { networks: ["k4-backend"] },
  };
  return {
    effective_spec: {
      compose: { services },
      imageIdentities: { backend: "backend-image" },
      configFingerprints: {},
      runnerTool: { node: "v22.14.0" },
      backend_replica_count: 1,
      backend_upstream_membership: ["backend-1"],
    },
    runtime_attestation: {
      networkSets: {
        runner: ["k4-workload"],
        nginx: ["k4-workload", "k4-backend"],
        backend: ["k4-backend"],
        mongo: ["k4-backend"],
        redis: ["k4-backend"],
        rabbitmq: ["k4-backend"],
      },
      backendReplicas: [{ id: "backend-1", immutableImage: "backend-image", networkSet, publishedPorts: [] }],
      observerBoundary: { status: "ATTESTED", helperIdentity: "helper-runtime" },
    },
  };
}

function effectiveSnapshotWithObserverBoundary(helperMountTargets = ["/var/run/docker.sock"]) {
  const snapshot = effectiveSnapshotWithBackendNetwork();
  snapshot.effective_spec.compose.services.observer = { networks: ["k4-observation"], environment: { K4_OBSERVER_TOKEN: "observer-token" }, volumes: [] };
  snapshot.effective_spec.compose.services["observer-helper"] = { networks: ["k4-observation", "k4-backend"], environment: { K4_OBSERVER_TOKEN: "observer-token" }, volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"] };
  snapshot.runtime_attestation.networkSets.observer = ["k4-observation"];
  snapshot.runtime_attestation.networkSets["observer-helper"] = ["k4-observation", "k4-backend"];
  snapshot.runtime_attestation.observerBoundary = {
    status: "ATTESTED",
    helperIdentity: "helper-runtime",
    observationNetworkMembership: {
      runner: ["k4-workload"],
      observer: ["k4-observation"],
      helper: ["k4-observation", "k4-backend"],
    },
    effectiveInspection: {
      runner: { containerId: "runner-1", mountTargets: [], environmentKeys: [] },
      observer: { containerId: "observer-1", mountTargets: [], environmentKeys: ["K4_OBSERVER_TOKEN"] },
      helper: { containerId: "helper-1", mountTargets: helperMountTargets.map((destination) => ({ destination })), environmentKeys: ["K4_OBSERVER_TOKEN"] },
    },
    deniedOperationDiagnostics: [
      { operation: "runner-backend-direct", status: "DENIED" },
      { operation: "runner-docker-api", status: "DENIED" },
    ],
    runnerAccess: { helper: false, helperCredential: false, dockerSocket: false, dockerApi: false, backend: false },
  };
  return snapshot;
}

function effectiveRuntimeEvidence(profile = "single-replica") {
  const replicaCount = profile === "multi-replica" ? 3 : 1;
  const membership = profile === "multi-replica" ? ["backend-1", "backend-2", "backend-3"] : ["backend-1"];
  return {
    schema: "k4-effective-runtime-attestation-v1",
    status: "ATTESTED",
    source: "effective-runtime-attestation",
    resolvedTopology: { status: "ATTESTED", profile, backendReplicaCount: replicaCount, backendUpstreamMembership: membership, source: "effective-runtime-attestation" },
    observerBoundary: {
      status: "ATTESTED",
      source: "effective-runtime-attestation",
      observerIdentity: "container:observer-1",
      helperIdentity: "k4-observer:runtime-composition",
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
}

test("production composition scopes secrets in memory and drives the approved lifecycle through runner and nginx", async () => {
  const trace = [];
  let suppliedEnvironment;
  const executeRunFn = async (resolvedPlan, { executePhase, observation }) => {
    assert.equal(resolvedPlan.workload.scenario, "sidebar");
    assert.equal(observation.id, "production-observation");
    const context = {
      plan: resolvedPlan,
      registerOwnedResource(resource) { trace.push(["owned", resource]); },
      ownedResources: () => [{ class: "run", id: resolvedPlan.runId }],
    };
    const setup = await executePhase("setup/seed", context);
    const warmup = await executePhase("warm-up", { ...context, ...setup });
    const measurement = await executePhase("measurement", { ...context, ...setup, ...warmup });
    const teardown = await executePhase("teardown", context);
    return { setup, warmup, measurement, teardown };
  };
  const runtime = createRuntimeComposition({
    executeRunFn,
    environment: {
      K4_IMAGE_SET_ID: "fixed-images",
      K4_BENCHMARK_EMAIL: "alice@kittachat.test",
      K4_BENCHMARK_PASSWORD: "memory-only-password",
    },
    randomBytes: (size) => Buffer.alloc(size, 7),
    setupPreflight: async ({ environment }) => {
      suppliedEnvironment = environment;
      trace.push(["setup", environment.K4_BENCHMARK_EMAIL]);
      return { ...lifecycleEvidence(), admission: { status: "FRESH" }, warmupAdmission: "WARMUP_ADMITTED", benchmarkActors: { alice: { id: "actor-alice", token: "secret-a" } } };
    },
    executeRunnerWorkload: async ({ phase, target, workload, actorRefs, actorSecrets }) => {
      assert.equal(actorSecrets.alice.token, "secret-a");
      trace.push([phase, target, workload.scenario, Object.keys(actorRefs)]);
      return phase === "measurement"
        ? { numbers: { requests: 2 }, measuredRequestIds: ["sidebar-1"], runnerShortfallSamples: [] }
        : { stable: true };
    },
    teardownOwnedRun: async ({ ownedResources }) => {
      trace.push(["teardown", ownedResources]);
      return { released: true };
    },
    observationFactory: ({ intervalMs, environment }) => {
      assert.equal(intervalMs, 250);
      assert.equal(environment.K4_OBSERVER_TOKEN, Buffer.alloc(32, 7).toString("hex"));
      return { id: "production-observation" };
    },
    observerBridgeFactory: ({ plan: suppliedPlan, environment }) => {
      assert.equal(suppliedPlan.runId, "runtime-composition");
      assert.match(environment.K4_OBSERVER_TOKEN, /^[a-f0-9]{64}$/);
      return { kind: "compose-observer-bridge" };
    },
    observationSourcesFactory: ({ helper }) => {
      assert.equal(helper.kind, "compose-observer-bridge");
      return { kind: "production-runtime-port" };
    },
    runtimeEvidenceFactory: async ({ plan: runtimePlan }) => effectiveRuntimeEvidence(runtimePlan.topology.profile),
  });

  const result = await runtime.executeProduction({ plan: plan(), intervalMs: 250 });

  assert.equal(suppliedEnvironment.K4_JWT_SECRET, Buffer.alloc(48, 7).toString("hex"));
  assert.equal(suppliedEnvironment.K4_OBSERVER_TOKEN, Buffer.alloc(32, 7).toString("hex"));
  assert.deepEqual(trace.map((entry) => entry[0]), ["setup", "owned", "warm-up", "measurement", "teardown"]);
  assert.equal(result.measurement.numbers.requests, 2);
  assert.equal(JSON.stringify(result).includes("secret-a"), false);
  for (const entry of trace.filter((item) => item[0] === "warm-up" || item[0] === "measurement")) {
    assert.equal(entry[1], "http://nginx");
  }
});

test("production entry forwards explicit non-secret test-machine provenance metadata", async () => {
  let received;
  const runtime = createRuntimeComposition({
    executeRunFn: async (_plan, options) => {
      received = options.artifactMetadata;
      return { executionOutcome: "COMPLETED" };
    },
    environment: {
      K4_IMAGE_SET_ID: "fixed-images",
      K4_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
      K4_BENCHMARK_PASSWORD: "memory-only-password",
      K4_TEST_MACHINE_HOSTNAME: "machine-86",
      K4_TEST_MACHINE_CPU_MODEL: "CPU-86",
      K4_TEST_MACHINE_LOGICAL_PROCESSORS: "12",
      K4_TEST_MACHINE_MEMORY_BYTES: "16438382592",
    },
    setupPreflight: async () => ({ ...lifecycleEvidence(), warmupAdmission: "WARMUP_ADMITTED", benchmarkActors: {} }),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
    observerBridgeFactory: () => ({}),
    observationSourcesFactory: () => ({}),
    runtimeEvidenceFactory: async ({ plan: runtimePlan }) => effectiveRuntimeEvidence(runtimePlan.topology.profile),
  });

  await runtime.executeProduction({ plan: plan() });

  assert.deepEqual(received.hardware, {
    hostname: "machine-86",
    cpuModel: "CPU-86",
    logicalProcessors: 12,
    memoryBytes: 16438382592,
  });
  assert.equal(JSON.stringify(received).includes("memory-only-password"), false);
});

test("production composition emits a complete measured provenance manifest", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(process.env.TEMP || process.cwd(), "k4-runtime-provenance-"));
  try {
    const runtime = createRuntimeComposition({
      environment: {
        K4_IMAGE_SET_ID: "fixed-images",
        K4_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
        K4_BENCHMARK_PASSWORD: "memory-only-password",
        K4_TEST_MACHINE_HOSTNAME: "machine-provenance",
        K4_TEST_MACHINE_CPU_MODEL: "CPU-provenance",
        K4_TEST_MACHINE_LOGICAL_PROCESSORS: "8",
        K4_TEST_MACHINE_MEMORY_BYTES: "8589934592",
      },
      setupPreflight: async () => ({ ...lifecycleEvidence(), warmupAdmission: "WARMUP_ADMITTED", benchmarkActors: {} }),
      executeRunnerWorkload: async ({ phase }) => ({ numbers: phase === "measurement" ? { requests: 1 } : undefined }),
      observationFactory: () => ({
        start: async () => {},
        finalize: async () => ({ qualificationFlags: [], claimEligibility: {} }),
      }),
      teardownOwnedRun: async () => ({ attempted: true, completed: true, ownershipSafe: true }),
      runtimeEvidenceFactory: async ({ plan: runtimePlan }) => effectiveRuntimeEvidence(runtimePlan.topology.profile),
    });
    const result = await runtime.executeProduction({ plan: { ...plan(), resultDirectory }, intervalMs: 250 });
    const manifest = JSON.parse(fs.readFileSync(path.join(resultDirectory, "manifest.json"), "utf8"));
    assert.equal(manifest.provenance.status, "COMPLETE");
    assert.deepEqual(manifest.toolVersions, { node: "v22.14.0", k6: "not-used" });
    assert.deepEqual(manifest.resolvedTopology, { status: "ATTESTED", profile: "single-replica", backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"], source: "effective-runtime-attestation" });
    assert.deepEqual(manifest.dependencyTopology, { mongo: "mongo:7", redis: "redis:alpine", rabbitmq: "rabbitmq:3-management-alpine", nginx: "kittachat-k4-nginx:fixed-images", backend: "kittachat-k4-backend:fixed-images" });
    assert.equal(manifest.runnerPlacement.service, "runner");
    assert.equal(manifest.runnerPlacement.workloadTarget, "http://nginx");
    assert.deepEqual(manifest.runtimeConfiguration.phaseSettings, ["setup/seed", "warm-up", "measurement", "teardown"]);
    assert.equal(manifest.runtimeConfiguration.ingress, "nginx");
    assert.equal(manifest.effectiveRuntimeEvidence.status, "ATTESTED");
    assert.equal(manifest.runtimeEvidenceArtifact, "runtime-provenance.raw.json");
    assert.equal(manifest.observerBoundary.status, "ATTESTED");
    assert.equal(manifest.observerBoundary.source, "effective-runtime-attestation");
    assert.equal(manifest.observerBoundary.runnerAccess.dockerSocket, false);
    assert.equal(manifest.observerBoundary.runnerAccess.dockerApi, false);
    assert.equal(manifest.observerBoundary.runnerAccess.backend, false);
    assert.equal(result.artifacts.verification.status, "PUBLISHABLE");
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("effective runtime provenance fails closed when inspected backend topology contradicts Compose", async () => {
  const result = await captureEffectiveRuntimeEvidence({
    plan: { runId: "runtime-attestation-gap", projectName: "kittachat-k4-runtime-attestation-gap", topology: { profile: "single-replica" } },
    environment: {},
    effectiveSnapshot: effectiveSnapshotWithBackendNetwork(["unexpected-network"]),
    observerBridge: { identity: async () => ({ helperIdentity: "helper-runtime", policyVersion: "k4-observer-helper-v1" }) },
  });

  assert.equal(result.status, "INCOMPLETE");
  assert.match(result.reason, /topology|network|effective runtime/i);
  assert.notEqual(result.resolvedTopology.status, "ATTESTED");
});

test("effective runtime provenance fails closed when observer mount evidence contradicts Compose", async () => {
  const result = await captureEffectiveRuntimeEvidence({
    plan: { runId: "runtime-observer-mount-gap", projectName: "kittachat-k4-runtime-observer-mount-gap", topology: { profile: "single-replica" } },
    environment: {},
    effectiveSnapshot: effectiveSnapshotWithObserverBoundary(["/unexpected-mount"]),
    observerBridge: { identity: async () => ({ helperIdentity: "helper-runtime", policyVersion: "k4-observer-helper-v1" }) },
  });

  assert.equal(result.status, "INCOMPLETE");
  assert.match(result.reason, /mount|observer|Compose/i);
});

test("production provenance does not self-attest when effective runtime evidence is unavailable", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(process.env.TEMP || process.cwd(), "k4-runtime-provenance-gap-"));
  try {
    const runtime = createRuntimeComposition({
      environment: {
        K4_IMAGE_SET_ID: "fixed-images",
        K4_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
        K4_BENCHMARK_PASSWORD: "memory-only-password",
        K4_TEST_MACHINE_HOSTNAME: "machine-provenance-gap",
        K4_TEST_MACHINE_CPU_MODEL: "CPU-provenance-gap",
        K4_TEST_MACHINE_LOGICAL_PROCESSORS: "8",
        K4_TEST_MACHINE_MEMORY_BYTES: "8589934592",
      },
      setupPreflight: async () => ({ ...lifecycleEvidence(), warmupAdmission: "WARMUP_ADMITTED", benchmarkActors: {} }),
      executeRunnerWorkload: async ({ phase }) => ({ numbers: phase === "measurement" ? { requests: 1 } : undefined }),
      observationFactory: () => ({
        start: async () => {},
        finalize: async () => ({ qualificationFlags: [], claimEligibility: {} }),
      }),
      teardownOwnedRun: async () => ({ attempted: true, completed: true, ownershipSafe: true }),
      runtimeEvidenceFactory: async () => ({
        schema: "k4-effective-runtime-attestation-v1",
        status: "INCOMPLETE",
        source: "effective-runtime-attestation",
        reason: "effective Compose inspection unavailable",
      }),
    });

    await runtime.executeProduction({ plan: { ...plan(), resultDirectory } });
    const manifest = JSON.parse(fs.readFileSync(path.join(resultDirectory, "manifest.json"), "utf8"));
    const marker = JSON.parse(fs.readFileSync(path.join(resultDirectory, "COMPLETED"), "utf8"));
    assert.notEqual(manifest.resolvedTopology?.status, "ATTESTED");
    assert.notEqual(manifest.observerBoundary?.status, "ATTESTED");
    assert.equal(manifest.effectiveRuntimeEvidence.status, "INCOMPLETE");
    assert.ok(marker.qualification_flags.includes("OBSERVATION_INCOMPLETE"));
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("production composition fails closed and uses the registered ownership ledger for teardown", async () => {
  const trace = [];
  const executeRunFn = async (resolvedPlan, { executePhase }) => {
    const owned = [];
    const context = {
      plan: resolvedPlan,
      registerOwnedResource(resource) { owned.push(resource); },
      ownedResources: () => [...owned],
    };
    await assert.rejects(executePhase("setup/seed", context), /setup\/preflight did not admit warm-up/);
    return executePhase("teardown", context);
  };
  const runtime = createRuntimeComposition({
    executeRunFn,
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 3),
    setupPreflight: async () => ({ warmupAdmission: "NOT_ADMITTED", status: "FAILED_SETUP", admission: { status: "FRESH" } }),
    executeRunnerWorkload: async () => assert.fail("workload must not run after failed setup"),
    teardownOwnedRun: async ({ ownedResources }) => {
      trace.push(ownedResources);
      return { released: true };
    },
    observationFactory: () => ({ id: "unused" }),
    runtimeEvidenceFactory: async ({ plan: runtimePlan }) => effectiveRuntimeEvidence(runtimePlan.topology.profile),
  });

  await runtime.executeProduction({ plan: plan() });
  assert.equal(trace.length, 1);
  assert.equal(trace[0][0].class, "run");
  assert.equal(trace[0][0].id, "runtime-composition");
});

test("production setup registers ownership before resource creation and preserves cleanup evidence after setup failure", async () => {
  const trace = [];
  const runtime = createRuntimeComposition({
    executeRunFn: (resolvedPlan, options) => executeRun(resolvedPlan, {
      ...options,
      executePhase: async (phase, context) => {
        if (phase === "setup/seed" && !context.__ownershipTraceWrapped) {
          const register = context.registerOwnedResource;
          context.registerOwnedResource = (resource) => { trace.push("registered"); register(resource); };
          context.__ownershipTraceWrapped = true;
        }
        return options.executePhase(phase, context);
      },
    }),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 4),
    admitProductionRun: async () => ({ status: "FRESH" }),
    setupPreflight: async () => { trace.push("create"); throw new Error("auth failed after compose create"); },
    teardownOwnedRun: async ({ ownedResources }) => {
      trace.push(["teardown", ownedResources]);
      return { attempted: true, released: true, completed: true, ownershipSafe: true, noResources: false };
    },
    observationFactory: () => ({}),
    observerBridgeFactory: () => ({}),
    observationSourcesFactory: () => ({}),
    runtimeEvidenceFactory: async () => ({ status: "INCOMPLETE" }),
  });
  const result = await runtime.executeProduction({ plan: { ...plan(), resultDirectory: "" } });
  assert.deepEqual(trace.map((entry) => Array.isArray(entry) ? entry[0] : entry), ["registered", "create", "teardown"]);
  assert.equal(result.failure.phase, "setup/seed");
  assert.equal(result.cleanup.completed, true);
  assert.equal(result.cleanup.ownershipSafe, true);
  assert.equal(result.cleanup.noResources, false);
  assert.equal(result.cleanup.attempted, true);
});

test("setup failure before resource creation retains no-resource cleanup semantics", async () => {
  const trace = [];
  const runtime = createRuntimeComposition({
    executeRunFn: (resolvedPlan, options) => executeRun(resolvedPlan, options),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 5),
    admitProductionRun: async () => ({ status: "FRESH" }),
    setupPreflight: async () => { throw new Error("health failed before compose resources existed"); },
    teardownOwnedRun: async ({ ownedResources }) => {
      trace.push(ownedResources);
      return { attempted: false, released: false, completed: true, ownershipSafe: true, noResources: true };
    },
    observationFactory: () => ({}),
    observerBridgeFactory: () => ({}),
    observationSourcesFactory: () => ({}),
    runtimeEvidenceFactory: async () => ({ status: "INCOMPLETE" }),
  });
  const result = await runtime.executeProduction({ plan: { ...plan(), resultDirectory: "" } });
  assert.equal(trace.length, 1);
  assert.equal(trace[0][0].class, "run");
  assert.equal(result.cleanup.completed, true);
  assert.equal(result.cleanup.ownershipSafe, true);
  assert.equal(result.cleanup.noResources, true);
  assert.equal(result.cleanup.attempted, true);
});

test("cleanup failure is retained as incomplete and unsafe after setup ownership registration", async () => {
  const runtime = createRuntimeComposition({
    executeRunFn: (resolvedPlan, options) => executeRun(resolvedPlan, options),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 6),
    admitProductionRun: async () => ({ status: "FRESH" }),
    setupPreflight: async () => { throw new Error("seed failed after create"); },
    teardownOwnedRun: async () => { throw new Error("cleanup failed"); },
    observationFactory: () => ({}),
    observerBridgeFactory: () => ({}),
    observationSourcesFactory: () => ({}),
    runtimeEvidenceFactory: async () => ({ status: "INCOMPLETE" }),
  });
  const result = await runtime.executeProduction({ plan: { ...plan(), resultDirectory: "" } });
  assert.equal(result.cleanup.completed, false);
  assert.equal(result.cleanup.ownershipSafe, false);
  assert.equal(result.cleanup.noResources, false);
  assert.match(result.cleanup.error, /cleanup failed/);
});

test("production composition has a closed approved-scenario adapter set", async () => {
  const runtime = createRuntimeComposition({
    executeRunFn: async () => assert.fail("invalid scenario must fail before lifecycle"),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 1),
    setupPreflight: async () => assert.fail("invalid scenario must fail before setup"),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
  });
  const customPlan = plan("sidebar");
  customPlan.workload.scenario = "custom";
  customPlan.workload.snapshot.scenario = "custom";
  await assert.rejects(runtime.executeProduction({ plan: customPlan }), /production workload adapter is unavailable/);
});

test("runner phase transport keeps credentials out of command arguments", () => {
  const args = runnerPhaseArgs(plan(), {
    phase: "measurement",
    workload: plan().workload,
    actorRefs: { alice: { id: "actor-alice" } },
  });
  const serialized = JSON.stringify(args);
  assert.doesNotMatch(serialized, /token|password|authorization/i);
  assert.match(serialized, /K4_ACTOR_REFS_B64/);
  assert.equal(serialized.includes("K4_ACTORS_B64"), false);
  assert.match(serialized, /K4_ACTOR_SECRETS_JSON/);
  assert.doesNotMatch(serialized, /secret-a/);
});

test("runner phase transports an allowlisted fault fixture only for measurement", () => {
  const measurement = JSON.stringify(runnerPhaseArgs(plan("message"), {
    phase: "measurement",
    workload: plan("message").workload,
    actorRefs: { alice: { id: "actor-alice" }, bob: { id: "actor-bob" } },
    faultFixture: "acknowledgement-failure",
  }));
  assert.match(measurement, /K4_FAULT_FIXTURE=acknowledgement-failure/);
  const warmup = JSON.stringify(runnerPhaseArgs(plan("message"), {
    phase: "warm-up",
    workload: plan("message").workload,
    actorRefs: { alice: { id: "actor-alice" }, bob: { id: "actor-bob" } },
    faultFixture: "acknowledgement-failure",
  }));
  assert.doesNotMatch(warmup, /K4_FAULT_FIXTURE/);
});

test("runner image packages the allowlist module used by the workload entrypoint", () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, "../../k4/runner/Dockerfile"), "utf8");
  assert.match(dockerfile, /COPY faultFixtures\.js \.\/faultFixtures\.js/);
});

test("runtime composition forwards the operational fixture to measurement only", async () => {
  const phases = [];
  const runtime = createRuntimeComposition({
    executeRunFn: async (_plan, { executePhase, observation }) => {
      const context = { registerOwnedResource() {}, ownedResources: () => [] };
      await executePhase("setup/seed", context);
      await executePhase("warm-up", context);
      await executePhase("measurement", context);
      await executePhase("teardown", context);
      return { observation, phases };
    },
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 2),
    setupPreflight: async () => ({
      ...lifecycleEvidence(),
      warmupAdmission: "WARMUP_ADMITTED",
      benchmarkActors: {
        alice: { id: "actor-alice", token: "alice-token" },
        bob: { id: "actor-bob", token: "bob-token" },
      },
    }),
    executeRunnerWorkload: async ({ phase, faultFixture }) => { phases.push([phase, faultFixture]); return {}; },
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({ id: "observation" }),
    observerBridgeFactory: () => ({}),
    observationSourcesFactory: () => ({}),
    runtimeEvidenceFactory: async ({ plan: runtimePlan }) => effectiveRuntimeEvidence(runtimePlan.topology.profile),
  });
  await runtime.executeProduction({ plan: plan("message"), faultFixture: "acknowledgement-failure" });
  assert.deepEqual(phases, [
    ["warm-up", undefined],
    ["measurement", "acknowledgement-failure"],
  ]);
});

test("production collision hard-fails before ownership, cleanup, execution, or artifact finalization", async () => {
  const resultDirectory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "k4-runtime-collision-"));
  const retainedPath = path.join(resultDirectory, "retained.json");
  fs.writeFileSync(retainedPath, "{\"prior\":true}\n", { flag: "wx" });
  const before = fs.readFileSync(retainedPath);
  let executeCalls = 0;
  let setupCalls = 0;
  let cleanupCalls = 0;
  try {
    const runtime = createRuntimeComposition({
      executeRunFn: async () => { executeCalls += 1; },
      admitProductionRun: async () => { throw new Error("result directory collision"); },
      environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
      setupPreflight: async () => { setupCalls += 1; },
      teardownOwnedRun: async () => { cleanupCalls += 1; },
      observationFactory: () => ({}),
      observerBridgeFactory: () => ({}),
      observationSourcesFactory: () => ({}),
    });
    const collidedPlan = { ...plan(), resultDirectory };
    await assert.rejects(runtime.executeProduction({ plan: collidedPlan }), /collision/i);
    assert.equal(executeCalls, 0);
    assert.equal(setupCalls, 0);
    assert.equal(cleanupCalls, 0);
    assert.deepEqual(fs.readFileSync(retainedPath), before);
    assert.deepEqual(fs.readdirSync(resultDirectory), ["retained.json"]);
  } finally {
    fs.rmSync(resultDirectory, { recursive: true, force: true });
  }
});

test("production composition fails closed when setup lifecycle ownership evidence is missing", async () => {
  const runtime = createRuntimeComposition({
    executeRunFn: async (_plan, { executePhase }) => {
      const context = { registerOwnedResource() {}, ownedResources: () => [] };
      await assert.rejects(executePhase("setup/seed", context), /lifecycle|run-scoped|clean/i);
      return { status: "FAILED_SETUP" };
    },
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    setupPreflight: async () => ({ warmupAdmission: "WARMUP_ADMITTED", benchmarkActors: {} }),
    executeRunnerWorkload: async () => assert.fail("workload must not run without lifecycle evidence"),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({ id: "unused" }),
    runtimeEvidenceFactory: async ({ plan: runtimePlan }) => effectiveRuntimeEvidence(runtimePlan.topology.profile),
  });
  await runtime.executeProduction({ plan: plan() });
});

test("production setup authenticates every v2 message actor through nginx", async () => {
  const { runApprovedSetupPreflight } = require("../../k4/runtimeComposition");
  const requestedEmails = [];
  const runtimePlan = plan("message");
  const result = await runApprovedSetupPreflight({
    plan: runtimePlan,
    environment: { K4_BENCHMARK_EMAIL: "alice@kittachat.test", K4_BENCHMARK_PASSWORD: "memory-only" },
    setupEvidence: lifecycleEvidence(runtimePlan.runId),
    freshAdmission: () => ({ status: "FRESH", runId: runtimePlan.runId }),
    dockerCommand: (args, { env }) => {
      const command = args.join(" ");
      if (command.includes("k4VerifyDataset")) return JSON.stringify(require("../../k4/preflight").K4_DATASET_DECLARATION);
      if (command.includes("api/auth/login")) {
      const bobEmail = args.find((entry) => entry.startsWith("K4_BOB_EMAIL="))?.split("=")[1];
      const email = bobEmail || env.K4_BOB_EMAIL || env.K4_BENCHMARK_EMAIL;
        requestedEmails.push(email);
        const name = email.startsWith("bob") ? "bob" : "alice";
        return JSON.stringify({ token: `${name}-token`, user: { id: `${name}-id` } });
      }
      return "socket-authenticated";
    },
  });
  assert.deepEqual(requestedEmails, ["alice@kittachat.test", "bob@kittachat.test"]);
  assert.deepEqual(Object.keys(result.benchmarkActors), ["alice", "bob"]);
  assert.equal(result.dataset.identity, result.dataset.observed.fingerprint);
  assert.deepEqual(result.dataset.size.cardinalities, result.dataset.observed.cardinalities);
});

test("production setup retains observed dataset evidence when verification fails", async () => {
  const { K4_DATASET_DECLARATION } = require("../../k4/preflight");
  const observed = { ...K4_DATASET_DECLARATION, fingerprint: "sha256:observed-but-mismatched" };
  const result = await require("../../k4/runtimeComposition").runApprovedSetupPreflight({
    plan: plan("sidebar"),
    environment: { K4_BENCHMARK_EMAIL: "alice@kittachat.test", K4_BENCHMARK_PASSWORD: "memory-only" },
    setupEvidence: lifecycleEvidence("runtime-composition"),
    freshAdmission: () => ({ status: "FRESH", runId: "runtime-composition" }),
    dockerCommand: (args) => {
      const command = args.join(" ");
      if (command.includes("k4VerifyDataset")) return JSON.stringify(observed);
      if (command.includes("api/auth/login")) return JSON.stringify({ token: "alice-token", user: { id: "alice-id" } });
      return "socket-authenticated";
    },
  });

  assert.equal(result.status, "FAILED_SETUP");
  assert.equal(result.warmupAdmission, "NOT_ADMITTED");
  assert.deepEqual(result.dataset.observed, observed);
  assert.deepEqual(result.dataset.declared, K4_DATASET_DECLARATION);
  assert.equal(result.dataset.identity, observed.fingerprint);
});

test("production setup rejects retained setup-preflight evidence without fresh admission", async () => {
  let commands = 0;
  const result = await require("../../k4/runtimeComposition").runApprovedSetupPreflight({
    plan: plan("sidebar"),
    environment: { K4_BENCHMARK_EMAIL: "alice@kittachat.test", K4_BENCHMARK_PASSWORD: "memory-only" },
    setupEvidence: lifecycleEvidence("runtime-composition"),
    freshAdmission: () => ({ status: "FAILED_SETUP", reason: "result directory already exists" }),
    dockerCommand: () => { commands += 1; return "unexpected"; },
  });
  assert.equal(result.status, "FAILED_SETUP");
  assert.match(result.reason, /fresh production admission/i);
  assert.equal(commands, 0);
});

test("runner phase persists raw phase output while keeping secrets outside artifacts", async () => {
  let written;
  const runtimePlan = plan("sidebar");
  const evidence = await executeRunnerWorkload({
    plan: runtimePlan,
    phase: "measurement",
    workload: runtimePlan.workload,
    actorRefs: { alice: { id: "alice-id" } },
    actorSecrets: { alice: { token: "memory-only-token" } },
    environment: {},
    dockerCommand: (_args, { env }) => {
      assert.match(env.K4_ACTOR_SECRETS_JSON, /memory-only-token/);
      return JSON.stringify({ measuredRequestIds: ["request-1"], runnerShortfallSamples: [] });
    },
    writeFileSync: (artifactPath, content, options) => { written = { artifactPath, content, options }; },
  });
  assert.deepEqual(evidence.measuredRequestIds, ["request-1"]);
  assert.match(written.artifactPath, /measurement-runner\.json$/);
  assert.doesNotMatch(written.content, /memory-only-token/);
  assert.equal(written.options.flag, "wx");
});

test("owned teardown releases runtime resources while retaining the result artifact directory", async () => {
  let cleanupOptions;
  const result = await teardownOwnedRun({
    plan: plan(),
    ownedResources: [{ class: "run", id: "runtime-composition" }],
    environment: {},
    cleanupPreviewFn: () => ({ digest: "cleanup-digest" }),
    cleanupFn: (_runId, _digest, options) => { cleanupOptions = options; },
  });
  assert.deepEqual(result, { attempted: true, released: true, targetDigest: "cleanup-digest" });
  assert.equal(cleanupOptions.preserveResultDirectory, true);
});

test("owned teardown reports no resources without invoking cleanup when the exact target set is empty", async () => {
  let cleanupCalled = false;
  const result = await teardownOwnedRun({
    plan: plan(),
    ownedResources: [{ class: "run", id: "runtime-composition" }],
    environment: {},
    cleanupPreviewFn: () => ({ digest: "empty-digest", targets: { containers: [], networks: [], volumes: [], resultDirectory: [{ path: "C:/tmp/k4/runtime-composition" }] } }),
    cleanupFn: () => { cleanupCalled = true; },
  });
  assert.deepEqual(result, { attempted: false, released: false, completed: true, ownershipSafe: true, noResources: true, targetDigest: "empty-digest" });
  assert.equal(cleanupCalled, false);
});

test("production composition rejects non-executable v1 before setup", async () => {
  const incomplete = plan("sidebar");
  incomplete.workload.snapshot = {
    scenario: "sidebar",
    version: 1,
    loadModel: { type: "fixed-rate", ratePerSecond: 2 },
    pageSize: 20,
    pagination: { mode: "page", pageSize: 20 },
  };
  const runtime = createRuntimeComposition({
    executeRunFn: async () => assert.fail("incomplete workload must fail before lifecycle"),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    setupPreflight: async () => assert.fail("incomplete workload must fail before setup"),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
  });
  await assert.rejects(runtime.executeProduction({ plan: incomplete }), /requires approved production-executable version 2/);
});

test("production composition rejects socket execution without a locked actor allocation and ramp timeout", async () => {
  const incomplete = plan("socket-concurrency");
  incomplete.workload.snapshot = {
    scenario: "socket-concurrency",
    version: 1,
    loadModel: { type: "concurrency", concurrency: 4 },
    clientCount: 4,
    targetConcurrency: 4,
    ramp: { mode: "immediate" },
    settling: { durationMs: 1000 },
    plateau: { durationMs: 2000 },
  };
  const runtime = createRuntimeComposition({
    executeRunFn: async () => assert.fail("incomplete workload must fail before lifecycle"),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    setupPreflight: async () => assert.fail("incomplete workload must fail before setup"),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
  });
  await assert.rejects(runtime.executeProduction({ plan: incomplete }), /requires approved production-executable version 2/);
});
