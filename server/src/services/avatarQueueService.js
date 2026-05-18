const { buildRemoteAvatarImageJob } = require("../queues/imageJobs");
const { imageQueue: defaultImageQueue } = require("../queues/imageQueue");
const { QUEUE_TEMPORARILY_UNAVAILABLE } = require("../utils/queueApiSemantics");
const { formatQueueError } = require("./profileAvatarQueueService");

const queueRemoteAvatarProcessing = async ({
  avatarUrl,
  userId,
  displayName,
  imageQueue = defaultImageQueue,
  requestId,
}) => {
  const job = buildRemoteAvatarImageJob({
    avatarUrl,
    userId,
    displayName,
    requestId,
  });

  try {
    await imageQueue.publishImageJob(job);
  } catch (error) {
    return {
      queued: false,
      requestId: null,
      error: formatQueueError(error),
      queueError: QUEUE_TEMPORARILY_UNAVAILABLE,
    };
  }

  return {
    queued: true,
    requestId: job.requestId,
  };
};

module.exports = {
  queueRemoteAvatarProcessing,
};
