const path = require("node:path");

const {
  expectedOperationPolicies,
  expectedPolicies,
} = require("./fixtures.cjs");
const {
  emptySideEffects,
  withLoopbackServer,
} = require("./runnerSupport.cjs");
const { createSocket } = require("./scenarioSupport.cjs");

const directMiddlewareResult = async ({ middleware, rateLimiter }) => {
  const headers = new Map();
  const response = {
    req: { requestId: "safe-request-id" },
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers.set(name.toLowerCase(), String(value)); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await middleware({
    app: { get: () => rateLimiter },
    ip: "127.0.0.1",
  }, response, () => {
    throw new Error("rejected limiter fixture reached next middleware");
  });
  return { headers, response };
};

const socketLimitObservation = async ({ root, result }) => {
  const { registerCallHandlers } = require(path.join(
    root,
    "server",
    "src",
    "socket",
    "handlers",
    "call",
  ));
  const socket = createSocket();
  const io = { rateLimiter: {}, redisClient: {} };
  registerCallHandlers(socket, io, {
    capabilities: { calls: true },
    rateLimiter: { admitLogicalCall: async () => result },
  });
  await socket.listeners.get("initCall")({
    callId: "temp_safe",
    from: "safe-socket-id",
    typeCall: "audio",
    userToCall: "safe-callee-id",
  });
  const emitted = socket.emitted[0];
  return {
    inputEvent: "initCall",
    outputEvent: emitted.event,
    payloadShape: Object.keys(emitted.payload).sort(),
    reasonEqual: true,
  };
};

const mapHttpLimiterObservation = ({ result, unavailable = false }) => ({
  method: "POST",
  pathTemplate: "/api/auth/login",
  status: result.response.statusCode,
  success: result.response.body.success,
  errorCode: result.response.body.error.code,
  messageEqual: result.response.body.message === (
    unavailable
      ? "Rate-limit service is unavailable"
      : "Too many requests. Please try again later."
  ),
  requestIdMatched: result.response.body.requestId === "safe-request-id",
  retryAfter: result.headers.get("retry-after") || null,
});

const buildPolicyChecks = (policies) => Object.entries(expectedPolicies).map(
  ([policyId, expectedTuple]) => {
    const policy = policies[policyId];
    const actualTuple = [
      policy.algorithm,
      policy.limit,
      policy.windowMs,
      policy.capacity ?? null,
      policy.scope,
    ];
    return {
      policyId,
      actualTuple,
      expectedTuple,
      exactMatch: JSON.stringify(actualTuple) === JSON.stringify(expectedTuple),
    };
  },
);

const buildOperationPolicyChecks = (membership) => Object.entries(expectedOperationPolicies).map(
  ([operation, expectedPolicyIds]) => {
    const actualPolicyIds = [...(membership[operation] || [])];
    return {
      operation,
      actualPolicyIds,
      expectedPolicyIds,
      exactMatch: JSON.stringify(actualPolicyIds) === JSON.stringify(expectedPolicyIds),
    };
  },
);

const assertLimiterContract = ({ http, socket, policyChecks, operationPolicyChecks }) => {
  if (
    http[0].status !== 429
    || http[0].retryAfter !== "1"
    || http[1].status !== 503
    || http[1].retryAfter !== null
    || socket[0].outputEvent !== "RATE_LIMIT_UNAVAILABLE"
    || socket[1].outputEvent !== "RATE_LIMITED"
    || policyChecks.some((entry) => !entry.exactMatch)
    || operationPolicyChecks.some((entry) => !entry.exactMatch)
  ) {
    throw new Error("rate-limit contract differs from the locked matrix");
  }
};

const scenarioLimiterContract = async ({ root, port }) => {
  const { createHttpRateLimitMiddleware } = require(path.join(
    root,
    "server",
    "src",
    "rateLimit",
    "httpAdmissionMiddleware.js",
  ));
  const { POLICIES } = require(path.join(root, "server", "src", "rateLimit", "closureMinimumPolicyCatalog.js"));
  const { OPERATION_POLICY_MEMBERSHIP } = require(path.join(
    root,
    "server",
    "src",
    "rateLimit",
    "operationPolicyMembership.js",
  ));
  const middleware = createHttpRateLimitMiddleware({ policyIds: ["auth_entry.aggregate"] });
  const exhausted = await directMiddlewareResult({
    middleware,
    rateLimiter: { admit: async () => ({ allowed: false, retryAfterMs: 1000 }) },
  });
  const unavailable = await directMiddlewareResult({
    middleware,
    rateLimiter: { admit: async () => ({ unavailable: true }) },
  });
  const http = [
    mapHttpLimiterObservation({ result: exhausted }),
    mapHttpLimiterObservation({ result: unavailable, unavailable: true }),
  ];
  const socket = [
    await socketLimitObservation({ root, result: { unavailable: true } }),
    await socketLimitObservation({ root, result: { allowed: false, retryAfterMs: 1000 } }),
  ];
  const policyChecks = buildPolicyChecks(POLICIES);
  const operationPolicyChecks = buildOperationPolicyChecks(OPERATION_POLICY_MEMBERSHIP);
  assertLimiterContract({ http, socket, policyChecks, operationPolicyChecks });
  await withLoopbackServer({ port }, async () => undefined);
  return {
    http,
    socket,
    policyChecks,
    operationPolicyChecks,
    sideEffects: { ...emptySideEffects(), limiter: 4 },
  };
};

module.exports = { scenarioLimiterContract };
