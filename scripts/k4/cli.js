const crypto = require("node:crypto");
const { attestRuntimeTopology, buildImageSet, compareEffectiveTopologySnapshots, createRunPlan, createResultDirectory, cleanup, cleanupPreview, currentEffectiveTopologySnapshot, docker, imageSetEnvironment, runnerDiagnosticArgs, startArgs, validateCleanupTarget } = require("./lifecycle");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] || null;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function planFromArguments() {
  return createRunPlan({ runId: argument("--run-id"), profile: argument("--profile") });
}

function main() {
  const action = process.argv[2];
  if (action === "resolve") return print(planFromArguments());
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
    const plan = planFromArguments();
    return process.stdout.write(docker(runnerDiagnosticArgs(plan), {
      env: { ...process.env, K4_PROJECT_NAME: plan.projectName, K4_RUN_ID: plan.runId, K4_RESULT_DIR: plan.resultDirectory },
    }));
  }
  if (action === "build-image-set") return print({ action, imageSet: buildImageSet(argument("--image-set-id")) });
  if (action === "start") {
    const plan = planFromArguments();
    const imageSet = imageSetEnvironment(argument("--image-set-id"));
    createResultDirectory(plan);
    docker(startArgs(plan), {
      env: {
        ...process.env,
        ...imageSet,
        K4_PROJECT_NAME: plan.projectName,
        K4_RUN_ID: plan.runId,
        K4_RESULT_DIR: plan.resultDirectory,
        K4_JWT_SECRET: process.env.K4_JWT_SECRET || crypto.randomBytes(48).toString("hex"),
      },
    });
    return print({ action, plan });
  }
  if (action === "cleanup-preview") return print(cleanupPreview(argument("--run-id")));
  if (action === "validate-cleanup-target") {
    let target;
    try { target = JSON.parse(argument("--target-json")); } catch { throw new Error("--target-json must be valid JSON."); }
    return print(validateCleanupTarget(argument("--class"), target, argument("--run-id")));
  }
  if (action === "cleanup") return print(cleanup(argument("--run-id"), argument("--confirm-digest")));
  throw new Error("usage: k4 <resolve|compare|diagnose-runner|build-image-set|start|cleanup-preview|validate-cleanup-target|cleanup> --run-id <id> [--profile <profile>] [--image-set-id <id>]");
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
