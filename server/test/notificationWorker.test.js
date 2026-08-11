const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createDefaultMailer,
  processNotificationJob,
} = require("../src/workers/notificationWorker");

test("createDefaultMailer preserves service transport and basic credentials configuration", () => {
  const previous = {
    EMAIL_SERVICE: process.env.EMAIL_SERVICE,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
  };

  process.env.EMAIL_SERVICE = "test-smtp-service";
  process.env.EMAIL_USER = "test-user@example.invalid";
  process.env.EMAIL_PASS = "synthetic-test-password";

  try {
    const mailer = createDefaultMailer();

    assert.equal(mailer.options.service, "test-smtp-service");
    assert.deepEqual(mailer.options.auth, {
      user: "test-user@example.invalid",
      pass: "synthetic-test-password",
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("processNotificationJob sends password reset emails", async () => {
  const sent = [];
  const result = await processNotificationJob(
    {
      type: "email.password_reset",
      to: "alice@example.com",
      subject: "Reset password",
      html: "<p>reset</p>",
    },
    {
      mailer: {
        async sendMail(mailOptions) {
          sent.push(mailOptions);
          return { messageId: "mail-1" };
        },
      },
      from: '"KittaChat Support" <support@example.com>',
    },
  );

  assert.deepEqual(sent, [
    {
      from: '"KittaChat Support" <support@example.com>',
      to: "alice@example.com",
      subject: "Reset password",
      html: "<p>reset</p>",
    },
  ]);
  assert.deepEqual(result, { success: true, messageId: "mail-1" });
});

test("processNotificationJob rejects unknown notification jobs", async () => {
  await assert.rejects(
    () => processNotificationJob({ type: "push.unknown" }, { mailer: {} }),
    /Unknown notification job type: push\.unknown/,
  );
});

test("processNotificationJob propagates sendMail failures to the worker", async () => {
  const sendFailure = new Error("synthetic SMTP unavailable");

  await assert.rejects(
    () =>
      processNotificationJob(
        {
          type: "email.password_reset",
          to: "alice@example.com",
          subject: "Reset password",
          html: "<p>reset</p>",
        },
        {
          mailer: {
            async sendMail() {
              throw sendFailure;
            },
          },
        },
      ),
    (error) => error === sendFailure,
  );
});
