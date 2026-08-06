const crypto = require("crypto");
const {
  buildProducerCarrier,
  resolveWorkerCarrier,
} = require("../observability/correlation/carrierPolicy");

const createCorrelationId = () => crypto.randomUUID();

const getCorrelationId = (job, message) =>
  resolveWorkerCarrier({ job, message }).correlationId;

const getJobType = (job) => job?.type || "unknown";

const withCorrelation = (payload, correlationIdGenerator = createCorrelationId) => {
  const carrier = buildProducerCarrier({ payload, generator: correlationIdGenerator });
  return { payload: carrier.payload, correlationId: carrier.correlationId };
};

module.exports = {
  createCorrelationId,
  getCorrelationId,
  getJobType,
  withCorrelation,
};
