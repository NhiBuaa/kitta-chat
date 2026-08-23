const router = require("express").Router();
const callHistoryController = require("../controllers/callHistoryController");
const authMiddleware = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");
const { OPERATION_POLICY_MEMBERSHIP } = require("../rateLimit/operationPolicyMembership");

const callHistoryReadLimiter = createHttpRateLimitMiddleware({
  policyIds: OPERATION_POLICY_MEMBERSHIP["GET /api/calls/history"],
});
const callHistoryMutationLimiter = createHttpRateLimitMiddleware({
  policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/calls/:id/read"],
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
