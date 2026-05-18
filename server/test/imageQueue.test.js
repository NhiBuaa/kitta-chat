const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildChatImageJob,
  buildAvatarImageJob,
  buildRemoteAvatarImageJob,
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

test("buildRemoteAvatarImageJob queues remote avatars without staging bytes in the API", () => {
  const job = buildRemoteAvatarImageJob({
    avatarUrl: "https://lh3.googleusercontent.com/avatar.jpg",
    userId: "user-1",
    displayName: "Alice",
    requestId: "req-google-avatar",
  });

  assert.equal(job.type, "avatar-image");
  assert.equal(job.userId, "user-1");
  assert.equal(job.requestId, "req-google-avatar");
  assert.equal(job.source.key, null);
  assert.equal(job.source.url, "https://lh3.googleusercontent.com/avatar.jpg");
  assert.equal(job.file.originalName, "google-avatar.jpg");
  assert.equal(job.file.mimeType, "image/jpeg");
  assert.equal(job.file.bufferBase64, undefined);
});

test("processImageJob downloads remote avatar sources inside the worker", async () => {
  const httpDownloads = [];
  const uploads = [];
  const deps = {
    sharp: () => ({
      resize() {
        return this;
      },
      webp() {
        return this;
      },
      async toBuffer() {
        return Buffer.from("remote avatar webp");
      },
    }),
    httpClient: {
      async get(url, options) {
        httpDownloads.push({ url, options });
        return { data: Buffer.from("remote avatar bytes") };
      },
    },
    s3Service: {
      async uploadSingleFile(buffer, fileName, mimeType, folder) {
        uploads.push({ buffer, fileName, mimeType, folder });
        return "https://bucket.s3.local/avatars/google-avatar.webp";
      },
      async deleteObject() {
        throw new Error("remote sources should not be deleted from S3");
      },
    },
    FileModel: {},
    UserModel: {
      async findByIdAndUpdate(userId, updateData) {
        return { _id: userId, ...updateData };
      },
    },
    invalidateUserProfile: async () => {},
    io: { to: () => ({ emit() {} }) },
  };

  const result = await processImageJob(
    buildRemoteAvatarImageJob({
      avatarUrl: "https://lh3.googleusercontent.com/avatar.jpg",
      userId: "user-1",
      displayName: "Alice",
      requestId: "req-google-avatar",
    }),
    deps,
  );

  assert.equal(result.success, true);
  assert.deepEqual(httpDownloads, [
    {
      url: "https://lh3.googleusercontent.com/avatar.jpg",
      options: { responseType: "arraybuffer" },
    },
  ]);
  assert.equal(uploads[0].buffer.toString(), "remote avatar webp");
  assert.equal(uploads[0].fileName, "google-avatar.webp");
  assert.equal(uploads[0].folder, "avatars");
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

test("processImageJob re-emits existing chat image for duplicate requestId", async () => {
  const emitted = [];
  let uploads = 0;
  let creates = 0;
  const existingFile = {
    _id: "file-existing",
    ownerId: "user-1",
    originalName: "cat.webp",
    mimeType: "image/webp",
    size: 15,
    s3Key: "uploads/cat.webp",
    url: "https://bucket.s3.local/uploads/cat.webp",
    requestId: "req-duplicate",
  };
  const deps = {
    sharp: () => {
      throw new Error("duplicate jobs should not be reprocessed");
    },
    s3Service: {
      async downloadObject() {
        throw new Error("duplicate jobs should not download source");
      },
      async uploadSingleFile() {
        uploads += 1;
        throw new Error("duplicate jobs should not upload output");
      },
      async deleteObject() {},
    },
    FileModel: {
      async findOne(query) {
        assert.deepEqual(query, { requestId: "req-duplicate" });
        return existingFile;
      },
      async create() {
        creates += 1;
        throw new Error("duplicate jobs should not create a File");
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
      requestId: "req-duplicate",
    }),
    deps,
  );

  assert.equal(result.success, true);
  assert.equal(result.file._id, "file-existing");
  assert.equal(uploads, 0);
  assert.equal(creates, 0);
  assert.deepEqual(emitted, [
    {
      room: "user-1",
      eventName: "fileProcessed",
      payload: {
        requestId: "req-duplicate",
        file: {
          _id: "file-existing",
          cdnUrl: "https://bucket.s3.local/uploads/cat.webp",
          url: "https://bucket.s3.local/uploads/cat.webp",
          name: "cat.webp",
          originalName: "cat.webp",
          type: "image/webp",
          mimeType: "image/webp",
          size: 15,
        },
      },
    },
  ]);
});

test("processImageJob cleans duplicate chat image upload when requestId insert races", async () => {
  const deletedObjects = [];
  let findCount = 0;
  const existingFile = {
    _id: "file-existing",
    ownerId: "user-1",
    originalName: "cat.webp",
    mimeType: "image/webp",
    size: 15,
    s3Key: "uploads/cat-existing.webp",
    url: "https://bucket.s3.local/uploads/cat-existing.webp",
    requestId: "req-race",
  };
  const duplicateError = new Error("duplicate key");
  duplicateError.code = 11000;
  const deps = {
    sharp: () => ({
      resize() {
        return this;
      },
      webp() {
        return this;
      },
      async toBuffer() {
        return Buffer.from("processed race image");
      },
    }),
    s3Service: {
      async downloadObject() {
        return Buffer.from("raw");
      },
      async uploadSingleFile() {
        return "https://bucket.s3.local/uploads/cat-race.webp";
      },
      async deleteObject(key) {
        deletedObjects.push(key);
      },
    },
    FileModel: {
      async findOne() {
        findCount += 1;
        return findCount === 1 ? null : existingFile;
      },
      async create() {
        throw duplicateError;
      },
    },
    UserModel: {},
    invalidateUserProfile: async () => {},
    io: { to: () => ({ emit() {} }) },
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
      requestId: "req-race",
    }),
    deps,
  );

  assert.equal(result.success, true);
  assert.equal(result.file._id, "file-existing");
  assert.deepEqual(deletedObjects, ["uploads/cat-race.webp", "queue-sources/cat.png"]);
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
        return { _id: userId, friends: ["friend-1", { _id: "friend-2" }], ...updateData };
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
      avatarRequestId: "req-2",
    },
  });
  assert.deepEqual(updates[1], { invalidated: "user-1" });
  assert.equal(emitted[0].room, "user-1");
  assert.equal(emitted[0].eventName, "avatarUpdated");
  assert.equal(emitted[0].payload.requestId, "req-2");
  assert.deepEqual(
    emitted.map((item) => item.room),
    ["user-1", "friend-1", "friend-2"],
  );
  assert.equal(emitted[1].payload.user.avatar, "https://bucket.s3.local/avatars/me.webp");
  assert.equal(emitted[1].payload.user.friends, undefined);
});

