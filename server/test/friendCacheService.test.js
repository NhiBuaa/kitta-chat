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

const loadFriendCacheService = ({ messageCount = 0 } = {}) => {
  clearFriendCacheServiceCache();

  const calls = [];

  mockModule(redisConfigPath, {
    cacheClient: {
      isOpen: true,
      async sRem(key, value) {
        calls.push(["sRem", key, value]);
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
    ["findByIdAndUpdate", "user-a", { $pull: { friends: "user-b" } }],
    ["findByIdAndUpdate", "user-b", { $pull: { friends: "user-a" } }],
    ["sRem", "cache:friends:user-a", "user-b"],
    ["sRem", "cache:friends:user-b", "user-a"],
    ["countDocuments", { conversationId: "user-a_user-b" }],
    ["updateConversationRemove", "user-a_user-b", ["user-a", "user-b"]],
  ]);
});
