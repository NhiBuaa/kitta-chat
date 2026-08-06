const dotenv = require("dotenv");

const { AUDIT_EVENTS_QUEUE } = require("../queues/auditJobs");
const { closeRabbitMQ, connectionManager } = require("../queues/rabbitmq");
const { startQueueWorker } = require("./workerRuntime");
const { validateWorkerEnv } = require("../config/env");
const { logSafely, logger: defaultLogger } = require("../utils/logger");

dotenv.config();

const processAuditJob = async (job, { logger = defaultLogger } = {}) => {
  if (job.type === "message.created") {
    logSafely(logger, "info", "audit_message_created", {
      messageId: job.messageId,
      conversationId: job.conversationId,
      senderId: job.senderId,
      receiverId: job.receiverId,
      messageType: job.messageType,
      attachmentCount: job.attachmentCount,
      createdAt: job.createdAt,
    });

    return { success: true };
  }

  throw new Error(`Unknown audit job type: ${job.type}`);
};

const startAuditWorker = async () => {
  const workerConfig = validateWorkerEnv({ workerName: "audit" });

  const worker = await startQueueWorker({
    queueName: AUDIT_EVENTS_QUEUE,
    connectionManager,
    prefetch: workerConfig.workerConcurrency,
    processJob: processAuditJob,
    logger: defaultLogger,
  });

  defaultLogger.info("audit_worker_consuming", { queue: AUDIT_EVENTS_QUEUE });
  return worker;
};

if (require.main === module) {
  let workerRuntime = null;
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    defaultLogger.info("audit_worker_shutdown_started", { signal });
    await workerRuntime?.stop?.().catch(() => {});
    await closeRabbitMQ().catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  startAuditWorker().catch(async (error) => {
    defaultLogger.error("audit_worker_fatal", { reason: error?.message });
    await closeRabbitMQ().catch(() => {});
    process.exit(1);
  }).then((worker) => {
    workerRuntime = worker;
  });
}

module.exports = {
  processAuditJob,
  startAuditWorker,
};
