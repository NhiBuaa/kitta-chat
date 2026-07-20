const express = require("express");
const router = express.Router();
const { getSidebarConversations } = require("../controllers/sidebarController");
const authMiddleware = require("../middlewares/auth");

router.get("/conversations", authMiddleware, getSidebarConversations);

module.exports = router;
