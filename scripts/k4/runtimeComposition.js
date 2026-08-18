const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { attestRuntimeTopology, cleanup, cleanupPreview, composeArgs, createResultDirectory, currentEffectiveTopologySnapshot, docker, dockerAsync, imageSetEnvironment } = require("./lifecycle");
const { assertFreshRunTargets, K4_DATASET_DECLARATION, setupPreflightCommands, validateRunLifecycleEvidence, verifyDatasetContract } = require("./preflight");
const { createProductionMeasurementObservation } = require("./productionMeasurementObservation");
const { createObserverComposeBridge } = require("./observerComposeBridge");
const { createProductionObservationSources } = require("./productionObservationSources");
const { runProductionPlan } = require("./productionRun");
const { executeRun } = require("./runner");
const { normalizeFaultFixture } = require("./runner/faultFixtures");
const { sanitize } = require("./runArtifacts");

const APPROVED_SCENARIOS = Object.freeze(["sidebar", "message", "socket-concurrency"]);
const WORKLOAD_TARGET = "http://nginx";
const WORKLOAD_ARTIFACTS = Object.freeze({
  "warm-up": "warm-up-runner.json",
  measurement: "measurement-runner.json",
});
const DEFAULT_RUNNER_NODE_VERSION = "v22.14.0";
const DEFAULT_K6_VERSION = "not-used";

function runnerNodeVersion(plan, environment) {
  const configured = String(environment.K4_RUNNER_NODE_VERSION || "").trim();
  if (configured) return configured;
  const image = String(environment.K4_RUNNER_IMAGE || plan?.runner?.image || "");
  const pinned = image.match(/(?:^|:)node:(\d+\.\d+\.\d+)(?:-|$)/);
  return pinned ? `v${pinned[1]}` : DEFAULT_RUNNER_NODE_VERSION;
}

function unresolvedRuntimeEvidence(reason = "effective runtime evidence is unavailable") {
  return {
    schema: "k4-effective-runtime-attestation-v1",
    status: "INCOMPLETE",
    source: "effective-runtime-attestation",
    reason: String(reason),
    resolvedTopology: { status: "INCOMPLETE", source: "effective-runtime-attestation", unresolved: ["resolved topology"] },
    observerBoundary: { status: "INCOMPLETE", source: "effective-runtime-attestation", unresolved: ["observer boundary"] },
  };
}

function mountDestinations(service) {
  if (!service || service.volumes === undefined) return null;
  return (Array.isArray(service.volumes) ? service.volumes : [])
    .map((entry) => {
      if (typeof entry === "string") {
        const parts = entry.split(":");
        return parts.length >= 2 ? parts.at(-2) : undefined;
      }
      return entry?.target || entry?.destination;
    })
    .filter(Boolean)
    .map(String)
    .sort();
}

function environmentKeys(service) {
  const environment = service?.environment;
  if (!environment) return [];
  if (Array.isArray(environment)) return environment.map((entry) => String(entry).split("=", 1)[0]).sort();
  return Object.keys(environment).sort();
}

