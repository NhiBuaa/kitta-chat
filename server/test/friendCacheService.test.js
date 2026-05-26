const assert = require("node:assert/strict");
const test = require("node:test");

const friendCacheServicePath = require.resolve("../src/services/friendCacheService");
const redisConfigPath = require.resolve("../src/config/redis");
const userModelPath = require.resolve("../src/models/User");
const messageModelPath = require.resolve("../src/models/Message");
const conversationCacheServicePath = require.resolve("../src/services/conversationCacheService");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearFriendCacheServiceCache = () => {
  for (const path of [
    friendCacheServicePath,
    redisConfigPath,
    userModelPath,
    messageModelPath,
    conversationCacheServicePath,
  ]) {
    delete require.cache[path];
  }
};

const loadFriendCacheService = ({ messageCount = 0, redisFails = false } = {}) => {
  clearFriendCacheServiceCache();

  const calls = [];

  mockModule(redisConfigPath, {
    cacheClient: {
      isOpen: true,
      async sRem(key, value) {
        calls.push(["sRem", key, value]);
        if (redisFails) throw new Error("redis down");
      },
    },
  });
  mockModule(userModelPath, {
    async findByIdAndUpdate(userId, update) {
      calls.push(["findByIdAndUpdate", userId, update]);
    },
  });
  mockModule(messageModelPath, {
    async countDocuments(query) {
      calls.push(["countDocuments", query]);
      return messageCount;
    },
  });
  mockModule(conversationCacheServicePath, {
    async updateConversationWriteThrough(conversationId, participantIds, timestamp) {
      calls.push(["updateConversationWriteThrough", conversationId, participantIds, timestamp]);
    },
    async updateConversationRemove(conversationId, participantIds) {
      calls.push(["updateConversationRemove", conversationId, participantIds]);
    },
  });

  const service = require(friendCacheServicePath);
  return { service, calls };
};

test("removeFriendWriteThrough removes friendship cache and conversation entry when no messages exist", async () => {
  const { service, calls } = loadFriendCacheService({ messageCount: 0 });

  await service.removeFriendWriteThrough("user-a", "user-b");

  assert.deepEqual(calls, [
    ["findByIdAndUpdate", "user-a", { $pull: { friends: "user-b", friendRequests: "user-b" } }],
    ["findByIdAndUpdate", "user-b", { $pull: { friends: "user-a", friendRequests: "user-a" } }],
    ["sRem", "cache:friends:user-a", "user-b"],
    ["sRem", "cache:friends:user-b", "user-a"],
    ["countDocuments", { conversationId: "user-a_user-b" }],
    ["updateConversationRemove", "user-a_user-b", ["user-a", "user-b"]],
  ]);
});

test("removeFriendWriteThrough keeps conversation entry when messages exist", async () => {
  const { service, calls } = loadFriendCacheService({ messageCount: 2 });

  const result = await service.removeFriendWriteThrough("user-a", "user-b");

  assert.equal(result.conversationId, "user-a_user-b");
  assert.equal(result.hadMessages, true);
  assert.equal(calls.some((call) => call[0] === "updateConversationRemove"), false);
});

test("removeFriendWriteThrough preserves Mongo update when Redis cache removal fails", async () => {
  const { service, calls } = loadFriendCacheService({ redisFails: true });

  await assert.doesNotReject(() => service.removeFriendWriteThrough("user-a", "user-b"));

  assert.deepEqual(calls.slice(0, 2), [
    ["findByIdAndUpdate", "user-a", { $pull: { friends: "user-b", friendRequests: "user-b" } }],
    ["findByIdAndUpdate", "user-b", { $pull: { friends: "user-a", friendRequests: "user-a" } }],
  ]);
  assert.ok(calls.some((call) => call[0] === "countDocuments"));
});
