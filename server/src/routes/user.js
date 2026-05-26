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
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() })

router.get("/online-friends", authMiddleware, getOnlineFriends);
router.get("/profile", authMiddleware, getUserProfile);
router.put("/profile", authMiddleware, upload.single('avatar'), updateUserProfile);
router.get("/friends", authMiddleware, getFriends);
router.get("/friend-requests", authMiddleware, getFriendRequests);
router.post("/accept-friend", authMiddleware, accceptFriendRequest);
router.get("/sidebar-list", authMiddleware, getSidebarUsers);
router.post("/friend-request", authMiddleware, sendFriendRequest);
router.post("/reject-friend", authMiddleware, rejectFriendRequest);
router.post("/remove-friend", authMiddleware, removeFriend);
router.get("/search", authMiddleware, searchUsers);
router.get("/:id", authMiddleware, getUserById);
router.get("/", authMiddleware, getAllUsers);

module.exports = router;
