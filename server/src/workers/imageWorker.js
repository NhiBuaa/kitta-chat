const mongoose = require("mongoose");
const dotenv = require("dotenv");
const sharp = require("sharp");
const axios = require("axios");

const FileModel = require("../models/File");
const UserModel = require("../models/User");
const s3Service = require("../services/s3.service");
const { invalidateUserProfile } = require("../services/cacheService");
const { closeRabbitMQ, connectionManager } = require("../queues/rabbitmq");
const { IMAGE_JOB_QUEUE } = require("../queues/imageJobs");
const { startQueueWorker } = require("./workerRuntime");
const { createSocketEmitter } = require("../socket/emitter");
const { cacheClient, connectCacheRedis } = require("../config/redis");

dotenv.config();

const toWebpName = (baseName = "image") => `${baseName}.webp`;

const emitToUser = (io, userId, eventName, payload) => {
  if (!io || !userId) return;
  io.to(String(userId)).emit(eventName, payload);
};

const getAvatarUpdateRooms = (updatedUser, userId) => {
  const roomIds = new Set([String(userId)]);
  const friends = Array.isArray(updatedUser?.friends) ? updatedUser.friends : [];

  for (const friend of friends) {
    const friendId = friend?._id || friend?.id || friend;
    if (friendId) roomIds.add(String(friendId));
  }

  return Array.from(roomIds);
};

const buildPublicAvatarUser = (user) => ({
  _id: user?._id,
  displayName: user?.displayName,
  username: user?.username,
  avatar: user?.avatar,
  status: user?.status,
  activityStatus: user?.activityStatus,
});

const buildFileProcessedPayload = (job, file) => ({
  requestId: job.requestId,
  file: {
    _id: file._id,
    cdnUrl: file.url,
    url: file.url,
    name: file.originalName,
    originalName: file.originalName,
    type: file.mimeType,
    mimeType: file.mimeType,
    size: file.size,
  },
});

const findFileByRequestId = async (deps, requestId) => {
  if (!requestId || typeof deps.FileModel.findOne !== "function") {
    return null;
  }

  return deps.FileModel.findOne({ requestId });
};

const findAvatarByRequestId = async (deps, userId, requestId) => {
  if (!userId || !requestId || typeof deps.UserModel.findOne !== "function") {
    return null;
  }

  return deps.UserModel.findOne({ _id: userId, avatarRequestId: requestId });
};

const emitAvatarUpdated = (deps, job, updatedUser, avatarUrl) => {
  for (const roomId of getAvatarUpdateRooms(updatedUser, job.userId)) {
    const isOwnerRoom = roomId === String(job.userId);
    emitToUser(deps.io, roomId, "avatarUpdated", {
      requestId: job.requestId,
      user: isOwnerRoom ? updatedUser : buildPublicAvatarUser(updatedUser),
      avatar: avatarUrl,
    });
  }
};

const cleanupSourceObject = async (deps, job) => {
  if (!job.source?.key || typeof deps.s3Service.deleteObject !== "function") {
    return;
  }

  try {
    await deps.s3Service.deleteObject(job.source.key);
  } catch (error) {
    console.warn(`[ImageWorker] failed to delete source object ${job.source.key}:`, error.message);
  }
};

const cleanupObjectKey = async (deps, key) => {
  if (!key || typeof deps.s3Service.deleteObject !== "function") {
    return;
  }

  try {
    await deps.s3Service.deleteObject(key);
  } catch (error) {
    console.warn(`[ImageWorker] failed to delete object ${key}:`, error.message);
  }
};

const downloadSourceBuffer = async (deps, job) => {
  if (job.source?.key) {
    return deps.s3Service.downloadObject(job.source.key);
  }

  if (job.source?.url) {
    const response = await deps.httpClient.get(job.source.url, {
      responseType: "arraybuffer",
    });
    return Buffer.from(response.data);
  }

  throw new Error("Image job source.key or source.url is required");
};

