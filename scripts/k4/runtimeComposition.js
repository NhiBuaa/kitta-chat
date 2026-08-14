const crypto = require("node:crypto");
const { cleanup, cleanupPreview, composeArgs, docker, dockerAsync, imageSetEnvironment } = require("./lifecycle");
const { K4_DATASET_DECLARATION, setupPreflightCommands, verifyDatasetContract } = require("./preflight");
const { createProductionMeasurementObservation } = require("./productionMeasurementObservation");
const { createObserverComposeBridge } = require("./observerComposeBridge");
const { createProductionObservationSources } = require("./productionObservationSources");
const { runProductionPlan } = require("./productionRun");
const { executeRun } = require("./runner");

const APPROVED_SCENARIOS = Object.freeze(["sidebar", "message", "socket-concurrency"]);
const WORKLOAD_TARGET = "http://nginx";
const WORKLOAD_ARTIFACTS = Object.freeze({
  "warm-up": "warm-up-runner.json",
  measurement: "measurement-runner.json",
});

function secretHex(bytes, randomBytes = crypto.randomBytes) {
  return randomBytes(bytes).toString("hex");
}

function productionEnvironment(plan, environment = process.env, randomBytes = crypto.randomBytes) {
  const imageSet = imageSetEnvironment(environment.K4_IMAGE_SET_ID);
  return {
    ...environment,
    ...imageSet,
    K4_PROJECT_NAME: plan.projectName,
    K4_RUN_ID: plan.runId,
    K4_RESULT_DIR: plan.resultDirectory,
    K4_JWT_SECRET: environment.K4_JWT_SECRET || secretHex(48, randomBytes),
    K4_OBSERVER_TOKEN: environment.K4_OBSERVER_TOKEN || secretHex(32, randomBytes),
    K4_BENCHMARK_EMAIL: environment.K4_BENCHMARK_EMAIL || "alice@kittachat.test",
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

const waitForAuthRateLimit = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runApprovedSetupPreflight({ plan, environment, dockerCommand = docker, wait = waitForAuthRateLimit }) {
  let observedDeclaration;
  const benchmarkActors = {};
  for (const step of setupPreflightCommands(plan).filter(({ prerequisite }) => prerequisite !== "create")) {
    const output = dockerCommand(step.args, {
      env: { ...environment, K4_BENCHMARK_TOKEN: benchmarkActors.alice?.token },
    });
    if (step.prerequisite === "verification") observedDeclaration = parseJsonOutput(output, step.prerequisite);
    if (step.prerequisite === "login") {
      const session = parseJsonOutput(output, step.prerequisite);
      benchmarkActors.alice = { id: String(session.user?._id || session.user?.id), email: environment.K4_BENCHMARK_EMAIL, token: session.token };
    }
  }
  const verification = verifyDatasetContract(K4_DATASET_DECLARATION, observedDeclaration);
  if (verification.status !== "VERIFIED") {
    return { status: "FAILED_SETUP", warmupAdmission: "NOT_ADMITTED", verification };
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
  return {
    status: "WARMUP_ADMITTED",
    warmupAdmission: "WARMUP_ADMITTED",
    verification,
    benchmarkActors,
  };
}

function runnerPhaseArgs(plan, { phase, workload, actorRefs }) {
  return composeArgs(plan, [
    "exec", "-T",
    "-e", `K4_PHASE=${phase}`,
    "-e", `K4_PROFILE_B64=${Buffer.from(JSON.stringify(workload.snapshot), "utf8").toString("base64")}`,
    "-e", `K4_ACTOR_REFS_B64=${Buffer.from(JSON.stringify(actorRefs), "utf8").toString("base64")}`,
    "-e", "K4_ACTOR_SECRETS_JSON",
    "runner", "node", "/opt/k4/workload.js",
  ]);
}

async function executeRunnerWorkload({ plan, phase, workload, actorRefs, actorSecrets, target = WORKLOAD_TARGET, environment, dockerCommand = dockerAsync, writeFileSync = require("node:fs").writeFileSync }) {
  if (target !== WORKLOAD_TARGET) throw new Error("production workload target must be nginx");
  const output = await dockerCommand(runnerPhaseArgs(plan, { phase, workload, actorRefs }), {
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
  if (!ownsActiveRun) return { attempted: false, released: false };
  const preview = cleanupPreviewFn(plan.runId, { profile: plan.topology?.profile || plan.profile, env: environment });
  cleanupFn(plan.runId, preview.digest, { profile: plan.topology?.profile || plan.profile, env: environment });
  return { attempted: true, released: true, targetDigest: preview.digest };
}

function createRuntimeComposition({
  environment = process.env,
  randomBytes = crypto.randomBytes,
  executeRunFn = executeRun,
  setupPreflight = runApprovedSetupPreflight,
  executeRunnerWorkload: runWorkload = executeRunnerWorkload,
  teardownOwnedRun: releaseRun = teardownOwnedRun,
  observationFactory = createProductionMeasurementObservation,
  observerBridgeFactory = createObserverComposeBridge,
  observationSourcesFactory = createProductionObservationSources,
} = {}) {
  async function executeProduction({ plan, intervalMs = 1000 }) {
    if (!APPROVED_SCENARIOS.includes(plan?.workload?.scenario)) {
      throw new Error(`production workload adapter is unavailable for ${plan?.workload?.scenario || "unknown"}`);
    }
    assertExecutableProfile(plan.workload);
    requireBenchmarkSecret(environment);
    const scopedEnvironment = productionEnvironment(plan, environment, randomBytes);
    const actorRefs = {};
    const actorSecrets = {};
    const setup = async (context) => {
      context.registerOwnedResource({ class: "run", id: plan.runId });
      const result = await setupPreflight({ plan, environment: scopedEnvironment });
      if (result?.warmupAdmission !== "WARMUP_ADMITTED") {
        throw new Error("setup/preflight did not admit warm-up");
      }
      for (const [name, actor] of Object.entries(result.benchmarkActors || {})) {
        actorRefs[name] = { id: actor.id, email: actor.email };
        actorSecrets[name] = { token: actor.token };
      }
      return {
        resourcesCreated: true,
        setupPreflight: {
          status: result.status,
          warmupAdmission: result.warmupAdmission,
          verification: result.verification,
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
    return runProductionPlan({
      plan,
      intervalMs,
      observation,
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
  runApprovedSetupPreflight,
  runnerPhaseArgs,
  teardownOwnedRun,
};
