const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { parse, parseDocument } = require("yaml");

const repositoryRoot = path.resolve(__dirname, "../..");
const composeOverlayPath = path.join(repositoryRoot, "docker-compose.observability.yml");
const dashboardPath = path.join(
  repositoryRoot,
  "docs/observability/dashboards/k3-observability.json",
);
const scrapeConfigPath = path.join(
  repositoryRoot,
  "docs/observability/local/prometheus.yml",
);
const datasourcePath = path.join(
  repositoryRoot,
  "docs/observability/local/grafana/provisioning/datasource.yml",
);
const dashboardProvisioningPath = path.join(
  repositoryRoot,
  "docs/observability/local/grafana/provisioning/dashboards.yml",
);

const {
  LocalObservabilityDemo,
  PROJECT_NAME,
  runDemoAction,
} = require("../../scripts/observabilityDemo");
const { ensureDemoEnvironment } = require("../../scripts/demoEnvironment");

function parseComposeYaml(filePath) {
  const document = parseDocument(fs.readFileSync(filePath, "utf8"), {
    customTags: [
      {
        tag: "!reset",
        resolve: (value) => value,
      },
    ],
  });
  return document.toJS();
}

function resolveComposeConfig() {
  const envPath = path.join(repositoryRoot, "server", ".env");
  let createdEnvironment = false;
  if (!fs.existsSync(envPath)) {
    ensureDemoEnvironment({
      envPath,
      templatePath: path.join(repositoryRoot, "server", ".env.example"),
    });
    createdEnvironment = true;
  }

  const result = spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      PROJECT_NAME,
      "--file",
      "docker-compose.yml",
      "--file",
      "docker-compose.observability.yml",
      "--profile",
      "observability",
      "config",
      "--format",
      "json",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  return {
    available: !result.error && result.status === 0,
    config: result.status === 0 ? JSON.parse(result.stdout) : null,
    createdEnvironment,
    error: result.error || result.stderr,
  };
}

function makeHealthyProcessAdapter({ calls = [] } = {}) {
  return {
    calls,
    async run(args) {
      calls.push(args);
      if (args.includes("ps")) {
        return {
          stdout: JSON.stringify([
            { Service: "mongo", State: "running", Health: "healthy" },
            { Service: "redis", State: "running", Health: "healthy" },
            { Service: "backend", State: "running", Health: "healthy" },
            { Service: "prometheus", State: "running", Health: "healthy" },
            { Service: "grafana", State: "running", Health: "healthy" },
          ]),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    },
  };
}

function makeGrafanaFetch() {
  return async (url) => {
    if (url.endsWith("/api/health")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { database: "ok", version: "12.4.8" };
        },
      };
    }
    if (url.includes("/api/search")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              title: "KittaChat K3 Observability",
              uid: "kittachat-k3-observability",
            },
          ];
        },
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("the observability overlay gates monitoring services and pins the approved images", () => {
  const overlay = parseComposeYaml(composeOverlayPath);

  assert.equal(overlay.name, PROJECT_NAME);
  assert.deepEqual(overlay.services.prometheus.profiles, ["observability"]);
  assert.deepEqual(overlay.services.grafana.profiles, ["observability"]);
  assert.equal(overlay.services.prometheus.image, "prom/prometheus:v3.13.2");
  assert.equal(overlay.services.grafana.image, "grafana/grafana:12.4.8");
  assert.deepEqual(overlay.services.grafana.ports, ["127.0.0.1:3001:3000"]);
  assert.ok(overlay.services.grafana.volumes.some((volume) =>
    String(volume).includes("/etc/grafana/provisioning/datasources/datasource.yml"),
  ));
  assert.ok(overlay.services.grafana.volumes.some((volume) =>
    String(volume).includes("/etc/grafana/provisioning/dashboards/dashboards.yml"),
  ));
  assert.match(
    fs.readFileSync(composeOverlayPath, "utf8"),
    /!reset\s+(?:\[\]|null)/,
  );
});

