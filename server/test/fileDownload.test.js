const assert = require("node:assert/strict");
const test = require("node:test");

const { buildDownloadObjectInput } = require("../src/services/s3.service");
const { createFileController } = require("../src/controllers/fileController");

const createResponseRecorder = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test("download object input preserves the original Unicode filename", () => {
  const input = buildDownloadObjectInput({
    key: "uploads/1721234567890-random-report.pdf",
    originalName: "Báo cáo quý 2.pdf",
    mimeType: "application/pdf",
  });

  assert.equal(input.Key, "uploads/1721234567890-random-report.pdf");
  assert.equal(input.ResponseContentType, "application/pdf");
  assert.match(input.ResponseContentDisposition, /^attachment; filename="Bao cao quy 2.pdf";/);
  assert.equal(
    input.ResponseContentDisposition,
    `attachment; filename="Bao cao quy 2.pdf"; filename*=UTF-8''B%C3%A1o%20c%C3%A1o%20qu%C3%BD%202.pdf`,
  );
});

test("authorized attachment download returns a signed URL using the stored original name", async () => {
  const signedRequests = [];
  const file = {
    _id: "file-1",
    s3Key: "uploads/random-document.pdf",
    originalName: "Báo cáo quý 2.pdf",
    mimeType: "application/pdf",
  };
  const message = {
    _id: "message-1",
    conversationId: "user-1_user-2",
  };
  const controller = createFileController({
    fileModel: {
      findById() {
        return { lean: async () => file };
      },
    },
    messageModel: {
      findOne() {
        return {
          select() {
            return { lean: async () => message };
          },
        };
      },
    },
    permissionService: {
      getPermissions: async () => ({ canRead: true }),
    },
    participantModel: {
      findOne() {
        return { lean: async () => null };
      },
    },
    storage: {
      async getDownloadUrl(key, originalName, mimeType) {
        signedRequests.push({ key, originalName, mimeType });
        return "https://signed.example/download";
      },
    },
  });
  const response = createResponseRecorder();

  await controller.createDownloadUrl(
    {
      user: { id: "user-1" },
      params: { fileId: "file-1" },
      body: { messageId: "message-1" },
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    url: "https://signed.example/download",
    originalName: "Báo cáo quý 2.pdf",
  });
  assert.deepEqual(signedRequests, [
    {
      key: "uploads/random-document.pdf",
      originalName: "Báo cáo quý 2.pdf",
      mimeType: "application/pdf",
    },
  ]);
});

test("file routes expose the authenticated signed-download endpoint", () => {
  const fileRouter = require("../src/routes/file");
  const downloadRoute = fileRouter.stack.find(
    (layer) => layer.route?.path === "/:fileId/download-url",
  );

  assert.ok(downloadRoute);
  assert.equal(downloadRoute.route.methods.post, true);
});

test("download rejects an attachment outside the participant message visibility window", async () => {
  let signed = false;
  const controller = createFileController({
    fileModel: {
      findById() {
        return {
          lean: async () => ({
            _id: "file-1",
            s3Key: "uploads/random-document.pdf",
            originalName: "secret.pdf",
            mimeType: "application/pdf",
          }),
        };
      },
    },
    messageModel: {
      findOne() {
        return {
          select() {
            return {
              lean: async () => ({
                _id: "message-1",
                conversationId: "group-1",
                createdAt: new Date("2026-07-23T10:05:00.000Z"),
              }),
            };
          },
        };
      },
      async exists() {
        return null;
      },
    },
    participantModel: {
      findOne() {
        return {
          lean: async () => ({
            role: "member",
            joinedAt: new Date("2026-07-23T09:00:00.000Z"),
            leftAt: new Date("2026-07-23T10:00:00.000Z"),
            state: {},
          }),
        };
      },
    },
    permissionService: {
      getPermissions: async () => ({ canRead: true }),
    },
    storage: {
      async getDownloadUrl() {
        signed = true;
        return "https://signed.example/download";
      },
    },
  });
  const response = createResponseRecorder();

  await controller.createDownloadUrl(
    {
      user: { id: "user-1" },
      params: { fileId: "file-1" },
      body: { messageId: "message-1" },
    },
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(signed, false);
});

test("download content disposition strips header injection characters", () => {
  const input = buildDownloadObjectInput({
    key: "uploads/random-report.pdf",
    originalName: "report.pdf\r\nX-Evil: injected",
    mimeType: "application/pdf",
  });

  assert.equal(input.ResponseContentDisposition.includes("\r"), false);
  assert.equal(input.ResponseContentDisposition.includes("\n"), false);
  assert.match(input.ResponseContentDisposition, /^attachment; filename=/);
  assert.equal(input.ResponseContentDisposition.includes("filename*=UTF-8''"), true);
});

test("download rejects users without conversation read permission", async () => {
  let signed = false;
  const controller = createFileController({
    fileModel: {
      findById() {
        return {
          lean: async () => ({
            s3Key: "uploads/random-document.pdf",
            originalName: "private.pdf",
            mimeType: "application/pdf",
          }),
        };
      },
    },
    messageModel: {
      findOne() {
        return {
          select() {
            return {
              lean: async () => ({ conversationId: "user-1_user-2" }),
            };
          },
        };
      },
    },
    permissionService: {
      getPermissions: async () => ({ canRead: false }),
    },
    storage: {
      async getDownloadUrl() {
        signed = true;
        return "https://signed.example/download";
      },
    },
  });
  const response = createResponseRecorder();

  await controller.createDownloadUrl(
    {
      user: { id: "user-3" },
      params: { fileId: "file-1" },
      body: { messageId: "message-1" },
    },
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(signed, false);
});

test("download rejects a file that is not attached to the requested message", async () => {
  const controller = createFileController({
    fileModel: {
      findById() {
        return {
          lean: async () => ({
            s3Key: "uploads/random-document.pdf",
            originalName: "orphan.pdf",
            mimeType: "application/pdf",
          }),
        };
      },
    },
    messageModel: {
      findOne() {
        return {
          select() {
            return { lean: async () => null };
          },
        };
      },
    },
  });
  const response = createResponseRecorder();

  await controller.createDownloadUrl(
    {
      user: { id: "user-1" },
      params: { fileId: "file-1" },
      body: { messageId: "message-1" },
    },
    response,
  );

  assert.equal(response.statusCode, 404);
});

