const crypto = require("crypto");

const IMAGE_JOB_QUEUE = "image.process";

const getBaseName = (fileName = "image") => {
  const normalized = fileName.replace(/\\/g, "/").split("/").pop() || "image";
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
};

const buildFilePayload = (file) => ({
  originalName: file.originalname,
  baseName: getBaseName(file.originalname),
  mimeType: file.mimetype,
  size: file.size,
  bufferBase64: file.buffer.toString("base64"),
});

const buildChatImageJob = ({ file, userId, requestId = crypto.randomUUID() }) => ({
  type: "chat-image",
  requestId,
  userId,
  file: buildFilePayload(file),
  createdAt: new Date().toISOString(),
});

const buildAvatarImageJob = ({
  file,
  userId,
  profileUpdates = {},
  requestId = crypto.randomUUID(),
}) => ({
  type: "avatar-image",
  requestId,
  userId,
  profileUpdates,
  file: buildFilePayload(file),
  createdAt: new Date().toISOString(),
});

module.exports = {
  IMAGE_JOB_QUEUE,
  buildChatImageJob,
  buildAvatarImageJob,
};
