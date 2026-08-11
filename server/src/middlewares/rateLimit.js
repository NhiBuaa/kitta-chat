/**
 * Retired compatibility seam. Runtime routes must use the Redis-backed
 * closure-minimum admission middleware; this module intentionally contains no
 * process-local counter or fallback behavior.
 */
const createRateLimiter = () => {
  throw new Error("Process-local rate limiting is retired; use distributed admission");
};

module.exports = {
  createRateLimiter,
};
