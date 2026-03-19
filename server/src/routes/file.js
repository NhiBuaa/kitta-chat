// src/routes/file.routes.js
const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const authMiddleware = require('../middlewares/auth');

// Tất cả thao tác upload đều cần đăng nhập
router.use(authMiddleware);

router.post('/init', fileController.init);
router.post('/get-presigned-url', fileController.getPresignedUrl);
router.post('/complete', fileController.complete);

module.exports = router;