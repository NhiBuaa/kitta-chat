const router = require("express").Router();
const callHistoryController = require("../controllers/callHistoryController");
const authMiddleware = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");

const callHistoryReadLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.call_history"],
});
const callHistoryMutationLimiter = createHttpRateLimitMiddleware({
  policyIds: ["state_mutation.aggregate", "state_mutation.call_history"],
});

// GET /api/calls/history
router.get("/history", authMiddleware, callHistoryReadLimiter, callHistoryController.getCallHistory);
// GET /api/calls/missed
router.get("/missed", authMiddleware, callHistoryReadLimiter, callHistoryController.getMissedCalls);
// POST /api/calls/:id/read — mark a single call as read
router.post("/:id/read", authMiddleware, callHistoryMutationLimiter, callHistoryController.markCallRead);
// POST /api/calls/read-all — mark all missed calls as read
router.post("/read-all", authMiddleware, callHistoryMutationLimiter, callHistoryController.markAllCallsRead);

module.exports = router;
