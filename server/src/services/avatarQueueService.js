const { buildRemoteAvatarImageJob } = require("../queues/imageJobs");
const { imageQueue: defaultImageQueue } = require("../queues/imageQueue");

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

  await imageQueue.publishImageJob(job);

  return {
    queued: true,
    requestId: job.requestId,
  };
};

module.exports = {
  queueRemoteAvatarProcessing,
};
