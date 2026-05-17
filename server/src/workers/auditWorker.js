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
  await startQueueWorker({
    queueName: AUDIT_EVENTS_QUEUE,
    connectionManager,
    prefetch: Number(process.env.AUDIT_WORKER_CONCURRENCY || 10),
    processJob: processAuditJob,
    logger: console,
  });

  console.log(`[AuditWorker] consuming queue=${AUDIT_EVENTS_QUEUE}`);
};

if (require.main === module) {
  startAuditWorker().catch(async (error) => {
    console.error("[AuditWorker] fatal:", error);
    await closeRabbitMQ().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  processAuditJob,
  startAuditWorker,
};
