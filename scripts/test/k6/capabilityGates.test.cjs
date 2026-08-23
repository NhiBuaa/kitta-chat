const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  computeCandidateTree,
  computeCompatibleTree,
} = require("../../k6/capabilityGates/treeIdentity.cjs");

const repository = path.resolve(__dirname, "..", "..", "..");
const acceptScript = path.join(repository, "scripts", "k6", "capabilityGates", "accept.cjs");
const oracleScript = path.join(repository, "scripts", "k6", "capabilityGates", "oracle.cjs");
const scenarios = [
  "env-matrix",
  "disabled-auth",
  "disabled-upload",
  "calls-disabled",
  "calls-enabled",
  "synthetic-signup",
  "legacy-contract",
  "limiter-contract",
];

const isRuntimeEnvironmentFile = (name) => name === ".env"
  || (name.startsWith(".env.") && !name.endsWith(".example"));

const createImmutableFixture = (temporary, { coreAutocrlf = "false" } = {}) => {
  const fixtureRepository = path.join(temporary, "fixture-repository");
  fs.cpSync(repository, fixtureRepository, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(repository, source);
      if (!relative) return true;
      const segments = relative.split(path.sep);
      if (segments.includes(".git") || segments.includes("node_modules")) return false;
      if (isRuntimeEnvironmentFile(path.basename(source))) return false;
      return !(segments[0] === "client" && segments[1] === "dist");
    },
  });
  execFileSync("git", ["-C", fixtureRepository, "init", "--quiet"]);
  execFileSync("git", ["-C", fixtureRepository, "config", "core.autocrlf", coreAutocrlf]);
  execFileSync(
    "git",
    ["-C", fixtureRepository, "add", "--force", "--all"],
    { stdio: "ignore" },
  );
  execFileSync("git", [
    "-C", fixtureRepository,
    "-c", "user.name=K6 Fixture",
    "-c", "user.email=k6-fixture@kittachat.test",
    "commit", "--quiet", "--no-gpg-sign", "-m", "fixture",
  ]);
  return {
    repository: fixtureRepository,
    commit: execFileSync("git", ["-C", fixtureRepository, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    tree: execFileSync("git", ["-C", fixtureRepository, "rev-parse", "HEAD^{tree}"], {
      encoding: "utf8",
    }).trim(),
  };
};

test("candidate tree reconstruction matches an immutable Git archive", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "k6-113-tree-test-"));
  const archive = path.join(temporary, "source.tar");
  const extracted = path.join(temporary, "source");
  fs.mkdirSync(extracted);
  try {
    const fixture = createImmutableFixture(temporary);
    execFileSync("git", [
      "-C", fixture.repository,
      "archive", "--format=tar", `--output=${archive}`, fixture.commit,
    ]);
    execFileSync("tar", ["-xf", archive, "-C", extracted]);
    assert.equal(computeCandidateTree(extracted), fixture.tree);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test("candidate tree reconstruction reverses host archive line-ending filters", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "k6-113-filtered-tree-test-"));
  const archive = path.join(temporary, "source.tar");
  const extracted = path.join(temporary, "source");
  fs.mkdirSync(extracted);
  try {
    const fixture = createImmutableFixture(temporary, { coreAutocrlf: "input" });
    execFileSync("git", [
      "-C", fixture.repository,
      "config", "core.autocrlf", "true",
    ]);
    execFileSync("git", [
      "-C", fixture.repository,
      "archive", "--format=tar", `--output=${archive}`, fixture.commit,
    ]);
    execFileSync("tar", ["-xf", archive, "-C", extracted]);
    assert.equal(computeCompatibleTree(extracted, fixture.tree), fixture.tree);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test("unknown acceptance scenarios fail before binding the requested port", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "k6-113-unknown-"));
  try {
    const result = spawnSync(process.execPath, [
      acceptScript,
      "--scenario", "unknown",
      "--port", "4184",
      "--output", path.join(temporary, "unknown.json"),
    ], { cwd: repository, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown capability-gate acceptance scenario/);
    assert.equal(fs.existsSync(path.join(temporary, "unknown.json")), false);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test("oracle launches isolated source and candidate probes bound to the immutable source tree", { timeout: 60_000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "k6-113-oracle-test-"));
  const archive = path.join(temporary, "source.tar");
  const source = path.join(temporary, "source");
  const candidate = path.join(temporary, "candidate");
  const output = path.join(temporary, "oracle.json");
  fs.mkdirSync(source);
  fs.mkdirSync(candidate);
  try {
    const fixture = createImmutableFixture(temporary);
    execFileSync("git", [
      "-C", fixture.repository,
      "archive", "--format=tar", `--output=${archive}`, fixture.commit,
    ]);
    execFileSync("tar", ["-xf", archive, "-C", source]);
    execFileSync("tar", ["-xf", archive, "-C", candidate]);
    for (const root of [source, candidate]) {
      fs.symlinkSync(
        path.join(repository, "server", "node_modules"),
        path.join(root, "server", "node_modules"),
        "junction",
      );
    }
    const sourceBase = fixture.commit;
    const sourceTree = fixture.tree;
    const result = spawnSync(process.execPath, [
      oracleScript,
      "--source-base-root", source,
      "--candidate-root", candidate,
      "--source-base", sourceBase,
      "--source-base-tree", sourceTree,
      "--output", output,
    ], { cwd: repository, encoding: "utf8", timeout: 45_000 });
    assert.equal(result.status, 0, result.stderr);
    const observation = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(observation.sourceBaseOracle.sourceBase, sourceBase);
    assert.equal(observation.sourceBaseOracle.sourceBaseTree, sourceTree);
    assert.equal(observation.sourceBaseOracle.exactMatch, true);
    assert.equal(observation.contractChecks.every((entry) => entry.exactMatch), true);
    assert.equal(observation.externalProviderRequestCount, 0);
    assert.equal(observation.providerMutationCount, 0);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});

test("all one-shot scenarios emit sanitized observations and release their listener", { timeout: 120_000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "k6-113-scenarios-"));
  try {
    scenarios.forEach((scenario, index) => {
      const output = path.join(temporary, `${scenario}.json`);
      const result = spawnSync(process.execPath, [
        acceptScript,
        "--scenario", scenario,
        "--port", String(4300 + index),
        "--output", output,
      ], {
        cwd: repository,
        encoding: "utf8",
        timeout: 90_000,
      });
      assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
      const observation = JSON.parse(fs.readFileSync(output, "utf8"));
      assert.equal(observation.scenario, scenario);
      assert.match(observation.candidateTree, /^[0-9a-f]{40}$/);
      assert.equal(observation.externalProviderRequestCount, 0);
      assert.equal(observation.providerMutationCount, 0);
      assert.deepEqual(observation.cleanup, { portReleased: true, processCount: 0 });
      const retained = fs.readFileSync(output, "utf8");
      assert.doesNotMatch(retained, /Authorization:|Bearer |AKIA[0-9A-Z]{16}/i);
      assert.doesNotMatch(retained, /(?:mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s/@:]+:[^\s/@]+@/i);
    });
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
});
