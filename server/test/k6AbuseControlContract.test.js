const assert = require("node:assert/strict");
const test = require("node:test");

const authRoutes = require("../src/routes/auth");
const fileRoutes = require("../src/routes/file");
const callRoutes = require("../src/routes/callHistory");
const {
  OPERATION_POLICY_MEMBERSHIP,
} = require("../src/rateLimit/operationPolicyMembership");

const routePolicies = (router, method, path) => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method.toLowerCase()],
  );
  assert.ok(layer, `${method} ${path}`);
  return layer.route.stack.flatMap(
    (entry) => entry.handle.rateLimitPolicyIds || [],
  );
};

test("K6 operation membership remains exactly bound to the existing route middleware", () => {
  const actual = {
    "POST /api/auth/login": routePolicies(authRoutes, "POST", "/login"),
    "POST /api/auth/register": routePolicies(authRoutes, "POST", "/register"),
    "POST /api/auth/google": routePolicies(authRoutes, "POST", "/google"),
    "POST /api/auth/forgot-password": routePolicies(authRoutes, "POST", "/forgot-password"),
    "POST /api/auth/reset-password/:id": routePolicies(authRoutes, "POST", "/reset-password/:id"),
    "POST /api/auth/refresh stage A": routePolicies(authRoutes, "POST", "/refresh"),
    "refresh subject admission stage B": OPERATION_POLICY_MEMBERSHIP["refresh subject admission stage B"],
    "POST /api/files/init": routePolicies(fileRoutes, "POST", "/init"),
    "POST /api/files/get-presigned-url": routePolicies(fileRoutes, "POST", "/get-presigned-url"),
    "POST /api/files/complete": routePolicies(fileRoutes, "POST", "/complete"),
    "POST /api/files/upload-single": routePolicies(fileRoutes, "POST", "/upload-single"),
    "POST /api/files/:fileId/download-url": routePolicies(fileRoutes, "POST", "/:fileId/download-url"),
    "GET /api/calls/history": routePolicies(callRoutes, "GET", "/history"),
    "GET /api/calls/missed": routePolicies(callRoutes, "GET", "/missed"),
    "POST /api/calls/:id/read": routePolicies(callRoutes, "POST", "/:id/read"),
    "POST /api/calls/read-all": routePolicies(callRoutes, "POST", "/read-all"),
    "Socket.IO initCall": OPERATION_POLICY_MEMBERSHIP["Socket.IO initCall"],
    "Socket.IO callUser": OPERATION_POLICY_MEMBERSHIP["Socket.IO callUser"],
    "Socket.IO answerCall": OPERATION_POLICY_MEMBERSHIP["Socket.IO answerCall"],
    "Socket.IO endCall": OPERATION_POLICY_MEMBERSHIP["Socket.IO endCall"],
    "Socket.IO rejectCall": OPERATION_POLICY_MEMBERSHIP["Socket.IO rejectCall"],
    "Socket.IO toggleMedia": OPERATION_POLICY_MEMBERSHIP["Socket.IO toggleMedia"],
  };

  assert.deepEqual(actual, OPERATION_POLICY_MEMBERSHIP);
});

test("limiter middleware exposes immutable policy identity without changing admission", () => {
  const layer = authRoutes.stack.find((entry) => entry.route?.path === "/register");
  const limiter = layer.route.stack.find((entry) => entry.handle.rateLimitPolicyIds).handle;

  assert.deepEqual(limiter.rateLimitPolicyIds, ["auth_entry.aggregate", "auth_entry.register"]);
  assert.equal(Object.isFrozen(limiter.rateLimitPolicyIds), true);
});
