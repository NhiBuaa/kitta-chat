const assert = require("node:assert/strict");
const test = require("node:test");

const servicePath = require.resolve("../src/socket/handlers/call/services/callSocketBindingStore");

const loadService = () => {
  delete require.cache[servicePath];
  return require("../src/socket/handlers/call/services/callSocketBindingStore");
};

const createRedisClient = ({ fail = false, values = {} } = {}) => {
  const calls = [];
  return {
    calls,
    async setEx(key, ttl, value) {
      calls.push(["setEx", key, ttl, value]);
      if (fail) throw new Error("redis down");
      values[key] = value;
    },
    async get(key) {
      calls.push(["get", key]);
      if (fail) throw new Error("redis down");
      return values[key] ?? null;
    },
    async del(key) {
      calls.push(["del", key]);
      if (fail) throw new Error("redis down");
      delete values[key];
    },
  };
};

test("stores socket call binding with TTL", async () => {
  const {
    CALL_BINDING_TTL_SECONDS,
    getCallSocketKey,
    storeSocketCallBinding,
  } = loadService();
  const redisClient = createRedisClient();

  await storeSocketCallBinding("socket-1", "call-1", redisClient);

  assert.deepEqual(redisClient.calls, [
    ["setEx", getCallSocketKey("socket-1"), CALL_BINDING_TTL_SECONDS, "call-1"],
  ]);
});

test("stores user active call binding with TTL", async () => {
  const {
    CALL_BINDING_TTL_SECONDS,
    getCallUserKey,
    storeUserActiveCall,
  } = loadService();
  const redisClient = createRedisClient();

  await storeUserActiveCall("user-1", "call-1", redisClient);

  assert.deepEqual(redisClient.calls, [
    ["setEx", getCallUserKey("user-1"), CALL_BINDING_TTL_SECONDS, "call-1"],
  ]);
});

test("resolves socket and user bindings", async () => {
  const {
    getCallSocketKey,
    getCallUserKey,
    resolveSocketCallBinding,
    resolveUserActiveCall,
  } = loadService();
  const redisClient = createRedisClient({
    values: {
      [getCallSocketKey("socket-1")]: "call-1",
      [getCallUserKey("user-1")]: "call-2",
    },
  });

  assert.equal(await resolveSocketCallBinding("socket-1", redisClient), "call-1");
  assert.equal(await resolveUserActiveCall("user-1", redisClient), "call-2");
});

test("removes socket and user bindings", async () => {
  const {
    getCallSocketKey,
    getCallUserKey,
    removeSocketCallBinding,
    removeUserActiveCall,
  } = loadService();
  const redisClient = createRedisClient();

  await removeSocketCallBinding("socket-1", redisClient);
  await removeUserActiveCall("user-1", redisClient);

  assert.deepEqual(redisClient.calls, [
    ["del", getCallSocketKey("socket-1")],
    ["del", getCallUserKey("user-1")],
  ]);
});

test("Redis failures are swallowed and resolve returns null", async () => {
  const {
    storeSocketCallBinding,
    storeUserActiveCall,
    resolveSocketCallBinding,
    resolveUserActiveCall,
    removeSocketCallBinding,
    removeUserActiveCall,
  } = loadService();
  const redisClient = createRedisClient({ fail: true });

  await assert.doesNotReject(() => storeSocketCallBinding("socket-1", "call-1", redisClient));
  await assert.doesNotReject(() => storeUserActiveCall("user-1", "call-1", redisClient));
  await assert.doesNotReject(() => removeSocketCallBinding("socket-1", redisClient));
  await assert.doesNotReject(() => removeUserActiveCall("user-1", redisClient));
  assert.equal(await resolveSocketCallBinding("socket-1", redisClient), null);
  assert.equal(await resolveUserActiveCall("user-1", redisClient), null);
});
