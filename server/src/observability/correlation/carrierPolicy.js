const { getCorrelationContext } = require("./asyncContext");
const { generateValidId, isValidCorrelationId } = require("./idPolicy");
const { logSafely } = require("../../utils/logger");

const buildProducerCarrier = ({
  payload = {},
  context = getCorrelationContext(),
  generator,
} = {}) => {
  const correlationId = [
    payload.correlationId,
    payload.requestId,
    context.requestId,
  ].find(isValidCorrelationId) || generateValidId(generator);

  return {
    correlationId,
    payload: { ...payload, correlationId },
    properties: {
      correlationId,
      headers: { correlationId },
    },
  };
};

const resolveWorkerCarrier = ({ job = {}, message, logger, generator } = {}) => {
  const candidates = [
    ["amqp.correlationId", message?.properties?.correlationId],
    ["amqp.headers.correlationId", message?.properties?.headers?.correlationId],
    ["payload.correlationId", job?.correlationId],
    ["payload.requestId", job?.requestId],
  ].filter(([, value]) => isValidCorrelationId(value));
  const correlationId = candidates[0]?.[1] || generateValidId(generator);
  const distinctValues = new Set(candidates.map(([, value]) => value));

  if (distinctValues.size > 1) {
    logSafely(logger, "warn", "correlation_context_mismatch", {
      correlationId,
      carriers: candidates.map(([name]) => name),
    });
  }

  return {
    correlationId,
    job: { ...job, correlationId },
  };
};

const rewriteCorrelationCarrier = (payload, correlationId) => ({
  correlationId,
  payload: { ...payload, correlationId },
  properties: {
    correlationId,
    headers: { correlationId },
  },
});

module.exports = {
  buildProducerCarrier,
  resolveWorkerCarrier,
  rewriteCorrelationCarrier,
};
