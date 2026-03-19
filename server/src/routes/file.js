const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);

router.post('/init', fileController.init);
router.post('/get-presigned-url', fileController.getPresignedUrl);
router.post('/complete', fileController.complete);

module.exports = router;