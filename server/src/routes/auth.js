const router = require("express").Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { googleLogin } = require("../controllers/authController");
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:id/:token", resetPassword);

module.exports = router;
