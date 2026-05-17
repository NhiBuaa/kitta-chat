const assert = require("node:assert/strict");
const test = require("node:test");

const { queuePasswordResetEmail } = require("../src/services/passwordResetNotificationService");

test("queuePasswordResetEmail publishes a password reset email job", async () => {
  const published = [];

  const result = await queuePasswordResetEmail({
    user: {
      email: "Alice@Example.com",
      displayName: "Alice",
    },
    resetUrl: "https://app.local/reset-password/user-1/token-1",
    notificationQueue: {
      async publishEmailJob(job) {
        published.push(job);
      },
    },
    requestId: "req-reset-1",
  });

  assert.equal(result.queued, true);
  assert.equal(result.requestId, "req-reset-1");
  assert.equal(published[0].type, "email.password_reset");
  assert.equal(published[0].to, "alice@example.com");
  assert.match(published[0].html, /token-1/);
});

test("queuePasswordResetEmail reports queue failures", async () => {
  const result = await queuePasswordResetEmail({
    user: {
      email: "alice@example.com",
      displayName: "Alice",
    },
    resetUrl: "https://app.local/reset-password/user-1/token-1",
    notificationQueue: {
      async publishEmailJob() {
        const error = new AggregateError([
          new Error("connect ECONNREFUSED ::1:5672"),
          new Error("connect ECONNREFUSED 127.0.0.1:5672"),
        ]);
        error.code = "ECONNREFUSED";
        throw error;
      },
    },
  });

  assert.equal(result.queued, false);
  assert.equal(result.requestId, null);
  assert.match(result.error, /ECONNREFUSED/);
});
