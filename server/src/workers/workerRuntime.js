const {
  getCorrelationId,
  getJobType,
} = require("../queues/correlation");

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
  job,
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

const buildRetryPayload = ({ job, attempts }) => ({
  ...job,
  attempts,
});

const buildWorkerLogFields = ({
  queueName,
  job,
  attempts,
  correlationId,
  error,
  maxAttempts,
}) => {
  const fields = {
    queue: queueName,
    jobType: getJobType(job),
    attempt: attempts,
    correlationId,
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
  logger = console,
}) => {
  let stopped = false;
  let channel = null;
  let reconnecting = false;
  let reconnectDelay = reconnectDelayMs;

  const handleMessage = async (message) => {
    if (!message) return;

    let job = null;

    try {
      job = JSON.parse(message.content.toString("utf8"));
      await processJob(job, message);
      channel.ack(message);
    } catch (error) {
      try {
        const attempts = getAttempts(job, message);
        const correlationId = getCorrelationId(job, message);
        const failureFields = buildWorkerLogFields({
          queueName,
          job,
          attempts,
          correlationId,
          error,
        });

        logger.error?.("worker_job_failed", failureFields);

        if (attempts < maxAttempts) {
          const nextAttempts = attempts + 1;
          logger.warn?.(
            "worker_job_retry",
            buildWorkerLogFields({
              queueName,
              job,
              attempts: nextAttempts,
              correlationId,
              error,
              maxAttempts,
            }),
          );

          await publishConfirmed(
            channel,
            `${queueName}.retry`,
            buildRetryPayload({ job, attempts: nextAttempts }),
            {
              correlationId,
              headers: { attempts: nextAttempts, correlationId },
            },
          );
        } else {
          logger.error?.(
            "worker_job_dlq",
            buildWorkerLogFields({
              queueName,
              job,
              attempts,
              correlationId,
              error,
              maxAttempts,
            }),
          );

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
        logger.error?.(`[Worker] queue=${queueName} failure routing publish failed:`, routeError);
      }
    }
  };

  const scheduleReconnect = async (reason) => {
    if (stopped || reconnecting) return;
    reconnecting = true;
    connectionManager.reset?.();

    while (!stopped) {
      logger.warn?.(
        `[Worker] queue=${queueName} RabbitMQ connection lost; reconnecting in ${reconnectDelay}ms`,
        reason,
      );
      await sleep(reconnectDelay);

      try {
        await connectAndConsume();
        reconnectDelay = reconnectDelayMs;
        reconnecting = false;
        logger.log?.(`[Worker] queue=${queueName} consumer re-registered after reconnect`);
        return;
      } catch (error) {
        logger.error?.(`[Worker] queue=${queueName} reconnect failed:`, error);
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
  sleep,
  startQueueWorker,
};
