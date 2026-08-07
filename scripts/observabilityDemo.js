const path = require("node:path");
const { spawn } = require("node:child_process");

const { ensureDemoEnvironment } = require("./demoEnvironment");

const repositoryRoot = path.resolve(__dirname, "..");
const PROJECT_NAME = "kittachat-k3-1";
const OBSERVABILITY_PROFILE = "observability";
const GRAFANA_URL = "http://127.0.0.1:3001";
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.observability.yml"];
const REQUIRED_SERVICES = ["mongo", "redis", "backend", "prometheus", "grafana"];
const DEFAULT_WAIT = {
  timeoutMs: 180_000,
  intervalMs: 2_000,
};

class DemoActionError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "DemoActionError";
    this.stage = stage;
  }
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function composeArgs(commandArgs = []) {
  return [
    "compose",
    "--project-name",
    PROJECT_NAME,
    ...COMPOSE_FILES.flatMap((file) => ["--file", file]),
    "--profile",
    OBSERVABILITY_PROFILE,
    ...commandArgs,
  ];
}

function runChildProcess(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", () => {});
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr: "" });
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function createDockerProcessAdapter({
  command = "docker",
  cwd = repositoryRoot,
  env = { ...process.env, COMPOSE_PROJECT_NAME: PROJECT_NAME },
  run = runChildProcess,
} = {}) {
  return {
    run(args) {
      return run(command, args, { cwd, env });
    },
  };
}

function getStdout(result) {
  if (typeof result === "string") return result;
  return String(result?.stdout || "");
}

function parseComposePsOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  }
}

function serviceName(entry) {
  return String(entry?.Service || entry?.service || "");
}

function serviceIsReady(entry) {
  const state = String(entry?.State || entry?.state || "").toLowerCase();
  const health = String(entry?.Health || entry?.health || "").toLowerCase();
  const status = String(entry?.Status || entry?.status || "").toLowerCase();
  const running = state === "running"
    || state === "up"
    || status.includes("running")
    || status.startsWith("up ")
    || status === "up";
  const healthy = !health || health === "healthy" || health.includes("healthy");
  return running && healthy;
}

function projectIsReady(stdout) {
  const entries = parseComposePsOutput(stdout);
  const byService = new Map(entries.map((entry) => [serviceName(entry), entry]));
  return REQUIRED_SERVICES.every((name) => {
    const entry = byService.get(name);
    return Boolean(entry && serviceIsReady(entry));
  });
}

async function waitForCondition(
  check,
  {
    timeoutMs = DEFAULT_WAIT.timeoutMs,
    intervalMs = DEFAULT_WAIT.intervalMs,
    delay = sleep,
    now = Date.now,
    description = "condition",
  } = {},
) {
  const deadline = now() + timeoutMs;
  const maxAttempts = Math.max(
    1,
    Math.ceil(timeoutMs / Math.max(intervalMs, 1)) + 1,
  );
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts && now() <= deadline; attempt += 1) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < maxAttempts && now() <= deadline) {
      await delay(intervalMs);
    }
  }

  const suffix = lastError?.name ? ` (${lastError.name})` : "";
  throw new Error(`${description} did not become ready${suffix}.`);
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response?.ok) {
    throw new Error(`HTTP ${response?.status || "request"} was not successful`);
  }
  return response.json();
}

function dashboardIsProvisioned(searchResult) {
  return Array.isArray(searchResult)
    && searchResult.some((dashboard) => (
      dashboard?.uid === "kittachat-k3-observability"
      && dashboard?.title === "KittaChat K3 Observability"
    ));
}

function stageFailure(stage) {
  return new DemoActionError(stage, `Local Observability Stack ${stage} stage failed.`);
}

function writeOutput(output, method, message) {
  if (typeof output?.[method] === "function") {
    output[method](message);
  }
}

