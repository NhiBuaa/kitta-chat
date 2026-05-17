const createProducer = ({ connectionManager }) => ({
  async publish(queueName, payload, options = {}) {
    const channel = await connectionManager.getChannel();
    const accepted = channel.sendToQueue(
      queueName,
      Buffer.from(JSON.stringify(payload)),
      {
        contentType: "application/json",
        persistent: true,
        ...options,
      },
    );

    if (!accepted) {
      throw new Error(`RabbitMQ backpressure: job was not accepted by ${queueName}`);
    }
  },
});

module.exports = {
  createProducer,
};
