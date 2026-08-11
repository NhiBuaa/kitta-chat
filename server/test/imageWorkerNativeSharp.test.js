const assert = require("node:assert/strict");
const test = require("node:test");

const sharp = require("sharp");
const {
  buildAvatarImageJob,
  buildChatImageJob,
} = require("../src/queues/imageJobs");
const { processImageJob } = require("../src/workers/imageWorker");

// Static, checked-in image fixtures. They are intentionally small and contain no user data.
const PNG_FIXTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gJ+M8ixMwAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG_FIXTURE = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
  "base64",
);
const WIDE_SVG_FIXTURE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200"><rect width="2400" height="1200" fill="#2471a3"/></svg>',
);

const createNativeDeps = ({ sourceBuffer, uploads }) => ({
  sharp,
  s3Service: {
    async downloadObject() {
      return sourceBuffer;
    },
    async uploadSingleFile(buffer, fileName, mimeType, folder) {
      uploads.push({ buffer, fileName, mimeType, folder });
      return `https://bucket.s3.local/${folder}/${fileName}`;
    },
    async deleteObject() {},
  },
  FileModel: {
    async findOne() {
      return null;
    },
    async create(document) {
      return { _id: "file-native", ...document };
    },
  },
  UserModel: {
    async findOne() {
      return null;
    },
    async findByIdAndUpdate(userId, update) {
      return { _id: userId, ...update, friends: [] };
    },
  },
  invalidateUserProfile: async () => {},
  io: { to: () => ({ emit() {} }) },
});

test("native Sharp decodes representative PNG and JPEG inputs", async () => {
  const [png, jpeg] = await Promise.all([
    sharp(PNG_FIXTURE).metadata(),
    sharp(JPEG_FIXTURE).metadata(),
  ]);

  assert.equal(png.format, "png");
  assert.equal(png.width, 1);
  assert.equal(png.height, 1);
  assert.equal(jpeg.format, "jpeg");
  assert.equal(jpeg.width, 1);
  assert.equal(jpeg.height, 1);
});

test("native Sharp keeps the chat image 1920px cap and produces real WebP output", async () => {
  assert.match(sharp.versions.sharp, /^0\.35\./);
  const uploads = [];
  const result = await processImageJob(
    buildChatImageJob({
      source: { key: "queue-sources/wide.svg" },
      file: { originalname: "wide.svg", mimetype: "image/svg+xml", size: WIDE_SVG_FIXTURE.length },
      userId: "user-native",
      requestId: "request-native-chat",
    }),
    createNativeDeps({ sourceBuffer: WIDE_SVG_FIXTURE, uploads }),
  );

  assert.equal(result.success, true);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].fileName, "wide.webp");
  assert.equal(uploads[0].mimeType, "image/webp");
  assert.equal(uploads[0].folder, "uploads");
  assert.deepEqual(uploads[0].buffer.subarray(0, 4), Buffer.from("RIFF"));
  assert.equal(uploads[0].buffer.subarray(8, 12).toString(), "WEBP");

  const metadata = await sharp(uploads[0].buffer).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 960);
});

test("native Sharp creates a 256px covered WebP avatar", async () => {
  const uploads = [];
  const result = await processImageJob(
    buildAvatarImageJob({
      source: { key: "queue-sources/wide.svg" },
      file: { originalname: "avatar.svg", mimetype: "image/svg+xml", size: WIDE_SVG_FIXTURE.length },
      userId: "user-native",
      requestId: "request-native-avatar",
    }),
    createNativeDeps({ sourceBuffer: WIDE_SVG_FIXTURE, uploads }),
  );

  assert.equal(result.success, true);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].fileName, "avatar.webp");
  assert.equal(uploads[0].mimeType, "image/webp");
  assert.equal(uploads[0].folder, "avatars");

  const metadata = await sharp(uploads[0].buffer).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 256);
  assert.equal(metadata.height, 256);
});

test("native Sharp rejects malformed image input before any output upload", async () => {
  const uploads = [];
  await assert.rejects(
    processImageJob(
      buildChatImageJob({
        source: { key: "queue-sources/not-an-image.png" },
        file: { originalname: "not-an-image.png", mimetype: "image/png", size: 12 },
        userId: "user-native",
        requestId: "request-native-invalid",
      }),
      createNativeDeps({ sourceBuffer: Buffer.from("not an image"), uploads }),
    ),
    /unsupported image format|Input buffer contains unsupported image format/i,
  );
  assert.equal(uploads.length, 0);
});
