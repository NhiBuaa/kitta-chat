const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { parse } = require("yaml");
const test = require("node:test");

const alertPath = path.resolve(__dirname, "../../docs/observability/alerts/k3-queue-alerts.yml");
const runbookPath = path.resolve(__dirname, "../../docs/observability/runbooks/k3-queue-dead-lettered.md");
const expectedExpression =
  'sum by (queue, job_type, reason) ( increase( kittachat_queue_dead_lettered_total{ reason=~"poison|retry_exhausted" }[5m] ) ) > 0';

const normalizeExpression = (expression) => String(expression).replace(/\s+/g, " ").trim();

const loadAlertRule = () => {
  const document = parse(readFileSync(alertPath, "utf8"));
  return document.groups[0].rules[0];
};

const evaluateDeadLetterRule = (series) => {
  const grouped = new Map();

  for (const sample of series) {
    if (!["poison", "retry_exhausted"].includes(sample.reason)) continue;

    const key = JSON.stringify([sample.queue, sample.job_type, sample.reason]);
    const current = grouped.get(key) || {
      job_type: sample.job_type,
      queue: sample.queue,
      reason: sample.reason,
      increase: 0,
    };
    current.increase += Math.max(0, sample.end - sample.start);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .filter(({ increase }) => increase > 0)
    .map(({ increase, job_type, queue, reason }) => ({
      increase,
      job_type,
      queue,
      reason,
    }));
};

test("K3 queue alert YAML parses and preserves the critical contract", () => {
  const rule = loadAlertRule();

  assert.equal(rule.alert, "KittaChatQueueDeadLettered");
  assert.equal(normalizeExpression(rule.expr), expectedExpression);
  assert.equal(Object.hasOwn(rule, "for"), false);
  assert.deepEqual(rule.labels, {
    component: "queue",
    service: "kittachat",
    severity: "critical",
  });
  assert.match(rule.annotations.runbook_url, /docs\/observability\/runbooks\/k3-queue-dead-lettered\.md$/);
});

test("K3 queue alert remains inactive when the five-minute increase is zero", () => {
  const firing = evaluateDeadLetterRule([
    { end: 4, job_type: "chat-image", queue: "image", reason: "poison", start: 4 },
    { end: 8, job_type: "chat-image", queue: "image", reason: "retry_exhausted", start: 8 },
  ]);

  assert.deepEqual(firing, []);
});

test("K3 queue alert fires for one poison or retry-exhausted event", () => {
  const poison = evaluateDeadLetterRule([
    { end: 1, job_type: "chat-image", queue: "image", reason: "poison", start: 0 },
  ]);
  const retryExhausted = evaluateDeadLetterRule([
    { end: 2, job_type: "chat-image", queue: "image", reason: "retry_exhausted", start: 1 },
  ]);

  assert.deepEqual(poison, [{
    increase: 1,
    job_type: "chat-image",
    queue: "image",
    reason: "poison",
  }]);
  assert.deepEqual(retryExhausted, [{
    increase: 1,
    job_type: "chat-image",
    queue: "image",
    reason: "retry_exhausted",
  }]);
});

test("K3 queue alert aggregates matching dead-letter events across replicas", () => {
  const firing = evaluateDeadLetterRule([
    { end: 4, instance: "worker-a", job_type: "chat-image", queue: "image", reason: "retry_exhausted", start: 3 },
    { end: 7, instance: "worker-b", job_type: "chat-image", queue: "image", reason: "retry_exhausted", start: 5 },
  ]);

  assert.deepEqual(firing, [{
    increase: 3,
    job_type: "chat-image",
    queue: "image",
    reason: "retry_exhausted",
  }]);
});

test("K3 queue dead-letter runbook preserves controlled-access and notification boundaries", () => {
  const runbook = readFileSync(runbookPath, "utf8");

  assert.match(runbook, /1\. Start with the alert's `queue`, `job_type`, `reason`, and five-minute time window\./);
  assert.match(runbook, /2\. Find the corresponding structured worker logs and failure stage\./);
  assert.match(runbook, /3\. Use the correlation ID and trace context/);
  assert.match(runbook, /controlled access/i);
  assert.match(runbook, /Do not automatically retry outside the RabbitMQ retry contract\./);
  assert.match(runbook, /does not produce outbound notifications/i);
});