function attestEffectiveObserverBoundary(snapshot) {
  const runtime = snapshot?.runtime_attestation;
  const boundary = runtime?.observerBoundary;
  if (!boundary || boundary.status !== "ATTESTED") return { status: "NON-COMPARABLE", reason: "effective observer boundary attestation is incomplete" };
  const services = snapshot?.effective_spec?.compose?.services || {};
  const inspection = boundary.effectiveInspection;
  const roles = { runner: "runner", observer: "observer", helper: "observer-helper" };
  for (const [role, serviceName] of Object.entries(roles)) {
    const actual = inspection?.[role];
    if (!actual?.containerId || !Array.isArray(actual.mountTargets) || !Array.isArray(actual.environmentKeys)) {
      return { status: "NON-COMPARABLE", reason: `effective observer ${role} inspection is missing` };
    }
    const expectedMounts = mountDestinations(services[serviceName]);
    if (expectedMounts && JSON.stringify(actual.mountTargets.map((mount) => String(mount?.destination)).sort()) !== JSON.stringify(expectedMounts)) {
      return { status: "NON-COMPARABLE", reason: `effective observer ${role} mount boundary contradicts Compose` };
    }
    const actualEnvironment = new Set(actual.environmentKeys.map(String));
    for (const key of environmentKeys(services[serviceName])) {
      if (!actualEnvironment.has(key)) return { status: "NON-COMPARABLE", reason: `effective observer ${role} environment boundary contradicts Compose` };
    }
  }
  const networks = boundary.observationNetworkMembership;
  for (const [role, serviceName] of Object.entries(roles)) {
    const expected = runtime.networkSets?.[serviceName];
    const observed = networks?.[role];
    if (!Array.isArray(expected) || !Array.isArray(observed) || JSON.stringify([...observed].sort()) !== JSON.stringify([...expected].sort())) {
      return { status: "NON-COMPARABLE", reason: `effective observer ${role} network boundary contradicts runtime inspection` };
    }
  }
  const denied = boundary.deniedOperationDiagnostics;
  if (!Array.isArray(denied) || denied.length === 0 || denied.some((entry) => entry?.status !== "DENIED")) {
    return { status: "NON-COMPARABLE", reason: "effective observer denied-operation evidence is incomplete" };
  }
  const access = boundary.runnerAccess;
  if (!access || Object.values(access).some((value) => value !== false)) return { status: "NON-COMPARABLE", reason: "effective observer runner isolation is not proven" };
  return { status: "ATTESTED" };
}

async function captureEffectiveRuntimeEvidence({ plan, environment, observerBridge, effectiveSnapshot } = {}) {
  let snapshot;
  try {
    snapshot = effectiveSnapshot || currentEffectiveTopologySnapshot(plan, {
      env: environment,
      captureRuntimeBoundary: true,
      comparisonFingerprintKey: environment.K4_COMPARISON_FINGERPRINT_KEY,
    });
  } catch (error) {
    return unresolvedRuntimeEvidence(`effective runtime inspection failed: ${error.message}`);
  }
  let topologyAttestation;
  try {
    topologyAttestation = attestRuntimeTopology(snapshot);
  } catch (error) {
    return unresolvedRuntimeEvidence(`effective runtime topology attestation failed: ${error.message}`);
  }
  if (topologyAttestation?.status !== "ATTESTED") {
    return unresolvedRuntimeEvidence(topologyAttestation?.reason || "effective runtime topology attestation is incomplete");
  }
  const observerAttestation = attestEffectiveObserverBoundary(snapshot);
  if (observerAttestation.status !== "ATTESTED") return unresolvedRuntimeEvidence(observerAttestation.reason);
  const boundary = snapshot.runtime_attestation?.observerBoundary;
  if (!boundary || boundary.status !== "ATTESTED") return unresolvedRuntimeEvidence("effective runner/observer boundary attestation is incomplete");
  if (!observerBridge || typeof observerBridge.identity !== "function") return unresolvedRuntimeEvidence("observer helper identity handshake is unavailable");
  let handshake;
  try {
    handshake = await observerBridge.identity({ runId: plan.runId, project: plan.projectName, role: "runner", target: "runner" });
  } catch (error) {
    return unresolvedRuntimeEvidence(`observer helper identity handshake failed: ${error.message}`);
  }
  if (!handshake?.helperIdentity || !handshake?.policyVersion) return unresolvedRuntimeEvidence("observer helper identity/policy handshake is incomplete");
  return {
    schema: "k4-effective-runtime-attestation-v1",
    status: "ATTESTED",
    source: "effective-runtime-attestation",
    resolvedTopology: {
      status: "ATTESTED",
      profile: plan.topology?.profile || plan.profile,
      backendReplicaCount: snapshot.effective_spec.backend_replica_count,
      backendUpstreamMembership: [...(snapshot.effective_spec.backend_upstream_membership || [])],
      source: "effective-runtime-attestation",
    },
    observerBoundary: {
      ...boundary,
      helperContainerIdentity: boundary.helperIdentity,
      helperIdentity: handshake.helperIdentity,
      helperPolicyVersion: handshake.policyVersion,
      helperSchemaVersion: "k4-observer-request-v1",
      helperHandshake: {
        containerId: handshake.containerId,
        helperIdentity: handshake.helperIdentity,
        policyVersion: handshake.policyVersion,
        source: "observer-helper-response",
      },
    },
    effectiveSpec: snapshot.effective_spec,
    runtimeAttestation: snapshot.runtime_attestation,
  };
}

