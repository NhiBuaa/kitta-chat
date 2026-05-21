const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const userPath = require.resolve("../src/models/User");
const callLogPath = require.resolve("../src/socket/handlers/call/callLog");
const finalizerPath = require.resolve("../src/socket/handlers/call/services/callFinalizer");
const bindingStorePath = require.resolve("../src/socket/handlers/call/services/callSocketBindingStore");
const initCallPath = require.resolve("../src/socket/handlers/call/handlers/initCall");
const callUserPath = require.resolve("../src/socket/handlers/call/handlers/callUser");
const answerCallPath = require.resolve("../src/socket/handlers/call/handlers/answerCall");

const callerId = "111111111111111111111111";
const receiverId = "222222222222222222222222";
const callId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const realDateNow = Date.now;
const realSetTimeout = global.setTimeout;
let capturedTimeouts = [];

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

const createSocketIo = ({ redisClient = createRedisClient(), userId = callerId } = {}) => {
  const listeners = new Map();
  const emitted = [];
  const socket = {
    id: "socket-1",
    userId,
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    emit(eventName, payload) {
      emitted.push({ target: "socket", eventName, payload });
    },
  };
  const io = {
    redisClient,
    emitted,
    in() {
      return { allSockets: async () => new Set(["receiver-socket"]) };
    },
    to(target) {
      return {
        emit(eventName, payload) {
          emitted.push({ target, eventName, payload });
        },
      };
    },
  };
  return { socket, io, listeners, emitted, redisClient };
};

const makeCall = (overrides = {}) => ({
  _id: { toString: () => callId },
  callerId,
  receiverId,
  conversationId: `${callerId}_${receiverId}`,
  type: "video",
  status: "pending",
  answeredAt: null,
  endedAt: null,
  readBy: [],
  ...overrides,
});

const populateResult = (value) => ({ populate: async () => value });

const installCallHistoryMock = ({ initialCall = makeCall() } = {}) => {
  let storedCall = initialCall;
  const calls = {
    create: [],
    findById: [],
    findByIdAndUpdate: [],
    findOneAndUpdate: [],
    getStoredCall: () => storedCall,
    setStoredCall: (nextCall) => {
      storedCall = nextCall;
    },
  };
  require.cache[callHistoryPath] = {
    id: callHistoryPath,
    filename: callHistoryPath,
    loaded: true,
    exports: {
      async create(doc) {
        calls.create.push(doc);
        storedCall = makeCall({ ...doc, _id: { toString: () => callId } });
        return { _id: { toString: () => callId } };
      },
      findOne() {
        return { lean: async () => null };
      },
      findById(id) {
        calls.findById.push(id);
        return populateResult(storedCall);
      },
      findByIdAndUpdate(id, update) {
        calls.findByIdAndUpdate.push({ id, update });
        storedCall = { ...storedCall, ...update };
        return populateResult(storedCall);
      },
      findOneAndUpdate(filter, update, options) {
        calls.findOneAndUpdate.push({ filter, update, options });
        const canFinalize = storedCall &&
          !storedCall.endedAt &&
          filter.status.$in.includes(storedCall.status) &&
          (!Object.prototype.hasOwnProperty.call(filter, "answeredAt") || storedCall.answeredAt === filter.answeredAt);
        if (!canFinalize) return populateResult(null);
        storedCall = { ...storedCall, ...update.$set };
        return populateResult(storedCall);
      },
    },
  };
  return calls;
};

const installUserMock = () => {
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: {
      findById() {
        return {
          select() {
            return { lean: async () => ({ _id: callerId, displayName: "A", avatar: "", username: "a" }) };
          },
        };
      },
    },
  };
};

const installCallLogMock = () => {
  const calls = { createCallLogMessage: [], emitCallLogMessage: [] };
  require.cache[callLogPath] = {
    id: callLogPath,
    filename: callLogPath,
    loaded: true,
    exports: {
      createCallLogMessage: async (call) => {
        calls.createCallLogMessage.push(call);
        return { _id: "call-log-message", callData: { callHistoryId: call._id } };
      },
      emitCallLogMessage: (io, message) => {
        calls.emitCallLogMessage.push(message);
        io.emitted.push({ target: "callLog", eventName: "callLogMessage", payload: message });
      },
    },
  };
  return calls;
};

const clearCallModules = () => {
  [
    callHistoryPath,
    userPath,
    callLogPath,
    finalizerPath,
    bindingStorePath,
    initCallPath,
    callUserPath,
    answerCallPath,
  ].forEach((path) => delete require.cache[path]);
};

