const router = require('express').Router();
const { register, login, forgotPassword, resetPassword } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:id/:token', resetPassword);

module.exports = router;