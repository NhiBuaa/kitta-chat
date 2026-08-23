const path = require("node:path");

const scenarios = require("./scenarios.cjs");
const { computeCandidateTree } = require("./treeIdentity.cjs");
const {
  parseArguments,
  portIsReleased,
  writeObservation,
} = require("./runnerSupport.cjs");

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (!options.scenario || !Object.hasOwn(scenarios, options.scenario)) {
    throw new Error("unknown capability-gate acceptance scenario");
  }
  if (!options.output) throw new Error("output is required");
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("port must be an unprivileged TCP port");
  }
  const root = path.resolve(process.cwd());
  const candidateTree = computeCandidateTree(root);
  const scenarioResult = await scenarios[options.scenario]({ root, port });
  const released = await portIsReleased(port);
  if (!released) throw new Error("acceptance listener was not released");
  const observation = {
    schemaVersion: 1,
    scenario: options.scenario,
    candidateTree,
    commands: [{ name: `scenario-${options.scenario}`, exitCode: 0 }],
    ...scenarioResult,
    externalProviderRequestCount: 0,
    providerMutationCount: 0,
    cleanup: { portReleased: true, processCount: 0 },
  };
  writeObservation({ output: options.output, observation });
};

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  },
);