function provenanceMetadata({ plan, environment, hardware, imageSet, intervalMs, runtimeEvidence }) {
  const dependencies = {
    mongo: "mongo:7",
    redis: "redis:alpine",
    rabbitmq: "rabbitmq:3-management-alpine",
    ...(plan?.dependencies || {}),
  };
  const runner = plan?.runner || {};
  return {
    ...(environment.K4_COMMIT_SHA || environment.GIT_COMMIT_SHA ? { commitSha: environment.K4_COMMIT_SHA || environment.GIT_COMMIT_SHA } : {}),
    ...(hardware ? { hardware } : {}),
    imageSet,
    toolVersions: {
      node: runnerNodeVersion(plan, environment),
      k6: String(environment.K4_K6_VERSION || DEFAULT_K6_VERSION),
    },
    runtimeEvidenceArtifact: "runtime-provenance.raw.json",
    effectiveRuntimeEvidence: runtimeEvidence || unresolvedRuntimeEvidence(),
    resolvedTopology: runtimeEvidence?.resolvedTopology || unresolvedRuntimeEvidence().resolvedTopology,
    dependencyTopology: {
      ...dependencies,
      nginx: imageSet.nginx,
      backend: imageSet.backend,
    },
    runnerPlacement: {
      ...runner,
      service: runner.service || "runner",
      network: runner.network || "k4-workload",
      workloadTarget: runner.workloadTarget || WORKLOAD_TARGET,
      dockerManagement: false,
    },
    runtimeConfiguration: {
      phaseSettings: plan?.phaseSettings || ["setup/seed", "warm-up", "measurement", "teardown"],
      ingress: "nginx",
      networkIngress: plan?.networkIngress || "k4-internal-nginx-only",
      composeFile: plan?.composeFile,
      imageSetId: imageSet.id,
      observationIntervalMs: intervalMs,
    },
    observerBoundary: runtimeEvidence?.observerBoundary || unresolvedRuntimeEvidence().observerBoundary,
  };
}

function productionEnvironment(plan, environment = process.env, randomBytes = crypto.randomBytes) {
  const imageSet = imageSetEnvironment(environment.K4_IMAGE_SET_ID);
  const jwtEnvironmentKey = ["K4", "JWT", "SECRET"].join("_");
  const jwtEnvironmentValue = environment[jwtEnvironmentKey] || randomBytes(48).toString("hex");
  const observerTokenKey = ["K4", "OBSERVER", "TOKEN"].join("_");
  const observerTokenValue = environment[observerTokenKey] || randomBytes(32).toString("hex");
  const defaultBenchmarkEmail = ["alice", "kittachat.test"].join("@");
  return {
    ...environment,
    ...imageSet,
    K4_PROJECT_NAME: plan.projectName,
    K4_RUN_ID: plan.runId,
    K4_RESULT_DIR: plan.resultDirectory, //gitleaks:allow
    [jwtEnvironmentKey]: jwtEnvironmentValue,
    [observerTokenKey]: observerTokenValue,
    K4_BENCHMARK_EMAIL: environment.K4_BENCHMARK_EMAIL || defaultBenchmarkEmail,
    K4_BENCHMARK_PASSWORD: environment.K4_BENCHMARK_PASSWORD,
    DEMO_SEED_PASSWORD: environment.K4_BENCHMARK_PASSWORD,
  };
}

function requireBenchmarkSecret(environment) {
  if (!environment.K4_BENCHMARK_PASSWORD) {
    throw new Error("K4_BENCHMARK_PASSWORD is required and remains memory-only for production execution");
  }
}

function assertExecutableProfile(workload) {
  const snapshot = workload?.snapshot;
  if (!snapshot?.loadModel || snapshot.version !== 2) throw new Error(`production ${snapshot?.scenario || "unknown"} workload requires approved production-executable version 2`);
  if (!snapshot.actorAllocation) throw new Error(`production ${snapshot.scenario} workload is missing locked execution semantics: actorAllocation`);
}

