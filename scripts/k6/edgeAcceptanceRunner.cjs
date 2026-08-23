const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  EdgeAcceptanceInputError,
  computeFilesystemGitTree,
  createObservation,
  parseArguments,
  validateObservation,
} = require("./edgeAcceptanceContract.cjs");
const { EdgeDockerHarness } = require("./edgeDockerHarness.cjs");
const { SCENARIO_RUNNERS } = require("./edgeAcceptanceScenarios.cjs");

const main = async (argv = process.argv.slice(2)) => {
  const options = parseArguments(argv);
  const repository = path.resolve(__dirname, "../..");
  const candidateTree = computeFilesystemGitTree(repository);
  const observation = createObservation(options.scenario, candidateTree);
  const nonce = crypto.randomBytes(6).toString("hex");
  const project = `k6-112-${nonce}`;
  const harness = new EdgeDockerHarness({
    repository,
    candidateTree,
    edgePort: options.edgePort,
    project,
    observation,
  });
  let scenarioError = null;
  let cleanupStarted = false;

  const cleanup = async () => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    await harness.cleanup();
  };
  const signalHandler = () => {
    cleanup().finally(() => {
      process.exitCode = 130;
    });
  };
  process.once("SIGINT", signalHandler);
  process.once("SIGTERM", signalHandler);

  try {
    await harness.start();
    await SCENARIO_RUNNERS[options.scenario](harness, observation);
  } catch (error) {
    scenarioError = error;
  } finally {
    await cleanup();
    process.removeListener("SIGINT", signalHandler);
    process.removeListener("SIGTERM", signalHandler);
  }

  validateObservation(observation);
  fs.writeFileSync(options.output, `${JSON.stringify(observation, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  if (scenarioError) throw scenarioError;
  if (
    !observation.cleanup.portReleased
    || observation.cleanup.containerCount !== 0
    || observation.cleanup.networkCount !== 0
  ) {
    throw new Error("EDGE_ACCEPTANCE_RUNTIME_ERROR=CLEANUP_INCOMPLETE");
  }
  return observation;
};

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof EdgeAcceptanceInputError
      ? error.message
      : "EDGE_ACCEPTANCE_RUNTIME_ERROR=RUN_FAILED";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main };
