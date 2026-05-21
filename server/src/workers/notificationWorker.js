const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

const { NOTIFICATION_EMAIL_QUEUE } = require("../queues/notificationJobs");
const { closeRabbitMQ, connectionManager } = require("../queues/rabbitmq");
const { startQueueWorker } = require("./workerRuntime");
const { validateWorkerEnv } = require("../config/env");

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
  const workerConfig = validateWorkerEnv({ workerName: "notification" });

  const worker = await startQueueWorker({
    queueName: NOTIFICATION_EMAIL_QUEUE,
    connectionManager,
    prefetch: workerConfig.workerConcurrency,
    processJob: processNotificationJob,
    logger: console,
  });

  console.log(`[NotificationWorker] consuming queue=${NOTIFICATION_EMAIL_QUEUE}`);
  return worker;
};

if (require.main === module) {
  let workerRuntime = null;
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[NotificationWorker] received ${signal}, shutting down...`);
    await workerRuntime?.stop?.().catch(() => {});
    await closeRabbitMQ().catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  startNotificationWorker().catch(async (error) => {
    console.error("[NotificationWorker] fatal:", error);
    await closeRabbitMQ().catch(() => {});
    process.exit(1);
  }).then((worker) => {
    workerRuntime = worker;
  });
}

module.exports = {
  createDefaultMailer,
  processNotificationJob,
  startNotificationWorker,
};
