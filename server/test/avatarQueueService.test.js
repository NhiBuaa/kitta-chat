const assert = require("node:assert/strict");
const test = require("node:test");

const { queueRemoteAvatarProcessing } = require("../src/services/avatarQueueService");

test("queueRemoteAvatarProcessing publishes a remote avatar job without downloading the image", async () => {
  const published = [];

  const result = await queueRemoteAvatarProcessing({
    avatarUrl: "https://lh3.googleusercontent.com/avatar.jpg",
    userId: "user-1",
    displayName: "Alice",
    imageQueue: {
      async publishImageJob(job) {
        published.push(job);
      },
    },
    requestId: "req-google-avatar",
  });

  assert.equal(result.queued, true);
  assert.equal(result.requestId, "req-google-avatar");
  assert.equal(published.length, 1);
  assert.equal(published[0].type, "avatar-image");
  assert.equal(published[0].source.key, null);
  assert.equal(published[0].source.url, "https://lh3.googleusercontent.com/avatar.jpg");
  assert.equal(published[0].userId, "user-1");
});

test("queueRemoteAvatarProcessing reports queued false with safe queueError when publish fails", async () => {
  const result = await queueRemoteAvatarProcessing({
    avatarUrl: "https://lh3.googleusercontent.com/avatar.jpg",
    userId: "user-1",
    displayName: "Alice",
    imageQueue: {
      async publishImageJob() {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5672");
      },
    },
    requestId: "req-google-avatar",
  });

  assert.equal(result.queued, false);
  assert.equal(result.requestId, null);
  assert.match(result.error, /ECONNREFUSED/);
  assert.match(result.queueError, /temporarily unavailable/i);
  assert.doesNotMatch(result.queueError, /ECONNREFUSED|5672|RabbitMQ/i);
});
