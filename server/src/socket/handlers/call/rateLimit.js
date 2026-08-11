/**
 * Retired compatibility seam. Call admission is distributed and must be
 * performed through `admitLogicalCall`; this helper cannot be used as a
 * process-local fallback.
 */
const checkRateLimit = () => {
    throw new Error("Process-local call rate limiting is retired; use distributed admission");
};

module.exports = { checkRateLimit };
