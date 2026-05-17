const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

const { NOTIFICATION_EMAIL_QUEUE } = require("../queues/notificationJobs");
const { closeRabbitMQ, connectionManager } = require("../queues/rabbitmq");
const { startQueueWorker } = require("./workerRuntime");

dotenv.config();

const createDefaultMailer = () =>
  nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const getDefaultFrom = () =>
  `"KittaChat Support" <${process.env.EMAIL_USER || "no-reply@kittachat.local"}>`;

const processNotificationJob = async (
  job,
  {
    mailer = createDefaultMailer(),
    from = getDefaultFrom(),
  } = {},
) => {
  if (job.type === "email.password_reset") {
    const result = await mailer.sendMail({
      from,
      to: job.to,
      subject: job.subject,
      html: job.html,
    });

    return { success: true, messageId: result?.messageId };
  }

  throw new Error(`Unknown notification job type: ${job.type}`);
};

const startNotificationWorker = async () => {
  await startQueueWorker({
    queueName: NOTIFICATION_EMAIL_QUEUE,
    connectionManager,
    prefetch: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY || 5),
    processJob: processNotificationJob,
    logger: console,
  });

  console.log(`[NotificationWorker] consuming queue=${NOTIFICATION_EMAIL_QUEUE}`);
};

if (require.main === module) {
  startNotificationWorker().catch(async (error) => {
    console.error("[NotificationWorker] fatal:", error);
    await closeRabbitMQ().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  createDefaultMailer,
  processNotificationJob,
  startNotificationWorker,
};
