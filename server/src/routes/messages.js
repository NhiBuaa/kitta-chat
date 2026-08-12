const router = require("express").Router();
const messageController = require("../controllers/messageController");
const authMiddleware = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");

const messageSyncLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.message_sync"],
});
const messageWriteLimiter = createHttpRateLimitMiddleware({
  policyIds: ["state_mutation.aggregate", "state_mutation.message_write"],
});
const messageHistoryLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.message_history"],
});

router.post("/", authMiddleware, messageWriteLimiter, messageController.createMessage);
router.get("/:userId1/:userId2", authMiddleware, messageHistoryLimiter, messageController.getMessages);
// Sync missed messages (auth required)
router.get("/sync", authMiddleware, messageSyncLimiter, messageController.syncMissedMessages);

module.exports = router;
