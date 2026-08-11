const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");
const panelController = require("../controllers/conversationPanelController");

const panelReadLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.conversation_panel"],
});
const panelResourceLimiter = createHttpRateLimitMiddleware({
  policyIds: [
    "read_expensive.aggregate",
    "read_expensive.conversation_panel",
    "read_expensive.panel_resources",
  ],
});
const panelMutationLimiter = createHttpRateLimitMiddleware({
  policyIds: ["state_mutation.aggregate", "state_mutation.conversation_panel"],
});

// Route Metadata (Giai đoạn 1)
router.get("/:id/panel/metadata", verifyToken, panelReadLimiter, panelController.getMetadata);

// Route Cập nhật Preference
router.patch("/:id/panel/preference", verifyToken, panelMutationLimiter, panelController.updatePreference);

// Route Resources (Giai đoạn 2)
router.get("/:id/panel/resources", verifyToken, panelResourceLimiter, panelController.getResources);

// Route Rời nhóm (Slice 6)
router.post("/:id/panel/leave", verifyToken, panelMutationLimiter, panelController.leaveGroup);

// Route Xóa lịch sử trò chuyện (Slice 6)
router.post("/:id/panel/delete", verifyToken, panelMutationLimiter, panelController.deleteHistory);

module.exports = router;
