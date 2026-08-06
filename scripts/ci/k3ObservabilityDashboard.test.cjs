const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const repositoryRoot = path.resolve(__dirname, "../..");
const dashboardPath = path.join(repositoryRoot, "docs/observability/dashboards/k3-observability.json");
const scrapeConfigPath = path.join(repositoryRoot, "docs/observability/prometheus/k3-scrape-config.yml");
const operatorGuidePath = path.join(repositoryRoot, "docs/observability/k3-operator-validation.md");
const queueAlertPath = path.join(repositoryRoot, "docs/observability/alerts/k3-queue-alerts.yml");
const queueRunbookPath = path.join(repositoryRoot, "docs/observability/runbooks/k3-queue-dead-lettered.md");

const LOCKED_METRICS = [
  "kittachat_http_requests_total",
  "kittachat_http_request_duration_seconds",
  "kittachat_socket_active_connections",
  "kittachat_message_persistence_duration_seconds",
  "kittachat_redis_operations_total",
  "kittachat_cache_fallbacks_total",
  "kittachat_queue_jobs_total",
  "kittachat_queue_dead_lettered_total",
];

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));
const readYaml = (filePath) => parse(readFileSync(filePath, "utf8"));

const flattenPanels = (panels = []) => panels.flatMap((panel) => [
  panel,
  ...flattenPanels(panel.panels),
]);

const panelTargets = (dashboard) => flattenPanels(dashboard.panels)
  .flatMap((panel) => (panel.targets || []).map((target) => ({ panel, target })));

const datasourceReference = (value) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "";
};

