const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { ensureDemoEnvironment } = require("./demoEnvironment");

const repositoryRoot = path.resolve(__dirname, "..");
const PROJECT_NAME = "kittachat-k3-1";
const OBSERVABILITY_PROFILE = "observability";
const GRAFANA_URL = "http://127.0.0.1:3001";
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.observability.yml"];
const REQUIRED_SERVICES = ["mongo", "redis", "backend", "prometheus", "grafana"];
const VOLUME_PROJECT_LABEL = "com.docker.compose.project";
const SAFE_TRAFFIC_REQUEST_COUNT = 5;
const PROMETHEUS_QUERY_URL = "http://127.0.0.1:9090/api/v1/query";
const PROMETHEUS_TARGET_QUERY = 'up{job="kittachat-k3-1-backend",instance="backend:3000"}';
const PROMETHEUS_REQUEST_RATE_QUERY = 'sum(rate(kittachat_http_requests_total{instance="backend:3000"}[1m]))';
const PROMETHEUS_LATENCY_QUERY = 'histogram_quantile(0.95, sum by (le) (rate(kittachat_http_request_duration_seconds_bucket{instance="backend:3000"}[1m])))';
const SAFE_TRAFFIC_SCRIPT = [
  `const count = ${SAFE_TRAFFIC_REQUEST_COUNT};`,
  "const run = async () => {",
  "  for (let index = 0; index < count; index += 1) {",
  "    const response = await fetch('http://127.0.0.1:3000/healthz');",
  "    if (!response.ok || response.status < 200 || response.status >= 300) process.exit(1);",
  "    await response.arrayBuffer();",
  "  }",
  "  process.stdout.write(JSON.stringify({ successfulRequests: count, statusClass: '2xx' }));",
  "};",
  "run().catch(() => process.exit(1));",
].join(" ");
const DEFAULT_WAIT = {
  timeoutMs: 180_000,
  intervalMs: 2_000,
};
const DEFAULT_OPERATION_TIMEOUT_MS = 15_000;

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

function runChildProcess(command, args, { cwd, env, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      signal,
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
    run(args, options = {}) {
      return run(command, args, { cwd, env, ...options });
    },
  };
}

function createDockerVolumeAdapter({ processAdapter = createDockerProcessAdapter() } = {}) {
  return {
    async listOwnedVolumes({ signal } = {}) {
      const listed = await processAdapter.run([
        "volume",
        "ls",
        "--filter",
        `label=${VOLUME_PROJECT_LABEL}=${PROJECT_NAME}`,
        "--format",
        "{{.Name}}",
      ], { signal });
      const names = String(getStdout(listed) || "")
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length === 0) return [];

      const inspected = await processAdapter.run([
        "volume",
        "inspect",
        "--format",
        "{{json .}}",
        ...names,
      ], { signal });
      return String(getStdout(inspected) || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseJsonOutput(line, "Docker volume inspection"))
        .map((volume) => ({
          name: volume?.Name,
          labels: volume?.Labels || {},
        }));
    },
    async removeVolumes(expectedVolumes, { signal } = {}) {
      const expected = normalizeOwnedVolumes(expectedVolumes);
      if (expected.length === 0) return;

      const current = normalizeOwnedVolumes(await this.listOwnedVolumes({ signal }));
      if (targetSetDigest(current) !== targetSetDigest(expected)) {
        throw new Error("Docker volume target set changed before removal.");
      }

      await processAdapter.run(
        ["volume", "rm", ...current.map((volume) => volume.name)],
        { signal },
      );
    },
  };
}

function getStdout(result) {
  if (typeof result === "string") return result;
  return String(result?.stdout || "");
}

function parseJsonOutput(stdout, description) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch {
    throw new Error(`${description} returned invalid JSON.`);
  }
}

function normalizeOwnedVolumes(volumes) {
  if (!Array.isArray(volumes)) {
    throw new Error("Docker volume Adapter returned an invalid volume list.");
  }

  const normalized = volumes.map((volume) => {
    const name = String(volume?.name || "").trim();
    const labels = Object.fromEntries(
      Object.entries(volume?.labels || {})
        .map(([key, value]) => [String(key), String(value)])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    if (!name || labels[VOLUME_PROJECT_LABEL] !== PROJECT_NAME) {
      throw new Error("Docker volume target is not labeled for the K3.1 project.");
    }
    return { name, labels };
  });

  normalized.sort((left, right) => left.name.localeCompare(right.name));
  if (new Set(normalized.map((volume) => volume.name)).size !== normalized.length) {
    throw new Error("Docker volume target set contains duplicate names.");
  }
  return normalized;
}

function targetSetDigest(volumes) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(volumes))
    .digest("hex");
}

