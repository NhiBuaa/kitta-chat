const {
  ADMISSION_SCRIPT,
  CALL_CORRELATION_TTL_SECONDS,
  CALL_PHASES,
  REDIS_MIN_VERSION,
  createDistributedRateLimiter,
  getRateLimitRedisClient,
} = require("./distributedRateLimiter");

/**
 * The closure-minimum Redis admission boundary is intentionally one EVAL
 * primitive. This named factory keeps the implementation seam explicit for
 * tests and future wiring without introducing a sequential fallback.
 */
const createRedisAdmission = (options) => createDistributedRateLimiter(options);

module.exports = {
  ADMISSION_SCRIPT,
  CALL_CORRELATION_TTL_SECONDS,
  CALL_PHASES,
  REDIS_MIN_VERSION,
  createRedisAdmission,
  getRateLimitRedisClient,
};
