const { createCorrelationId, withCorrelation } = require("./correlation");

const createProducer = ({
  connectionManager,
  correlationIdGenerator = createCorrelationId,
}) => ({
  async publish(queueName, payload, options = {}) {
    const channel = await connectionManager.getChannel();
    const { payload: correlatedPayload, correlationId } = withCorrelation(
      payload,
      correlationIdGenerator,
    );

    await new Promise((resolve, reject) => {
      channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(correlatedPayload)),
        {
          contentType: "application/json",
          persistent: true,
          correlationId,
          ...options,
          headers: {
            ...(options.headers || {}),
            correlationId,
          },
        },
        (error) => {
          if (error) {
            reject(new Error(`RabbitMQ publish confirm failed for ${queueName}: ${error.message}`));
            return;
          }

          resolve();
        },
      );
    });
  },
});

module.exports = {
  createProducer,
};
