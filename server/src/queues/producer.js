const createProducer = ({ connectionManager }) => ({
  async publish(queueName, payload, options = {}) {
    const channel = await connectionManager.getChannel();

    await new Promise((resolve, reject) => {
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
