const s3Service = require('../services/s3.service');
const FileModel = require('../models/File');
const sharp = require('sharp');

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
    },

    uploadSingleFile: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ message: "Không tìm thấy file upload" });

            let fileBuffer = req.file.buffer;
            let fileName = req.file.originalname;
            let mimeType = req.file.mimetype;
            let fileSize = req.file.size;

            if (mimeType.startsWith('image/')) {
                fileBuffer = await sharp(fileBuffer)
                    .resize({ width: 1920, withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toBuffer()

                const originalNameWithoutExt = fileName.split('.')[0];
                fileName = originalNameWithoutExt + ".webp";
                mimeType = 'image/webp';
                fileSize = fileBuffer.length;
            }

            const s3Url = await s3Service.uploadSingleFile(fileBuffer, fileName, mimeType, 'uploads');

            const urlObject = new URL(s3Url);
            const key = urlObject.pathname.substring(1);

            const userId = req.user?.id || req.user?._id;
            if (!userId) throw new Error("Không lấy được id người dùng từ token");

            const newFile = await FileModel.create({
                ownerId: userId,
                originalName: fileName,
                mimeType: mimeType,
                size: fileSize,
                s3Key: key,
                url: s3Url,
                fileHash: ""
            })

            res.status(200).json({
                success: true,
                file: {
                    _id: newFile._id,
                    cdnUrl: s3Url,
                    name: fileName,
                    type: mimeType,
                    size: fileSize
                }
            })

        } catch (err) {
            console.error("Lỗi uploadSingleFile: ", err);
            res.status(500).json({ message: "Lỗi server khi xử lý file tải lên" });
        }
    }
};
