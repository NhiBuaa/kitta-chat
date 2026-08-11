const express = require("express");
const router = express.Router();
const {
  sendFriendRequest,
  accceptFriendRequest,
  getUserProfile,
  getUserById,
  updateUserProfile,
  getAllUsers,
  searchUsers,
  getFriends,
  getFriendRequests,
  getSidebarUsers,
  rejectFriendRequest,
  removeFriend,
  getOnlineFriends
} = require("../controllers/userController");
const authMiddleware = require("../middlewares/auth");
const { createHttpRateLimitMiddleware } = require("../rateLimit/httpAdmissionMiddleware");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() })

const expensiveUserDirectoryLimiter = createHttpRateLimitMiddleware({
  policyIds: ["read_expensive.aggregate", "read_expensive.user_directory"],
});
const friendshipMutationLimiter = createHttpRateLimitMiddleware({
  policyIds: ["state_mutation.aggregate", "state_mutation.friendship"],
});
const profileMutationLimiter = createHttpRateLimitMiddleware({
  policyIds: (req) => {
    const isMultipart = String(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("multipart/form-data");
    if (isMultipart) {
      return [
        "state_mutation.aggregate",
        "state_mutation.profile",
        "file_resource.aggregate",
        "file_resource.upload_control",
      ];
    }
    return ["state_mutation.aggregate", "state_mutation.profile"];
  },
});

router.get("/online-friends", authMiddleware, expensiveUserDirectoryLimiter, getOnlineFriends);
router.get("/profile", authMiddleware, getUserProfile);
router.put("/profile", authMiddleware, profileMutationLimiter, upload.single('avatar'), updateUserProfile);
router.get("/friends", authMiddleware, expensiveUserDirectoryLimiter, getFriends);
router.get("/friend-requests", authMiddleware, expensiveUserDirectoryLimiter, getFriendRequests);
router.post("/accept-friend", authMiddleware, friendshipMutationLimiter, accceptFriendRequest);
router.get("/sidebar-list", authMiddleware, expensiveUserDirectoryLimiter, getSidebarUsers);
router.post("/friend-request", authMiddleware, friendshipMutationLimiter, sendFriendRequest);
router.post("/reject-friend", authMiddleware, friendshipMutationLimiter, rejectFriendRequest);
router.post("/remove-friend", authMiddleware, friendshipMutationLimiter, removeFriend);
router.get("/search", authMiddleware, expensiveUserDirectoryLimiter, searchUsers);
router.get("/:id", authMiddleware, getUserById);
router.get("/", authMiddleware, expensiveUserDirectoryLimiter, getAllUsers);

module.exports = router;
