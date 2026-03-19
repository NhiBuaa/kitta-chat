const s3Service = require('../service/s3.service');
const FileModel = require('../models/File');

module.exports = {
    init: async (req, res) => {
        try {
            const { fileName, fileType, fileHash } = req.body;
            const { uploadId, key } = await s3Service.initiateUpload(fileName, fileType);

            res.status(200).json({ uploadId, key });
        } catch (error) {
            res.status(400).json({ message: error.message });
        }
    },

    // Lấy Signed URL cho chunk
    getPresignedUrl: async (req, res) => {
        try {
            const { uploadId, key, partNumber } = req.body;
            const url = await s3Service.getPartUrl(uploadId, key, partNumber);

            res.status(200).json({ url });
        } catch (error) {
            res.status(500).json({ message: "Lỗi tạo Presigned URL", error: error.message });
        }
    },

    // Hoàn tất & Lưu DB
    complete: async (req, res) => {
        try {
            const { uploadId, key, parts, fileName, fileType, fileSize, fileHash } = req.body;

            // Gọi S3 để ghép file
            await s3Service.completeUpload(uploadId, key, parts);

            // Tạo link truy cập
            const baseUrl = process.env.CLOUDFRONT_URL || `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`;
            const fileUrl = `${baseUrl}/${key}`;

            const userId = req.user?._id || req.user?.id || req.userId;

            if (!userId) {
                throw new Error("Không lấy được ID người dùng từ Token. Hãy kiểm tra lại middleware auth!");
            }

            // Lưu thông tin vào Database
            const newFile = await FileModel.create({
                ownerId: userId,
                originalName: fileName,
                mimeType: fileType,
                size: fileSize,
                s3Key: key,
                url: fileUrl,
                fileHash: fileHash
            });

            res.status(200).json({ message: "Upload thành công", file: newFile });
        } catch (error) {
            console.error("Lỗi hoàn tất upload:", error);
            if (req.body.uploadId) {
                await s3Service.abortUpload(req.body.uploadId, req.body.key).catch(e => console.error("Lỗi hủy S3:", e));
            }
            res.status(500).json({ message: "Ghép file thất bại", error: error.message });
        }
    }
};