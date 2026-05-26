const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const callLogPath = require.resolve("../src/socket/handlers/call/callLog");
const disconnectPath = require.resolve("../src/socket/handlers/call/disconnect");
const statePath = require.resolve("../src/socket/handlers/call/state");
const finalizerPath = require.resolve("../src/socket/handlers/call/services/callFinalizer");
const bindingStorePath = require.resolve("../src/socket/handlers/call/services/callSocketBindingStore");

const callerId = "111111111111111111111111";
const receiverId = "222222222222222222222222";
const localCallId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const redisSocketCallId = "bbbbbbbbbbbbbbbbbbbbbbbb";
const redisUserCallId = "cccccccccccccccccccccccc";

const clearModules = () => {
  [
    callHistoryPath,
    callLogPath,
    disconnectPath,
    statePath,
    finalizerPath,
    bindingStorePath,
  ].forEach((path) => delete require.cache[path]);
};

const createCall = (overrides = {}) => ({
  _id: { toString: () => overrides.id ?? localCallId },
  callerId: { _id: { toString: () => callerId }, displayName: "Caller" },
  receiverId: { _id: { toString: () => receiverId }, displayName: "Receiver" },
  conversationId: `${callerId}_${receiverId}`,
  type: "video",
  status: "pending",
  startedAt: new Date("2026-05-21T01:00:00.000Z"),
  answeredAt: null,
  endedAt: null,
  duration: null,
  readBy: [],
  ...overrides,
});

const queryResult = (value) => ({
  populate: async () => value,
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const installCallHistoryMock = ({ callsById }) => {
  const calls = {
    findById: [],
    findByIdAndUpdate: [],
    findOneAndUpdate: [],
    getCall(id) {
      return callsById[id] ?? null;
    },
  };

  require.cache[callHistoryPath] = {
    id: callHistoryPath,
    filename: callHistoryPath,
    loaded: true,
    exports: {
      findById(id) {
        calls.findById.push(id);
        return queryResult(callsById[id] ?? null);
      },
      findByIdAndUpdate(id, update) {
        calls.findByIdAndUpdate.push({ id, update });
        const current = callsById[id];
        if (!current) return queryResult(null);
        callsById[id] = { ...current, ...update };
        return queryResult(callsById[id]);
      },
      findOneAndUpdate(filter, update) {
        calls.findOneAndUpdate.push({ filter, update });
        const current = callsById[filter._id];
        const canFinalize = current &&
          current.endedAt === null &&
          filter.status.$in.includes(current.status) &&
          (!Object.prototype.hasOwnProperty.call(filter, "answeredAt") || current.answeredAt === filter.answeredAt);

        if (!canFinalize) return queryResult(null);

        callsById[filter._id] = { ...current, ...update.$set };
        return queryResult(callsById[filter._id]);
      },
    },
  };

  return calls;
};

const installCallLogMock = () => {
  const calls = [];
  require.cache[callLogPath] = {
    id: callLogPath,
    filename: callLogPath,
    loaded: true,
    exports: {
      createCallLogMessage: async (call) => {
        calls.push(call);
        return { _id: `log-${calls.length}`, callData: { callHistoryId: call._id.toString() } };
      },
      emitCallLogMessage: (io, message) => {
        io.emitted.push({ target: "callLog", eventName: "callLogMessage", payload: message });
      },
    },
  };
  return calls;
};

const createRedisClient = ({ values = {}, fail = false } = {}) => {
  const calls = [];
  return {
    calls,
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
    async sMembers() {
      return [];
    },
  };
};

const createIo = (redisClient = createRedisClient()) => {
  const emitted = [];
  return {
    redisClient,
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

test.afterEach(() => {
  try {
    const { activeSocketCalls, activeTimeouts } = require("../src/socket/handlers/call/state");
    activeSocketCalls.clear();
    activeTimeouts.clear();
  } catch {
    // ignore if state was not loaded
  }
  clearModules();
});

test("disconnect resolves local binding before Redis bindings", async () => {
  clearModules();
  const callsById = {
    [localCallId]: createCall({ id: localCallId }),
    [redisSocketCallId]: createCall({ id: redisSocketCallId }),
  };
  const historyCalls = installCallHistoryMock({ callsById });
  installCallLogMock();
  const { activeSocketCalls } = require("../src/socket/handlers/call/state");
  activeSocketCalls.set("socket-1", localCallId);
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");
  const redisClient = createRedisClient({
    values: { "call:socket:socket-1": redisSocketCallId },
  });

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io: createIo(redisClient) });

  assert.equal(historyCalls.findById[0], localCallId);
  assert.equal(callsById[localCallId].status, "rejected");
  assert.equal(callsById[redisSocketCallId].status, "pending");
  assert.equal(redisClient.calls.some((entry) => entry[0] === "get"), false);
});

test("disconnect resolves Redis socket binding when local binding is missing", async () => {
  clearModules();
  const callsById = { [redisSocketCallId]: createCall({ id: redisSocketCallId }) };
  installCallHistoryMock({ callsById });
  installCallLogMock();
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");
  const redisClient = createRedisClient({
    values: { "call:socket:socket-1": redisSocketCallId },
  });

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io: createIo(redisClient) });

  assert.equal(callsById[redisSocketCallId].status, "rejected");
  assert.ok(redisClient.calls.some((entry) => entry[0] === "get" && entry[1] === "call:socket:socket-1"));
});

