const express = require('express');
const router = express.Router();
const { accceptFriendRequest, getUserProfile, updateUserProfile, getAllUsers, searchUsers, getFriends, getFriendRequests, getSidebarUsers } = require('../controllers/userController');
const authMiddleware = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.get('/profile', authMiddleware, getUserProfile);
router.put('/profile', authMiddleware, upload.single('avatar'), updateUserProfile);
router.get('/friends', authMiddleware, getFriends);
router.get('/friend-requests', authMiddleware, getFriendRequests);
router.post('/friend-requests/accept', authMiddleware, accceptFriendRequest);
router.get('/sidebar-list', authMiddleware, getSidebarUsers);
router.get('/search', authMiddleware, searchUsers);
router.get('/', authMiddleware, getAllUsers);

module.exports = router;