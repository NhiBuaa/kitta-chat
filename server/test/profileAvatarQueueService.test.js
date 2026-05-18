const assert = require("node:assert/strict");
const test = require("node:test");

const { queueProfileAvatarProcessing } = require("../src/services/profileAvatarQueueService");

test("queueProfileAvatarProcessing reports queued false when RabbitMQ is unavailable", async () => {
  const stagedUploads = [];
  const deletedObjects = [];

  const result = await queueProfileAvatarProcessing({
      userId: "user-1",
      file: {
        buffer: Buffer.from("avatar"),
        originalname: "me.png",
        mimetype: "image/png",
        size: 6,
      },
      storage: {
        async uploadObject(buffer, fileName, mimeType, folder) {
          stagedUploads.push({ buffer, fileName, mimeType, folder });
          return {
            key: "queue-sources/me.png",
            url: "https://bucket/queue-sources/me.png",
          };
        },
        async deleteObject(key) {
          deletedObjects.push(key);
        },
      },
      imageQueue: {
        async publishImageJob() {
          const error = new AggregateError([
            new Error("connect ECONNREFUSED ::1:5672"),
            new Error("connect ECONNREFUSED 127.0.0.1:5672"),
          ]);
          error.code = "ECONNREFUSED";
          throw error;
        },
      },
    });

  assert.equal(stagedUploads[0].folder, "queue-sources");
  assert.deepEqual(deletedObjects, ["queue-sources/me.png"]);
  assert.equal(result.queued, false);
  assert.equal(result.requestId, null);
  assert.match(result.error, /ECONNREFUSED/);
  assert.match(result.queueError, /temporarily unavailable/i);
  assert.doesNotMatch(result.queueError, /ECONNREFUSED|5672|RabbitMQ/i);
});