function parsePrometheusResponse(stdout, description) {
  const payload = parseJsonOutput(stdout, description);
  if (payload?.status !== "success" || !Array.isArray(payload?.data?.result)) {
    throw new Error(`${description} returned an unsuccessful Prometheus response.`);
  }
  return payload;
}

async function fetchJsonResponse(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options);
  if (!response?.ok) {
    throw new Error(`HTTP ${response?.status || "request"} was not successful`);
  }
  return {
    status: response.status,
    body: await response.json(),
  };
}

function withOperationDeadline(
  operation,
  { timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, description = "operation" } = {},
) {
  if (typeof operation !== "function") {
    throw new TypeError("An operation function is required.");
  }

  const controller = new AbortController();
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, timeoutMs)
    : DEFAULT_OPERATION_TIMEOUT_MS;
  let timeoutId;
  const operationPromise = Promise.resolve().then(() => operation(controller.signal));
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${description} timed out.`));
    }, boundedTimeoutMs);
  });

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
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

async function fetchJson(fetchImpl, url, options = {}) {
  const response = await fetchJsonResponse(fetchImpl, url, options);
  return response.body;
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
    volumeAdapter = createDockerVolumeAdapter({ processAdapter }),
    ensureEnvironment = ensureDemoEnvironment,
    environment = {
      envPath: path.join(repositoryRoot, "server", ".env"),
      templatePath: path.join(repositoryRoot, "server", ".env.example"),
    },
    fetchImpl = fetch,
    output = console,
    wait = {},
    grafanaUrl = GRAFANA_URL,
    operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  } = {}) {
    if (!processAdapter || typeof processAdapter.run !== "function") {
      throw new TypeError("LocalObservabilityDemo requires a process adapter");
    }
    if (
      !volumeAdapter
      || typeof volumeAdapter.listOwnedVolumes !== "function"
      || typeof volumeAdapter.removeVolumes !== "function"
    ) {
      throw new TypeError("LocalObservabilityDemo requires a volume adapter");
    }
    if (typeof ensureEnvironment !== "function") {
      throw new TypeError("LocalObservabilityDemo requires an environment initializer");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("LocalObservabilityDemo requires a fetch implementation");
    }

    this.processAdapter = processAdapter;
    this.volumeAdapter = volumeAdapter;
    this.ensureEnvironment = ensureEnvironment;
    this.environment = environment;
    this.fetchImpl = fetchImpl;
    this.output = output;
    this.wait = { ...DEFAULT_WAIT, delay: sleep, now: Date.now, ...wait };
    this.grafanaUrl = grafanaUrl;
    this.operationTimeoutMs = Number.isFinite(operationTimeoutMs)
      ? Math.max(1, operationTimeoutMs)
      : DEFAULT_OPERATION_TIMEOUT_MS;
  }

  runProcess(args, description, timeoutMs = this.operationTimeoutMs) {
    return withOperationDeadline(
      (signal) => this.processAdapter.run(args, { signal }),
      { timeoutMs, description },
    );
  }

  fetchJson(url, description) {
    return withOperationDeadline(
      (signal) => fetchJson(this.fetchImpl, url, { signal }),
      { timeoutMs: this.operationTimeoutMs, description },
    );
  }

  fetchJsonResponse(url, description) {
    return withOperationDeadline(
      (signal) => fetchJsonResponse(this.fetchImpl, url, { signal }),
      { timeoutMs: this.operationTimeoutMs, description },
    );
  }

  async run(action, { confirmationDigest = null } = {}) {
    if (action === "start") return this.start();
    if (action === "traffic") return this.traffic();
    if (action === "verify") return this.verify();
    if (action === "stop") return this.stop();
    if (action === "reset") return this.reset(confirmationDigest);
    throw new DemoActionError(
      "interface",
      `Action "${action || ""}" is not part of the Local Observability Demo interface.`,
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
      await this.runProcess(composeArgs([
        "up",
        "--detach",
        "--build",
        "grafana",
      ]), "Compose start", this.wait.timeoutMs);
      writeOutput(this.output, "log", "[start] compose: isolated project started.");
    } catch {
      throw stageFailure("compose");
    }

    try {
      await waitForCondition(
        async () => {
          const result = await this.runProcess(composeArgs([
            "ps",
            "--format",
            "json",
          ]), "Compose readiness");
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
          const health = await this.fetchJson(
            `${this.grafanaUrl}/api/health`,
            "Grafana health",
          );
          if (health?.version !== "12.4.8") return false;
          const search = await this.fetchJson(
            `${this.grafanaUrl}/api/search?query=KittaChat%20K3%20Observability`,
            "Grafana dashboard discovery",
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

  async traffic() {
    try {
      const result = await this.runProcess(composeArgs([
        "exec",
        "-T",
        "backend",
        "node",
        "-e",
        SAFE_TRAFFIC_SCRIPT,
      ]), "Safe traffic", this.wait.timeoutMs);
      const traffic = parseJsonOutput(getStdout(result), "Traffic");
      if (
        traffic?.successfulRequests !== SAFE_TRAFFIC_REQUEST_COUNT
        || traffic?.statusClass !== "2xx"
      ) {
        throw new Error("Traffic did not report the approved successful request contract.");
      }
      writeOutput(
        this.output,
        "log",
        `[traffic] successful: ${SAFE_TRAFFIC_REQUEST_COUNT} safe 2xx requests completed inside the backend service.`,
      );
      return {
        action: "traffic",
        projectName: PROJECT_NAME,
        requestCount: SAFE_TRAFFIC_REQUEST_COUNT,
        statusClass: "2xx",
      };
    } catch {
      throw stageFailure("traffic");
    }
  }

  async queryPrometheus(query, signal) {
    const result = await this.processAdapter.run(composeArgs([
      "exec",
      "-T",
      "prometheus",
      "wget",
      "-qO-",
      `${PROMETHEUS_QUERY_URL}?query=${encodeURIComponent(query)}`,
    ]), { signal });
    return parsePrometheusResponse(getStdout(result), "Prometheus query");
  }

  async waitForPrometheusQuery(query, predicate, description) {
    return waitForCondition(
      async () => {
        const response = await withOperationDeadline(
          (signal) => this.queryPrometheus(query, signal),
          {
            timeoutMs: this.operationTimeoutMs,
            description,
          },
        );
        return predicate(response) ? response : false;
      },
      {
        ...this.wait,
        description,
      },
    );
  }

  async verify() {
    const checks = {};
    try {
      const result = await this.runProcess(composeArgs([
        "ps",
        "--format",
        "json",
      ]), "Compose verification readiness");
      if (!projectIsReady(getStdout(result))) {
        throw new Error("K3.1 dependency chain is not ready.");
      }
      checks.readiness = { ok: true };
      writeOutput(this.output, "log", "[verify] readiness: dependency chain is healthy.");
    } catch {
      throw stageFailure("readiness");
    }

    try {
      const response = await this.waitForPrometheusQuery(
        PROMETHEUS_TARGET_QUERY,
        (candidate) => {
          const targets = candidate.data.result;
          return targets.length === 1
            && targets.every((target) => Number(target?.value?.[1]) === 1);
        },
        "Prometheus backend target",
      );
      const targets = response.data.result;
      checks.target = { status: "UP", resultCount: targets.length };
      writeOutput(this.output, "log", "[verify] target: Prometheus backend target is UP.");
    } catch {
      throw stageFailure("target");
    }

    try {
      const response = await this.waitForPrometheusQuery(
        PROMETHEUS_REQUEST_RATE_QUERY,
        (candidate) => candidate.data.result.length > 0,
        "total HTTP request-rate query",
      );
      checks.requestRate = { hasData: true, resultCount: response.data.result.length };
      writeOutput(this.output, "log", "[verify] request-rate: total HTTP request-rate query returned data.");
    } catch {
      throw stageFailure("request-rate");
    }

    try {
      const response = await this.waitForPrometheusQuery(
        PROMETHEUS_LATENCY_QUERY,
        (candidate) => candidate.data.result.length > 0,
        "HTTP latency query",
      );
      checks.latency = { hasData: true, resultCount: response.data.result.length };
      writeOutput(this.output, "log", "[verify] latency: HTTP latency query returned data.");
    } catch {
      throw stageFailure("latency");
    }

    try {
      const response = await this.fetchJsonResponse(
        `${this.grafanaUrl}/api/health`,
        "Grafana health",
      );
      if (response.body?.database !== "ok") {
        throw new Error("Grafana database health is not ok.");
      }
      checks.grafana = {
        status: response.status,
        version: response.body?.version || null,
      };
      writeOutput(this.output, "log", `[verify] Grafana health: Grafana is healthy (HTTP ${response.status}).`);
    } catch {
      throw stageFailure("grafana");
    }

    try {
      const search = await this.fetchJson(
        `${this.grafanaUrl}/api/search?query=KittaChat%20K3%20Observability`,
        "Grafana dashboard discovery",
      );
      if (!dashboardIsProvisioned(search)) {
        throw new Error("K3 dashboard was not discovered.");
      }
      checks.dashboard = {
        uid: "kittachat-k3-observability",
        title: "KittaChat K3 Observability",
      };
      writeOutput(this.output, "log", "[verify] dashboard: K3 dashboard discovered by UID and title.");
    } catch {
      throw stageFailure("dashboard");
    }

    return {
      action: "verify",
      projectName: PROJECT_NAME,
      stages: ["readiness", "target", "request-rate", "latency", "grafana", "dashboard"],
      checks,
    };
  }

  async reset(confirmationDigest = null) {
    try {
      const volumes = normalizeOwnedVolumes(await withOperationDeadline(
        (signal) => this.volumeAdapter.listOwnedVolumes({ signal }),
        {
          timeoutMs: this.operationTimeoutMs,
          description: "Reset volume discovery",
        },
      ));
      const names = volumes.map((volume) => volume.name);
      const digest = targetSetDigest(volumes);

      if (!confirmationDigest) {
        const displayNames = names.length > 0 ? names.join(", ") : "(none)";
        writeOutput(
          this.output,
          "log",
          `[reset] preview: K3.1 project-owned volumes: ${displayNames}.`,
        );
        writeOutput(
          this.output,
          "log",
          `[reset] preview: target-set-digest=${digest}; no volumes removed.`,
        );
        return {
          action: "reset",
          projectName: PROJECT_NAME,
          phase: "preview",
          volumes: names,
          targetSetDigest: digest,
        };
      }

      if (!/^[0-9a-f]{64}$/i.test(String(confirmationDigest))) {
        throw new Error("Reset confirmation digest is invalid.");
      }
      if (String(confirmationDigest).toLowerCase() !== digest) {
        throw new Error("Reset confirmation digest does not match the current target set.");
      }

      await withOperationDeadline(
        (signal) => this.volumeAdapter.removeVolumes(volumes, { signal }),
        {
          timeoutMs: this.operationTimeoutMs,
          description: "Reset volume removal",
        },
      );
      writeOutput(
        this.output,
        "log",
        `[reset] confirmed: removed ${names.length} unchanged K3.1 project-owned volume(s).`,
      );
      return {
        action: "reset",
        projectName: PROJECT_NAME,
        phase: "confirmed",
        volumes: names,
        targetSetDigest: digest,
      };
    } catch {
      throw stageFailure("reset");
    }
  }

  async stop() {
    try {
      await this.runProcess(composeArgs([
        "down",
        "--remove-orphans",
      ]), "Safe stop", this.wait.timeoutMs);
      writeOutput(this.output, "log", "[stop] cleanup: stopped the isolated project without deleting volumes.");
    } catch {
      throw stageFailure("stop");
    }

    return { action: "stop", projectName: PROJECT_NAME };
  }
}

async function runDemoAction(action, options) {
  return new LocalObservabilityDemo(options).run(action, options);
}

async function main(argv = process.argv.slice(2)) {
  const [action, ...argumentsList] = argv;
  if (!action) {
    throw new DemoActionError(
      "interface",
      "Usage: npm run demo:observability -- <start|traffic|verify|stop|reset [--confirm <target-set-digest>]>",
    );
  }
  if (action === "reset") {
    if (argumentsList.length === 0) return runDemoAction(action);
    if (argumentsList.length === 2 && argumentsList[0] === "--confirm" && argumentsList[1]) {
      return runDemoAction(action, { confirmationDigest: argumentsList[1] });
    }
    throw new DemoActionError(
      "interface",
      "Usage: npm run demo:observability -- reset [--confirm <target-set-digest>]",
    );
  }
  if (argumentsList.length > 0) {
    throw new DemoActionError("interface", "The selected action does not accept arguments.");
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
  DEFAULT_OPERATION_TIMEOUT_MS,
  DemoActionError,
  GRAFANA_URL,
  LocalObservabilityDemo,
  OBSERVABILITY_PROFILE,
  PROMETHEUS_LATENCY_QUERY,
  PROMETHEUS_QUERY_URL,
  PROMETHEUS_REQUEST_RATE_QUERY,
  PROMETHEUS_TARGET_QUERY,
  PROJECT_NAME,
  REQUIRED_SERVICES,
  SAFE_TRAFFIC_REQUEST_COUNT,
  SAFE_TRAFFIC_SCRIPT,
  VOLUME_PROJECT_LABEL,
  composeArgs,
  createDockerProcessAdapter,
  createDockerVolumeAdapter,
  dashboardIsProvisioned,
  main,
  parseJsonOutput,
  parsePrometheusResponse,
  parseComposePsOutput,
  projectIsReady,
  normalizeOwnedVolumes,
  runDemoAction,
  serviceIsReady,
  targetSetDigest,
  withOperationDeadline,
  waitForCondition,
};