class LocalObservabilityDemo {
  constructor({
    processAdapter = createDockerProcessAdapter(),
    ensureEnvironment = ensureDemoEnvironment,
    environment = {
      envPath: path.join(repositoryRoot, "server", ".env"),
      templatePath: path.join(repositoryRoot, "server", ".env.example"),
    },
    fetchImpl = fetch,
    output = console,
    wait = {},
    grafanaUrl = GRAFANA_URL,
  } = {}) {
    if (!processAdapter || typeof processAdapter.run !== "function") {
      throw new TypeError("LocalObservabilityDemo requires a process adapter");
    }
    if (typeof ensureEnvironment !== "function") {
      throw new TypeError("LocalObservabilityDemo requires an environment initializer");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("LocalObservabilityDemo requires a fetch implementation");
    }

    this.processAdapter = processAdapter;
    this.ensureEnvironment = ensureEnvironment;
    this.environment = environment;
    this.fetchImpl = fetchImpl;
    this.output = output;
    this.wait = { ...DEFAULT_WAIT, delay: sleep, now: Date.now, ...wait };
    this.grafanaUrl = grafanaUrl;
  }

  async run(action) {
    if (action === "start") return this.start();
    if (action === "stop") return this.stop();
    throw new DemoActionError(
      "interface",
      `Action "${action || ""}" is not part of the Issue #70 implementation slice.`,
    );
  }

  async start() {
    let environmentResult;
    try {
      environmentResult = await this.ensureEnvironment(this.environment);
      writeOutput(
        this.output,
        "log",
        environmentResult?.created
          ? "[start] preflight: created server/.env with local-only generated secrets."
          : "[start] preflight: using existing server/.env without modifying it.",
      );
    } catch {
      throw stageFailure("preflight");
    }

    try {
      await this.processAdapter.run(composeArgs([
        "up",
        "--detach",
        "--build",
        "grafana",
      ]));
      writeOutput(this.output, "log", "[start] compose: isolated project started.");
    } catch {
      throw stageFailure("compose");
    }

    try {
      await waitForCondition(
        async () => {
          const result = await this.processAdapter.run(composeArgs([
            "ps",
            "--format",
            "json",
          ]));
          return projectIsReady(getStdout(result));
        },
        {
          ...this.wait,
          description: "K3.1 dependency readiness",
        },
      );
      writeOutput(this.output, "log", "[start] readiness: dependency chain is healthy.");
    } catch {
      throw stageFailure("readiness");
    }

    try {
      await waitForCondition(
        async () => {
          const health = await fetchJson(this.fetchImpl, `${this.grafanaUrl}/api/health`);
          if (health?.version !== "12.4.8") return false;
          const search = await fetchJson(
            this.fetchImpl,
            `${this.grafanaUrl}/api/search?query=KittaChat%20K3%20Observability`,
          );
          return dashboardIsProvisioned(search);
        },
        {
          ...this.wait,
          description: "Grafana provisioning",
        },
      );
      writeOutput(
        this.output,
        "log",
        `[start] provisioning: Grafana K3 dashboard ready at ${this.grafanaUrl}.`,
      );
    } catch {
      throw stageFailure("provisioning");
    }

    return {
      action: "start",
      projectName: PROJECT_NAME,
      grafanaUrl: this.grafanaUrl,
      environmentCreated: Boolean(environmentResult?.created),
      stages: ["preflight", "compose", "readiness", "provisioning"],
    };
  }

  async stop() {
    try {
      await this.processAdapter.run(composeArgs([
        "down",
        "--remove-orphans",
      ]));
      writeOutput(this.output, "log", "[stop] cleanup: stopped the isolated project without deleting volumes.");
    } catch {
      throw stageFailure("stop");
    }

    return { action: "stop", projectName: PROJECT_NAME };
  }
}

async function runDemoAction(action, options) {
  return new LocalObservabilityDemo(options).run(action);
}

async function main(argv = process.argv.slice(2)) {
  const [action] = argv;
  if (!action) {
    throw new DemoActionError("interface", "Usage: npm run demo:observability -- <start|stop>");
  }
  return runDemoAction(action);
}

if (require.main === module) {
  main().catch((error) => {
    const stage = error?.stage || "unknown";
    console.error(`[Demo] ${stage}: ${error?.message || "operation failed"}`);
    process.exitCode = 1;
  });
}

module.exports = {
  COMPOSE_FILES,
  DemoActionError,
  GRAFANA_URL,
  LocalObservabilityDemo,
  OBSERVABILITY_PROFILE,
  PROJECT_NAME,
  REQUIRED_SERVICES,
  composeArgs,
  createDockerProcessAdapter,
  dashboardIsProvisioned,
  main,
  parseComposePsOutput,
  projectIsReady,
  runDemoAction,
  serviceIsReady,
  waitForCondition,
};
