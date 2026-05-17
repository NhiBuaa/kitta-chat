const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildChatImageJob,
  buildAvatarImageJob,
} = require("../src/queues/imageJobs");
const { createFileController } = require("../src/controllers/fileController");
const { processImageJob } = require("../src/workers/imageWorker");

test("buildChatImageJob only puts S3 source metadata on the queue", () => {
  const job = buildChatImageJob({
    source: {
      key: "queue-sources/req-1.png",
      url: "https://bucket.s3.local/queue-sources/req-1.png",
    },
    file: {
      originalname: "hello world.png",
      mimetype: "image/png",
      size: 9,
    },
    userId: "user-1",
    requestId: "req-1",
  });

  assert.equal(job.type, "chat-image");
  assert.equal(job.userId, "user-1");
  assert.equal(job.requestId, "req-1");
  assert.equal(job.file.originalName, "hello world.png");
  assert.equal(job.file.mimeType, "image/png");
  assert.equal(job.source.key, "queue-sources/req-1.png");
  assert.equal(job.source.url, "https://bucket.s3.local/queue-sources/req-1.png");
  assert.equal(job.file.bufferBase64, undefined);
});

test("buildAvatarImageJob keeps profile fields separate from image work", () => {
  const job = buildAvatarImageJob({
    source: {
      key: "queue-sources/req-2.jpg",
      url: "https://bucket.s3.local/queue-sources/req-2.jpg",
    },
    file: {
      originalname: "avatar.jpg",
      mimetype: "image/jpeg",
      size: 6,
    },
    userId: "user-1",
    profileUpdates: { displayName: "Alice", status: "Hi" },
    requestId: "req-2",
  });

  assert.equal(job.type, "avatar-image");
  assert.deepEqual(job.profileUpdates, { displayName: "Alice", status: "Hi" });
  assert.equal(job.source.key, "queue-sources/req-2.jpg");
  assert.equal(job.file.bufferBase64, undefined);
});

test("processImageJob stores chat images and emits fileProcessed", async () => {
  const emitted = [];
  const createdFiles = [];
  const deps = {
    sharp: () => ({
      resize() {
        return this;
      },
      webp() {
        return this;
      },
      async toBuffer() {
        return Buffer.from("processed image");
      },
    }),
    s3Service: {
      async downloadObject(key) {
        assert.equal(key, "queue-sources/cat.png");
        return Buffer.from("raw");
      },
      async uploadSingleFile(buffer, fileName, mimeType, folder) {
        assert.equal(buffer.toString(), "processed image");
        assert.equal(fileName, "cat.webp");
        assert.equal(mimeType, "image/webp");
        assert.equal(folder, "uploads");
        return "https://bucket.s3.local/uploads/cat.webp";
      },
      async deleteObject(key) {
        assert.equal(key, "queue-sources/cat.png");
      },
    },
    FileModel: {
      async create(doc) {
        createdFiles.push(doc);
        return { _id: "file-1", ...doc };
      },
    },
    UserModel: {},
    invalidateUserProfile: async () => {},
    io: {
      to(room) {
        return {
          emit(eventName, payload) {
            emitted.push({ room, eventName, payload });
          },
        };
      },
    },
  };

  const result = await processImageJob(
    buildChatImageJob({
      source: {
        key: "queue-sources/cat.png",
        url: "https://bucket.s3.local/queue-sources/cat.png",
      },
      file: {
        originalname: "cat.png",
        mimetype: "image/png",
        size: 3,
      },
      userId: "user-1",
      requestId: "req-1",
    }),
    deps,
  );

  assert.equal(result.success, true);
  assert.equal(createdFiles[0].ownerId, "user-1");
  assert.equal(createdFiles[0].originalName, "cat.webp");
  assert.equal(emitted[0].room, "user-1");
  assert.equal(emitted[0].eventName, "fileProcessed");
  assert.equal(emitted[0].payload.requestId, "req-1");
  assert.equal(emitted[0].payload.file._id, "file-1");
});

test("processImageJob updates avatar and emits avatarUpdated", async () => {
  const emitted = [];
  const updates = [];
  const deps = {
    sharp: () => ({
      resize() {
        return this;
      },
      webp() {
        return this;
      },
      async toBuffer() {
        return Buffer.from("avatar webp");
      },
    }),
    s3Service: {
      async downloadObject(key) {
        assert.equal(key, "queue-sources/me.jpg");
        return Buffer.from("raw avatar");
      },
      async uploadSingleFile(buffer, fileName, mimeType, folder) {
        assert.equal(buffer.toString(), "avatar webp");
        assert.equal(fileName, "me.webp");
        assert.equal(mimeType, "image/webp");
        assert.equal(folder, "avatars");
        return "https://bucket.s3.local/avatars/me.webp";
      },
      async deleteObject(key) {
        assert.equal(key, "queue-sources/me.jpg");
      },
    },
    FileModel: {},
    UserModel: {
      async findByIdAndUpdate(userId, updateData) {
        updates.push({ userId, updateData });
        return { _id: userId, ...updateData };
      },
    },
    invalidateUserProfile: async (userId) => {
      updates.push({ invalidated: userId });
    },
    io: {
      to(room) {
        return {
          emit(eventName, payload) {
            emitted.push({ room, eventName, payload });
          },
        };
      },
    },
  };

  const result = await processImageJob(
    buildAvatarImageJob({
      source: {
        key: "queue-sources/me.jpg",
        url: "https://bucket.s3.local/queue-sources/me.jpg",
      },
      file: {
        originalname: "me.jpg",
        mimetype: "image/jpeg",
        size: 10,
      },
      userId: "user-1",
      profileUpdates: { displayName: "Alice" },
      requestId: "req-2",
    }),
    deps,
  );

  assert.equal(result.success, true);
  assert.deepEqual(updates[0], {
    userId: "user-1",
    updateData: {
      displayName: "Alice",
      avatar: "https://bucket.s3.local/avatars/me.webp",
    },
  });
  assert.deepEqual(updates[1], { invalidated: "user-1" });
  assert.equal(emitted[0].room, "user-1");
  assert.equal(emitted[0].eventName, "avatarUpdated");
  assert.equal(emitted[0].payload.requestId, "req-2");
});

test("uploadSingleFile stages the image in S3 before publishing a metadata-only job", async () => {
  const published = [];
  const stagedUploads = [];
  const controller = createFileController({
    storage: {
      async uploadObject(buffer, fileName, mimeType, folder) {
        stagedUploads.push({ buffer, fileName, mimeType, folder });
        return {
          key: "queue-sources/source-cat.png",
          url: "https://bucket.s3.local/queue-sources/source-cat.png",
        };
      },
    },
    imageQueue: {
      async publishImageJob(job) {
        published.push(job);
      },
    },
  });

  const req = {
    user: { id: "user-1" },
    file: {
      buffer: Buffer.from("raw-cat"),
      originalname: "cat.png",
      mimetype: "image/png",
      size: 7,
    },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await controller.uploadSingleFile(req, res);

  assert.equal(res.statusCode, 202);
  assert.equal(stagedUploads[0].folder, "queue-sources");
  assert.equal(stagedUploads[0].buffer.toString(), "raw-cat");
  assert.equal(published.length, 1);
  assert.equal(published[0].source.key, "queue-sources/source-cat.png");
  assert.equal(published[0].file.bufferBase64, undefined);
  assert.equal(res.body.file.status, "processing");
});
