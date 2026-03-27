const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require('dotenv').config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME;

const validateFile = (mimeType) => {
  const allowedTypes = [
    "image/", "video/", "audio/", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain"
  ];
  const isAllowed = allowedTypes.some((type) => mimeType.startsWith(type));
  if (!isAllowed) throw new Error("Định dạng file không được hỗ trợ!");
};

module.exports = {
  initiateUpload: async (fileName, mimeType) => {
    validateFile(mimeType);

    // Tạo key an toàn không bị trùng lặp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `uploads/${uniqueSuffix}-${safeName}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType,
    });

    const response = await s3Client.send(command);
    return { uploadId: response.UploadId, key: response.Key };
  },

  getPartUrl: async (uploadId, key, partNumber) => {
    const command = new UploadPartCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  },

  completeUpload: async (uploadId, key, parts) => {
    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
      },
    });

    const response = await s3Client.send(command);
    return response.Location; // Trả về link S3 mặc định
  },

  abortUpload: async (uploadId, key) => {
    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId
    });
    await s3Client.send(command);
  },

  uploadAvatar: async (fileBuffer, fileName, mimeType) => {
    // Chỉ dành cho ảnh
    if (!mimeType.startsWith("image/")) throw new Error("Chỉ hổ trợ định dạng ảnh.");

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
    const key = `avatars/${uniqueSuffix}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);

    return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }
};