test("disconnect does not finalize from Redis user binding alone", async () => {
  clearModules();
  const callsById = { [redisUserCallId]: createCall({ id: redisUserCallId }) };
  installCallHistoryMock({ callsById });
  const logCalls = installCallLogMock();
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");
  const redisClient = createRedisClient({
    values: { [`call:user:${callerId}`]: redisUserCallId },
  });

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io: createIo(redisClient) });

  assert.equal(callsById[redisUserCallId].status, "pending");
  assert.equal(logCalls.length, 0);
  assert.deepEqual(redisClient.calls.filter((entry) => entry[0] === "get"), [
    ["get", "call:socket:socket-1"],
  ]);
  assert.ok(redisClient.calls.some((entry) => entry[0] === "del" && entry[1] === `call:user:${callerId}`));
});

test("answered call disconnect finalizes completed once", async () => {
  clearModules();
  const answeredAt = new Date("2026-05-21T01:00:10.000Z");
  const callsById = { [localCallId]: createCall({ answeredAt }) };
  installCallHistoryMock({ callsById });
  const logCalls = installCallLogMock();
  const { activeSocketCalls } = require("../src/socket/handlers/call/state");
  activeSocketCalls.set("socket-1", localCallId);
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io: createIo() });

  assert.equal(callsById[localCallId].status, "completed");
  assert.equal(logCalls.length, 1);
});

test("pending call disconnect finalizes rejected once", async () => {
  clearModules();
  const callsById = { [localCallId]: createCall() };
  installCallHistoryMock({ callsById });
  const logCalls = installCallLogMock();
  const { activeSocketCalls } = require("../src/socket/handlers/call/state");
  activeSocketCalls.set("socket-1", localCallId);
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: receiverId, io: createIo() });

  assert.equal(callsById[localCallId].status, "rejected");
  assert.equal(logCalls.length, 1);
});

test("duplicate disconnect does not recreate call_log", async () => {
  clearModules();
  const callsById = { [localCallId]: createCall() };
  installCallHistoryMock({ callsById });
  const logCalls = installCallLogMock();
  const { activeSocketCalls } = require("../src/socket/handlers/call/state");
  activeSocketCalls.set("socket-1", localCallId);
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");
  const io = createIo(createRedisClient({ values: { [`call:user:${callerId}`]: localCallId } }));

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io });
  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io });

  assert.equal(callsById[localCallId].status, "rejected");
  assert.equal(logCalls.length, 1);
});

test("disconnect after terminal call no-ops", async () => {
  for (const status of ["missed", "rejected", "completed", "busy", "unreachable"]) {
    clearModules();
    const callsById = {
      [localCallId]: createCall({ status, endedAt: new Date("2026-05-21T01:01:00.000Z") }),
    };
    installCallHistoryMock({ callsById });
    const logCalls = installCallLogMock();
    const { activeSocketCalls } = require("../src/socket/handlers/call/state");
    activeSocketCalls.set("socket-1", localCallId);
    const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");

    await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io: createIo() });

    assert.equal(callsById[localCallId].status, status);
    assert.equal(logCalls.length, 0);
  }
});

test("Redis failures fall back safely to local binding", async () => {
  clearModules();
  const callsById = { [localCallId]: createCall() };
  installCallHistoryMock({ callsById });
  installCallLogMock();
  const { activeSocketCalls } = require("../src/socket/handlers/call/state");
  activeSocketCalls.set("socket-1", localCallId);
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");

  await assert.doesNotReject(() => finalizeCallFromDisconnect({
    socketId: "socket-1",
    userId: callerId,
    io: createIo(createRedisClient({ fail: true })),
  }));
  assert.equal(callsById[localCallId].status, "rejected");
});

test("Redis bindings are cleaned best-effort", async () => {
  clearModules();
  const callsById = { [redisSocketCallId]: createCall({ id: redisSocketCallId }) };
  installCallHistoryMock({ callsById });
  installCallLogMock();
  const { finalizeCallFromDisconnect } = require("../src/socket/handlers/call/disconnect");
  const redisClient = createRedisClient({
    values: {
      "call:socket:socket-1": redisSocketCallId,
      [`call:user:${callerId}`]: redisSocketCallId,
      [`call:user:${receiverId}`]: redisSocketCallId,
    },
  });

  await finalizeCallFromDisconnect({ socketId: "socket-1", userId: callerId, io: createIo(redisClient) });

  assert.ok(redisClient.calls.some((entry) => entry[0] === "del" && entry[1] === "call:socket:socket-1"));
  assert.ok(redisClient.calls.some((entry) => entry[0] === "del" && entry[1] === `call:user:${callerId}`));
  assert.ok(redisClient.calls.some((entry) => entry[0] === "del" && entry[1] === `call:user:${receiverId}`));
});
