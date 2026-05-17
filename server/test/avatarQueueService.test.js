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
