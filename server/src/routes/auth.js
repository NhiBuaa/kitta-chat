const router = require('express').Router();
const { register, login, changePassword, forgotPassword, resetPassword } = require('../controllers/authController');
const verifyToken = require('../middlewares/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/change-password', verifyToken, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

module.exports = router;