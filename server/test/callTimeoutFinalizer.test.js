const assert = require("node:assert/strict");
const test = require("node:test");

const { CALL_TIMEOUTS_ZSET_KEY } = require("../src/socket/handlers/call/services/callTimeoutDueStore");
const {
  CALL_TIMEOUT_FINALIZER_ENABLED_VALUES,
  createCallTimeoutFinalizer,
  getCallFinalizeLockKey,
  isDistributedTimeoutEnabled,
} = require("../src/socket/handlers/call/services/callTimeoutFinalizer");

const createRedisClient = ({ dueCallIds = [], lockResults = {}, failOn } = {}) => {
  const calls = [];
  return {
    calls,
    async zRangeByScore(key, min, max) {
      calls.push(["zRangeByScore", key, min, max]);
      if (failOn === "zRangeByScore") throw new Error("redis down");
      return dueCallIds;
    },
    async set(key, value, options) {
      calls.push(["set", key, value, options]);
      if (failOn === "set") throw new Error("redis down");
      return lockResults[key] ?? "OK";
    },
    async zRem(key, value) {
      calls.push(["zRem", key, value]);
      if (failOn === "zRem") throw new Error("redis down");
    },
    async del(key) {
      calls.push(["del", key]);
      if (failOn === "del") throw new Error("redis down");
    },
  };
};

const createIo = () => {
  const emitted = [];
  return {
    emitted,
    to(target) {
      return {
        emit(eventName, payload) {
          emitted.push({ target, eventName, payload });
        },
      };
    },
  };
};

const makeCall = (overrides = {}) => ({
  _id: { toString: () => "call-1" },
  callerId: "111111111111111111111111",
  receiverId: "222222222222222222222222",
  conversationId: "111111111111111111111111_222222222222222222222222",
  type: "video",
  status: "missed",
  answeredAt: null,
  endedAt: new Date("2026-05-20T08:00:45.000Z"),
  readBy: [],
  ...overrides,
});

test("distributed timeout finalizer flag is disabled by default", () => {
  assert.equal(isDistributedTimeoutEnabled(undefined), false);
  assert.equal(isDistributedTimeoutEnabled("false"), false);
  assert.equal(isDistributedTimeoutEnabled("0"), false);
  for (const value of CALL_TIMEOUT_FINALIZER_ENABLED_VALUES) {
    assert.equal(isDistributedTimeoutEnabled(value), true);
  }
});

test("finalizer does not start when flag is off", () => {
  let intervalStarted = false;
  const finalizer = createCallTimeoutFinalizer({
    enabled: false,
    setIntervalFn: () => {
      intervalStarted = true;
    },
  });

  assert.deepEqual(finalizer.start(), { started: false, reason: "disabled" });
  assert.equal(intervalStarted, false);
});

test("finalizer scans due call ids from call:timeouts when enabled", async () => {
  const redisClient = createRedisClient({ dueCallIds: ["call-1"] });
  const finalizedCalls = [];
  const finalizer = createCallTimeoutFinalizer({
    enabled: true,
    redisClient,
    io: createIo(),
    now: () => 1_797_760_045_000,
    finalizeCallOnce: async (options) => {
      finalizedCalls.push(options);
      return { finalized: false, alreadyFinalized: false, call: null, callLogMessage: null };
    },
  });

  await finalizer.pollOnce();

  assert.deepEqual(redisClient.calls[0], ["zRangeByScore", CALL_TIMEOUTS_ZSET_KEY, 0, 1_797_760_045_000]);
  assert.equal(finalizedCalls[0].callId, "call-1");
});

test("finalizer acquires call finalize lock with short TTL", async () => {
  const redisClient = createRedisClient({ dueCallIds: ["call-1"] });
  const finalizer = createCallTimeoutFinalizer({
    enabled: true,
    redisClient,
    io: createIo(),
    finalizeCallOnce: async () => ({ finalized: false, call: null }),
  });

  await finalizer.pollOnce();

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "set" &&
    entry[1] === getCallFinalizeLockKey("call-1") &&
    entry[3]?.NX === true &&
    entry[3]?.EX > 0
  )));
});

