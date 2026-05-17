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

      try {
        const job = JSON.parse(message.content.toString("utf8"));
        await processJob(job, message);
        channel.ack(message);
      } catch (error) {
        logger.error?.(`[Worker] queue=${queueName} job failed:`, error);
        channel.nack(message, false, false);
      }
    },
    { noAck: false },
  );

  return { channel, queueName };
};

module.exports = {
  startQueueWorker,
};
