const router = require("express").Router();
const messageController = require("../controllers/messageController");
const authMiddleware = require("../middlewares/auth");

router.post("/", messageController.createMessage);
router.get("/:userId1/:userId2", messageController.getMessages);
// Sync missed messages (auth required)
router.get("/sync", authMiddleware, messageController.syncMissedMessages);

module.exports = router;