const processChatImage = async (job, deps) => {
  const existingFile = await findFileByRequestId(deps, job.requestId);
  if (existingFile) {
    const payload = buildFileProcessedPayload(job, existingFile);
    emitToUser(deps.io, job.userId, "fileProcessed", payload);
    await cleanupSourceObject(deps, job);
    return { success: true, file: payload.file };
  }

  const sourceBuffer = await downloadSourceBuffer(deps, job);
  const processedBuffer = await deps
    .sharp(sourceBuffer)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const fileName = toWebpName(job.file.baseName);
  const mimeType = "image/webp";
  const s3Url = await deps.s3Service.uploadSingleFile(
    processedBuffer,
    fileName,
    mimeType,
    "uploads",
  );
  const key = new URL(s3Url).pathname.substring(1);

  let newFile;
  try {
    newFile = await deps.FileModel.create({
      ownerId: job.userId,
      originalName: fileName,
      mimeType,
      size: processedBuffer.length,
      s3Key: key,
      url: s3Url,
      fileHash: "",
      requestId: job.requestId,
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    await cleanupObjectKey(deps, key);
    newFile = await findFileByRequestId(deps, job.requestId);
    if (!newFile) {
      throw error;
    }
  }

  const payload = buildFileProcessedPayload(job, newFile);

  emitToUser(deps.io, job.userId, "fileProcessed", payload);
  await cleanupSourceObject(deps, job);
  return { success: true, file: payload.file };
};

const processAvatarImage = async (job, deps) => {
  const existingUser = await findAvatarByRequestId(deps, job.userId, job.requestId);
  if (existingUser) {
    emitAvatarUpdated(deps, job, existingUser, existingUser.avatar);
    await cleanupSourceObject(deps, job);
    return { success: true, user: existingUser, avatar: existingUser.avatar };
  }

  const sourceBuffer = await downloadSourceBuffer(deps, job);
  const processedBuffer = await deps
    .sharp(sourceBuffer)
    .resize(256, 256, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();

  const fileName = toWebpName(job.file.baseName);
  const avatarUrl = await deps.s3Service.uploadSingleFile(
    processedBuffer,
    fileName,
    "image/webp",
    "avatars",
  );

  const updateQuery = deps.UserModel.findByIdAndUpdate(
    job.userId,
    {
      ...job.profileUpdates,
      avatar: avatarUrl,
      avatarRequestId: job.requestId,
    },
    { returnDocument: "after" },
  );
  const updatedUser =
    typeof updateQuery?.select === "function"
      ? await updateQuery.select("-password")
      : await updateQuery;

  await deps.invalidateUserProfile(job.userId);

  emitAvatarUpdated(deps, job, updatedUser, avatarUrl);

  await cleanupSourceObject(deps, job);
  return { success: true, user: updatedUser, avatar: avatarUrl };
};

const processImageJob = async (
  job,
  deps = {
    sharp,
    s3Service,
    FileModel,
    UserModel,
    invalidateUserProfile,
    httpClient: axios,
    io: global.io,
  },
) => {
  if (job.type === "chat-image") {
    return processChatImage(job, deps);
  }

  if (job.type === "avatar-image") {
    return processAvatarImage(job, deps);
  }

  throw new Error(`Unknown image job type: ${job.type}`);
};

const startImageWorker = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await connectCacheRedis();

  const io = await createSocketEmitter();
  global.io = io;

  const worker = await startQueueWorker({
    queueName: IMAGE_JOB_QUEUE,
    connectionManager,
    prefetch: Number(process.env.IMAGE_WORKER_CONCURRENCY || 2),
    processJob: async (job) => {
      await processImageJob(job, { sharp, s3Service, FileModel, UserModel, invalidateUserProfile, httpClient: axios, io });
    },
    logger: console,
  });

  console.log(`[ImageWorker] consuming queue=${IMAGE_JOB_QUEUE}`);
  return worker;
};

if (require.main === module) {
  let workerRuntime = null;
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[ImageWorker] received ${signal}, shutting down...`);

    await workerRuntime?.stop?.().catch(() => {});
    await closeRabbitMQ().catch(() => {});
    await global.io?.closeEmitterClients?.().catch(() => {});
    global.io?.close?.();
    if (cacheClient.isOpen) await cacheClient.quit().catch(() => {});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close().catch(() => {});
    }

    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  startImageWorker().catch(async (error) => {
    console.error("[ImageWorker] fatal:", error);
    await closeRabbitMQ().catch(() => {});
    process.exit(1);
  }).then((worker) => {
    workerRuntime = worker;
  });
}

module.exports = {
  buildPublicAvatarUser,
  getAvatarUpdateRooms,
  processImageJob,
  startImageWorker,
};
