const { Router } = require("express");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");
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
    policyIds: ["auth_entry.aggregate", "auth_entry.login"],
  });
  const registerLimiter = createHttpRateLimitMiddleware({
    policyIds: ["auth_entry.aggregate", "auth_entry.register"],
  });
  const googleLimiter = createHttpRateLimitMiddleware({
    policyIds: ["auth_entry.aggregate", "auth_entry.google"],
  });
  const forgotPasswordLimiter = createHttpRateLimitMiddleware({
    policyIds: ["auth_recovery_request"],
  });
  const resetPasswordLimiter = createHttpRateLimitMiddleware({
    policyIds: ["auth_recovery_complete"],
  });
  const refreshStageALimiter = createHttpRateLimitMiddleware({
    policyIds: ["auth_refresh.stage_a"],
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
