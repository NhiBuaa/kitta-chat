const { IMAGE_JOB_QUEUE } = require("./imageJobs");
const { createProducer } = require("./producer");
const { connectionManager } = require("./rabbitmq");

const createImageQueue = ({
  producer = createProducer({ connectionManager }),
} = {}) => ({
  async publishImageJob(job) {
    await producer.publish(IMAGE_JOB_QUEUE, job);
  },
});

module.exports = {
  createImageQueue,
  imageQueue: createImageQueue(),
};