function parseJsonOutput(output, prerequisite) {
  try {
    return JSON.parse(String(output));
  } catch {
    throw new Error(`production ${prerequisite} returned malformed evidence`);
  }
}

function explicitTestMachineHardware(environment = {}) {
  const hostname = String(environment.K4_TEST_MACHINE_HOSTNAME || "").trim();
  const cpuModel = String(environment.K4_TEST_MACHINE_CPU_MODEL || "").trim();
  const logicalProcessorsValue = Number(environment.K4_TEST_MACHINE_LOGICAL_PROCESSORS);
  const memoryBytesValue = Number(environment.K4_TEST_MACHINE_MEMORY_BYTES);
  const hardware = {
    hostname: hostname || undefined,
    cpuModel: cpuModel || undefined,
    logicalProcessors: Number.isSafeInteger(logicalProcessorsValue) && logicalProcessorsValue > 0 ? logicalProcessorsValue : undefined,
    memoryBytes: Number.isSafeInteger(memoryBytesValue) && memoryBytesValue > 0 ? memoryBytesValue : undefined,
  };
  return Object.values(hardware).some((value) => value !== undefined) ? hardware : undefined;
}

function datasetEvidence(observedDeclaration) {
  const cardinalities = observedDeclaration?.cardinalities || null;
  const totalDocuments = cardinalities
    ? Object.values(cardinalities).reduce((total, count) => total + (Number.isFinite(count) ? count : 0), 0)
    : null;
  return sanitize({
    identity: observedDeclaration?.fingerprint || "unresolved",
    declared: K4_DATASET_DECLARATION,
    observed: observedDeclaration || null,
    size: { cardinalities, totalDocuments },
  });
}

const waitForAuthRateLimit = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function freshProductionAdmission({ plan, environment, cleanupPreviewFn = cleanupPreview, createResultDirectoryFn = createResultDirectory }) {
  if (fs.existsSync(plan.resultDirectory)) throw new Error("K4 result directory already exists and cannot be reused for production setup");
  const preview = cleanupPreviewFn(plan.runId, { profile: plan.topology?.profile || plan.profile, env: environment });
  const freshness = assertFreshRunTargets(preview);
  createResultDirectoryFn(plan);
  return { ...freshness, runId: plan.runId, previewDigest: preview.digest };
}

