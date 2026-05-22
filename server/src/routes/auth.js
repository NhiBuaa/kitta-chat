const { Router } = require("express");
const { createRateLimiter } = require("../middlewares/rateLimit");
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  googleLogin,
} = require("../controllers/authController");

const defaultAuthRateLimits = {
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  register: { windowMs: 60 * 60 * 1000, max: 5 },
  forgotPassword: { windowMs: 60 * 60 * 1000, max: 5 },
};

const createAuthRouter = ({ rateLimits = defaultAuthRateLimits } = {}) => {
  const router = Router();

  const loginLimiter = createRateLimiter({
    ...defaultAuthRateLimits.login,
    ...(rateLimits.login || {}),
    message: "Too many login attempts. Please try again later.",
  });
  const registerLimiter = createRateLimiter({
    ...defaultAuthRateLimits.register,
    ...(rateLimits.register || {}),
    message: "Too many registration attempts. Please try again later.",
  });
  const forgotPasswordLimiter = createRateLimiter({
    ...defaultAuthRateLimits.forgotPassword,
    ...(rateLimits.forgotPassword || {}),
    message: "Too many password reset attempts. Please try again later.",
  });

  router.post("/register", registerLimiter, register);
  router.post("/login", loginLimiter, login);
  router.post("/google", googleLogin);
  router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
  router.post("/reset-password/:id/:token", resetPassword);

  return router;
};

module.exports = createAuthRouter();
module.exports.createAuthRouter = createAuthRouter;
module.exports.defaultAuthRateLimits = defaultAuthRateLimits;
