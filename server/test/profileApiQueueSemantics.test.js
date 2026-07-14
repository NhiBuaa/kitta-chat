const assert = require("node:assert/strict");
const test = require("node:test");

const userControllerPath = require.resolve("../src/controllers/userController");
const userModelPath = require.resolve("../src/models/User");
const messageModelPath = require.resolve("../src/models/Message");
const profileAvatarQueueServicePath = require.resolve("../src/services/profileAvatarQueueService");
const cacheServicePath = require.resolve("../src/services/cacheService");
const friendCacheServicePath = require.resolve("../src/services/friendCacheService");
const presenceServicePath = require.resolve("../src/services/presenceService");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearControllerCache = () => {
  for (const path of [
    userControllerPath,
    userModelPath,
    messageModelPath,
    profileAvatarQueueServicePath,
    cacheServicePath,
    friendCacheServicePath,
    presenceServicePath,
    presenceHandlerPath,
  ]) {
    delete require.cache[path];
  }
};

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const loadUserController = ({ avatarQueueResult }) => {
  clearControllerCache();

  mockModule(userModelPath, {
    findByIdAndUpdate() {
      return {
        async select() {
          return {
            _id: "user-1",
            displayName: "Alice",
            status: "Available",
          };
        },
      };
    },
  });
  mockModule(messageModelPath, {});
  mockModule(profileAvatarQueueServicePath, {
    async queueProfileAvatarProcessing() {
      return avatarQueueResult;
    },
  });
  mockModule(cacheServicePath, {
    invalidateUserProfile: async () => {},
    getCachedUserProfile: async () => null,
  });
  mockModule(friendCacheServicePath, {
    addFriendWriteThrough: async () => {},
    removeFriendWriteThrough: async () => {},
    getFriendIdsFromCache: async () => [],
  });
  mockModule(presenceServicePath, {
    getMultiPresence: async () => ({}),
    setPresenceWriteThrough: async () => {},
  });
  mockModule(presenceHandlerPath, {
    broadcastUserStatus: async () => {},
  });

  return require(userControllerPath);
};

test("updateUserProfile reports safe avatar queue failure while profile update succeeds", async () => {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const logs = [];

  console.warn = (...args) => logs.push(args);
  console.log = () => {};

  try {
    const { updateUserProfile } = loadUserController({
      avatarQueueResult: {
        queued: false,
        requestId: null,
        error: "connect ECONNREFUSED 127.0.0.1:5672",
        queueError: "Background processing is temporarily unavailable. Please try again later.",
      },
    });
    const req = {
      user: { id: "user-1" },
      body: { displayName: "Alice", status: "Available" },
      file: {
        buffer: Buffer.from("avatar"),
        originalname: "me.png",
        mimetype: "image/png",
        size: 6,
      },
      app: { get: () => null },
    };
    const res = createResponse();

    await updateUserProfile(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.queued, false);
    assert.equal(res.body.avatarRequestId, null);
    assert.match(res.body.avatarQueueError, /temporarily unavailable/i);
    assert.doesNotMatch(res.body.avatarQueueError, /ECONNREFUSED|5672|RabbitMQ/i);
    assert.equal(logs.length, 1);
    assert.match(String(logs[0][0]), /queue unavailable/);
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    clearControllerCache();
  }
});
