const { callRateLimit } = require("./state");
const { RATE_LIMIT_CALLS, RATE_LIMIT_WINDOW_MS } = require("./constants");

/**
 * Returns true when the user is within the allowed call rate,
 * false when they have exceeded it.
 *
 * @param {string} userId
 * @returns {boolean}
 */
const checkRateLimit = (userId) => {
    const now = Date.now();
    const entry = callRateLimit.get(userId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        callRateLimit.set(userId, { count: 1, windowStart: now });
        return true;
    }

    if (entry.count >= RATE_LIMIT_CALLS) return false;

    entry.count++;
    return true;
};

module.exports = { checkRateLimit };