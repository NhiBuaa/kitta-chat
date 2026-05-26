const crypto = require("crypto");

const createCorrelationId = () => crypto.randomUUID();

const getCorrelationId = (job, message) =>
  job?.correlationId ||
  message?.properties?.correlationId ||
  message?.properties?.headers?.correlationId ||
  job?.requestId ||
  createCorrelationId();

const getJobType = (job) => job?.type || "unknown";

const withCorrelation = (payload, correlationIdGenerator = createCorrelationId) => {
  const correlationId =
    payload?.correlationId || payload?.requestId || correlationIdGenerator();

  return {
    payload: {
      ...payload,
      correlationId,
    },
    correlationId,
  };
};

module.exports = {
  createCorrelationId,
  getCorrelationId,
  getJobType,
  withCorrelation,
};
