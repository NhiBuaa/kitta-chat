const publishConfirmed = (channel, queueName, payload) =>
  new Promise((resolve, reject) => {
    channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(payload)),
      {
        contentType: "application/json",
        persistent: true,
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

const startQueueWorker = async ({
  queueName,
  connectionManager,
  processJob,
  prefetch = 1,
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
          await publishConfirmed(
            channel,
            `${queueName}.dlq`,
            buildDeadLetterPayload({ job, error, queueName }),
          );
          channel.ack(message);
        } catch (dlqError) {
          logger.error?.(`[Worker] queue=${queueName} DLQ publish failed:`, dlqError);
        }
      }
    },
    { noAck: false },
  );

  return { channel, queueName };
};

module.exports = {
  buildDeadLetterPayload,
  startQueueWorker,
};
