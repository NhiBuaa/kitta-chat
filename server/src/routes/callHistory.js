const router = require("express").Router();
const callHistoryController = require("../controllers/callHistoryController");
const authMiddleware = require("../middlewares/auth");

// GET /api/calls/history
router.get("/history", authMiddleware, callHistoryController.getCallHistory);
// GET /api/calls/missed
router.get("/missed", authMiddleware, callHistoryController.getMissedCalls);
// POST /api/calls/:id/read — mark a single call as read
router.post("/:id/read", authMiddleware, callHistoryController.markCallRead);
// POST /api/calls/read-all — mark all missed calls as read
router.post("/read-all", authMiddleware, callHistoryController.markAllCallsRead);

module.exports = router;
