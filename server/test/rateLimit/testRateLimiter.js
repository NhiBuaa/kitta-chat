const createTestRateLimiter = ({ authRateLimits = {} } = {}) => {
  const counters = new Map();
  const events = [];

  return {
    events,
    async admit({ policyIds, actor, conversationId }) {
      events.push({ policyIds: [...policyIds], actor, conversationId });
      if (policyIds.includes("read_expensive.panel_resources")) {
        const configuredLimit = Number(process.env.CONVERSATION_PANEL_RATE_LIMIT);
        if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
          const key = `panel:${actor?.value || "unknown"}:${conversationId || "unknown"}`;
          const count = counters.get(key) || 0;
          if (count >= configuredLimit) {
            return {
              allowed: false,
              retryAfterMs: 60_000,
              policyId: "read_expensive.panel_resources",
            };
          }
          counters.set(key, count + 1);
        }
      }
      const operationPolicy = policyIds.find((policyId) => policyId.startsWith("auth_entry.") && policyId !== "auth_entry.aggregate")
        || (policyIds.includes("auth_recovery_request") ? "auth_entry.forgotPassword" : null);
      if (!operationPolicy) return { allowed: true };

      const operation = operationPolicy.split(".")[1];
      const configured = authRateLimits[operation];
      if (!configured) return { allowed: true };

      const key = `${operation}:${actor?.value || "unknown"}`;
      const count = counters.get(key) || 0;
      if (count >= configured.max) {
        return { allowed: false, retryAfterMs: configured.windowMs, policyId: operationPolicy };
      }
      counters.set(key, count + 1);
      return { allowed: true };
    },

    async admitLogicalCall() {
      return { allowed: true, kind: "charged" };
    },
  };
};

module.exports = { createTestRateLimiter };