test("the resolved K3.1 model exposes only loopback Grafana", (t) => {
  const resolved = resolveComposeConfig();
  if (!resolved.available) {
    t.skip(`Docker Compose config unavailable: ${String(resolved.error || "unknown error")}`);
    return;
  }

  const services = resolved.config.services;
  assert.equal(resolved.config.name, PROJECT_NAME);
  assert.deepEqual(
    Object.entries(services)
      .filter(([, service]) => Array.isArray(service.ports) && service.ports.length > 0)
      .map(([name]) => name),
    ["grafana"],
  );
  assert.deepEqual(services.grafana.ports, [
    {
      mode: "ingress",
      target: 3000,
      published: "3001",
      host_ip: "127.0.0.1",
      protocol: "tcp",
    },
  ]);
  assert.ok(Object.entries(services).every(([, service]) => !service.container_name));
  assert.equal(services.backend.deploy.replicas, 1);

  const backendEnvironment = services.backend.environment;
  assert.equal(backendEnvironment.METRICS_ENABLED, "true");
  assert.equal(backendEnvironment.CONVERSATION_DUAL_WRITE_ENABLED, "false");
  assert.equal(backendEnvironment.CONVERSATION_SHADOW_COMPARE_ENABLED, "false");
  assert.equal(backendEnvironment.CONVERSATION_SIDEBAR_READ_MODEL_ENABLED, "false");
});

test("the default runtime keeps metrics disabled and does not opt into observability", () => {
  const baseCompose = parse(fs.readFileSync(path.join(repositoryRoot, "docker-compose.yml"), "utf8"));
  const envExample = fs.readFileSync(path.join(repositoryRoot, "server/.env.example"), "utf8");

  assert.equal(baseCompose.services.prometheus, undefined);
  assert.equal(baseCompose.services.grafana, undefined);
  assert.match(envExample, /^METRICS_ENABLED=false$/m);
});

test("static scrape and Grafana provisioning point at the internal K3.1 stack", () => {
  const scrape = parse(fs.readFileSync(scrapeConfigPath, "utf8"));
  const datasource = parse(fs.readFileSync(datasourcePath, "utf8"));
  const dashboardProvisioning = parse(fs.readFileSync(dashboardProvisioningPath, "utf8"));
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));

  const target = scrape.scrape_configs[0];
  assert.equal(target.metrics_path, "/metrics");
  assert.deepEqual(target.static_configs, [{ targets: ["backend:3000"] }]);
  assert.equal(datasource.datasources.length, 1);
  assert.equal(datasource.datasources[0].type, "prometheus");
  assert.equal(datasource.datasources[0].url, "http://prometheus:9090");
  assert.equal(dashboardProvisioning.providers.length, 1);
  assert.equal(
    dashboardProvisioning.providers[0].options.path,
    "/var/lib/grafana/dashboards",
  );

  const totalRequestPanel = dashboard.panels.find((panel) =>
    /total.*http.*request.*rate/i.test(panel.title || ""),
  );
  assert.ok(totalRequestPanel);
  assert.match(
    totalRequestPanel.targets[0].expr,
    /sum\s*\(\s*rate\(kittachat_http_requests_total\{instance=~"\$instance"\}/,
  );
  assert.doesNotMatch(totalRequestPanel.targets[0].expr, /status_class\s*=\s*"5xx"/);
});

test("start reaches readiness and provisioning through the injected operator seam", async () => {
  const calls = [];
  const output = [];
  const demo = new LocalObservabilityDemo({
    processAdapter: makeHealthyProcessAdapter({ calls }),
    ensureEnvironment: async () => ({ created: false }),
    fetchImpl: makeGrafanaFetch(),
    output: {
      log(message) {
        output.push(message);
      },
    },
    wait: {
      timeoutMs: 100,
      intervalMs: 0,
      delay: async () => {},
    },
  });

  const result = await demo.run("start");

  assert.deepEqual(result.stages, ["preflight", "compose", "readiness", "provisioning"]);
  assert.equal(result.projectName, PROJECT_NAME);
  assert.ok(output.some((line) => /Grafana.*127\.0\.0\.1:3001/.test(line)));
  assert.ok(calls.some((args) => args.includes("up") && args.includes("--profile")));
  assert.ok(calls.some((args) => args.includes("ps")));
  assert.ok(calls.every((args) => !args.includes("--volumes")));
});

