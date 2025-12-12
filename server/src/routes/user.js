const express = require('express');
const router = express.Router();
const { getUserProfile, updateUserProfile, getAllUsers } = require('../controllers/userController');
const authMiddleware = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.get('/profile', authMiddleware, getUserProfile);
router.put('/profile', authMiddleware, upload.single('avatar'), updateUserProfile);
router.get('/', authMiddleware, getAllUsers);

module.exports = router;