test.beforeEach(() => {
  capturedTimeouts = [];
  Date.now = () => 1_797_760_000_000;
  global.setTimeout = (callback, delay) => {
    const timer = { fakeTimer: true, callback, delay };
    capturedTimeouts.push(timer);
    return timer;
  };
});

test.afterEach(() => {
  Date.now = realDateNow;
  global.setTimeout = realSetTimeout;
  try {
    require("../src/socket/handlers/call/state").activeTimeouts.clear();
  } catch {
    // ignore cache state from tests that did not load call state
  }
  clearCallModules();
});

test("initCall adds callId to Redis timeout due storage with correct timeoutAt", async () => {
  clearCallModules();
  installCallHistoryMock();
  installCallLogMock();
  const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
  const { socket, io, listeners, redisClient } = createSocketIo();

  registerInitCall(socket, io);
  await listeners.get("initCall")({
    userToCall: receiverId,
    typeCall: "video",
    callId: "temp_init",
    from: "socket-1",
  });

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "zAdd" &&
    entry[1] === "call:timeouts" &&
    entry[2].value === callId &&
    entry[2].score === 1_797_760_045_000
  )));
});

test("initCall stores caller socket and user active call bindings", async () => {
  clearCallModules();
  installCallHistoryMock();
  installCallLogMock();
  const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
  const { CALL_BINDING_TTL_SECONDS } = require("../src/socket/handlers/call/services/callSocketBindingStore");
  const { socket, io, listeners, redisClient } = createSocketIo();

  registerInitCall(socket, io);
  await listeners.get("initCall")({
    userToCall: receiverId,
    typeCall: "video",
    callId: "temp_init",
    from: "socket-1",
  });

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === "call:socket:socket-1" &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === `call:user:${callerId}` &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
});

test("callUser-created fallback call adds timeout due metadata", async () => {
  clearCallModules();
  installCallHistoryMock();
  installUserMock();
  installCallLogMock();
  const { registerCallUser } = require("../src/socket/handlers/call/handlers/callUser");
  const { socket, io, listeners, redisClient } = createSocketIo();

  registerCallUser(socket, io);
  await listeners.get("callUser")({
    userToCall: receiverId,
    signalData: { sdp: "offer" },
    from: "socket-1",
    name: "A",
    mediaStatus: { cam: true, mic: true },
    typeCall: "video",
    avatar: "",
    callId: null,
  });

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "zAdd" &&
    entry[1] === "call:timeouts" &&
    entry[2].value === callId &&
    entry[2].score === 1_797_760_045_000
  )));
});

test("callUser stores caller socket, caller user, and receiver user active call bindings", async () => {
  clearCallModules();
  installCallHistoryMock();
  installUserMock();
  installCallLogMock();
  const { registerCallUser } = require("../src/socket/handlers/call/handlers/callUser");
  const { CALL_BINDING_TTL_SECONDS } = require("../src/socket/handlers/call/services/callSocketBindingStore");
  const { socket, io, listeners, redisClient } = createSocketIo();

  registerCallUser(socket, io);
  await listeners.get("callUser")({
    userToCall: receiverId,
    signalData: { sdp: "offer" },
    from: "socket-1",
    name: "A",
    mediaStatus: { cam: true, mic: true },
    typeCall: "video",
    avatar: "",
    callId: null,
  });

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === "call:socket:socket-1" &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === `call:user:${callerId}` &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === `call:user:${receiverId}` &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
});

test("answerCall removes timeout due metadata", async () => {
  clearCallModules();
  installCallHistoryMock();
  const { registerAnswerCall } = require("../src/socket/handlers/call/handlers/answerCall");
  const { socket, io, listeners, redisClient } = createSocketIo({ userId: receiverId });

  registerAnswerCall(socket, io);
  await listeners.get("answerCall")({
    to: callerId,
    signal: { sdp: "answer" },
    mediaStatus: { cam: false, mic: false },
    callId,
  });

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "zRem" && entry[1] === "call:timeouts" && entry[2] === callId
  )));
  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "del" && entry[1] === `call:timeout:${callId}`
  )));
});

