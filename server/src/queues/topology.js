const { IMAGE_JOB_QUEUE } = require("./imageJobs");
const { AUDIT_EVENTS_QUEUE } = require("./auditJobs");
const { NOTIFICATION_EMAIL_QUEUE } = require("./notificationJobs");

const getRetryDelayMs = () => Number(process.env.RABBITMQ_RETRY_DELAY_MS || 30000);

const QUEUES = {
  IMAGE_PROCESS: IMAGE_JOB_QUEUE,
  AUDIT_EVENTS: AUDIT_EVENTS_QUEUE,
  NOTIFICATION_EMAIL: NOTIFICATION_EMAIL_QUEUE,
  IMAGE_PROCESS_RETRY: `${IMAGE_JOB_QUEUE}.retry`,
  AUDIT_EVENTS_RETRY: `${AUDIT_EVENTS_QUEUE}.retry`,
  NOTIFICATION_EMAIL_RETRY: `${NOTIFICATION_EMAIL_QUEUE}.retry`,
  IMAGE_PROCESS_DLQ: `${IMAGE_JOB_QUEUE}.dlq`,
  AUDIT_EVENTS_DLQ: `${AUDIT_EVENTS_QUEUE}.dlq`,
  NOTIFICATION_EMAIL_DLQ: `${NOTIFICATION_EMAIL_QUEUE}.dlq`,
};

const retryQueueOptions = (primaryQueueName) => ({
  durable: true,
  messageTtl: getRetryDelayMs(),
  deadLetterExchange: "",
  deadLetterRoutingKey: primaryQueueName,
});

const QUEUE_TOPOLOGY = [
  {
    name: QUEUES.IMAGE_PROCESS,
    options: { durable: true },
  },
  {
    name: QUEUES.IMAGE_PROCESS_RETRY,
    options: retryQueueOptions(QUEUES.IMAGE_PROCESS),
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
    name: QUEUES.AUDIT_EVENTS_RETRY,
    options: retryQueueOptions(QUEUES.AUDIT_EVENTS),
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
    name: QUEUES.NOTIFICATION_EMAIL_RETRY,
    options: retryQueueOptions(QUEUES.NOTIFICATION_EMAIL),
  },
  {
    name: QUEUES.NOTIFICATION_EMAIL_DLQ,
    options: { durable: true },
  },
];

module.exports = {
  getRetryDelayMs,
  QUEUES,
  QUEUE_TOPOLOGY,
};
