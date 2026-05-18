const { NOTIFICATION_EMAIL_QUEUE } = require("./notificationJobs");
const { createProducer } = require("./producer");
const { connectionManager } = require("./rabbitmq");

const createNotificationQueue = ({
  producer = createProducer({ connectionManager }),
} = {}) => ({
  async publishEmailJob(job) {
    await producer.publish(NOTIFICATION_EMAIL_QUEUE, job);
  },
});

module.exports = {
  createNotificationQueue,
  notificationQueue: createNotificationQueue(),
};
