const crypto = require("crypto");

const { runWithCorrelationContext } = require("../observability/correlation/asyncContext");
const { canonicalizeRequestId } = require("../observability/correlation/idPolicy");
const { logger: defaultLogger } = require("../utils/logger");
const { logSafely } = require("../utils/logger");

const getUserId = (req) => {
  const userId = req.user?.id || req.user?._id || req.userId;
  return userId?.toString?.() || userId || undefined;
};

const defaultRequestIdGenerator = () => crypto.randomUUID();

const redactResetTokenPath = (path) => path.replace(
  /^(\/api\/auth\/reset-password\/[^/]+)\/[^/?#]+$/,
  "$1/[REDACTED]",
);

const createRequestLoggingMiddleware = ({
  logger = defaultLogger,
  requestIdGenerator = defaultRequestIdGenerator,
} = {}) => {
  return (req, res, next) => {
    const requestId = canonicalizeRequestId(
      req.headers["x-request-id"],
      requestIdGenerator,
    );
    const startTime = process.hrtime.bigint();
    const requestPath = redactResetTokenPath((req.originalUrl || req.url).split("?", 1)[0]);

    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    runWithCorrelationContext({ requestId }, () => {
      res.on("finish", () => {
        const latencyMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        const fields = {
          requestId,
          method: req.method,
          path: requestPath,
          status: res.statusCode,
          latencyMs: Math.round(latencyMs * 100) / 100,
        };
        const userId = getUserId(req);

        if (userId) {
          fields.userId = userId;
        }

        logSafely(logger, "info", "http_request", fields);
      });

      next();
    });
  };
};

module.exports = {
  createRequestLoggingMiddleware,
};
