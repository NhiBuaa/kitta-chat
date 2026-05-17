const { IMAGE_JOB_QUEUE } = require("./imageJobs");

const QUEUES = {
  IMAGE_PROCESS: IMAGE_JOB_QUEUE,
};

const QUEUE_TOPOLOGY = [
  {
    name: QUEUES.IMAGE_PROCESS,
    options: { durable: true },
  },
];

module.exports = {
  QUEUES,
  QUEUE_TOPOLOGY,
};
