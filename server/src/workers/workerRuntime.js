const {
  getJobType,
} = require("../queues/correlation");
const { resolveWorkerCarrier } = require("../observability/correlation/carrierPolicy");
const { runWithCorrelationContext } = require("../observability/correlation/asyncContext");
const { logSafely, logger: defaultLogger } = require("../utils/logger");

const getMaxAttempts = () => Number(process.env.RABBITMQ_MAX_ATTEMPTS || 3);

const publishConfirmed = (channel, queueName, payload, options = {}) =>
  new Promise((resolve, reject) => {
    channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(payload)),
      {
          contentType: "application/json",
          persistent: true,
          ...options,
          headers: {
            ...(options.headers || {}),
          },
        },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });

const buildDeadLetterPayload = ({ job, error, queueName, correlationId }) => ({
  correlationId,
  job: { ...job, correlationId },
  error: {
    message: error.message,
    failedAt: new Date().toISOString(),
    originalQueue: queueName,
    correlationId,
  },
});

const getAttempts = (job, message) => {
  const headerAttempts = Number(message?.properties?.headers?.attempts);
  if (Number.isFinite(headerAttempts) && headerAttempts > 0) {
    return headerAttempts;
  }

  const payloadAttempts = Number(job?.attempts);
  if (Number.isFinite(payloadAttempts) && payloadAttempts > 0) {
    return payloadAttempts;
  }

  return 0;
};

const buildRetryPayload = ({ job, attempts, correlationId = job?.correlationId }) => ({
  ...job,
  correlationId,
  attempts,
});

const parseJobMessage = (message) => {
  const raw = message.content.toString("utf8");

  try {
    return {
      job: JSON.parse(raw),
      parseError: null,
    };
  } catch (error) {
    return {
      job: {
        type: "poison",
        raw,
        parseFailed: true,
      },
      parseError: error,
    };
  }
};

const buildWorkerLogFields = ({
  queueName,
  job,
  attempts,
  correlationId,
  error,
  maxAttempts,
  failureStage,
}) => {
  const fields = {
    queue: queueName,
    jobType: getJobType(job),
    attempt: attempts,
    correlationId,
    failureStage: failureStage || "none",
  };

  if (maxAttempts !== undefined) {
    fields.maxAttempts = maxAttempts;
  }

  if (error?.message) {
    fields.reason = error.message;
  }

  return fields;
};

const sleep = (delayMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const startQueueWorker = async ({
  queueName,
  connectionManager,
  processJob,
  prefetch = 1,
  maxAttempts = getMaxAttempts(),
  reconnectDelayMs = Number(process.env.RABBITMQ_WORKER_RECONNECT_DELAY_MS || 1000),
  maxReconnectDelayMs = Number(process.env.RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS || 30000),
  logger = defaultLogger,
}) => {
  let stopped = false;
  let channel = null;
  let reconnecting = false;
  let reconnectDelay = reconnectDelayMs;

  const handleMessage = async (message) => {
    if (!message) return;

    let job = null;
    let correlationId = null;
    let failureStage = "parse";

    try {
      const parsedMessage = parseJobMessage(message);
      const resolvedCarrier = resolveWorkerCarrier({
        job: parsedMessage.job,
        message,
        logger,
      });
      job = resolvedCarrier.job;
      correlationId = resolvedCarrier.correlationId;

      if (parsedMessage.parseError) {
        throw parsedMessage.parseError;
      }

      failureStage = "handler";
      await runWithCorrelationContext({ correlationId }, () => processJob(job, message));
      channel.ack(message);
      logSafely(logger, "info", "worker_job_processed", buildWorkerLogFields({
        queueName,
        job,
        attempts: getAttempts(job, message),
        correlationId,
        failureStage: "none",
      }));
    } catch (error) {
      try {
        const attempts = getAttempts(job, message);
        if (!correlationId) {
          const resolvedCarrier = resolveWorkerCarrier({ job, message, logger });
          job = resolvedCarrier.job;
          correlationId = resolvedCarrier.correlationId;
        }
        const poisonMessage = job?.parseFailed === true;
        const failureFields = buildWorkerLogFields({
          queueName,
          job,
          attempts,
          correlationId,
          error,
          failureStage,
        });

        logSafely(logger, "error", poisonMessage ? "worker_job_poison" : "worker_job_failed", failureFields);

        if (!poisonMessage && attempts < maxAttempts) {
          const nextAttempts = attempts + 1;
          logSafely(
            logger,
            "warn",
            "worker_job_retry",
            buildWorkerLogFields({
              queueName,
              job,
              attempts: nextAttempts,
              correlationId,
              error,
              maxAttempts,
              failureStage: "retry_publish",
            }),
          );

          failureStage = "retry_publish";
          await publishConfirmed(
            channel,
            `${queueName}.retry`,
            buildRetryPayload({ job, attempts: nextAttempts, correlationId }),
            {
              correlationId,
              headers: { attempts: nextAttempts, correlationId },
            },
          );
        } else {
          logSafely(
            logger,
            "error",
            "worker_job_dlq",
            buildWorkerLogFields({
              queueName,
              job,
              attempts,
              correlationId,
              error,
              maxAttempts,
              failureStage: "dlq_publish",
            }),
          );

          failureStage = "dlq_publish";
          await publishConfirmed(
            channel,
            `${queueName}.dlq`,
            buildDeadLetterPayload({ job, error, queueName, correlationId }),
            {
              correlationId,
              headers: { correlationId },
            },
          );
        }

        channel.ack(message);
      } catch (routeError) {
        logSafely(logger, "error", "worker_failure_routing_publish_failed", {
          queue: queueName,
          jobType: getJobType(job),
          correlationId,
          failureStage,
          reason: routeError?.message,
        });
      }
    }
  };

  const scheduleReconnect = async (reason) => {
    if (stopped || reconnecting) return;
    reconnecting = true;
    connectionManager.reset?.();

    while (!stopped) {
      logSafely(logger, "warn", "worker_connection_reconnecting", {
        queue: queueName,
        reconnectDelayMs: reconnectDelay,
        reason: reason?.message,
      });
      await sleep(reconnectDelay);

      try {
        await connectAndConsume();
        reconnectDelay = reconnectDelayMs;
        reconnecting = false;
        logSafely(logger, "info", "worker_consumer_reregistered", { queue: queueName });
        return;
      } catch (error) {
        logSafely(logger, "error", "worker_reconnect_failed", {
          queue: queueName,
          reason: error?.message,
        });
        reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelayMs);
        connectionManager.reset?.();
      }
    }
  };

  const watchChannel = (activeChannel) => {
    const onClose = (reason) => {
      scheduleReconnect(reason);
    };

    const onError = (error) => {
      scheduleReconnect(error);
    };

    activeChannel.on?.("close", onClose);
    activeChannel.on?.("error", onError);
  };

  const connectAndConsume = async () => {
    channel = await connectionManager.getChannel();
    await channel.prefetch(prefetch);
    await channel.consume(queueName, handleMessage, { noAck: false });
    watchChannel(channel);
    return channel;
  };

  await connectAndConsume();

  return {
    get channel() {
      return channel;
    },
    queueName,
    async stop() {
      stopped = true;
      await connectionManager.close?.();
    },
  };
};

module.exports = {
  buildDeadLetterPayload,
  buildRetryPayload,
  buildWorkerLogFields,
  getAttempts,
  getMaxAttempts,
  parseJobMessage,
  sleep,
  startQueueWorker,
};
