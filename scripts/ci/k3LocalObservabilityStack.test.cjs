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
const localDemoGuidePath = path.join(
  repositoryRoot,
  "docs/observability/k3-local-demo.md",
);

const {
  createDockerVolumeAdapter,
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

function makeVerifyProcessAdapter({ calls = [], prometheusResults = [] } = {}) {
  const healthyAdapter = makeHealthyProcessAdapter({ calls });
  const defaultResult = [
    {
      metric: { instance: "backend:3000" },
      value: [1710000000, "1"],
    },
  ];
  let prometheusCall = 0;
  return {
    calls,
    async run(args) {
      if (args.includes("prometheus")) {
        calls.push(args);
        const result = prometheusResults.length > 0
          ? (prometheusResults[Math.min(prometheusCall, prometheusResults.length - 1)] ?? defaultResult)
          : defaultResult;
        prometheusCall += 1;
        return {
          stdout: JSON.stringify({
            status: "success",
            data: { result },
          }),
          stderr: "",
        };
      }
      return healthyAdapter.run(args);
    },
  };
}

function prometheusQueryFromArgs(args) {
  const endpoint = String(args.at(-1) || "");
  return new URL(endpoint).searchParams.get("query");
}

function assertTotalRequestRateQuery(expression) {
  assert.match(
    expression,
    /sum\s*\(\s*rate\(kittachat_http_requests_total\{instance=~"\$instance"\}/,
  );
  assert.doesNotMatch(expression, /\bstatus_class\s*(?:=|!=|=~|!~)/);
}

test("total request-rate contract rejects every status_class matcher", () => {
  assert.throws(
    () => assertTotalRequestRateQuery(
      'sum(rate(kittachat_http_requests_total{status_class=~"5.*",instance=~"$instance"}[1m]))',
    ),
    /status_class/,
  );
});

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
  assertTotalRequestRateQuery(totalRequestPanel.targets[0].expr);

  const fiveXRatePanel = dashboard.panels.find((panel) => panel.title === "HTTP 5xx request rate");
  const fiveXRatioPanel = dashboard.panels.find((panel) => panel.title === "HTTP 5xx ratio");
  assert.ok(fiveXRatePanel);
  assert.ok(fiveXRatioPanel);
  assert.notEqual(fiveXRatePanel.id, fiveXRatioPanel.id);
  assert.equal(
    fiveXRatePanel.targets[0].expr,
    'sum(rate(kittachat_http_requests_total{status_class="5xx",instance=~"$instance"}[$__rate_interval]))',
  );
  assert.equal(
    fiveXRatioPanel.targets[0].expr,
    'sum(rate(kittachat_http_requests_total{status_class="5xx",instance=~"$instance"}[$__rate_interval])) / clamp_min(sum(rate(kittachat_http_requests_total{instance=~"$instance"}[$__rate_interval])), 1e-9)',
  );
});

test("the K3.1 operator guide separates runtime evidence and reset safety", () => {
  const guide = fs.readFileSync(localDemoGuidePath, "utf8");

  for (const phrase of [
    "Static configuration",
    "Bounded startup smoke",
    "Prometheus target health",
    "Metric data",
    "Grafana dashboard discovery",
    "Browser evidence",
    "Safe stop",
    "Destructive reset",
    "npm run demo:observability -- traffic",
    "npm run demo:observability -- verify",
    "npm run demo:observability -- reset --confirm",
  ]) {
    assert.match(guide, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), phrase);
  }

  assert.match(guide, /never.*--volumes/i);
  assert.match(guide, /do not run.*reset --confirm/i);
  assert.doesNotMatch(guide, /password=|secret=|token=|mongodb:\/\/[^\s]+:[^\s]+@/i);
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

test("traffic sends five successful safe requests from the backend service", async () => {
  const calls = [];
  const output = [];
  const demo = new LocalObservabilityDemo({
    processAdapter: {
      async run(args) {
        calls.push(args);
        assert.equal(args[args.length - 1].includes("const count = 5;"), true);
        assert.match(
          args[args.length - 1],
          /fetch\('http:\/\/127\.0\.0\.1:3000\/healthz'\)/,
        );
        assert.match(args[args.length - 1], /response\.status >= 300/);
        assert.match(args[args.length - 1], /await response\.arrayBuffer\(\)/);
        return {
          stdout: JSON.stringify({ successfulRequests: 5, statusClass: "2xx" }),
          stderr: "",
        };
      },
    },
    output: {
      log(message) {
        output.push(message);
      },
    },
  });

  const result = await demo.run("traffic");

  assert.deepEqual(result, {
    action: "traffic",
    projectName: PROJECT_NAME,
    requestCount: 5,
    statusClass: "2xx",
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("exec"));
  assert.ok(calls[0].includes("-T"));
  assert.ok(calls[0].includes("backend"));
  assert.ok(calls[0].includes("node"));
  assert.ok(calls[0].some((argument) => String(argument).includes("/healthz")));
  assert.ok(output.some((line) => /traffic.*successful/i.test(line)));
});

test("verify reports readiness, target, metric, Grafana, and dashboard claims separately", async () => {
  const calls = [];
  const targetResult = [
    {
      metric: { job: "kittachat-k3-1-backend", instance: "backend:3000" },
      value: [1710000000, "1"],
    },
  ];
  const requestRateResult = [
    {
      metric: { instance: "backend:3000" },
      value: [1710000000, "0.25"],
    },
  ];
  const latencyResult = [
    {
      metric: { instance: "backend:3000" },
      value: [1710000000, "0.01"],
    },
  ];
  const output = [];
  const demo = new LocalObservabilityDemo({
    processAdapter: makeVerifyProcessAdapter({
      calls,
      prometheusResults: [targetResult, requestRateResult, latencyResult],
    }),
    fetchImpl: makeGrafanaFetch(),
    output: {
      log(message) {
        output.push(message);
      },
    },
  });

  const result = await demo.run("verify");

  assert.deepEqual(result.stages, [
    "readiness",
    "target",
    "request-rate",
    "latency",
    "grafana",
    "dashboard",
  ]);
  assert.equal(result.checks.readiness.ok, true);
  assert.equal(result.checks.target.status, "UP");
  assert.equal(result.checks.requestRate.hasData, true);
  assert.equal(result.checks.latency.hasData, true);
  assert.equal(result.checks.grafana.status, 200);
  assert.equal(result.checks.dashboard.uid, "kittachat-k3-observability");
  const prometheusCalls = calls.filter((args) => args.includes("prometheus"));
  assert.deepEqual(
    prometheusCalls.map(prometheusQueryFromArgs),
    [
      'up{job="kittachat-k3-1-backend",instance="backend:3000"}',
      'sum(rate(kittachat_http_requests_total{instance="backend:3000"}[1m]))',
      'histogram_quantile(0.95, sum by (le) (rate(kittachat_http_request_duration_seconds_bucket{instance="backend:3000"}[1m])))',
    ],
  );
  assert.ok(output.some((line) => /readiness/i.test(line)));
  assert.ok(output.some((line) => /target.*UP/i.test(line)));
  assert.ok(output.some((line) => /request-rate.*data/i.test(line)));
  assert.ok(output.some((line) => /latency.*data/i.test(line)));
  assert.ok(output.some((line) => /Grafana.*healthy/i.test(line)));
  assert.ok(output.some((line) => /dashboard.*discovered/i.test(line)));
});

test("verify identifies each injected runtime failure stage", async () => {
  const healthyResult = [
    {
      metric: { instance: "backend:3000" },
      value: [1710000000, "1"],
    },
  ];
  const grafanaUnavailable = async () => ({
    ok: false,
    status: 503,
    async json() {
      return {};
    },
  });
  const dashboardMissing = async (url) => {
    if (url.endsWith("/api/health")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { database: "ok", version: "12.4.8" };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return [];
      },
    };
  };
  const scenarios = [
    {
      stage: "target",
      prometheusResults: [[{ metric: { instance: "backend:3000" }, value: [1710000000, "0"] }]],
      fetchImpl: makeGrafanaFetch(),
    },
    {
      stage: "request-rate",
      prometheusResults: [healthyResult, []],
      fetchImpl: makeGrafanaFetch(),
    },
    {
      stage: "latency",
      prometheusResults: [healthyResult, healthyResult, []],
      fetchImpl: makeGrafanaFetch(),
    },
    {
      stage: "grafana",
      prometheusResults: [healthyResult, healthyResult, healthyResult],
      fetchImpl: grafanaUnavailable,
    },
    {
      stage: "dashboard",
      prometheusResults: [healthyResult, healthyResult, healthyResult],
      fetchImpl: dashboardMissing,
    },
  ];

  for (const scenario of scenarios) {
    await assert.rejects(
      runDemoAction("verify", {
        processAdapter: makeVerifyProcessAdapter({
          prometheusResults: scenario.prometheusResults,
        }),
        fetchImpl: scenario.fetchImpl,
        wait: { timeoutMs: 1, intervalMs: 0, delay: async () => {} },
        output: { log() {} },
      }),
      (error) => error?.stage === scenario.stage,
    );
  }
});

test("verify aborts stalled Prometheus and Grafana operations at their failed stages", async () => {
  const healthyServices = JSON.stringify([
    { Service: "mongo", State: "running", Health: "healthy" },
    { Service: "redis", State: "running", Health: "healthy" },
    { Service: "backend", State: "running", Health: "healthy" },
    { Service: "prometheus", State: "running", Health: "healthy" },
    { Service: "grafana", State: "running", Health: "healthy" },
  ]);
  const abortAwareHang = (args) => new Promise((resolve, reject) => {
    const signal = args?.signal;
    if (!signal) return;
    signal.addEventListener("abort", () => reject(new Error("operation aborted")), { once: true });
  });
  const boundedResult = async (operation) => Promise.race([
    operation.then(
      () => ({ kind: "resolved" }),
      (error) => ({ kind: "rejected", error }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 100)),
  ]);

  const stalledPrometheus = await boundedResult(runDemoAction("verify", {
    processAdapter: {
      async run(args, options) {
        if (args.includes("ps")) return { stdout: healthyServices, stderr: "" };
        return abortAwareHang(options);
      },
    },
    fetchImpl: makeGrafanaFetch(),
    operationTimeoutMs: 5,
    wait: { timeoutMs: 20, intervalMs: 0, delay: async () => {} },
    output: { log() {} },
  }));
  assert.equal(stalledPrometheus.kind, "rejected");
  assert.equal(stalledPrometheus.error?.stage, "target");

  const stalledGrafana = await boundedResult(runDemoAction("verify", {
    processAdapter: makeVerifyProcessAdapter(),
    fetchImpl: async (_url, options) => abortAwareHang(options),
    operationTimeoutMs: 5,
    wait: { timeoutMs: 20, intervalMs: 0, delay: async () => {} },
    output: { log() {} },
  }));
  assert.equal(stalledGrafana.kind, "rejected");
  assert.equal(stalledGrafana.error?.stage, "grafana");
});

test("reset preview returns sorted labeled volumes without invoking removal", async () => {
  const calls = [];
  const output = [];
  const demo = new LocalObservabilityDemo({
    processAdapter: {
      async run() {
        throw new Error("reset preview must not use the process Adapter");
      },
    },
    volumeAdapter: {
      async listOwnedVolumes() {
        calls.push(["list"]);
        return [
          {
            name: "kittachat-k3-1_redis_data",
            labels: { "com.docker.compose.project": PROJECT_NAME },
          },
          {
            name: "kittachat-k3-1_mongo_data",
            labels: { "com.docker.compose.project": PROJECT_NAME },
          },
        ];
      },
      async removeVolumes(volumes) {
        calls.push(["remove", volumes]);
      },
    },
    output: {
      log(message) {
        output.push(message);
      },
    },
  });

  const result = await demo.run("reset");

  assert.equal(result.action, "reset");
  assert.equal(result.phase, "preview");
  assert.deepEqual(result.volumes, [
    "kittachat-k3-1_mongo_data",
    "kittachat-k3-1_redis_data",
  ]);
  assert.match(result.targetSetDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(calls, [["list"]]);
  assert.ok(output.some((line) => /reset.*preview/i.test(line)));
  assert.ok(output.some((line) => line.includes("kittachat-k3-1_mongo_data")));
  assert.ok(output.some((line) => line.includes(result.targetSetDigest)));
});

test("the Docker volume Adapter filters by the K3.1 project label", async () => {
  const calls = [];
  const adapter = createDockerVolumeAdapter({
    processAdapter: {
      async run(args) {
        calls.push(args);
        if (args.includes("ls")) return { stdout: "volume-b\nvolume-a\n", stderr: "" };
        if (args.includes("inspect")) {
          return {
            stdout: [
              { Name: "volume-b", Labels: { "com.docker.compose.project": PROJECT_NAME } },
              { Name: "volume-a", Labels: { "com.docker.compose.project": PROJECT_NAME } },
            ].map((volume) => JSON.stringify(volume)).join("\n"),
            stderr: "",
          };
        }
        return { stdout: "", stderr: "" };
      },
    },
  });

  const volumes = await adapter.listOwnedVolumes();
  await adapter.removeVolumes(volumes);

  assert.deepEqual(volumes, [
    { name: "volume-b", labels: { "com.docker.compose.project": PROJECT_NAME } },
    { name: "volume-a", labels: { "com.docker.compose.project": PROJECT_NAME } },
  ]);
  assert.ok(calls[0].includes(`label=com.docker.compose.project=${PROJECT_NAME}`));
  assert.deepEqual(calls[4], ["volume", "rm", "volume-a", "volume-b"]);
});

test("the Docker volume Adapter rejects a changed target set before removal", async () => {
  const calls = [];
  let listCount = 0;
  const adapter = createDockerVolumeAdapter({
    processAdapter: {
      async run(args) {
        calls.push(args);
        if (args.includes("ls")) {
          listCount += 1;
          return { stdout: listCount === 1 ? "volume-a\n" : "volume-a\nvolume-b\n", stderr: "" };
        }
        if (args.includes("inspect")) {
          const volumes = listCount === 1
            ? [{ Name: "volume-a", Labels: { "com.docker.compose.project": PROJECT_NAME } }]
            : [
              { Name: "volume-a", Labels: { "com.docker.compose.project": PROJECT_NAME } },
              { Name: "volume-b", Labels: { "com.docker.compose.project": PROJECT_NAME } },
            ];
          return {
            stdout: volumes.map((volume) => JSON.stringify(volume)).join("\n"),
            stderr: "",
          };
        }
        return { stdout: "", stderr: "" };
      },
    },
  });

  const disclosed = await adapter.listOwnedVolumes();
  await assert.rejects(adapter.removeVolumes(disclosed));
  assert.equal(calls.some((args) => args.includes("rm")), false);
});

test("reset confirmation re-resolves an unchanged target set before fake removal", async () => {
  const calls = [];
  const volumes = [
    {
      name: "kittachat-k3-1_prometheus_data",
      labels: { "com.docker.compose.project": PROJECT_NAME },
    },
  ];
  const demo = new LocalObservabilityDemo({
    processAdapter: {
      async run() {
        throw new Error("reset contract test must use the volume Adapter");
      },
    },
    volumeAdapter: {
      async listOwnedVolumes() {
        calls.push(["list"]);
        return volumes;
      },
      async removeVolumes(volumes) {
        calls.push(["remove", volumes]);
      },
    },
    output: { log() {} },
  });

  const preview = await demo.run("reset");
  const result = await demo.run("reset", {
    confirmationDigest: preview.targetSetDigest,
  });

  assert.equal(result.phase, "confirmed");
  assert.deepEqual(calls, [
    ["list"],
    ["list"],
    ["remove", volumes],
  ]);
});

test("runDemoAction forwards the reset confirmation digest to the public runner", async () => {
  const calls = [];
  const volumeAdapter = {
    async listOwnedVolumes() {
      calls.push(["list"]);
      return [{
        name: "kittachat-k3-1_prometheus_data",
        labels: { "com.docker.compose.project": PROJECT_NAME },
      }];
    },
    async removeVolumes(volumes) {
      calls.push(["remove", volumes]);
    },
  };
  const options = {
    processAdapter: {
      async run() {
        throw new Error("public reset runner test must use the volume Adapter");
      },
    },
    volumeAdapter,
    output: { log() {} },
  };

  const preview = await runDemoAction("reset", options);
  const confirmed = await runDemoAction("reset", {
    ...options,
    confirmationDigest: preview.targetSetDigest,
  });

  assert.equal(confirmed.phase, "confirmed");
  assert.deepEqual(calls, [
    ["list"],
    ["list"],
    ["remove", [
      {
        name: "kittachat-k3-1_prometheus_data",
        labels: { "com.docker.compose.project": PROJECT_NAME },
      },
    ]],
  ]);
});

test("reset confirmation aborts before fake removal when labels change", async () => {
  const calls = [];
  let listCount = 0;
  const demo = new LocalObservabilityDemo({
    processAdapter: {
      async run() {
        throw new Error("reset mismatch test must use the volume Adapter");
      },
    },
    volumeAdapter: {
      async listOwnedVolumes() {
        listCount += 1;
        calls.push(["list"]);
        return [
          {
            name: "kittachat-k3-1_prometheus_data",
            labels: {
              "com.docker.compose.project": PROJECT_NAME,
              ...(listCount > 1 ? { owner: "changed" } : {}),
            },
          },
        ];
      },
      async removeVolumes(volumes) {
        calls.push(["remove", volumes]);
      },
    },
    output: { log() {} },
  });

  const preview = await demo.run("reset");
  await assert.rejects(
    demo.run("reset", { confirmationDigest: preview.targetSetDigest }),
    (error) => error?.stage === "reset",
  );

  assert.deepEqual(calls, [["list"], ["list"]]);
});

test("reset confirmation rejects a stale digest before fake removal", async () => {
  const calls = [];
  const demo = new LocalObservabilityDemo({
    processAdapter: {
      async run() {
        throw new Error("stale digest test must use the volume Adapter");
      },
    },
    volumeAdapter: {
      async listOwnedVolumes() {
        calls.push(["list"]);
        return [{
          name: "kittachat-k3-1_prometheus_data",
          labels: { "com.docker.compose.project": PROJECT_NAME },
        }];
      },
      async removeVolumes(volumes) {
        calls.push(["remove", volumes]);
      },
    },
    output: { log() {} },
  });

  await assert.rejects(
    demo.run("reset", { confirmationDigest: "0".repeat(64) }),
    (error) => error?.stage === "reset",
  );
  assert.deepEqual(calls, [["list"]]);
});

test("reset confirmation rejects an added target volume before fake removal", async () => {
  const calls = [];
  let listCount = 0;
  const demo = new LocalObservabilityDemo({
    processAdapter: {
      async run() {
        throw new Error("target set test must use the volume Adapter");
      },
    },
    volumeAdapter: {
      async listOwnedVolumes() {
        listCount += 1;
        calls.push(["list"]);
        const volumes = [{
          name: "kittachat-k3-1_prometheus_data",
          labels: { "com.docker.compose.project": PROJECT_NAME },
        }];
        if (listCount > 1) {
          volumes.push({
            name: "kittachat-k3-1_redis_data",
            labels: { "com.docker.compose.project": PROJECT_NAME },
          });
        }
        return volumes;
      },
      async removeVolumes(volumes) {
        calls.push(["remove", volumes]);
      },
    },
    output: { log() {} },
  });

  const preview = await demo.run("reset");
  await assert.rejects(
    demo.run("reset", { confirmationDigest: preview.targetSetDigest }),
    (error) => error?.stage === "reset",
  );
  assert.deepEqual(calls, [["list"], ["list"]]);
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