test("start failures identify the failed stage without leaking process output", async () => {
  const secret = "do-not-print-this-secret";
  const output = [];
  const error = await assert.rejects(
    runDemoAction("start", {
      ensureEnvironment: async () => ({ created: true, secret }),
      processAdapter: {
        async run() {
          throw new Error(secret);
        },
      },
      output: {
        log(message) {
          output.push(message);
        },
      },
      fetchImpl: makeGrafanaFetch(),
      wait: { timeoutMs: 1, intervalMs: 0, delay: async () => {} },
    }),
    (candidate) => candidate?.stage === "compose",
  );

  assert.equal(error, undefined);
  assert.ok(output.every((line) => !line.includes(secret)));
});

test("preflight, readiness, and provisioning failures retain their stage boundary", async () => {
  await assert.rejects(
    runDemoAction("start", {
      ensureEnvironment: async () => {
        throw new Error("environment secret");
      },
      processAdapter: makeHealthyProcessAdapter(),
      fetchImpl: makeGrafanaFetch(),
      wait: { timeoutMs: 1, intervalMs: 0, delay: async () => {} },
      output: { log() {} },
    }),
    (error) => error?.stage === "preflight",
  );

  await assert.rejects(
    runDemoAction("start", {
      ensureEnvironment: async () => ({ created: false }),
      processAdapter: {
        async run() {
          return { stdout: "[]", stderr: "" };
        },
      },
      fetchImpl: makeGrafanaFetch(),
      wait: { timeoutMs: 1, intervalMs: 0, delay: async () => {} },
      output: { log() {} },
    }),
    (error) => error?.stage === "readiness",
  );

  await assert.rejects(
    runDemoAction("start", {
      ensureEnvironment: async () => ({ created: false }),
      processAdapter: makeHealthyProcessAdapter(),
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        async json() {
          return {};
        },
      }),
      wait: { timeoutMs: 1, intervalMs: 0, delay: async () => {} },
      output: { log() {} },
    }),
    (error) => error?.stage === "provisioning",
  );
});

test("stop is project-scoped and never requests volume deletion", async () => {
  const calls = [];
  const demo = new LocalObservabilityDemo({
    processAdapter: makeHealthyProcessAdapter({ calls }),
    output: { log() {} },
  });

  const result = await demo.run("stop");

  assert.deepEqual(result, { action: "stop", projectName: PROJECT_NAME });
  const stopCall = calls.find((args) => args.includes("down"));
  assert.ok(stopCall);
  assert.ok(stopCall.includes("--remove-orphans"));
  assert.equal(stopCall.includes("--volumes"), false);

  await assert.rejects(
    runDemoAction("stop", {
      processAdapter: {
        async run() {
          throw new Error("docker output must stay private");
        },
      },
      output: { log() {} },
    }),
    (error) => error?.stage === "stop",
  );
});

test("environment preflight remains atomic and byte-for-byte stable", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kittachat-k3-1-env-"));
  const templatePath = path.join(directory, ".env.example");
  const envPath = path.join(directory, ".env");
  fs.writeFileSync(templatePath, "JWT_SECRET=replace-me\nMETRICS_ENABLED=false\n");

  assert.deepEqual(
    ensureDemoEnvironment({
      envPath,
      templatePath,
      randomBytes: () => Buffer.from("0123456789abcdef".repeat(6)),
    }),
    { created: true },
  );
  const before = fs.readFileSync(envPath);
  assert.deepEqual(
    ensureDemoEnvironment({
      envPath,
      templatePath,
      randomBytes: () => Buffer.from("ffffffffffffffff".repeat(6)),
    }),
    { created: false },
  );
  assert.deepEqual(fs.readFileSync(envPath), before);
});
