const { buildPasswordResetEmailJob } = require("../queues/notificationJobs");
const { notificationQueue: defaultNotificationQueue } = require("../queues/notificationQueue");
const { formatQueueError } = require("./profileAvatarQueueService");

const queuePasswordResetEmail = async ({
  user,
  resetUrl,
  notificationQueue = defaultNotificationQueue,
  requestId,
}) => {
  const emailJob = buildPasswordResetEmailJob({
    to: user.email,
    displayName: user.displayName,
    resetUrl,
    requestId,
  });

  try {
    await notificationQueue.publishEmailJob(emailJob);
  } catch (error) {
    return {
      queued: false,
      requestId: null,
      error: formatQueueError(error),
    };
  }

  return {
    queued: true,
    requestId: emailJob.requestId,
  };
};

module.exports = {
  queuePasswordResetEmail,
};
