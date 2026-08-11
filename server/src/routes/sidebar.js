const express = require("express");
const router = express.Router();
const { getSidebarConversations } = require("../controllers/sidebarController");
const authMiddleware = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");

const sidebarLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.sidebar"],
});

router.get("/conversations", authMiddleware, sidebarLimiter, getSidebarConversations);

module.exports = router;
