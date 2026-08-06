const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createInMemoryMetricsAdapter,
  createMetricsModule,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");

const cacheServicePath = require.resolve("../../src/services/cacheService");
const resourceServicePath = require.resolve("../../src/services/resourceService");
const redisConfigPath = require.resolve("../../src/config/redis");
const messageModelPath = require.resolve("../../src/models/Message");
const fileModelPath = require.resolve("../../src/models/File");
const participantModelPath = require.resolve("../../src/models/ConversationParticipant");
const visibilityHelpersPath = require.resolve("../../src/services/conversationVisibilityHelpers");
const groupModelPath = require.resolve("../../src/models/Group");
const presenceServicePath = require.resolve("../../src/services/presenceService");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const redisState = {
  get: async () => null,
  set: async () => {},
  setEx: async () => {},
  del: async () => {},
};

const cacheClient = {
  isOpen: true,
  async get(...args) {
    return redisState.get(...args);
  },
  async set(...args) {
    return redisState.set(...args);
  },
  async setEx(...args) {
    return redisState.setEx(...args);
  },
  async del(...args) {
    return redisState.del(...args);
  },
};

mockModule(redisConfigPath, { cacheClient });
delete require.cache[cacheServicePath];
const { getCachedUserProfile, invalidateUserProfile } = require(cacheServicePath);

const groupRows = [
  {
    _id: { toString: () => "group-a" },
    name: "Shared Group",
    avatar: "group-avatar.png",
    members: ["user-left", "user-right"],
  },
];

mockModule(messageModelPath, {});
mockModule(fileModelPath, {});
mockModule(participantModelPath, {});
mockModule(visibilityHelpersPath, {});
mockModule(presenceServicePath, {});
mockModule(groupModelPath, {
  find() {
    return {
      select() {
        return {
          sort() {
            return {
              limit() {
                return {
                  lean: async () => groupRows,
                };
              },
            };
          },
        };
      },
    };
  },
});
delete require.cache[resourceServicePath];
const { loadCommonGroups } = require(resourceServicePath);

const createMetrics = () => {
  const adapter = createInMemoryMetricsAdapter();
  const warnings = [];
  const metrics = createMetricsModule({
    adapter,
    logger: {
      warn(event, fields) {
        warnings.push({ event, ...fields });
      },
    },
  });
  return { adapter, metrics, warnings };
};

const createUserModel = ({ result, error = null, onFind = () => {} }) => ({
  findById() {
    onFind();
    return {
      select() {
        return {
          async lean() {
            if (error) throw error;
            return result;
          },
        };
      },
    };
  },
});

test("GET hit records one Redis success and no fallback", async () => {
  const profile = { displayName: "Cached User", avatar: "avatar.png" };
  let userQueries = 0;
  redisState.get = async () => JSON.stringify(profile);
  const { adapter, metrics } = createMetrics();

  const result = await getCachedUserProfile(
    "user-a",
    createUserModel({ result: null, onFind: () => { userQueries += 1; } }),
    metrics,
  );

  assert.deepEqual(result, profile);
  assert.equal(userQueries, 0);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "success" }, value: 1 },
  ]);
  assert.equal(adapter.snapshot().kittachat_cache_fallbacks_total, undefined);
});

test("GET miss records Redis success, fallback miss, and one SET_EX warm-up", async () => {
  const profile = { displayName: "Mongo User", avatar: "mongo-avatar.png" };
  let setExCalls = 0;
  redisState.get = async () => null;
  redisState.setEx = async () => { setExCalls += 1; };
  const { adapter, metrics } = createMetrics();

  const result = await getCachedUserProfile(
    "user-b",
    createUserModel({ result: profile }),
    metrics,
  );

  assert.deepEqual(result, profile);
  assert.equal(setExCalls, 1);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "success" }, value: 1 },
    { labels: { operation: "set_ex", outcome: "success" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "miss" }, value: 1 },
  ]);
});

test("GET Redis error records redis_error fallback while MongoDB succeeds", async () => {
  const profile = { displayName: "Recovered User", avatar: "recovered.png" };
  redisState.get = async () => { throw new Error("redis unavailable"); };
  redisState.setEx = async () => {};
  const { adapter, metrics } = createMetrics();

  const result = await getCachedUserProfile(
    "user-c",
    createUserModel({ result: profile }),
    metrics,
  );

  assert.deepEqual(result, profile);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "error" }, value: 1 },
    { labels: { operation: "set_ex", outcome: "success" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "redis_error" }, value: 1 },
  ]);
});

test("GET Redis error keeps redis_error fallback when MongoDB fails", async () => {
  const mongoError = new Error("mongo unavailable");
  redisState.get = async () => { throw new Error("redis unavailable"); };
  const { adapter, metrics } = createMetrics();

  await assert.rejects(
    () => getCachedUserProfile(
      "user-d",
      createUserModel({ result: null, error: mongoError }),
      metrics,
    ),
    mongoError,
  );

  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "error" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "redis_error" }, value: 1 },
  ]);
});

test("SET_EX error is recorded once without changing the MongoDB fallback result", async () => {
  const profile = { displayName: "Warm-up User", avatar: "warm-up.png" };
  redisState.get = async () => null;
  redisState.setEx = async () => { throw new Error("redis write unavailable"); };
  const { adapter, metrics } = createMetrics();

  const result = await getCachedUserProfile(
    "user-e",
    createUserModel({ result: profile }),
    metrics,
  );

  assert.deepEqual(result, profile);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "success" }, value: 1 },
    { labels: { operation: "set_ex", outcome: "error" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "miss" }, value: 1 },
  ]);
});

