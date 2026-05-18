const assert = require("node:assert/strict");
const test = require("node:test");

const { processNotificationJob } = require("../src/workers/notificationWorker");

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
