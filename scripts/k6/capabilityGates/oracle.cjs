const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  computeCandidateTree,
  computeCompatibleTree,
} = require("./treeIdentity.cjs");

const parseArguments = (argv) => {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("oracle arguments must be named value pairs");
    }
    result[key.slice(2)] = value;
  }
  return result;
};

const digest = (value) => crypto
  .createHash("sha256")
  .update(JSON.stringify(value))
  .digest("hex");

const runProbe = ({ probeScript, root }) => {
  const result = spawnSync(
    process.execPath,
    [probeScript, "--root", root],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(`contract probe failed for ${path.basename(root)}`);
  }
  return JSON.parse(result.stdout);
};

const main = () => {
  const options = parseArguments(process.argv.slice(2));
  for (const key of [
    "source-base-root",
    "candidate-root",
    "source-base",
    "source-base-tree",
    "output",
  ]) {
    if (!options[key]) throw new Error(`${key} is required`);
  }
  const sourceRoot = path.resolve(options["source-base-root"]);
  const candidateRoot = path.resolve(options["candidate-root"]);
  const sourceTree = computeCompatibleTree(sourceRoot, options["source-base-tree"]);
  const candidateTree = computeCandidateTree(candidateRoot);
  const probeScript = path.join(__dirname, "contractProbe.cjs");
  const sourceObservation = runProbe({ probeScript, root: sourceRoot });
  const candidateObservation = runProbe({ probeScript, root: candidateRoot });
  const sourceChecks = new Map(sourceObservation.checks.map((entry) => [entry.seam, entry.shape]));
  const candidateChecks = new Map(candidateObservation.checks.map((entry) => [entry.seam, entry.shape]));
  const seams = [...new Set([...sourceChecks.keys(), ...candidateChecks.keys()])].sort();
  const contractChecks = seams.map((seam) => {
    const expectedShape = sourceChecks.get(seam) ?? null;
    const actualShape = candidateChecks.get(seam) ?? null;
    return {
      seam,
      actualShape,
      expectedShape,
      exactMatch: JSON.stringify(actualShape) === JSON.stringify(expectedShape),
    };
  });
  const exactMatch = contractChecks.every((check) => check.exactMatch);
  const sourceObservationSha256 = digest(sourceObservation);
  const candidateObservationSha256 = digest(candidateObservation);
  const output = {
    schemaVersion: 1,
    scenario: "contract-oracle",
    candidateTree,
    contractChecks,
    sourceBaseOracle: {
      sourceBase: options["source-base"],
      sourceBaseTree: sourceTree,
      sourceObservationSha256,
      candidateObservationSha256,
      exactMatch,
    },
    externalProviderRequestCount: 0,
    providerMutationCount: 0,
    cleanup: { portReleased: true, processCount: 0 },
  };
  if (!exactMatch) throw new Error("candidate public contract differs from source base");
  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(output, null, 2)}\n`, "utf8");
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
