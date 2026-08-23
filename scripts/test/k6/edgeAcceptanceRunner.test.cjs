const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const YAML = require("yaml");

const repository = path.resolve(__dirname, "../../..");
const runnerPath = path.join(repository, "scripts", "k6", "edgeAcceptanceRunner.cjs");
const contractPath = path.join(repository, "scripts", "k6", "edgeAcceptanceContract.cjs");
const composePath = path.join(repository, "scripts", "k6", "edge-fixture.compose.yml");

test("accept:k6-edge exposes exactly the five locked scenarios", () => {
  const contract = require(contractPath);
  assert.deepEqual(
    [...contract.SUPPORTED_SCENARIOS],
    ["rest-origin", "socket-reconnect", "backend-down", "route-matrix", "spa-precedence"],
  );
});

test("unknown scenario fails before any Docker command starts", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k6-112-unknown-"));
  const marker = path.join(temporaryDirectory, "docker-started");
  const output = path.join(temporaryDirectory, "observation.json");
  const fakeDocker = path.join(temporaryDirectory, "fake-docker.cjs");
  fs.writeFileSync(
    fakeDocker,
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started"); process.exit(99);\n`,
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        runnerPath,
        "--scenario",
        "unknown",
        "--edge-port",
        "4182",
        "--output",
        output,
      ],
      {
        cwd: repository,
        env: {
          ...process.env,
          K6_112_DOCKER_COMMAND: `${process.execPath} ${fakeDocker}`,
        },
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /unsupported scenario/);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("CLI rejects non-4182 ports and relative observation paths before Docker", () => {
  for (const args of [
    ["--scenario", "rest-origin", "--edge-port", "4183", "--output", path.join(os.tmpdir(), "x.json")],
    ["--scenario", "rest-origin", "--edge-port", "4182", "--output", "relative.json"],
  ]) {
    const result = spawnSync(process.execPath, [runnerPath, ...args], {
      cwd: repository,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /EDGE_ACCEPTANCE_INPUT_ERROR=/);
  }
});

test("fixture Compose keeps the backend private and exposes only loopback edge port", () => {
  const compose = YAML.parse(fs.readFileSync(composePath, "utf8"));
  const backend = compose.services.backend;
  const edge = compose.services.edge;
  assert.equal(Object.hasOwn(backend, "ports"), false);
  assert.deepEqual(backend.expose, ["3000"]);
  assert.equal(backend.read_only, true);
  assert.deepEqual(backend.networks.default.aliases, ["backend.internal.test"]);
  assert.equal(
    backend.volumes.some((volume) => volume === "${K6_112_SERVER_NODE_MODULES}:/dependencies/node_modules:ro"),
    true,
  );
  assert.deepEqual(edge.ports, ["127.0.0.1:${K6_112_EDGE_PORT}:80"]);
  assert.equal(edge.environment.K6_TARGET, "public-demo");
  assert.equal(edge.environment.BACKEND_UPSTREAM, "backend.internal.test:3000");
  assert.equal(edge.environment.K6_EDGE_ALLOW_TEST_UPSTREAM, "true");
  assert.equal(backend.pull_policy, "never");
  assert.equal(edge.pull_policy, "never");
});

test("sanitized observation contract accepts only the locked top-level and nested fields", () => {
  const { createObservation, validateObservation } = require(contractPath);
  const observation = createObservation("rest-origin", "a".repeat(40));
  observation.commands.push({ name: "docker-build-edge", exitCode: 0 });
  observation.http.push({
    method: "GET",
    path: "/api/probe",
    status: 200,
    contentCategory: "backend-json",
    upstreamHitCountBefore: 0,
    upstreamHitCountAfter: 1,
    upstreamHitDelta: 1,
  });
  observation.headerChecks.push({
    seam: "rest-present-origin",
    originEqual: true,
    originAbsent: false,
    hostPresent: true,
    realIpPresent: true,
    forwardedForPresent: true,
    forwardedProtoPresent: true,
    forbiddenSubstitutionAbsent: true,
  });
  observation.artifactChecks.push({ name: "edge-health-minimal", matched: true });
  observation.cleanup = { portReleased: true, containerCount: 0, networkCount: 0 };
  assert.equal(validateObservation(observation), observation);

  for (const mutate of [
    (value) => { value.rawHeaders = { origin: "forbidden" }; },
    (value) => { value.commands[0].command = "docker inspect"; },
    (value) => { value.http[0].body = "forbidden"; },
    (value) => { value.headerChecks[0].origin = "https://sentinel.invalid"; },
    (value) => { value.cleanup.logs = "forbidden"; },
  ]) {
    const unsafe = structuredClone(observation);
    mutate(unsafe);
    assert.throws(() => validateObservation(unsafe), /EDGE_OBSERVATION_ERROR=/);
  }
});

test("candidate tree hashing ignores installed dependencies and matches Git tree semantics", () => {
  const { computeFilesystemGitTree } = require(contractPath);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k6-112-tree-"));
  try {
    fs.mkdirSync(path.join(temporaryDirectory, "nested"));
    fs.mkdirSync(path.join(temporaryDirectory, "node_modules"));
    fs.writeFileSync(path.join(temporaryDirectory, "alpha.txt"), "alpha\n");
    fs.writeFileSync(path.join(temporaryDirectory, "nested", "beta.txt"), "beta\n");
    fs.writeFileSync(path.join(temporaryDirectory, "node_modules", "ignored.txt"), "ignored\n");

    const expected = spawnSync(
      "git",
      ["-c", "core.autocrlf=false", "-c", "core.filemode=false", "init", "--quiet"],
      { cwd: temporaryDirectory, encoding: "utf8" },
    );
    assert.equal(expected.status, 0, expected.stderr);
    assert.equal(spawnSync("git", ["add", "alpha.txt", "nested/beta.txt"], {
      cwd: temporaryDirectory,
      encoding: "utf8",
    }).status, 0);
    const writeTree = spawnSync("git", ["write-tree"], {
      cwd: temporaryDirectory,
      encoding: "utf8",
    });
    assert.equal(writeTree.status, 0, writeTree.stderr);
    assert.equal(computeFilesystemGitTree(temporaryDirectory), writeTree.stdout.trim());
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
