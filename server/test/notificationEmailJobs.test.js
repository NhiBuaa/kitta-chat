const assert = require("node:assert/strict");
const test = require("node:test");

const {
  NOTIFICATION_EMAIL_QUEUE,
  buildPasswordResetEmailJob,
} = require("../src/queues/notificationJobs");
const { createNotificationQueue } = require("../src/queues/notificationQueue");
const { QUEUE_TOPOLOGY } = require("../src/queues/topology");

test("password reset email job contains delivery metadata and reset link", () => {
  const job = buildPasswordResetEmailJob({
    to: "Alice@Example.com",
    displayName: "Alice",
    resetUrl: "https://app.local/reset-password/user-1/token-1",
    requestId: "req-reset-1",
  });

  assert.equal(job.type, "email.password_reset");
  assert.equal(job.requestId, "req-reset-1");
  assert.equal(job.to, "alice@example.com");
  assert.equal(job.template, "password_reset");
  assert.match(job.subject, /KittaChat/);
  assert.match(job.html, /https:\/\/app\.local\/reset-password\/user-1\/token-1/);
  assert.equal(typeof job.createdAt, "string");
});

test("notification queue publishes email jobs to the notification email queue", async () => {
  const published = [];
  const notificationQueue = createNotificationQueue({
    producer: {
      async publish(queueName, job) {
        published.push({ queueName, job });
      },
    },
  });

  await notificationQueue.publishEmailJob({ type: "email.password_reset", requestId: "req-1" });

  assert.deepEqual(published, [
    {
      queueName: NOTIFICATION_EMAIL_QUEUE,
      job: { type: "email.password_reset", requestId: "req-1" },
    },
  ]);
});

test("RabbitMQ topology includes notification email queue", () => {
  assert.ok(
    QUEUE_TOPOLOGY.some(
      (queue) =>
        queue.name === NOTIFICATION_EMAIL_QUEUE &&
        queue.options?.durable === true,
    ),
  );
});
