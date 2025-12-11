const router = require('express').Router();
const { register, login, changePassword, forgotPassword } = require('../controllers/authController');
const verifyToken = require('../middlewares/auth'); // Middleware tự viết để check token

router.post('/register', register);
router.post('/login', login);
router.post('/change-password', verifyToken, changePassword);
router.post('/forgot-password', forgotPassword);

module.exports = router;