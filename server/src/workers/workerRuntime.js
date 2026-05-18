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

const buildDeadLetterPayload = ({ job, error, queueName }) => ({
  job,
  error: {
    message: error.message,
    failedAt: new Date().toISOString(),
    originalQueue: queueName,
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

const startQueueWorker = async ({
  queueName,
  connectionManager,
  processJob,
  prefetch = 1,
  maxAttempts = getMaxAttempts(),
  logger = console,
}) => {
  const channel = await connectionManager.getChannel();
  await channel.prefetch(prefetch);

  await channel.consume(
    queueName,
    async (message) => {
      if (!message) return;

      let job = null;

      try {
        job = JSON.parse(message.content.toString("utf8"));
        await processJob(job, message);
        channel.ack(message);
      } catch (error) {
        logger.error?.(`[Worker] queue=${queueName} job failed:`, error);

        try {
          const attempts = getAttempts(job, message);

          if (attempts < maxAttempts) {
            const nextAttempts = attempts + 1;
            logger.warn?.(
              `[Worker] queue=${queueName} retry attempt=${nextAttempts}/${maxAttempts}`,
            );

            await publishConfirmed(
              channel,
              `${queueName}.retry`,
              buildRetryPayload({ job, attempts: nextAttempts }),
              { headers: { attempts: nextAttempts } },
            );
          } else {
            logger.error?.(
              `[Worker] queue=${queueName} routing to DLQ attempts=${attempts}/${maxAttempts}`,
            );

            await publishConfirmed(
              channel,
              `${queueName}.dlq`,
              buildDeadLetterPayload({ job, error, queueName }),
            );
          }

          channel.ack(message);
        } catch (routeError) {
          logger.error?.(`[Worker] queue=${queueName} failure routing publish failed:`, routeError);
        }
      }
    },
    { noAck: false },
  );

  return { channel, queueName };
};

module.exports = {
  buildDeadLetterPayload,
  buildRetryPayload,
  getAttempts,
  getMaxAttempts,
  startQueueWorker,
};