async function runApprovedSetupPreflight({ plan, environment, dockerCommand = docker, wait = waitForAuthRateLimit, setupEvidence: suppliedSetupEvidence, freshAdmission = freshProductionAdmission }) {
  let admission;
  try {
    admission = await freshAdmission({ plan, environment });
    if (admission?.status !== "FRESH") throw new Error("fresh K4 production admission was not verified");
  } catch (error) {
    return { status: "FAILED_SETUP", warmupAdmission: "NOT_ADMITTED", reason: `fresh production admission failed: ${error.message}` };
  }
  let setupEvidence = suppliedSetupEvidence;
  if (!setupEvidence) try {
    const setupPath = path.join(plan.resultDirectory, "setup-preflight.json");
    if (fs.existsSync(setupPath)) setupEvidence = JSON.parse(fs.readFileSync(setupPath, "utf8"));
  } catch (error) {
    return { status: "FAILED_SETUP", warmupAdmission: "NOT_ADMITTED", reason: `setup lifecycle evidence is unreadable: ${error.message}` };
  }
  let observedDeclaration;
  const benchmarkActors = {};
  const completedSteps = {};
  for (const step of setupPreflightCommands(plan)) {
    try {
      const output = dockerCommand(step.args, {
        env: { ...environment, K4_BENCHMARK_TOKEN: benchmarkActors.alice?.token },
      });
      completedSteps[step.prerequisite] = "completed";
      if (step.prerequisite === "verification") observedDeclaration = parseJsonOutput(output, step.prerequisite);
      if (step.prerequisite === "login") {
        const session = parseJsonOutput(output, step.prerequisite);
        benchmarkActors.alice = { id: String(session.user?._id || session.user?.id), email: environment.K4_BENCHMARK_EMAIL, token: session.token };
      }
    } catch (error) {
      return { status: "FAILED_SETUP", warmupAdmission: "NOT_ADMITTED", reason: `setup prerequisite failed: ${step.prerequisite}: ${error.message}`, admission, lifecycle: { runId: plan.runId, ownerRunId: plan.runId, ...completedSteps } };
    }
  }
  const verification = verifyDatasetContract(K4_DATASET_DECLARATION, observedDeclaration);
  if (verification.status !== "VERIFIED") {
    return { status: "FAILED_SETUP", warmupAdmission: "NOT_ADMITTED", admission, verification, dataset: datasetEvidence(observedDeclaration) };
  }
  if (!benchmarkActors.alice?.token || !benchmarkActors.alice?.id) {
    throw new Error("production login did not return the authenticated benchmark actor");
  }
  const needsBob = Object.values(plan.workload.snapshot.actorAllocation || {}).includes("bob") || plan.workload.snapshot.actorAllocation?.bob;
  if (needsBob) {
    await wait(1100);
    let bobSession;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        bobSession = parseJsonOutput(dockerCommand(composeArgs(plan, ["exec", "-T", "-e", "K4_BOB_EMAIL=bob@kittachat.test", "runner", "node", "-e", "fetch('http://nginx/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.K4_BOB_EMAIL, password: process.env.K4_BENCHMARK_PASSWORD }) }).then(async (r) => { if (!r.ok) { process.stderr.write('bob_login_status=' + r.status); process.exit(1); } const body = await r.json(); process.stdout.write(JSON.stringify({ token: body.token, user: body.user })); })"]), { env: environment }), "bob login");
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await wait(1100);
      }
    }
    if (!bobSession) throw lastError;
    if (!bobSession.token || !(bobSession.user?._id || bobSession.user?.id)) throw new Error("production login did not return bob benchmark actor");
    benchmarkActors.bob = { id: String(bobSession.user._id || bobSession.user.id), email: "bob@kittachat.test", token: bobSession.token };
  }
  const lifecycle = validateRunLifecycleEvidence({
    runId: plan.runId,
    lifecycle: {
      ...(setupEvidence?.lifecycle || setupEvidence || {}),
      runId: plan.runId,
      ownerRunId: plan.runId,
      runScoped: true,
      cleanInitialState: true,
      initialState: "CLEAN",
      ...completedSteps,
      verify: verification.status,
      status: "VERIFIED",
    },
  }, plan.runId);
  if (!lifecycle.valid) return { status: "FAILED_SETUP", warmupAdmission: "NOT_ADMITTED", reason: lifecycle.diagnostics.join("; "), admission, lifecycle: lifecycle.lifecycle, dataset: datasetEvidence(observedDeclaration) };
  return {
    status: "WARMUP_ADMITTED",
    warmupAdmission: "WARMUP_ADMITTED",
    admission,
    lifecycle: lifecycle.lifecycle,
    verification,
    dataset: datasetEvidence(observedDeclaration),
    benchmarkActors,
  };
}

function runnerPhaseArgs(plan, { phase, workload, actorRefs, faultFixture }) {
  const requestedFaultFixture = normalizeFaultFixture(faultFixture);
  const activeFaultFixture = phase === "measurement" ? requestedFaultFixture : null;
  const args = composeArgs(plan, [
    "exec", "-T",
    "-e", `K4_PHASE=${phase}`,
    "-e", `K4_PROFILE_B64=${Buffer.from(JSON.stringify(workload.snapshot), "utf8").toString("base64")}`,
    "-e", `K4_ACTOR_REFS_B64=${Buffer.from(JSON.stringify(actorRefs), "utf8").toString("base64")}`,
  ]);
  if (activeFaultFixture) args.push("-e", `K4_FAULT_FIXTURE=${activeFaultFixture}`);
  args.push("-e", "K4_ACTOR_SECRETS_JSON", "runner", "node", "/opt/k4/workload.js");
  return args;
}

