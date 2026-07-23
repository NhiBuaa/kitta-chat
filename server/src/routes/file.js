const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middlewares/auth');

const MAX_LIMIT = 50 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_LIMIT}
})

router.use(authMiddleware);

router.post('/init', fileController.init);
router.post('/get-presigned-url', fileController.getPresignedUrl);
router.post('/:fileId/download-url', fileController.createDownloadUrl);
router.post('/complete', fileController.complete);
router.post('/upload-single', upload.single('file'), fileController.uploadSingleFile);

module.exports = router;
