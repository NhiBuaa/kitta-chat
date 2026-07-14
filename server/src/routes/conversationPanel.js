const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/auth");
const { createRateLimiter } = require("../middlewares/rateLimit");
const panelController = require("../controllers/conversationPanelController");
const { validateServerEnv } = require("../config/env");

// Lấy config panel rate limit
let rateLimitMax = 30;
try {
  const config = validateServerEnv(process.env);
  rateLimitMax = config.conversationPanelRateLimit || 30;
} catch (err) {
  rateLimitMax = parseInt(process.env.CONVERSATION_PANEL_RATE_LIMIT, 10) || 30;
}

// Rate Limiter cho resources
const resourcesRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 phút
  max: rateLimitMax,
  code: "PANEL_RATE_LIMITED",
  message: "Too many resource requests. Please try again later.",
  keyGenerator: (req) => {
    const userId = req.user?.id || req.user?._id || "anonymous";
    const conversationId = req.params.id || "global";
    return `${userId}:${conversationId}`;
  },
});

// Route Metadata (Giai đoạn 1)
router.get("/:id/panel/metadata", verifyToken, panelController.getMetadata);

// Route Resources (Giai đoạn 2)
router.get("/:id/panel/resources", verifyToken, resourcesRateLimiter, panelController.getResources);

module.exports = router;