test("K3 dashboard has the locked Grafana schema and datasource contract", () => {
  const dashboard = readJson(dashboardPath);
  const variables = dashboard.templating?.list || [];
  const datasourceVariables = variables.filter((variable) => variable.type === "datasource");
  const panels = flattenPanels(dashboard.panels);
  const panelIds = panels.map((panel) => panel.id);

  assert.equal(dashboard.schemaVersion, 39);
  assert.match(dashboard.uid, /^[A-Za-z][A-Za-z0-9_-]+$/);
  assert.equal(Number.isNaN(Number(dashboard.uid)), true);
  assert.equal(dashboard.id, null);
  assert.equal(datasourceVariables.length, 1);
  assert.equal(datasourceVariables[0].name, "DS_PROMETHEUS");

  const instanceVariable = variables.find((variable) => variable.name === "instance");
  assert.ok(instanceVariable);
  assert.equal(instanceVariable.type, "query");
  assert.equal(instanceVariable.includeAll, true);
  assert.equal(instanceVariable.multi, true);

  assert.ok(panels.length >= 8);
  assert.equal(new Set(panelIds).size, panelIds.length);
  assert.ok(panelIds.every((id) => Number.isInteger(id)));

  for (const { panel, target } of panelTargets(dashboard)) {
    assert.match(datasourceReference(panel.datasource), /\$\{DS_PROMETHEUS\}/);
    assert.match(datasourceReference(target.datasource), /\$\{DS_PROMETHEUS\}/);
    assert.doesNotMatch(JSON.stringify(target), /https?:\/\//i);
    assert.doesNotMatch(JSON.stringify(target), /datasourceUid|dashboardId/i);
  }
});

test("K3 dashboard covers every locked metric and PromQL/presentation contract", () => {
  const dashboard = readJson(dashboardPath);
  const panels = flattenPanels(dashboard.panels);
  const serialized = JSON.stringify(dashboard);
  const queries = panelTargets(dashboard).map(({ target }) => String(target.expr || target.query || ""));
  const queryText = queries.join("\n");
  const titles = panels.map((panel) => String(panel.title || "")).join("\n");

  for (const metric of LOCKED_METRICS) assert.match(serialized, new RegExp(metric));
  for (const query of queries) assert.match(query, /instance=~"\$instance"/);

  assert.match(queryText, /sum\s*\([^\n]*kittachat_socket_active_connections/);
  assert.match(titles, /HTTP 5xx request rate/i);
  assert.match(titles, /HTTP 5xx ratio/i);
  assert.match(queryText, /histogram_quantile\(\s*0\.5/);
  assert.match(queryText, /histogram_quantile\(\s*0\.95/);
  assert.match(queryText, /sum\s+by\s*\(\s*le\s*\)\s*\(\s*rate\([^)]*_bucket/);
  assert.match(queryText, /kittachat_message_persistence_duration_seconds_count/);
  assert.match(queryText, /outcome\s*=\s*"failed"/);
  assert.match(titles, /Redis command errors/i);
  assert.match(titles, /Cache fallbacks/i);
  assert.match(queryText, /rate\([^)]*kittachat_queue_jobs_total/);
  assert.match(queryText, /increase\([^)]*kittachat_queue_dead_lettered_total[\s\S]*\$__range/);

  assert.match(String(dashboard.refresh), /\d+[smhd]/);
  assert.ok(dashboard.time?.from);
  assert.ok(dashboard.time?.to);

  for (const panel of panels) {
    assert.ok(panel.fieldConfig?.defaults?.unit, `panel ${panel.id} must declare a unit`);
    assert.ok(Object.hasOwn(panel.fieldConfig.defaults, "noValue"));
    assert.ok(panel.options?.legend || panel.legend);
    assert.ok(Object.hasOwn(panel.options || {}, "noValue") || Object.hasOwn(panel.fieldConfig.defaults, "noValue"));
  }

  assert.doesNotMatch(queryText, /request[_-]?id|correlation[_-]?id|user[_-]?id|message[_-]?id|raw[_-]?url|cache[_-]?key|error[_-]?message/i);
});

test("K3 scrape configuration is static, per-replica, and separate from runtime health", () => {
  const config = readYaml(scrapeConfigPath);
  const jobs = config.scrape_configs || [];
  const backendJob = jobs.find((job) => job.job_name === "kittachat-backend");
  const targets = backendJob?.static_configs?.flatMap((entry) => entry.targets || []) || [];
  const serialized = JSON.stringify(config);

  assert.ok(backendJob);
  assert.equal(backendJob.metrics_path, "/metrics");
  assert.equal(targets.length, 3);
  assert.equal(new Set(targets).size, targets.length);
  assert.ok(targets.every((target) => /:3000$/.test(target)));
  assert.doesNotMatch(serialized, /healthz|readyz|target health/i);
  assert.match(serialized, /job/);
  assert.match(serialized, /instance/);
});

test("K3 operator validation guide states the evidence and failure boundaries", () => {
  const guide = readFileSync(operatorGuidePath, "utf8");

  for (const phrase of [
    "static",
    "direct endpoint smoke",
    "METRICS_ENABLED=true",
    "aggregate",
    "correlation",
    "MongoDB",
    "Redis",
    "RabbitMQ",
    "Alertmanager",
    "outbound notification",
    "BLOCKED",
  ]) {
    assert.match(guide, new RegExp(phrase, "i"), phrase);
  }

  assert.match(guide, /docs\/observability\/dashboards\/k3-observability\.json/);
  assert.match(guide, /docs\/observability\/prometheus\/k3-scrape-config\.yml/);
  assert.match(guide, /docs\/observability\/alerts\/k3-queue-alerts\.yml/);
  assert.match(guide, /docs\/observability\/runbooks\/k3-queue-dead-lettered\.md/);
  assert.match(guide, /npx --yes node@22 --test server\/test\/observability\/metricsReplicaSmoke\.test\.js/);
  assert.match(guide, /npx --yes node@22 --test server\/test\/observability\/issue52EndToEnd\.test\.js/);
  assert.match(guide, /## Cleanup/);
  assert.match(guide, /original.*METRICS_ENABLED.*value/i);
  assert.doesNotMatch(guide, /password=|secret=|token=|mongodb:\/\/[^\s]+:[^\s]+@/i);
});

test("K3 dashboard dead-letter panel stays aligned with the queue alert and runbook", () => {
  const dashboard = readJson(dashboardPath);
  const alert = readYaml(queueAlertPath).groups[0].rules[0];
  const runbook = readFileSync(queueRunbookPath, "utf8");
  const panel = flattenPanels(dashboard.panels).find((candidate) => candidate.title === "Queue dead-letter events");
  const query = panel?.targets?.[0]?.expr || "";

  assert.ok(panel);
  assert.match(query, /increase\(kittachat_queue_dead_lettered_total/);
  assert.match(query, /reason=~"poison\|retry_exhausted"/);
  assert.equal(alert.alert, "KittaChatQueueDeadLettered");
  assert.match(alert.expr, /kittachat_queue_dead_lettered_total/);
  assert.equal(Object.hasOwn(alert, "for"), false);
  assert.match(runbook, /controlled access/i);
  assert.match(runbook, /does not produce outbound notifications/i);
});
