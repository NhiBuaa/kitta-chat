const assert = require("node:assert/strict");
const test = require("node:test");

const servicePath = require.resolve("../src/socket/handlers/call/services/callTimeoutDueStore");

const loadService = () => {
  delete require.cache[servicePath];
  return require("../src/socket/handlers/call/services/callTimeoutDueStore");
};

const createRedisClient = ({ fail = false } = {}) => {
  const calls = [];
  return {
    calls,
    async zAdd(key, entry) {
      calls.push(["zAdd", key, entry]);
      if (fail) throw new Error("redis down");
    },
    async setEx(key, ttl, value) {
      calls.push(["setEx", key, ttl, value]);
      if (fail) throw new Error("redis down");
    },
    async zRem(key, value) {
      calls.push(["zRem", key, value]);
      if (fail) throw new Error("redis down");
    },
    async del(key) {
      calls.push(["del", key]);
      if (fail) throw new Error("redis down");
    },
  };
};

test("stores timeout due metadata in Redis sorted set and debug key", async () => {
  const {
    CALL_TIMEOUTS_ZSET_KEY,
    CALL_TIMEOUT_DEBUG_TTL_SECONDS,
    getCallTimeoutDebugKey,
    storeCallTimeoutDue,
  } = loadService();
  const redisClient = createRedisClient();

  await storeCallTimeoutDue({
    redisClient,
    callId: "call-1",
    timeoutAt: 1_797_760_000_000,
  });

  assert.deepEqual(redisClient.calls, [
    ["zAdd", CALL_TIMEOUTS_ZSET_KEY, { score: 1_797_760_000_000, value: "call-1" }],
    [
      "setEx",
      getCallTimeoutDebugKey("call-1"),
      CALL_TIMEOUT_DEBUG_TTL_SECONDS,
      JSON.stringify({ callId: "call-1", timeoutAt: 1_797_760_000_000 }),
    ],
  ]);
});

test("removes timeout due metadata from Redis sorted set and debug key", async () => {
  const { CALL_TIMEOUTS_ZSET_KEY, getCallTimeoutDebugKey, removeCallTimeoutDue } = loadService();
  const redisClient = createRedisClient();

  await removeCallTimeoutDue({ redisClient, callId: "call-1" });

  assert.deepEqual(redisClient.calls, [
    ["zRem", CALL_TIMEOUTS_ZSET_KEY, "call-1"],
    ["del", getCallTimeoutDebugKey("call-1")],
  ]);
});

test("Redis timeout due failures are swallowed", async () => {
  const { storeCallTimeoutDue, removeCallTimeoutDue } = loadService();
  const redisClient = createRedisClient({ fail: true });

  await assert.doesNotReject(() => storeCallTimeoutDue({
    redisClient,
    callId: "call-1",
    timeoutAt: 1_797_760_000_000,
  }));
  await assert.doesNotReject(() => removeCallTimeoutDue({ redisClient, callId: "call-1" }));

  assert.equal(redisClient.calls.length, 2);
});
