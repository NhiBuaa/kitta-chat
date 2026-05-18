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
});

const buildSourcePayload = (source) => {
  if (!source?.key && !source?.url) {
    throw new Error("Image job source.key or source.url is required");
  }

  return {
    key: source.key || null,
    url: source.url || null,
  };
};

const buildChatImageJob = ({
  source,
  file,
  userId,
  requestId = crypto.randomUUID(),
}) => ({
  type: "chat-image",
  requestId,
  userId,
  source: buildSourcePayload(source),
  file: buildFilePayload(file),
  createdAt: new Date().toISOString(),
});

const buildAvatarImageJob = ({
  source,
  file,
  userId,
  profileUpdates = {},
  requestId = crypto.randomUUID(),
}) => ({
  type: "avatar-image",
  requestId,
  userId,
  profileUpdates,
  source: buildSourcePayload(source),
  file: buildFilePayload(file),
  createdAt: new Date().toISOString(),
});

const buildRemoteAvatarImageJob = ({
  avatarUrl,
  userId,
  displayName = "google-avatar",
  profileUpdates = {},
  requestId = crypto.randomUUID(),
}) => {
  if (!avatarUrl) {
    throw new Error("Remote avatar URL is required");
  }

  return buildAvatarImageJob({
    source: { url: avatarUrl },
    file: {
      originalname: "google-avatar.jpg",
      mimetype: "image/jpeg",
      size: 0,
    },
    userId,
    profileUpdates,
    requestId,
  });
};

module.exports = {
  IMAGE_JOB_QUEUE,
  buildChatImageJob,
  buildAvatarImageJob,
  buildRemoteAvatarImageJob,
};
