const { createCorrelationId } = require("./correlation");
const { buildProducerCarrier } = require("../observability/correlation/carrierPolicy");

const createProducer = ({
  connectionManager,
  correlationIdGenerator = createCorrelationId,
}) => ({
  async publish(queueName, payload, options = {}) {
    const channel = await connectionManager.getChannel();
    const carrier = buildProducerCarrier({ payload, generator: correlationIdGenerator });

    await new Promise((resolve, reject) => {
      channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(carrier.payload)),
        {
          contentType: "application/json",
          persistent: true,
          ...options,
          correlationId: carrier.correlationId,
          headers: {
            ...(options.headers || {}),
            correlationId: carrier.correlationId,
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
