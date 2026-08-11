const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middlewares/auth');
const { createHttpRateLimitMiddleware } = require('../rateLimit/httpAdmissionMiddleware');

const MAX_LIMIT = 50 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_LIMIT}
})

router.use(authMiddleware);

const uploadControlLimiter = createHttpRateLimitMiddleware({
    policyIds: ["file_resource.aggregate", "file_resource.upload_control"],
});
const partPresignLimiter = createHttpRateLimitMiddleware({
    policyIds: ["file_resource.aggregate", "file_resource.part_presign"],
});
const downloadSigningLimiter = createHttpRateLimitMiddleware({
    policyIds: ["file_resource.aggregate", "file_resource.download_signing"],
});

router.post('/init', uploadControlLimiter, fileController.init);
router.post('/get-presigned-url', partPresignLimiter, fileController.getPresignedUrl);
router.post('/:fileId/download-url', downloadSigningLimiter, fileController.createDownloadUrl);
router.post('/complete', uploadControlLimiter, fileController.complete);
router.post('/upload-single', uploadControlLimiter, upload.single('file'), fileController.uploadSingleFile);

module.exports = router;