test("answerCall stores receiver socket and user active call bindings", async () => {
  clearCallModules();
  installCallHistoryMock();
  const { registerAnswerCall } = require("../src/socket/handlers/call/handlers/answerCall");
  const { CALL_BINDING_TTL_SECONDS } = require("../src/socket/handlers/call/services/callSocketBindingStore");
  const { socket, io, listeners, redisClient } = createSocketIo({ userId: receiverId });

  registerAnswerCall(socket, io);
  await listeners.get("answerCall")({
    to: callerId,
    signal: { sdp: "answer" },
    mediaStatus: { cam: false, mic: false },
    callId,
  });

  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === "call:socket:socket-1" &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
  assert.ok(redisClient.calls.some((entry) => (
    entry[0] === "setEx" &&
    entry[1] === `call:user:${receiverId}` &&
    entry[2] === CALL_BINDING_TTL_SECONDS &&
    entry[3] === callId
  )));
});

test("Redis timeout storage failure does not prevent local timeout registration", async () => {
  clearCallModules();
  installCallHistoryMock();
  installCallLogMock();
  const { activeTimeouts } = require("../src/socket/handlers/call/state");
  const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
  const { socket, io, listeners } = createSocketIo({ redisClient: createRedisClient({ fail: true }) });

  registerInitCall(socket, io);
  await listeners.get("initCall")({
    userToCall: receiverId,
    typeCall: "video",
    callId: "temp_init",
    from: "socket-1",
  });

  assert.equal(activeTimeouts.has(callId), true);
  activeTimeouts.delete(callId);
});

test("initCall stale local timeout does not mark an answered call as missed", async () => {
  clearCallModules();
  const historyCalls = installCallHistoryMock();
  const logCalls = installCallLogMock();
  const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
  const { socket, io, listeners, emitted } = createSocketIo();

  registerInitCall(socket, io);
  await listeners.get("initCall")({
    userToCall: receiverId,
    typeCall: "video",
    callId: "temp_init",
    from: "socket-1",
  });
  historyCalls.setStoredCall({
    ...historyCalls.getStoredCall(),
    answeredAt: new Date("2026-05-20T08:00:02.000Z"),
  });
  await capturedTimeouts[0].callback();

  assert.equal(historyCalls.getStoredCall().status, "pending");
  assert.equal(historyCalls.getStoredCall().endedAt, null);
  assert.equal(historyCalls.findOneAndUpdate[0].filter.answeredAt, null);
  assert.equal(logCalls.createCallLogMessage.length, 0);
  assert.equal(emitted.some((event) => event.eventName === "callTimeout"), false);
});

test("callUser stale local timeout after cross-replica answer no-ops", async () => {
  clearCallModules();
  const historyCalls = installCallHistoryMock();
  installUserMock();
  const logCalls = installCallLogMock();
  const { registerCallUser } = require("../src/socket/handlers/call/handlers/callUser");
  const { socket, io, listeners, emitted } = createSocketIo();

  registerCallUser(socket, io);
  await listeners.get("callUser")({
    userToCall: receiverId,
    signalData: { sdp: "offer" },
    from: "socket-1",
    name: "A",
    mediaStatus: { cam: true, mic: true },
    typeCall: "video",
    avatar: "",
    callId: null,
  });
  historyCalls.setStoredCall({
    ...historyCalls.getStoredCall(),
    answeredAt: new Date("2026-05-20T08:00:02.000Z"),
  });
  await capturedTimeouts[0].callback();

  assert.equal(historyCalls.getStoredCall().status, "pending");
  assert.equal(historyCalls.getStoredCall().endedAt, null);
  assert.equal(historyCalls.findOneAndUpdate[0].filter.answeredAt, null);
  assert.equal(logCalls.createCallLogMessage.length, 0);
  assert.equal(emitted.some((event) => event.eventName === "callTimeout"), false);
});

test("local timeout still marks unanswered pending call as missed and emits side effects once", async () => {
  clearCallModules();
  const historyCalls = installCallHistoryMock();
  const logCalls = installCallLogMock();
  const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
  const { socket, io, listeners, emitted } = createSocketIo();

  registerInitCall(socket, io);
  await listeners.get("initCall")({
    userToCall: receiverId,
    typeCall: "video",
    callId: "temp_init",
    from: "socket-1",
  });
  await capturedTimeouts[0].callback();

  assert.equal(historyCalls.getStoredCall().status, "missed");
  assert.ok(historyCalls.getStoredCall().endedAt);
  assert.equal(historyCalls.findOneAndUpdate[0].filter.answeredAt, null);
  assert.equal(logCalls.createCallLogMessage.length, 1);
  assert.equal(emitted.filter((event) => event.eventName === "callTimeout").length, 2);
});
