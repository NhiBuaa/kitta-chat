const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildChatImageJob,
  buildAvatarImageJob,
} = require("../src/queues/imageJobs");
const { processImageJob } = require("../src/workers/imageWorker");

test("buildChatImageJob serializes the uploaded image for async processing", () => {
  const file = {
    buffer: Buffer.from("raw image"),
    originalname: "hello world.png",
    mimetype: "image/png",
    size: 9,
  };

  const job = buildChatImageJob({ file, userId: "user-1", requestId: "req-1" });

  assert.equal(job.type, "chat-image");
  assert.equal(job.userId, "user-1");
  assert.equal(job.requestId, "req-1");
  assert.equal(job.file.originalName, "hello world.png");
  assert.equal(job.file.mimeType, "image/png");
  assert.equal(job.file.bufferBase64, file.buffer.toString("base64"));
});

test("buildAvatarImageJob keeps profile fields separate from image work", () => {
  const file = {
    buffer: Buffer.from("avatar"),
    originalname: "avatar.jpg",
    mimetype: "image/jpeg",
    size: 6,
  };

  const job = buildAvatarImageJob({
    file,
    userId: "user-1",
    profileUpdates: { displayName: "Alice", status: "Hi" },
    requestId: "req-2",
  });

  assert.equal(job.type, "avatar-image");
  assert.deepEqual(job.profileUpdates, { displayName: "Alice", status: "Hi" });
  assert.equal(job.file.bufferBase64, file.buffer.toString("base64"));
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
      async uploadSingleFile(buffer, fileName, mimeType, folder) {
        assert.equal(buffer.toString(), "processed image");
        assert.equal(fileName, "cat.webp");
        assert.equal(mimeType, "image/webp");
        assert.equal(folder, "uploads");
        return "https://bucket.s3.local/uploads/cat.webp";
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
      file: {
        buffer: Buffer.from("raw"),
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
      async uploadSingleFile(buffer, fileName, mimeType, folder) {
        assert.equal(buffer.toString(), "avatar webp");
        assert.equal(fileName, "me.webp");
        assert.equal(mimeType, "image/webp");
        assert.equal(folder, "avatars");
        return "https://bucket.s3.local/avatars/me.webp";
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
      file: {
        buffer: Buffer.from("raw avatar"),
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