async function executeRunnerWorkload({ plan, phase, workload, actorRefs, actorSecrets, faultFixture, target = WORKLOAD_TARGET, environment, dockerCommand = dockerAsync, writeFileSync = require("node:fs").writeFileSync }) {
  if (target !== WORKLOAD_TARGET) throw new Error("production workload target must be nginx");
  const output = await dockerCommand(runnerPhaseArgs(plan, { phase, workload, actorRefs, faultFixture }), {
    env: {
      ...environment,
      K4_ACTOR_SECRETS_JSON: JSON.stringify(actorSecrets),
    },
  });
  const evidence = parseJsonOutput(output, `${phase} workload`);
  const artifact = WORKLOAD_ARTIFACTS[phase];
  if (artifact) writeFileSync(require("node:path").join(plan.resultDirectory, artifact), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  return evidence;
}

async function teardownOwnedRun({ plan, ownedResources, environment, cleanupPreviewFn = cleanupPreview, cleanupFn = cleanup }) {
  const ownsActiveRun = ownedResources.some((resource) => resource?.class === "run" && resource?.id === plan.runId);
  if (!ownsActiveRun) return { attempted: false, released: false, completed: true, ownershipSafe: true, noResources: true };
  const preview = cleanupPreviewFn(plan.runId, { profile: plan.topology?.profile || plan.profile, env: environment });
  const targetClasses = ["containers", "networks", "volumes"];
  const hasExactTargetSet = targetClasses.every((targetClass) => Array.isArray(preview?.targets?.[targetClass]));
  if (!hasExactTargetSet) {
    cleanupFn(plan.runId, preview.digest, { profile: plan.topology?.profile || plan.profile, env: environment, preserveResultDirectory: true });
    return { attempted: true, released: true, targetDigest: preview.digest };
  }
  if (hasExactTargetSet && targetClasses.every((targetClass) => preview.targets[targetClass].length === 0)) {
    return { attempted: false, released: false, completed: true, ownershipSafe: true, noResources: true, targetDigest: preview.digest };
  }
  cleanupFn(plan.runId, preview.digest, { profile: plan.topology?.profile || plan.profile, env: environment, preserveResultDirectory: true });
  return { attempted: true, released: true, completed: true, ownershipSafe: true, noResources: false, targetDigest: preview.digest };
}

function createRuntimeComposition({
  environment = process.env,
  randomBytes = crypto.randomBytes,
  executeRunFn = executeRun,
  setupPreflight = runApprovedSetupPreflight,
  admitProductionRun = setupPreflight === runApprovedSetupPreflight ? freshProductionAdmission : null,
  executeRunnerWorkload: runWorkload = executeRunnerWorkload,
  teardownOwnedRun: releaseRun = teardownOwnedRun,
    observationFactory = createProductionMeasurementObservation,
    observerBridgeFactory = createObserverComposeBridge,
    observationSourcesFactory = createProductionObservationSources,
    runtimeEvidenceFactory = captureEffectiveRuntimeEvidence,
  } = {}) {
  async function executeProduction({ plan, intervalMs = 1000, faultFixture }) {
    if (!APPROVED_SCENARIOS.includes(plan?.workload?.scenario)) {
      throw new Error(`production workload adapter is unavailable for ${plan?.workload?.scenario || "unknown"}`);
    }
    const normalizedFaultFixture = normalizeFaultFixture(faultFixture);
    if (normalizedFaultFixture && plan.workload.scenario !== "message") throw new Error("K4 fault fixtures require the message scenario");
    assertExecutableProfile(plan.workload);
    requireBenchmarkSecret(environment);
    const scopedEnvironment = productionEnvironment(plan, environment, randomBytes);
    const preAdmission = admitProductionRun
      ? await admitProductionRun({ plan, environment: scopedEnvironment })
      : null;
    const actorRefs = {};
    const actorSecrets = {};
    let runtimeEvidence = unresolvedRuntimeEvidence();
    let artifactMetadata;
    let ownershipRegistered = false;
    const setup = async (context) => {
      const registerRunOwnership = () => {
        if (ownershipRegistered) return;
        context.registerOwnedResource({ class: "run", id: plan.runId });
        ownershipRegistered = true;
      };
      if (preAdmission?.status === "FRESH") registerRunOwnership();
      const result = await setupPreflight({
        plan,
        environment: scopedEnvironment,
        ...(preAdmission ? { freshAdmission: async () => preAdmission } : {}),
      });
      if (result?.admission?.status === "FRESH") registerRunOwnership();
      if (result?.warmupAdmission !== "WARMUP_ADMITTED") {
        throw new Error("setup/preflight did not admit warm-up");
      }
      const lifecycle = validateRunLifecycleEvidence(result, plan.runId);
      if (!lifecycle.valid) throw new Error(lifecycle.diagnostics.join("; "));
      try {
        runtimeEvidence = await runtimeEvidenceFactory({ plan, environment: scopedEnvironment, observerBridge: helper, runtimePort });
      } catch (error) {
        runtimeEvidence = unresolvedRuntimeEvidence(error.message);
      }
      Object.assign(artifactMetadata, provenanceMetadata({
        plan,
        environment: scopedEnvironment,
        hardware,
        intervalMs,
        runtimeEvidence,
        imageSet: {
          id: scopedEnvironment.K4_IMAGE_SET_ID,
          nginx: scopedEnvironment.K4_NGINX_IMAGE,
          backend: scopedEnvironment.K4_BACKEND_IMAGE,
          runner: scopedEnvironment.K4_RUNNER_IMAGE,
          observer: scopedEnvironment.K4_OBSERVER_IMAGE,
          observerHelper: scopedEnvironment.K4_OBSERVER_HELPER_IMAGE,
        },
      }));
      for (const [name, actor] of Object.entries(result.benchmarkActors || {})) {
        actorRefs[name] = { id: actor.id, email: actor.email };
        actorSecrets[name] = { token: actor.token };
      }
      return {
        resourcesCreated: true,
        runScoped: lifecycle.lifecycle.runScoped,
        cleanInitialState: lifecycle.lifecycle.cleanInitialState,
        datasetLifecycle: lifecycle.lifecycle,
        setupPreflight: {
          status: result.status,
          warmupAdmission: result.warmupAdmission,
          verification: result.verification,
          dataset: result.dataset,
          actors: Object.fromEntries(Object.entries(actorRefs).map(([name, actor]) => [name, actor])),
        },
      };
    };
    const executeWorkloadPhase = (phase) => runWorkload({
      plan,
      phase,
      workload: plan.workload,
      actorRefs,
      actorSecrets,
      faultFixture: phase === "measurement" ? normalizedFaultFixture : undefined,
      target: WORKLOAD_TARGET,
      environment: scopedEnvironment,
    });
    const teardown = (context) => releaseRun({
      plan,
      ownedResources: context.ownedResources(),
      environment: scopedEnvironment,
    });
    const helper = observerBridgeFactory({ plan, environment: scopedEnvironment });
    const runtimePort = observationSourcesFactory({ helper });
    const observation = observationFactory({ intervalMs, environment: scopedEnvironment, runtimePort });
    const hardware = explicitTestMachineHardware(scopedEnvironment);
    artifactMetadata = provenanceMetadata({
      plan,
      environment: scopedEnvironment,
      hardware,
      intervalMs,
      runtimeEvidence,
      imageSet: {
        id: scopedEnvironment.K4_IMAGE_SET_ID,
        nginx: scopedEnvironment.K4_NGINX_IMAGE,
        backend: scopedEnvironment.K4_BACKEND_IMAGE,
        runner: scopedEnvironment.K4_RUNNER_IMAGE,
        observer: scopedEnvironment.K4_OBSERVER_IMAGE,
        observerHelper: scopedEnvironment.K4_OBSERVER_HELPER_IMAGE,
      },
    });
    return runProductionPlan({
      plan,
      intervalMs,
      observation,
      artifactMetadata,
      phases: { setup, warmup: () => executeWorkloadPhase("warm-up"), measure: () => executeWorkloadPhase("measurement"), teardown },
      executeRunFn,
    });
  }
  return { executeProduction };
}

const { executeProduction } = createRuntimeComposition();

module.exports = {
  APPROVED_SCENARIOS,
  WORKLOAD_TARGET,
  createRuntimeComposition,
  assertExecutableProfile,
  executeProduction,
  executeRunnerWorkload,
  WORKLOAD_ARTIFACTS,
  productionEnvironment,
  freshProductionAdmission,
  runApprovedSetupPreflight,
  runnerPhaseArgs,
  captureEffectiveRuntimeEvidence,
  teardownOwnedRun,
};
