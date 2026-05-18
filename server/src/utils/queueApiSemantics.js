const QUEUE_TEMPORARILY_UNAVAILABLE =
  "Background processing is temporarily unavailable. Please try again later.";

const buildQueueFailureResponse = ({
  message = "Background processing could not be queued.",
  file,
} = {}) => ({
  success: false,
  queued: false,
  queueError: QUEUE_TEMPORARILY_UNAVAILABLE,
  message,
  ...(file
    ? {
        file: {
          requestId: file.requestId || null,
          status: "queue_failed",
          name: file.name,
          type: file.type,
          size: file.size,
        },
      }
    : {}),
});

module.exports = {
  QUEUE_TEMPORARILY_UNAVAILABLE,
  buildQueueFailureResponse,
};
