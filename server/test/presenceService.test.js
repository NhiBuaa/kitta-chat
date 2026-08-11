const assert = require("node:assert/strict");
const test = require("node:test");

const presenceServicePath = require.resolve("../src/services/presenceService");
const redisConfigPath = require.resolve("../src/config/redis");
const userModelPath = require.resolve("../src/models/User");
const loggerPath = require.resolve("../src/utils/logger");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const loadPresenceService = ({ isOpen, hGetAll, activityStatus = null }) => {
  delete require.cache[presenceServicePath];
  delete require.cache[redisConfigPath];
  delete require.cache[userModelPath];
  delete require.cache[loggerPath];

  const calls = {
    hGetAll: [],
    findById: [],
  };

  mockModule(redisConfigPath, {
    cacheClient: {
      isOpen,
      async hGetAll(key) {
        calls.hGetAll.push(key);
        return hGetAll();
      },
    },
  });
  mockModule(userModelPath, {
    findById(userId) {
      calls.findById.push(userId);
      return {
        select() {
          return {
            lean: async () => (activityStatus ? { activityStatus } : null),
          };
        },
      };
    },
  });
  mockModule(loggerPath, {
    logger: {
      warn() {},
    },
  });

  return {
    presenceService: require("../src/services/presenceService"),
    calls,
  };
};

test("getUserPresence returns a Redis presence hit without Mongo fallback", async () => {
  const userId = "222222222222222222222222";
  const { presenceService, calls } = loadPresenceService({
    isOpen: true,
    hGetAll: async () => ({ status: "active", lastSeen: "12345" }),
  });

  const presence = await presenceService.getUserPresence(userId);

  assert.deepEqual(presence, { status: "active", lastSeen: 12345 });
  assert.deepEqual(calls.hGetAll, [`presence:${userId}`]);
  assert.deepEqual(calls.findById, []);
});

test("getUserPresence preserves the Mongo fallback when Redis lookup fails", async () => {
  const userId = "222222222222222222222222";
  const { presenceService, calls } = loadPresenceService({
    isOpen: true,
    hGetAll: async () => {
      throw new Error("Redis unavailable");
    },
    activityStatus: {
      state: "busy",
      lastSeen: "2026-08-09T00:00:00.000Z",
    },
  });

  const presence = await presenceService.getUserPresence(userId);

  assert.equal(presence.status, "busy");
  assert.equal(presence.lastSeen, new Date("2026-08-09T00:00:00.000Z").getTime());
  assert.deepEqual(calls.hGetAll, [`presence:${userId}`]);
  assert.deepEqual(calls.findById, [userId]);
});
