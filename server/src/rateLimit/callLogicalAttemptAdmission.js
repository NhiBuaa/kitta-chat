const { randomUUID } = require("node:crypto");
const { isValidClientCallId } = require("./keyBuilder");

const createCallLogicalAttemptAdmission = ({ rateLimiter } = {}) => {
  if (!rateLimiter || typeof rateLimiter.admitLogicalCall !== "function") {
    return async () => ({
      allowed: false,
      unavailable: true,
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  }

  return async ({ caller, callee, clientCallId, phase = "call_user_consumed" } = {}) => rateLimiter.admitLogicalCall({
    caller,
    callee,
    clientCallId: isValidClientCallId(clientCallId) ? clientCallId : `unmatched_${randomUUID()}`,
    phase,
  });
};

module.exports = { createCallLogicalAttemptAdmission };