test("processImageJob re-emits existing avatar state for duplicate requestId", async () => {
  const emitted = [];
  let updates = 0;
  let uploads = 0;
  const existingUser = {
    _id: "user-1",
    displayName: "Alice",
    avatar: "https://bucket.s3.local/avatars/me.webp",
    friends: ["friend-1"],
    avatarRequestId: "req-avatar-duplicate",
  };
  const deps = {
    sharp: () => {
      throw new Error("duplicate avatar jobs should not be reprocessed");
    },
    s3Service: {
      async downloadObject() {
        throw new Error("duplicate avatar jobs should not download source");
      },
      async uploadSingleFile() {
        uploads += 1;
        throw new Error("duplicate avatar jobs should not upload output");
      },
      async deleteObject() {},
    },
    FileModel: {},
    UserModel: {
      async findOne(query) {
        assert.deepEqual(query, {
          _id: "user-1",
          avatarRequestId: "req-avatar-duplicate",
        });
        return existingUser;
      },
      async findByIdAndUpdate() {
        updates += 1;
        throw new Error("duplicate avatar jobs should not update user");
      },
    },
    invalidateUserProfile: async () => {
      throw new Error("duplicate avatar jobs should not invalidate unchanged profile");
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
      requestId: "req-avatar-duplicate",
    }),
    deps,
  );

  assert.equal(result.success, true);
  assert.equal(result.avatar, "https://bucket.s3.local/avatars/me.webp");
  assert.equal(uploads, 0);
  assert.equal(updates, 0);
  assert.deepEqual(
    emitted.map((item) => item.room),
    ["user-1", "friend-1"],
  );
  assert.equal(emitted[0].eventName, "avatarUpdated");
  assert.equal(emitted[0].payload.requestId, "req-avatar-duplicate");
  assert.equal(emitted[0].payload.avatar, "https://bucket.s3.local/avatars/me.webp");
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

test("uploadSingleFile returns explicit queue failure when image job publish fails", async () => {
  const deletedObjects = [];
  const controller = createFileController({
    storage: {
      async uploadObject() {
        return {
          key: "queue-sources/source-cat.png",
          url: "https://bucket.s3.local/queue-sources/source-cat.png",
        };
      },
      async deleteObject(key) {
        deletedObjects.push(key);
      },
    },
    imageQueue: {
      async publishImageJob() {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5672");
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

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.queued, false);
  assert.equal(res.body.file.status, "queue_failed");
  assert.match(res.body.queueError, /temporarily unavailable/i);
  assert.doesNotMatch(res.body.queueError, /ECONNREFUSED|5672|RabbitMQ/i);
  assert.deepEqual(deletedObjects, ["queue-sources/source-cat.png"]);
});
