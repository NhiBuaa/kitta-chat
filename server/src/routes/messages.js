const router = require("express").Router();
const messageController = require("../controllers/messageController");
const authMiddleware = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");

const messageSyncLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.message_sync"],
});

router.post("/", authMiddleware, messageController.createMessage);
router.get("/:userId1/:userId2", authMiddleware, messageController.getMessages);
// Sync missed messages (auth required)
router.get("/sync", authMiddleware, messageSyncLimiter, messageController.syncMissedMessages);

module.exports = router;
