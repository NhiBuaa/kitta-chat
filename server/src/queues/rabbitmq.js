const { createRabbitConnectionManager } = require("./connectionManager");
const { QUEUE_TOPOLOGY } = require("./topology");

const connectionManager = createRabbitConnectionManager({
  queues: QUEUE_TOPOLOGY,
});

const connectRabbitMQ = async () => connectionManager.getChannel();

const publishImageJob = async (job) => {
  const { imageQueue } = require("./imageQueue");
  await imageQueue.publishImageJob(job);
};

const closeRabbitMQ = async () => {
  await connectionManager.close();
};

module.exports = {
  connectRabbitMQ,
  publishImageJob,
  closeRabbitMQ,
  connectionManager,
};
