const assert = require("node:assert/strict");
const test = require("node:test");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearModules = (paths) => {
  for (const path of paths) delete require.cache[path];
};

test("group lifecycle failure keeps derived action and group ID out of the log template", async () => {
  const servicePath = require.resolve("../src/services/conversationReadModelService");
  const envPath = require.resolve("../src/config/env");
  const groupPath = require.resolve("../src/models/Group");
  const conversationPath = require.resolve("../src/models/Conversation");
  const participantPath = require.resolve("../src/models/ConversationParticipant");
  const redisPath = require.resolve("../src/config/redis");
  const loggerPath = require.resolve("../src/utils/logger");
  const paths = [servicePath, envPath, groupPath, conversationPath, participantPath, redisPath, loggerPath];
  const logs = [];

  clearModules(paths);
  mockModule(envPath, { getConversationMigrationConfig: () => ({ conversationDualWriteEnabled: true }) });
  mockModule(groupPath, { findById: async () => { throw new Error("group store unavailable"); } });
  mockModule(conversationPath, {});
  mockModule(participantPath, {});
  mockModule(redisPath, { cacheClient: { isOpen: false } });
  mockModule(loggerPath, { logger: { error: (...args) => logs.push(args) } });

  try {
    const { syncGroupLifecycle } = require(servicePath);
    await syncGroupLifecycle("group-%s\n", "create-%s\n");

    assert.deepEqual(logs, [[
      "conversation_read_model_sync_group_lifecycle_failed",
      { action: "create-%s\n", groupId: "group-%s\n", errorName: "Error" },
    ]]);
  } finally {
    clearModules(paths);
  }
});

test("overview presence failure keeps a caller-derived ID out of the log template", async () => {
  const servicePath = require.resolve("../src/services/overviewService");
  const userPath = require.resolve("../src/models/User");
  const groupPath = require.resolve("../src/models/Group");
  const presencePath = require.resolve("../src/services/presenceService");
  const loggerPath = require.resolve("../src/utils/logger");
  const paths = [servicePath, userPath, groupPath, presencePath, loggerPath];
  const logs = [];

  clearModules(paths);
  mockModule(userPath, {
    findById: () => ({ select: () => ({ lean: async () => ({ displayName: "Other" }) }) }),
  });
  mockModule(groupPath, {});
  mockModule(presencePath, { getUserPresence: async () => { throw new Error("redis down"); } });
  mockModule(loggerPath, { logger: { error: (...args) => logs.push(args) } });

  try {
    const { getOverview } = require(servicePath);
    await getOverview("caller", "caller_target-%s\n");

    assert.deepEqual(logs, [[
      "conversation_overview_presence_lookup_failed",
      { userId: "target-%s\n", errorName: "Error" },
    ]]);
  } finally {
    clearModules(paths);
  }
});

test("presence Redis fallback keeps a derived key out of the log template", async () => {
  const servicePath = require.resolve("../src/services/presenceService");
  const redisPath = require.resolve("../src/config/redis");
  const userPath = require.resolve("../src/models/User");
  const loggerPath = require.resolve("../src/utils/logger");
  const paths = [servicePath, redisPath, userPath, loggerPath];
  const logs = [];

  clearModules(paths);
  mockModule(redisPath, {
    cacheClient: { isOpen: true, hGetAll: async () => { throw new Error("redis down"); } },
  });
  mockModule(userPath, {
    findById: () => ({ select: () => ({ lean: async () => ({ activityStatus: {} }) }) }),
  });
  mockModule(loggerPath, { logger: { warn: (...args) => logs.push(args) } });

  try {
    const { getUserPresence } = require(servicePath);
    await getUserPresence("user-%s\n");

    assert.deepEqual(logs, [[
      "presence_redis_hgetall_failed",
      { key: "presence:user-%s\n", errorName: "Error" },
    ]]);
  } finally {
    clearModules(paths);
  }
});
