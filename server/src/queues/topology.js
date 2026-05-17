const { IMAGE_JOB_QUEUE } = require("./imageJobs");
const { AUDIT_EVENTS_QUEUE } = require("./auditJobs");

const QUEUES = {
  IMAGE_PROCESS: IMAGE_JOB_QUEUE,
  AUDIT_EVENTS: AUDIT_EVENTS_QUEUE,
};

const QUEUE_TOPOLOGY = [
  {
    name: QUEUES.IMAGE_PROCESS,
    options: { durable: true },
  },
  {
    name: QUEUES.AUDIT_EVENTS,
    options: { durable: true },
  },
];

module.exports = {
  QUEUES,
  QUEUE_TOPOLOGY,
};
