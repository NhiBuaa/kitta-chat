const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const resolverPath = require.resolve("../src/socket/handlers/call/services/callSessionResolver");

const loadResolver = ({ redisValues = {}, localValues = {}, mongoCallId = null } = {}) => {
  delete require.cache[callHistoryPath];
  delete require.cache[resolverPath];

  const mongoCalls = [];
  require.cache[callHistoryPath] = {
    id: callHistoryPath,
    filename: callHistoryPath,
    loaded: true,
    exports: {
      findOne(query) {
        mongoCalls.push(query);
        return {
          lean: async () => (mongoCallId ? { _id: { toString: () => mongoCallId } } : null),
        };
      },
    },
  };

  const redisCalls = [];
  const redisClient = {
    async get(key) {
      redisCalls.push(["get", key]);
      return redisValues[key] ?? null;
    },
    async setEx(key, ttl, value) {
      redisCalls.push(["setEx", key, ttl, value]);
      redisValues[key] = value;
    },
  };

  const localTempIdToDbId = {
    get(key) {
      return localValues[key] ?? null;
    },
    has(key) {
      return Object.prototype.hasOwnProperty.call(localValues, key);
    },
    set(key, value) {
      localValues[key] = value;
    },
  };

  return {
    resolver: require("../src/socket/handlers/call/services/callSessionResolver"),
    redisClient,
    localTempIdToDbId,
    redisCalls,
    mongoCalls,
  };
};

test("real callHistoryId resolves unchanged", async () => {
  const { resolver, redisClient, localTempIdToDbId, redisCalls, mongoCalls } = loadResolver();
  const realCallId = "aaaaaaaaaaaaaaaaaaaaaaaa";

  const resolved = await resolver.resolveCallHistoryId({
    callId: realCallId,
    userId: "111111111111111111111111",
    userToCall: "222222222222222222222222",
    redisClient,
    localTempIdToDbId,
  });

  assert.equal(resolved, realCallId);
  assert.deepEqual(redisCalls, []);
  assert.deepEqual(mongoCalls, []);
});

test("temp call id resolves through Redis temp mapping", async () => {
  const realCallId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const { resolver, redisClient, localTempIdToDbId, redisCalls, mongoCalls } = loadResolver({
    redisValues: { "call:temp:temp_123": realCallId },
  });

  const resolved = await resolver.resolveCallHistoryId({
    callId: "temp_123",
    userId: "111111111111111111111111",
    userToCall: "222222222222222222222222",
    redisClient,
    localTempIdToDbId,
  });

  assert.equal(resolved, realCallId);
  assert.deepEqual(redisCalls, [["get", "call:temp:temp_123"]]);
  assert.deepEqual(mongoCalls, []);
});

test("Redis miss falls back to local temp mapping", async () => {
  const realCallId = "cccccccccccccccccccccccc";
  const { resolver, redisClient, localTempIdToDbId, mongoCalls } = loadResolver({
    localValues: { temp_456: realCallId },
  });

  const resolved = await resolver.resolveCallHistoryId({
    callId: "temp_456",
    userId: "111111111111111111111111",
    userToCall: "222222222222222222222222",
    redisClient,
    localTempIdToDbId,
  });

  assert.equal(resolved, realCallId);
  assert.deepEqual(mongoCalls, []);
});

test("Redis and local misses fall back to recent pending Mongo call", async () => {
  const realCallId = "dddddddddddddddddddddddd";
  const { resolver, redisClient, localTempIdToDbId, mongoCalls } = loadResolver({
    mongoCallId: realCallId,
  });

  const resolved = await resolver.resolveCallHistoryId({
    callId: "temp_789",
    userId: "111111111111111111111111",
    userToCall: "222222222222222222222222",
    redisClient,
    localTempIdToDbId,
  });

  assert.equal(resolved, realCallId);
  assert.equal(mongoCalls.length, 1);
  assert.equal(mongoCalls[0].status, "pending");
});

test("invalid or unresolvable call id returns null safely", async () => {
  const { resolver, redisClient, localTempIdToDbId } = loadResolver();

  assert.equal(
    await resolver.resolveCallHistoryId({
      callId: "not-valid",
      userId: "111111111111111111111111",
      userToCall: "222222222222222222222222",
      redisClient,
      localTempIdToDbId,
    }),
    null,
  );
});

test("stores temp call mapping in Redis with a short TTL", async () => {
  const { resolver, redisClient, redisCalls } = loadResolver();

  await resolver.storeTempCallMapping({
    redisClient,
    tempCallId: "temp_store",
    callHistoryId: "eeeeeeeeeeeeeeeeeeeeeeee",
  });

  assert.deepEqual(redisCalls, [["setEx", "call:temp:temp_store", 120, "eeeeeeeeeeeeeeeeeeeeeeee"]]);
});

