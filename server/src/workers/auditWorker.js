const dotenv = require("dotenv");

const { AUDIT_EVENTS_QUEUE } = require("../queues/auditJobs");
const { closeRabbitMQ, connectionManager } = require("../queues/rabbitmq");
const { startQueueWorker } = require("./workerRuntime");

dotenv.config();

const processAuditJob = async (job, { logger = console } = {}) => {
  if (job.type === "message.created") {
    logger.log("[AuditWorker] message.created", {
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
  const worker = await startQueueWorker({
    queueName: AUDIT_EVENTS_QUEUE,
    connectionManager,
    prefetch: Number(process.env.AUDIT_WORKER_CONCURRENCY || 10),
    processJob: processAuditJob,
    logger: console,
  });

  console.log(`[AuditWorker] consuming queue=${AUDIT_EVENTS_QUEUE}`);
  return worker;
};

if (require.main === module) {
  let workerRuntime = null;
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[AuditWorker] received ${signal}, shutting down...`);
    await workerRuntime?.stop?.().catch(() => {});
    await closeRabbitMQ().catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  startAuditWorker().catch(async (error) => {
    console.error("[AuditWorker] fatal:", error);
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