test("DEL success and error are each recorded once without a fallback", async () => {
  const success = createMetrics();
  redisState.del = async () => {};

  await invalidateUserProfile("user-f", success.metrics);

  assert.deepEqual(success.adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "del", outcome: "success" }, value: 1 },
  ]);
  assert.equal(success.adapter.snapshot().kittachat_cache_fallbacks_total, undefined);

  const failure = createMetrics();
  redisState.del = async () => { throw new Error("redis delete unavailable"); };

  await assert.doesNotReject(() => invalidateUserProfile("user-g", failure.metrics));

  assert.deepEqual(failure.adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "del", outcome: "error" }, value: 1 },
  ]);
  assert.equal(failure.adapter.snapshot().kittachat_cache_fallbacks_total, undefined);
});

test("common-groups SET success records the cache write and preserves the result", async () => {
  redisState.get = async () => null;
  let setCalls = 0;
  redisState.set = async () => { setCalls += 1; };
  const { adapter, metrics } = createMetrics();

  const result = await loadCommonGroups(
    "user-left_user-right",
    6,
    null,
    "user-left",
    metrics,
  );

  assert.deepEqual(result.items, [
    { _id: "group-a", name: "Shared Group", avatar: "group-avatar.png", memberCount: 2 },
  ]);
  assert.equal(setCalls, 1);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "success" }, value: 1 },
    { labels: { operation: "set", outcome: "success" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "miss" }, value: 1 },
  ]);
});

test("common-groups SET error is best-effort and preserves the MongoDB-derived result", async () => {
  redisState.get = async () => null;
  redisState.set = async () => { throw new Error("redis write unavailable"); };
  const { adapter, metrics } = createMetrics();

  const result = await loadCommonGroups(
    "user-left_user-right",
    6,
    null,
    "user-left",
    metrics,
  );

  assert.deepEqual(result.items, [
    { _id: "group-a", name: "Shared Group", avatar: "group-avatar.png", memberCount: 2 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "success" }, value: 1 },
    { labels: { operation: "set", outcome: "error" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "miss" }, value: 1 },
  ]);
});

test("common-groups Redis GET error keeps the MongoDB result and redis_error fallback", async () => {
  redisState.get = async () => { throw new Error("redis unavailable"); };
  redisState.set = async () => {};
  const { adapter, metrics } = createMetrics();

  const result = await loadCommonGroups(
    "user-left_user-right",
    6,
    null,
    "user-left",
    metrics,
  );

  assert.deepEqual(result.items, [
    { _id: "group-a", name: "Shared Group", avatar: "group-avatar.png", memberCount: 2 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "error" }, value: 1 },
    { labels: { operation: "set", outcome: "success" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "redis_error" }, value: 1 },
  ]);
});

test("independent cache-aside calls count exactly one operation and fallback decision each", async () => {
  redisState.get = async () => null;
  redisState.setEx = async () => {};
  const { adapter, metrics } = createMetrics();
  const userModel = createUserModel({
    result: { displayName: "Repeated User" },
  });

  await getCachedUserProfile("user-i", userModel, metrics);
  await getCachedUserProfile("user-i", userModel, metrics);

  assert.deepEqual(adapter.snapshot().kittachat_redis_operations_total, [
    { labels: { operation: "get", outcome: "success" }, value: 1 },
    { labels: { operation: "set_ex", outcome: "success" }, value: 1 },
    { labels: { operation: "get", outcome: "success" }, value: 1 },
    { labels: { operation: "set_ex", outcome: "success" }, value: 1 },
  ]);
  assert.deepEqual(adapter.snapshot().kittachat_cache_fallbacks_total, [
    { labels: { reason: "miss" }, value: 1 },
    { labels: { reason: "miss" }, value: 1 },
  ]);
});

test("cache business results survive MetricsModule observation failures", async () => {
  redisState.get = async () => JSON.stringify({ displayName: "Telemetry-safe User" });
  const warnings = [];
  const metrics = createMetricsModule({
    adapter: {
      registerMetric() {},
      observe() {
        throw new Error("adapter unavailable");
      },
      render: async () => ({ body: "", contentType: "text/plain" }),
    },
    logger: {
      warn(event, fields) {
        warnings.push({ event, ...fields });
      },
    },
  });

  const result = await getCachedUserProfile(
    "user-h",
    createUserModel({ result: null }),
    metrics,
  );

  assert.deepEqual(result, { displayName: "Telemetry-safe User" });
  assert.equal(warnings[0].event, "metrics_observation_failed");
  assert.equal(JSON.stringify(warnings).includes("cache:user:"), false);
});

test("Redis exposition keeps the approved operation and fallback label contract", async () => {
  const adapter = createPromClientMetricsAdapter();
  const metrics = createMetricsModule({ adapter });

  for (const operation of ["get", "set", "set_ex", "del"]) {
    metrics.observeRedisOperation({ operation, outcome: "success" });
    metrics.observeRedisOperation({ operation, outcome: "error" });
  }
  metrics.observeCacheFallback({ reason: "miss" });
  metrics.observeCacheFallback({ reason: "redis_error" });
  metrics.observeRedisOperation({ operation: "keys", outcome: "success" });
  metrics.observeCacheFallback({ reason: "cache_key" });

  const rendered = await metrics.renderPrometheus();

  assert.match(rendered.body, /kittachat_redis_operations_total/);
  assert.match(rendered.body, /kittachat_cache_fallbacks_total/);
  assert.match(rendered.body, /operation="set_ex",outcome="error"/);
  assert.match(rendered.body, /reason="redis_error"/);
  assert.doesNotMatch(rendered.body, /operation="keys"/);
  assert.doesNotMatch(rendered.body, /reason="cache_key"/);
  assert.doesNotMatch(rendered.body, /cache:user:|user-h|adapter unavailable/);
  assert.match(rendered.contentType, /text\/plain/);
});
