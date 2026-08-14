const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { attestRuntimeTopology, buildImageSet, compareEffectiveTopologySnapshots, createRunPlan, createResultDirectory, cleanup, cleanupPreview, currentEffectiveTopologySnapshot, docker, imageSetEnvironment, runnerDiagnosticArgs, startArgs, validateCleanupTarget } = require("./lifecycle");
const { K4_DATASET_DECLARATION, assertFreshRunTargets, classifySetupFailure, scanRetainedEvidenceDirectory, setupPreflightCommands, verifyDatasetContract } = require("./preflight");
const { approvedWorkloadProfile, resolveWorkloadProfile } = require("./workloadProfiles");
const { runProductionPlan } = require("./productionRun");
const { ALLOWED_FAULT_FIXTURES, normalizeFaultFixture } = require("./runner/faultFixtures");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  return print({
    usage: "npm run k4 -- execute --run-id <id> --profile <profile> --scenario message --workload-version 2 [--fault-fixture <fixture>]",
    faultFixtures: ALLOWED_FAULT_FIXTURES,
    note: "Fault fixtures are runner-only, measurement-phase options and are disabled unless explicitly selected.",
  });
}

function rejectWorkloadChannels(action) {
  const forbidden = ["--workload-json", "--workload", "--workload-config"];
  if (forbidden.some((flag) => process.argv.includes(flag)) || process.env.K4_WORKLOAD_JSON || process.env.K4_WORKLOAD_CONFIG) {
    throw new Error(`${action} accepts approved scenario:version profiles and operational metadata only; raw workload channels are forbidden`);
  }
}

function planFromArguments({ inspection = false } = {}) {
  const plan = createRunPlan({ runId: argument("--run-id"), profile: argument("--profile") });
  const scenario = argument("--scenario");
  if (!scenario) return plan;
  if (inspection && argument("--workload-json")) {
    const profile = JSON.parse(argument("--workload-json"));
    const resolved = resolveWorkloadProfile({ ...profile, scenario });
    return { ...plan, workload: { ...resolved, bytes: undefined }, topology: { profile: plan.profile, backendReplicaCount: plan.backendReplicaCount, backendUpstreamMembership: plan.backendUpstreamMembership } };
  }
  const resolved = approvedWorkloadProfile(scenario, Number(argument("--workload-version") || 1), { label: argument("--label"), notes: argument("--notes"), owner: argument("--owner") });
  return { ...plan, workload: { ...resolved, bytes: undefined }, topology: { profile: plan.profile, backendReplicaCount: plan.backendReplicaCount, backendUpstreamMembership: plan.backendUpstreamMembership } };
}

function resolveBenchmarkPassword(environment = process.env, randomBytes = crypto.randomBytes) {
  return environment.K4_BENCHMARK_PASSWORD || `K4a!${randomBytes(24).toString("base64url")}`;
}

function runSetupPreflight({
  plan,
  environment,
  dockerCommand = docker,
  cleanupPreviewFn = cleanupPreview,
  createResultDirectoryFn = createResultDirectory,
  writeFileSyncFn = fs.writeFileSync,
}) {
  try {
    assertFreshRunTargets(cleanupPreviewFn(plan.runId));
    createResultDirectoryFn(plan);
  } catch (error) {
    return { action: "setup-preflight", prerequisite: "create", ...classifySetupFailure("create"), reason: "fresh K4 run resources are required before setup" };
  }
  let observedDeclaration;
  let benchmarkToken;
  for (const step of setupPreflightCommands(plan)) {
    try {
      const output = dockerCommand(step.args, { env: { ...environment, K4_BENCHMARK_TOKEN: benchmarkToken } });
      if (step.prerequisite === "verification") observedDeclaration = JSON.parse(String(output));
      if (step.prerequisite === "login") benchmarkToken = JSON.parse(String(output)).token;
    } catch (error) {
      return { action: "setup-preflight", prerequisite: step.prerequisite, ...classifySetupFailure(step.prerequisite), reason: `setup/preflight prerequisite failed: ${step.prerequisite}` };
    }
  }
  const verification = verifyDatasetContract(K4_DATASET_DECLARATION, observedDeclaration);
  if (verification.status !== "VERIFIED") return { action: "setup-preflight", verification, warmupAdmission: "NOT_ADMITTED" };
  const phaseRecordPath = path.join(plan.resultDirectory, "setup-preflight.json");
  writeFileSyncFn(phaseRecordPath, `${JSON.stringify({
    runId: plan.runId,
    declaredDataset: K4_DATASET_DECLARATION,
    observedDataset: observedDeclaration,
    verification,
    warmupAdmission: "WARMUP_ADMITTED",
    authentication: { ingress: "http://nginx", login: "passed", socketIo: "passed" },
  })}\n`, { flag: "wx" });
  const evidenceScan = scanRetainedEvidenceDirectory(plan.resultDirectory, [environment.K4_BENCHMARK_PASSWORD, benchmarkToken]);
  return { action: "setup-preflight", verification, warmupAdmission: "WARMUP_ADMITTED", evidenceScan };
}

