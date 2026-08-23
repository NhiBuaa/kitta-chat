const express = require('express');
const router = express.Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');
const authMiddleware = require('../middlewares/auth');
const { createHttpRateLimitMiddleware } = require('../rateLimit/httpAdmissionMiddleware');
const { OPERATION_POLICY_MEMBERSHIP } = require('../rateLimit/operationPolicyMembership');

const MAX_LIMIT = 50 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: MAX_LIMIT}
})

router.use(authMiddleware);

const uploadControlLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/files/init"],
});
const partPresignLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/files/get-presigned-url"],
});
const downloadSigningLimiter = createHttpRateLimitMiddleware({
    policyIds: OPERATION_POLICY_MEMBERSHIP["POST /api/files/:fileId/download-url"],
});

router.post('/init', uploadControlLimiter, fileController.init);
router.post('/get-presigned-url', partPresignLimiter, fileController.getPresignedUrl);
router.post('/:fileId/download-url', downloadSigningLimiter, fileController.createDownloadUrl);
router.post('/complete', uploadControlLimiter, fileController.complete);
router.post('/upload-single', uploadControlLimiter, upload.single('file'), fileController.uploadSingleFile);

module.exports = router;