test("two finalizers racing only one performs side effects", async () => {
  const lockKey = getCallFinalizeLockKey("call-1");
  const sharedRedis = createRedisClient({
    dueCallIds: ["call-1"],
    lockResults: { [lockKey]: "OK" },
  });
  let lockTaken = false;
  sharedRedis.set = async (key, value, options) => {
    sharedRedis.calls.push(["set", key, value, options]);
    if (lockTaken) return null;
    lockTaken = true;
    return "OK";
  };
  let finalizeCount = 0;
  const io = createIo();
  const makeFinalizer = () => createCallTimeoutFinalizer({
    enabled: true,
    redisClient: sharedRedis,
    io,
    finalizeCallOnce: async () => {
      finalizeCount += 1;
      return {
        finalized: true,
        call: makeCall(),
        callLogMessage: {
          _id: "log-1",
          sender: "111111111111111111111111",
          receiver: "222222222222222222222222",
          conversationId: "111111111111111111111111_222222222222222222222222",
          type: "call_log",
          callData: { callHistoryId: "call-1", status: "missed" },
        },
      };
    },
  });

  await Promise.all([makeFinalizer().pollOnce(), makeFinalizer().pollOnce()]);

  assert.equal(finalizeCount, 1);
  assert.equal(io.emitted.filter((event) => event.eventName === "callTimeout").length, 2);
});

test("answered call is not marked missed and stale due id is removed", async () => {
  const redisClient = createRedisClient({ dueCallIds: ["call-1"] });
  const io = createIo();
  const finalizer = createCallTimeoutFinalizer({
    enabled: true,
    redisClient,
    io,
    finalizeCallOnce: async () => ({
      finalized: false,
      alreadyFinalized: false,
      call: makeCall({ status: "pending", answeredAt: new Date("2026-05-20T08:00:02.000Z"), endedAt: null }),
      callLogMessage: null,
    }),
  });

  await finalizer.pollOnce();

  assert.equal(io.emitted.length, 0);
  assert.ok(redisClient.calls.some((entry) => entry[0] === "zRem" && entry[2] === "call-1"));
});

test("rejected or completed call is not overwritten and stale due id is removed", async () => {
  const redisClient = createRedisClient({ dueCallIds: ["call-1"] });
  const finalizer = createCallTimeoutFinalizer({
    enabled: true,
    redisClient,
    io: createIo(),
    finalizeCallOnce: async () => ({
      finalized: false,
      alreadyFinalized: true,
      call: makeCall({ status: "rejected" }),
      callLogMessage: null,
    }),
  });

  await finalizer.pollOnce();

  assert.ok(redisClient.calls.some((entry) => entry[0] === "zRem" && entry[2] === "call-1"));
});

test("finalizer emits side effects only when Mongo finalize succeeds", async () => {
  const redisClient = createRedisClient({ dueCallIds: ["call-1"] });
  const io = createIo();
  const finalizer = createCallTimeoutFinalizer({
    enabled: true,
    redisClient,
    io,
    finalizeCallOnce: async (options) => {
      assert.equal(options.status, "missed");
      assert.equal(options.requireUnanswered, true);
      assert.deepEqual(options.activeStatuses, ["pending"]);
      return {
        finalized: true,
        call: makeCall(),
        callLogMessage: {
          _id: "log-1",
          sender: "111111111111111111111111",
          receiver: "222222222222222222222222",
          conversationId: "111111111111111111111111_222222222222222222222222",
          type: "call_log",
          callData: { callHistoryId: "call-1", status: "missed" },
        },
      };
    },
  });

  await finalizer.pollOnce();

  assert.equal(io.emitted.filter((event) => event.eventName === "callHistorySync").length, 2);
  assert.equal(io.emitted.filter((event) => event.eventName === "callLogMessage").length, 2);
  assert.equal(io.emitted.filter((event) => event.eventName === "callTimeout").length, 2);
});

test("Redis failure logs and does not crash backend", async () => {
  const warnings = [];
  const finalizer = createCallTimeoutFinalizer({
    enabled: true,
    redisClient: createRedisClient({ failOn: "zRangeByScore" }),
    io: createIo(),
    logger: { warn: (...args) => warnings.push(args), log() {} },
  });

  await assert.doesNotReject(() => finalizer.pollOnce());
  assert.equal(warnings.length, 1);
});