async function main({ executeProduction } = {}) {
  const action = process.argv[2];
  if (action === "help" || process.argv.includes("--help") || process.argv.includes("-h")) return printHelp();
  if (action === "resolve") return print(planFromArguments({ inspection: true }));
  if (action === "compare") {
    const leftRunId = argument("--left-run-id");
    const rightRunId = argument("--right-run-id");
    if (!leftRunId || !rightRunId) throw new Error("compare requires --left-run-id and --right-run-id; synthesized plans are intent only.");
    const left = currentEffectiveTopologySnapshot(createRunPlan({ runId: leftRunId, profile: argument("--left-profile") || "single-replica" }));
    const right = currentEffectiveTopologySnapshot(createRunPlan({ runId: rightRunId, profile: argument("--right-profile") || "single-replica" }));
    const leftAttestation = attestRuntimeTopology(left);
    const rightAttestation = attestRuntimeTopology(right);
    if (leftAttestation.status !== "ATTESTED" || rightAttestation.status !== "ATTESTED") return print({ status: "NON-COMPARABLE", leftAttestation, rightAttestation });
    return print(compareEffectiveTopologySnapshots(left, right));
  }
  if (action === "diagnose-runner") {
    rejectWorkloadChannels(action);
    const plan = planFromArguments();
    return process.stdout.write(docker(runnerDiagnosticArgs(plan), {
      env: { ...process.env, K4_PROJECT_NAME: plan.projectName, K4_RUN_ID: plan.runId, K4_RESULT_DIR: plan.resultDirectory },
    }));
  }
  if (action === "build-image-set") return print({ action, imageSet: buildImageSet(argument("--image-set-id")) });
  if (action === "execute") {
    rejectWorkloadChannels(action);
    const plan = planFromArguments();
    if (!plan.workload?.scenario) throw new Error("execute requires an approved --scenario and --workload-version");
    const faultFixture = normalizeFaultFixture(argument("--fault-fixture"));
    if (faultFixture && plan.workload.scenario !== "message") throw new Error("K4 fault fixtures require the message scenario");
    if (typeof executeProduction !== "function") throw new Error("production phase adapters must be supplied by the K4 runtime composition root");
    return print(await executeProduction({ plan, intervalMs: Number(argument("--observation-interval-ms") || 1000), faultFixture }));
  }
  if (action === "start") {
    rejectWorkloadChannels(action);
    const plan = planFromArguments();
    const imageSet = imageSetEnvironment(argument("--image-set-id"));
    const benchmarkPassword = resolveBenchmarkPassword();
    const observerToken = process.env.K4_OBSERVER_TOKEN || crypto.randomBytes(32).toString("hex");
    docker(startArgs(plan), {
      env: {
        ...process.env,
        ...imageSet,
        K4_PROJECT_NAME: plan.projectName,
        K4_RUN_ID: plan.runId,
        K4_RESULT_DIR: plan.resultDirectory,
        K4_JWT_SECRET: process.env.K4_JWT_SECRET || crypto.randomBytes(48).toString("hex"),
        K4_BENCHMARK_EMAIL: process.env.K4_BENCHMARK_EMAIL || "alice@kittachat.test",
        K4_BENCHMARK_PASSWORD: benchmarkPassword,
        K4_OBSERVER_TOKEN: observerToken,
      },
    });
    return print({ action, plan });
  }
  if (action === "setup-preflight") {
    rejectWorkloadChannels(action);
    const plan = planFromArguments();
    const imageSet = imageSetEnvironment(argument("--image-set-id"));
    const benchmarkPassword = resolveBenchmarkPassword();
    const observerToken = process.env.K4_OBSERVER_TOKEN || crypto.randomBytes(32).toString("hex");
    const environment = {
      ...process.env,
      ...imageSet,
      K4_PROJECT_NAME: plan.projectName,
      K4_RUN_ID: plan.runId,
      K4_RESULT_DIR: plan.resultDirectory,
      K4_JWT_SECRET: process.env.K4_JWT_SECRET || crypto.randomBytes(48).toString("hex"),
      K4_BENCHMARK_EMAIL: process.env.K4_BENCHMARK_EMAIL || "alice@kittachat.test",
      K4_BENCHMARK_PASSWORD: benchmarkPassword,
      K4_OBSERVER_TOKEN: observerToken,
      DEMO_SEED_PASSWORD: benchmarkPassword,
    };
    return print(runSetupPreflight({ plan, environment }));
  }
  if (action === "cleanup-preview") return print(cleanupPreview(argument("--run-id")));
  if (action === "validate-cleanup-target") {
    let target;
    try { target = JSON.parse(argument("--target-json")); } catch { throw new Error("--target-json must be valid JSON."); }
    return print(validateCleanupTarget(argument("--class"), target, argument("--run-id")));
  }
  if (action === "cleanup") return print(cleanup(argument("--run-id"), argument("--confirm-digest")));
  throw new Error("usage: k4 <help|resolve|compare|diagnose-runner|build-image-set|execute|start|setup-preflight|cleanup-preview|validate-cleanup-target|cleanup> --run-id <id> [--profile <profile>] [--image-set-id <id>]");
}

if (require.main === module) {
  main({ executeProduction: require("./runtimeComposition").executeProduction }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = { main, planFromArguments, resolveBenchmarkPassword, runSetupPreflight };
