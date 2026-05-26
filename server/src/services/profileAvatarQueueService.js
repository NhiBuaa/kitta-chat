const { buildAvatarImageJob } = require("../queues/imageJobs");
const { imageQueue: defaultImageQueue } = require("../queues/imageQueue");
const { QUEUE_TEMPORARILY_UNAVAILABLE } = require("../utils/queueApiSemantics");
const s3Service = require("./s3.service");

const queueProfileAvatarProcessing = async ({
  file,
  userId,
  storage = s3Service,
  imageQueue = defaultImageQueue,
  correlationId,
}) => {
  const source = await storage.uploadObject(
    file.buffer,
    file.originalname,
    file.mimetype,
    "queue-sources",
  );

  const avatarJob = buildAvatarImageJob({
    source,
    file,
    userId,
    profileUpdates: {},
    correlationId,
  });

  try {
    await imageQueue.publishImageJob(avatarJob);
  } catch (error) {
    if (typeof storage.deleteObject === "function" && source.key) {
      await storage.deleteObject(source.key).catch(() => {});
    }

    return {
      queued: false,
      requestId: null,
      error: formatQueueError(error),
      queueError: QUEUE_TEMPORARILY_UNAVAILABLE,
    };
  }

  return {
    queued: true,
    requestId: avatarJob.requestId,
  };
};

const formatQueueError = (error) => {
  if (error?.message) return error.message;

  const nestedMessages = Array.isArray(error?.errors)
    ? error.errors.map((nestedError) => nestedError.message).filter(Boolean)
    : [];

  if (nestedMessages.length > 0) {
    return nestedMessages.join("; ");
  }

  return error?.code || "RabbitMQ unavailable";
};

module.exports = {
  formatQueueError,
  queueProfileAvatarProcessing,
};
