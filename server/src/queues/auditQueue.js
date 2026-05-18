const { AUDIT_EVENTS_QUEUE } = require("./auditJobs");
const { createProducer } = require("./producer");
const { connectionManager } = require("./rabbitmq");

const createAuditQueue = ({
  producer = createProducer({ connectionManager }),
} = {}) => ({
  async publishMessageCreatedJob(job) {
    await producer.publish(AUDIT_EVENTS_QUEUE, job);
  },
});

module.exports = {
  createAuditQueue,
  auditQueue: createAuditQueue(),
};
