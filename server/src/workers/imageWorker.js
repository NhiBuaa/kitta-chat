const mongoose = require("mongoose");
const dotenv = require("dotenv");
const sharp = require("sharp");

const FileModel = require("../models/File");
const UserModel = require("../models/User");
const s3Service = require("../services/s3.service");
const { invalidateUserProfile } = require("../services/cacheService");
const { connectRabbitMQ, closeRabbitMQ } = require("../queues/rabbitmq");
const { IMAGE_JOB_QUEUE } = require("../queues/imageJobs");
const { createSocketEmitter } = require("../socket/emitter");
const { connectCacheRedis } = require("../config/redis");

dotenv.config();

const toWebpName = (baseName = "image") => `${baseName}.webp`;

const emitToUser = (io, userId, eventName, payload) => {
  if (!io || !userId) return;
  io.to(String(userId)).emit(eventName, payload);
};

const processChatImage = async (job, deps) => {
  const processedBuffer = await deps
    .sharp(Buffer.from(job.file.bufferBase64, "base64"))
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

  const newFile = await deps.FileModel.create({
    ownerId: job.userId,
    originalName: fileName,
    mimeType,
    size: processedBuffer.length,
    s3Key: key,
    url: s3Url,
    fileHash: "",
  });

  const payload = {
    requestId: job.requestId,
    file: {
      _id: newFile._id,
      cdnUrl: s3Url,
      url: s3Url,
      name: fileName,
      originalName: fileName,
      type: mimeType,
      mimeType,
      size: processedBuffer.length,
    },
  };

  emitToUser(deps.io, job.userId, "fileProcessed", payload);
  return { success: true, file: payload.file };
};

const processAvatarImage = async (job, deps) => {
  const processedBuffer = await deps
    .sharp(Buffer.from(job.file.bufferBase64, "base64"))
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
    },
    { returnDocument: "after" },
  );
  const updatedUser =
    typeof updateQuery?.select === "function"
      ? await updateQuery.select("-password")
      : await updateQuery;

  await deps.invalidateUserProfile(job.userId);

  emitToUser(deps.io, job.userId, "avatarUpdated", {
    requestId: job.requestId,
    user: updatedUser,
    avatar: avatarUrl,
  });

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

  const channel = await connectRabbitMQ();
  await channel.prefetch(Number(process.env.IMAGE_WORKER_CONCURRENCY || 2));

  await channel.consume(
    IMAGE_JOB_QUEUE,
    async (message) => {
      if (!message) return;

      try {
        const job = JSON.parse(message.content.toString("utf8"));
        await processImageJob(job, { sharp, s3Service, FileModel, UserModel, invalidateUserProfile, io });
        channel.ack(message);
      } catch (error) {
        console.error("[ImageWorker] job failed:", error);
        channel.nack(message, false, false);
      }
    },
    { noAck: false },
  );

  console.log(`[ImageWorker] consuming queue=${IMAGE_JOB_QUEUE}`);
};

if (require.main === module) {
  startImageWorker().catch(async (error) => {
    console.error("[ImageWorker] fatal:", error);
    await closeRabbitMQ().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  processImageJob,
  startImageWorker,
};
