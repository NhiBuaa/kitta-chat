const { sendError } = require("../utils/apiResponse");
const { getPolicy } = require("./policyCatalog");
const {
  canonicalConversationId,
  canonicalNetworkActor,
  canonicalUserActor,
} = require("./requestIdentity");

const RATE_LIMITED_MESSAGE = "Too many requests. Please try again later.";

const resolveActor = (req, policyIds) => {
  const policy = getPolicy(policyIds[0]);
  if (["network"].includes(policy.scope)) return canonicalNetworkActor(req);
  if (["user", "user_conversation"].includes(policy.scope)) return canonicalUserActor(req);
  return null;
};

const buildDefaultContext = (req, policyIds) => {
  const actor = resolveActor(req, policyIds);
  const conversationId = policyIds.some((policyId) => getPolicy(policyId).scope === "user_conversation")
    ? canonicalConversationId(req)
    : undefined;
  return {
    actor,
    conversationId,
    invalidIdentity: !actor || (policyIds.some((policyId) => getPolicy(policyId).scope === "user_conversation") && !conversationId),
  };
};

const createHttpRateLimitMiddleware = ({ policyIds, context, when } = {}) => {
  const resolvePolicyIds = typeof policyIds === "function"
    ? policyIds
    : () => policyIds;

  if (typeof policyIds !== "function" && (!Array.isArray(policyIds) || policyIds.length === 0)) {
    throw new TypeError("HTTP rate-limit middleware requires approved policy IDs");
  }

  return async (req, res, next) => {
    if (typeof when === "function" && !when(req)) return next();

    let resolvedPolicyIds;
    let resolvedContext;
    try {
      resolvedPolicyIds = resolvePolicyIds(req);
      if (!Array.isArray(resolvedPolicyIds) || resolvedPolicyIds.length === 0) {
        throw new TypeError("HTTP rate-limit middleware resolved no policy IDs");
      }
      resolvedContext = await (typeof context === "function"
        ? context(req, resolvedPolicyIds)
        : buildDefaultContext(req, resolvedPolicyIds));
    } catch {
      return sendError(res, {
        status: 503,
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Rate-limit service is unavailable",
      });
    }

    if (resolvedContext?.invalidIdentity) {
      return sendError(res, {
        status: 403,
        code: "FORBIDDEN",
        message: "Resource identity is invalid",
      });
    }

    const rateLimiter = req.app.get("rateLimiter");
    if (!rateLimiter || typeof rateLimiter.admit !== "function") {
      return sendError(res, {
        status: 503,
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Rate-limit service is unavailable",
      });
    }

    let result;
    try {
      result = await rateLimiter.admit({ policyIds: resolvedPolicyIds, ...resolvedContext });
    } catch {
      result = { unavailable: true };
    }

    if (result?.unavailable) {
      return sendError(res, {
        status: 503,
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Rate-limit service is unavailable",
      });
    }

    if (!result?.allowed) {
      if (result?.retryAfterMs) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
      }
      return sendError(res, {
        status: 429,
        code: "RATE_LIMITED",
        message: RATE_LIMITED_MESSAGE,
      });
    }

    return next();
  };
};

module.exports = {
  RATE_LIMITED_MESSAGE,
  createHttpRateLimitMiddleware,
};
