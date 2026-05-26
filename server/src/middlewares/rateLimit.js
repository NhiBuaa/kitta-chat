const { sendError } = require("../utils/apiResponse");

const defaultKeyGenerator = (req) => req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";

const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 10,
  code = "RATE_LIMITED",
  message = "Too many requests. Please try again later.",
  keyGenerator = defaultKeyGenerator,
  now = () => Date.now(),
} = {}) => {
  const hits = new Map();

  return (req, res, next) => {
    const currentTime = now();
    const key = String(keyGenerator(req));
    const existing = hits.get(key);

    if (!existing || currentTime >= existing.resetAt) {
      hits.set(key, { count: 1, resetAt: currentTime + windowMs });
      return next();
    }

    existing.count += 1;

    if (existing.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendError(res, {
        status: 429,
        code,
        message,
      });
    }

    return next();
  };
};

module.exports = {
  createRateLimiter,
};
