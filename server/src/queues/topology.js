const { IMAGE_JOB_QUEUE } = require("./imageJobs");
const { AUDIT_EVENTS_QUEUE } = require("./auditJobs");
const { NOTIFICATION_EMAIL_QUEUE } = require("./notificationJobs");

const QUEUES = {
  IMAGE_PROCESS: IMAGE_JOB_QUEUE,
  AUDIT_EVENTS: AUDIT_EVENTS_QUEUE,
  NOTIFICATION_EMAIL: NOTIFICATION_EMAIL_QUEUE,
  IMAGE_PROCESS_DLQ: `${IMAGE_JOB_QUEUE}.dlq`,
  AUDIT_EVENTS_DLQ: `${AUDIT_EVENTS_QUEUE}.dlq`,
  NOTIFICATION_EMAIL_DLQ: `${NOTIFICATION_EMAIL_QUEUE}.dlq`,
};

const QUEUE_TOPOLOGY = [
  {
    name: QUEUES.IMAGE_PROCESS,
    options: { durable: true },
  },
  {
    name: QUEUES.IMAGE_PROCESS_DLQ,
    options: { durable: true },
  },
  {
    name: QUEUES.AUDIT_EVENTS,
    options: { durable: true },
  },
  {
    name: QUEUES.AUDIT_EVENTS_DLQ,
    options: { durable: true },
  },
  {
    name: QUEUES.NOTIFICATION_EMAIL,
    options: { durable: true },
  },
  {
    name: QUEUES.NOTIFICATION_EMAIL_DLQ,
    options: { durable: true },
  },
];

module.exports = {
  QUEUES,
  QUEUE_TOPOLOGY,
};
