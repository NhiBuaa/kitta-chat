const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const test = require("node:test");

process.env.AWS_REGION = "us-east-1";
process.env.AWS_ACCESS_KEY_ID = "D8_TEST_ACCESS_KEY";
process.env.AWS_SECRET_ACCESS_KEY = "D8_TEST_SECRET_KEY";
process.env.AWS_S3_BUCKET_NAME = "d8-test-bucket";

const { S3Client } = require("@aws-sdk/client-s3");
const originalSend = S3Client.prototype.send;
const sentCommands = [];
let failureMode = null;

S3Client.prototype.send = async function send(command) {
  sentCommands.push(command);

  if (failureMode) {
    throw new Error(failureMode);
  }

  switch (command.constructor.name) {
    case "CreateMultipartUploadCommand":
      return { UploadId: "upload-1", Key: command.input.Key };
    case "CompleteMultipartUploadCommand":
      return { Location: "https://d8-test-bucket.s3.us-east-1.amazonaws.com/uploads/file" };
    case "GetObjectCommand":
      return { Body: Readable.from([Buffer.from("downloaded-bytes")]) };
    case "PutObjectCommand":
      return { ETag: '"etag-1"' };
    case "AbortMultipartUploadCommand":
    case "DeleteObjectCommand":
      return {};
    default:
      throw new Error(`Unexpected command: ${command.constructor.name}`);
  }
};

const s3Service = require("../src/services/s3.service");

test.after(() => {
  S3Client.prototype.send = originalSend;
});

test.beforeEach(() => {
  sentCommands.length = 0;
  failureMode = null;
});

test("S3 service initializes the client and uploads an object through the SDK boundary", async () => {
  const result = await s3Service.uploadObject(
    Buffer.from("upload-bytes"),
    "photo.png",
    "image/png",
  );

  assert.match(result.key, /^uploads\//);
  assert.match(result.url, /^https:\/\/d8-test-bucket\.s3\.us-east-1\.amazonaws\.com\//);
  assert.equal(sentCommands[0].constructor.name, "PutObjectCommand");
  assert.equal(sentCommands[0].input.Bucket, "d8-test-bucket");
  assert.equal(sentCommands[0].input.ContentType, "image/png");
});

test("S3 service completes and aborts multipart uploads and signs each part", async () => {
  const started = await s3Service.initiateUpload("multipart.bin", "application/octet-stream");
  const partUrl = await s3Service.getPartUrl(started.uploadId, started.key, 1);
  const completed = await s3Service.completeUpload(started.uploadId, started.key, [
    { ETag: "etag-1", PartNumber: 1 },
  ]);

  await s3Service.abortUpload(started.uploadId, started.key);

  assert.equal(started.uploadId, "upload-1");
  assert.match(partUrl, /X-Amz-Signature=/);
  assert.equal(completed, "https://d8-test-bucket.s3.us-east-1.amazonaws.com/uploads/file");
  assert.deepEqual(
    sentCommands.map((command) => command.constructor.name),
    ["CreateMultipartUploadCommand", "CompleteMultipartUploadCommand", "AbortMultipartUploadCommand"],
  );
});

test("S3 service signs downloads and preserves streamed object bytes", async () => {
  const signedUrl = await s3Service.getDownloadUrl(
    "uploads/file.txt",
    "file.txt",
    "text/plain",
  );
  const bytes = await s3Service.downloadObject("uploads/file.txt");

  assert.match(signedUrl, /X-Amz-Signature=/);
  assert.equal(bytes.toString(), "downloaded-bytes");
  assert.equal(sentCommands[0].constructor.name, "GetObjectCommand");
  assert.equal(sentCommands[0].input.Key, "uploads/file.txt");
});

test("S3 service propagates SDK failures without rewriting AWS errors", async () => {
  failureMode = "AWS XML response rejected";

  await assert.rejects(
    () => s3Service.downloadObject("uploads/failing.xml"),
    { message: "AWS XML response rejected" },
  );
});
