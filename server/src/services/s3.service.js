const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require("dotenv").config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME;

const validateFile = (mimeType) => {
  const safeMimeType = mimeType || "application/octet-stream";
  const allowedTypes = [
    "image/",
    "video/",
    "audio/",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
    "application/x-rar-compressed",
    "application/octet-stream",
  ];
  const isAllowed = allowedTypes.some((type) => safeMimeType.startsWith(type));
  if (!isAllowed) {
    throw new Error(`Unsupported file type: ${safeMimeType}`);
  }
};

const buildObjectUrl = (key) =>
  `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const uploadObject = async (fileBuffer, fileName, mimeType, folder = "uploads") => {
  validateFile(mimeType);

  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "-");
  const key = `${folder}/${uniqueSuffix}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType || "application/octet-stream",
  });

  await s3Client.send(command);

  return { key, url: buildObjectUrl(key) };
};

const downloadObject = async (key) => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );

  return streamToBuffer(response.Body);
};

const deleteObject = async (key) => {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
};

module.exports = {
  initiateUpload: async (fileName, mimeType) => {
    validateFile(mimeType);

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `uploads/${uniqueSuffix}-${safeName}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: mimeType || "application/octet-stream",
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

    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
  },

  completeUpload: async (uploadId, key, parts) => {
    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    const response = await s3Client.send(command);
    return response.Location;
  },

  abortUpload: async (uploadId, key) => {
    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
    });
    await s3Client.send(command);
  },

  uploadObject,
  downloadObject,
  deleteObject,

  uploadSingleFile: async (fileBuffer, fileName, mimeType, folder = "uploads") => {
    if (!mimeType?.startsWith("image/")) {
      throw new Error("Only image files are supported.");
    }

    const uploaded = await uploadObject(fileBuffer, fileName, mimeType, folder);
    return uploaded.url;
  },
};
