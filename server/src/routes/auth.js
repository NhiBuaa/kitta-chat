const { Router } = require("express");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");
const { OPERATION_POLICY_MEMBERSHIP } = require("../rateLimit/operationPolicyMembership");
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  googleLogin,
  session,
  refresh,
  logout,
} = require("../controllers/authController");

const defaultAuthRateLimits = {
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  register: { windowMs: 60 * 60 * 1000, max: 5 },
  forgotPassword: { windowMs: 60 * 60 * 1000, max: 5 },
};

const createAuthRouter = () => {
  const router = Router();

  const loginLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/auth/login"],
  });
  const registerLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/auth/register"],
  });
  const googleLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/auth/google"],
  });
  const forgotPasswordLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/auth/forgot-password"],
  });
  const resetPasswordLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/auth/reset-password/:id"],
  });
  const refreshStageALimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/auth/refresh stage A"],
  });

  router.post("/register", registerLimiter, register);
  router.post("/login", loginLimiter, login);
  router.post("/google", googleLimiter, googleLogin);
  router.get("/session", session);
  router.post("/refresh", refreshStageALimiter, refresh);
  router.post("/logout", logout);
  router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
  router.post("/reset-password/:id", resetPasswordLimiter, resetPassword);

  return router;
};

module.exports = createAuthRouter();
module.exports.createAuthRouter = createAuthRouter;
module.exports.defaultAuthRateLimits = defaultAuthRateLimits;
