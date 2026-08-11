"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const REDIS_IMAGE = "redis:7.0.0";
const SERVER_ROOT = path.resolve(__dirname, "..");
const STANDALONE_NAME = "issue-61-rate-limit-standalone";
const CLUSTER_NAME = "issue-61-rate-limit-cluster";
const STANDALONE_PORT = 6379;
const CLUSTER_PORTS = [7000, 7001, 7002];

const runDocker = (args, { stdio = "pipe" } = {}) => {
  const result = spawnSync("docker", args, {
    cwd: SERVER_ROOT,
    encoding: "utf8",
    stdio,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = String(result.stderr || result.stdout || "").trim();
    throw new Error(`docker ${args.join(" ")} failed${details ? `: ${details}` : ""}`);
  }
  return String(result.stdout || "").trim();
};

const containerExists = (name) => spawnSync("docker", ["inspect", name], {
  cwd: SERVER_ROOT,
  stdio: "ignore",
}).status === 0;

const assertContainerAbsent = (name) => {
  if (containerExists(name)) {
    throw new Error(`Refusing to reuse existing container ${name}; stop or rename it first`);
  }
};

const removeContainer = (name) => {
  if (containerExists(name)) runDocker(["rm", "-f", name], { stdio: "ignore" });
};

const waitFor = async (check, { timeoutMs = 30_000, intervalMs = 250, label } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label || "acceptance dependency"}`);
};

const startStandalone = () => {
  runDocker([
    "run",
    "--detach",
    "--rm",
    "--name",
    STANDALONE_NAME,
    "--publish",
    `${STANDALONE_PORT}:6379`,
    REDIS_IMAGE,
    "redis-server",
    "--save",
    "",
    "--appendonly",
    "no",
    "--protected-mode",
    "no",
  ]);
};

const startCluster = () => {
  const clusterScript = [
    "set -eu",
    ...CLUSTER_PORTS.map((port, index) => [
      "redis-server",
      "--bind 0.0.0.0",
      `--port ${port}`,
      "--cluster-enabled yes",
      `--cluster-config-file /tmp/nodes-${port}.conf`,
      "--cluster-node-timeout 5000",
      "--appendonly no",
      "--protected-mode no",
      "--daemonize yes",
      "--cluster-announce-ip 127.0.0.1",
      `--cluster-announce-port ${port}`,
      `--cluster-announce-bus-port ${port + 10_000}`,
    ].filter(Boolean).join(" ")),
    "tail -f /dev/null",
  ].join("; ");

  runDocker([
    "run",
    "--detach",
    "--rm",
    "--name",
    CLUSTER_NAME,
    ...CLUSTER_PORTS.flatMap((port) => ["--publish", `${port}:${port}`]),
    ...CLUSTER_PORTS.flatMap((port) => ["--publish", `${port + 10_000}:${port + 10_000}`]),
    REDIS_IMAGE,
    "sh",
    "-c",
    clusterScript,
  ]);
};

const redisPing = (name, port) => {
  const result = spawnSync("docker", ["exec", name, "redis-cli", "-p", String(port), "ping"], {
    cwd: SERVER_ROOT,
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.trim() === "PONG";
};

const clusterInfo = () => {
  const result = spawnSync(
    "docker",
    ["exec", CLUSTER_NAME, "redis-cli", "-p", String(CLUSTER_PORTS[0]), "cluster", "info"],
    { cwd: SERVER_ROOT, encoding: "utf8" },
  );
  return result.status === 0 ? result.stdout : "";
};

const prepareRedis = async () => {
  await waitFor(() => redisPing(STANDALONE_NAME, 6379), {
    label: "standalone Redis 7.0.0",
  });
  await Promise.all(CLUSTER_PORTS.map((port) => waitFor(() => redisPing(CLUSTER_NAME, port), {
    label: `cluster Redis primary ${port}`,
  })));

  runDocker([
    "exec",
    CLUSTER_NAME,
    "redis-cli",
    "--cluster",
    "create",
    ...CLUSTER_PORTS.map((port) => `127.0.0.1:${port}`),
    "--cluster-replicas",
    "0",
    "--cluster-yes",
  ], { stdio: "inherit" });

  await waitFor(() => clusterInfo().includes("cluster_state:ok"), {
    label: "native three-primary Redis Cluster 7.0.0",
  });
};

const runAcceptanceTests = () => {
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", "test/rateLimit/distributedAdmission.test.js"],
    {
      cwd: SERVER_ROOT,
      env: {
        ...process.env,
        RATE_LIMIT_REDIS_URL: `redis://127.0.0.1:${STANDALONE_PORT}`,
        RATE_LIMIT_REDIS_CLUSTER_URLS: CLUSTER_PORTS
          .map((port) => `redis://127.0.0.1:${port}`)
          .join(","),
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Redis acceptance tests failed with exit code ${result.status}`);
};

const main = async () => {
  assertContainerAbsent(STANDALONE_NAME);
  assertContainerAbsent(CLUSTER_NAME);

  const started = [];
  try {
    startStandalone();
    started.push(STANDALONE_NAME);
    startCluster();
    started.push(CLUSTER_NAME);
    await prepareRedis();
    runAcceptanceTests();
    console.log("RATE_LIMIT_ACCEPTANCE=PASS");
    console.log("REDIS_STANDALONE=redis:7.0.0");
    console.log("REDIS_CLUSTER=native-three-primary:redis:7.0.0");
  } finally {
    for (const name of started.reverse()) removeContainer(name);
  }
};

main().catch((error) => {
  console.error(`RATE_LIMIT_ACCEPTANCE=FAIL: ${error.message}`);
  process.exitCode = 1;
});
