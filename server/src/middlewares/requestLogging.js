const crypto = require("crypto");

const { logger: defaultLogger } = require("../utils/logger");

const getUserId = (req) => {
  const userId = req.user?.id || req.user?._id || req.userId;
  return userId?.toString?.() || userId || undefined;
};

const defaultRequestIdGenerator = () => crypto.randomUUID();

const createRequestLoggingMiddleware = ({
  logger = defaultLogger,
  requestIdGenerator = defaultRequestIdGenerator,
} = {}) => {
  return (req, res, next) => {
    const requestId = req.get("x-request-id") || requestIdGenerator();
    const startTime = process.hrtime.bigint();

    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      const latencyMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      const fields = {
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        latencyMs: Math.round(latencyMs * 100) / 100,
      };
      const userId = getUserId(req);

      if (userId) {
        fields.userId = userId;
      }

      logger.info("http_request", fields);
    });

    next();
  };
};

module.exports = {
  createRequestLoggingMiddleware,
};
