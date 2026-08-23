const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

class EdgeHarnessError extends Error {}

const safeEnvironment = (extra = {}) => {
  const allowed = [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SYSTEMROOT",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramData",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOME",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "DOCKER_CONFIG",
  ];
  const environment = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return { ...environment, ...extra };
};

const runProcess = (command, args, { cwd, env, timeoutMs = 180_000 } = {}) => new Promise((resolve) => {
  const child = spawn(command, args, {
    cwd,
    env: safeEnvironment(env),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  child.once("error", () => {
    clearTimeout(timer);
    resolve({ exitCode: 127, stdout: "", stderr: "" });
  });
  child.once("close", (code) => {
    clearTimeout(timer);
    resolve({
      exitCode: Number.isInteger(code) ? code : 124,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    });
  });
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isPortReleased = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});

class EdgeDockerHarness {
  constructor({ repository, candidateTree, edgePort, project, observation }) {
    this.repository = path.resolve(repository);
    this.candidateTree = candidateTree;
    this.edgePort = edgePort;
    this.project = project;
    this.observation = observation;
    this.composeFile = path.join(this.repository, "scripts", "k6", "edge-fixture.compose.yml");
    this.image = `kittachat-k6-112-edge-fixture:${candidateTree}`;
    this.started = false;
    this.cleaned = false;
  }

  get composeEnvironment() {
    return {
      K6_112_CANDIDATE_ROOT: this.repository,
      K6_112_SERVER_NODE_MODULES: path.join(this.repository, "server", "node_modules"),
      K6_112_EDGE_IMAGE: this.image,
      K6_112_EDGE_PORT: String(this.edgePort),
    };
  }

  async command(name, args, { allowFailure = false, timeoutMs, record = true } = {}) {
    const result = await runProcess("docker", args, {
      cwd: this.repository,
      env: this.composeEnvironment,
      timeoutMs,
    });
    if (record) this.observation.commands.push({ name, exitCode: result.exitCode });
    if (!allowFailure && result.exitCode !== 0) {
      throw new EdgeHarnessError(`EDGE_HARNESS_ERROR=${name}`);
    }
    return result;
  }

  composeArguments(...args) {
    return ["compose", "-p", this.project, "-f", this.composeFile, ...args];
  }

  async start() {
    if (!fs.existsSync(this.composeFile)) throw new EdgeHarnessError("EDGE_HARNESS_ERROR=COMPOSE_MISSING");
    await this.command("docker-build-edge", [
      "build",
      "--pull=false",
      "--build-arg",
      "VITE_TARGET=public-demo",
      "--label",
      `org.kittachat.k6.candidate-tree=${this.candidateTree}`,
      "--tag",
      this.image,
      "--file",
      "nginx/Dockerfile",
      ".",
    ], { timeoutMs: 600_000 });
    await this.command(
      "compose-up",
      this.composeArguments("up", "-d", "--wait", "--wait-timeout", "90"),
      { timeoutMs: 180_000 },
    );
    this.started = true;
    const response = await this.edgeFetch("/healthz");
    if (response.status !== 200 || response.body !== "OK") {
      throw new EdgeHarnessError("EDGE_HARNESS_ERROR=EDGE_HEALTH");
    }
  }

  async edgeFetch(route, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`http://127.0.0.1:${this.edgePort}${route}`, {
        ...options,
        redirect: "manual",
        signal: controller.signal,
      });
      return {
        status: response.status,
        headers: response.headers,
        body: await response.text(),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async backendControl(pathname) {
    const script = `fetch('http://127.0.0.1:3000${pathname}').then(async r=>{if(!r.ok)process.exit(2);process.stdout.write(await r.text())}).catch(()=>process.exit(3))`;
    const result = await this.command(
      pathname === "/__control/counter" ? "backend-counter" : "backend-socket-state",
      this.composeArguments("exec", "-T", "backend", "node", "-e", script),
    );
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new EdgeHarnessError("EDGE_HARNESS_ERROR=CONTROL_RESPONSE");
    }
  }

  async counter() {
    const state = await this.backendControl("/__control/counter");
    if (!Number.isInteger(state.count) || state.count < 0) {
      throw new EdgeHarnessError("EDGE_HARNESS_ERROR=COUNTER_RESPONSE");
    }
    return state.count;
  }

  async requestWithCounter(route, options = {}) {
    const before = await this.counter();
    const response = await this.edgeFetch(route, options);
    const after = await this.counter();
    return { response, before, after };
  }

  async stopBackend() {
    await this.command("compose-stop-backend", this.composeArguments("stop", "backend"));
  }

  async restartBackend() {
    await this.command("compose-restart-backend", this.composeArguments("restart", "backend"));
    let lastExitCode = 1;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await this.command(
        "backend-health-wait",
        this.composeArguments(
          "exec",
          "-T",
          "backend",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/__control/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ),
        { allowFailure: true, timeoutMs: 10_000, record: false },
      );
      lastExitCode = result.exitCode;
      if (result.exitCode === 0) {
        this.observation.commands.push({ name: "backend-health-wait", exitCode: 0 });
        return;
      }
      await wait(500);
    }
    this.observation.commands.push({ name: "backend-health-wait", exitCode: lastExitCode });
    throw new EdgeHarnessError("EDGE_HARNESS_ERROR=BACKEND_RESTART_HEALTH");
  }

  async cleanup() {
    if (this.cleaned) return this.observation.cleanup;
    this.cleaned = true;
    await this.command(
      "compose-down",
      this.composeArguments("down", "--remove-orphans", "--volumes"),
      { allowFailure: true, timeoutMs: 120_000 },
    );
    const containers = await this.command(
      "cleanup-container-count",
      ["ps", "-aq", "--filter", `label=com.docker.compose.project=${this.project}`],
      { allowFailure: true },
    );
    const networks = await this.command(
      "cleanup-network-count",
      ["network", "ls", "-q", "--filter", `label=com.docker.compose.project=${this.project}`],
      { allowFailure: true },
    );
    const countLines = (value) => value.split(/\r?\n/).filter(Boolean).length;
    this.observation.cleanup = {
      portReleased: await isPortReleased(this.edgePort),
      containerCount: countLines(containers.stdout),
      networkCount: countLines(networks.stdout),
    };
    return this.observation.cleanup;
  }
}

module.exports = {
  EdgeDockerHarness,
  EdgeHarnessError,
  isPortReleased,
};
