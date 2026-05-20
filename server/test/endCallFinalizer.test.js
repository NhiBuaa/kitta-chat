const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const callLogPath = require.resolve("../src/socket/handlers/call/callLog");
const finalizerPath = require.resolve("../src/socket/handlers/call/services/callFinalizer");
const endCallPath = require.resolve("../src/socket/handlers/call/handlers/endCall");

const callerId = "111111111111111111111111";
const receiverId = "222222222222222222222222";
const callId = "aaaaaaaaaaaaaaaaaaaaaaaa";
const answeredAt = new Date("2026-05-20T08:00:00.000Z");
const endedAt = new Date("2026-05-20T08:00:42.000Z");
const realDateNow = Date.now;

const makeCall = (overrides = {}) => ({
  _id: { toString: () => callId },
  callerId,
  receiverId,
  conversationId: `${callerId}_${receiverId}`,
  type: "video",
  status: "pending",
  answeredAt,
  endedAt: null,
  endedBy: null,
  duration: null,
  readBy: [],
  ...overrides,
});

const populateResult = (value) => ({ populate: async () => value });

const loadEndCall = ({ initialCall = makeCall() } = {}) => {
  delete require.cache[callHistoryPath];
  delete require.cache[callLogPath];
  delete require.cache[finalizerPath];
  delete require.cache[endCallPath];

  let storedCall = initialCall;
  const calls = {
    findById: [],
    findOneAndUpdate: [],
    findByIdAndUpdate: [],
    createCallLogMessage: [],
    getStoredCall: () => storedCall,
  };

  require.cache[callHistoryPath] = {
    id: callHistoryPath,
    filename: callHistoryPath,
    loaded: true,
    exports: {
      findById(id) {
        calls.findById.push(id);
        return populateResult(storedCall);
      },
      findOneAndUpdate(filter, update, options) {
        calls.findOneAndUpdate.push({ filter, update, options });
        if (!storedCall || storedCall.endedAt || !filter.status.$in.includes(storedCall.status)) {
          return populateResult(null);
        }
        storedCall = {
          ...storedCall,
          ...update.$set,
        };
        return populateResult(storedCall);
      },
      findByIdAndUpdate(id, update, options) {
        calls.findByIdAndUpdate.push({ id, update, options });
        storedCall = {
          ...storedCall,
          ...update,
        };
        return populateResult(storedCall);
      },
      findOne: () => ({ lean: async () => null }),
    },
  };

  require.cache[callLogPath] = {
    id: callLogPath,
    filename: callLogPath,
    loaded: true,
    exports: {
      createCallLogMessage: async (call) => {
        calls.createCallLogMessage.push(call);
        return {
          _id: "call-log-message",
          sender: call.callerId,
          receiver: call.receiverId,
          conversationId: call.conversationId,
          type: "call_log",
          text: "",
          callData: { callHistoryId: call._id, status: call.status, type: call.type },
        };
      },
      emitCallLogMessage: (io, message) => {
        io.emitted.push({ target: "callLog", eventName: "callLogMessage", payload: message });
      },
    },
  };

  const { registerEndCall } = require("../src/socket/handlers/call/handlers/endCall");
  return { registerEndCall, calls };
};

const createSocketIo = () => {
  const listeners = new Map();
  const emitted = [];
  const redisCalls = [];
  const socket = {
    id: "caller-socket",
    userId: callerId,
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
  };
  const io = {
    redisClient: {
      async zRem(key, value) {
        redisCalls.push(["zRem", key, value]);
      },
      async del(key) {
        redisCalls.push(["del", key]);
      },
      async sMembers() {
        return [];
      },
    },
    emitted,
    to(target) {
      return {
        emit(eventName, payload) {
          emitted.push({ target, eventName, payload });
        },
      };
    },
  };
  return { socket, io, listeners, emitted, redisCalls };
};

test.beforeEach(() => {
  Date.now = () => endedAt.getTime();
});

test.afterEach(() => {
  Date.now = realDateNow;
});

test("answered endCall finalizes as completed once with computed duration", async () => {
  const { registerEndCall, calls } = loadEndCall();
  const { socket, io, listeners, emitted } = createSocketIo();
  registerEndCall(socket, io);

  await listeners.get("endCall")({ to: receiverId, callId });

  assert.equal(calls.getStoredCall().status, "completed");
  assert.equal(calls.getStoredCall().duration, 42);
  assert.equal(calls.createCallLogMessage.length, 1);
  assert.ok(emitted.some((event) => event.eventName === "callEnded"));
  assert.ok(emitted.some((event) => event.eventName === "callHistorySync"));
});

test("duplicate endCall does not recreate call_log or duplicate side effects", async () => {
  const { registerEndCall, calls } = loadEndCall();
  const { socket, io, listeners, emitted } = createSocketIo();
  registerEndCall(socket, io);

  await listeners.get("endCall")({ to: receiverId, callId });
  const firstEmitCount = emitted.length;
  await listeners.get("endCall")({ to: receiverId, callId });

  assert.equal(calls.createCallLogMessage.length, 1);
  assert.equal(emitted.length, firstEmitCount);
});

test("endCall after rejected does not overwrite rejected", async () => {
  const { registerEndCall, calls } = loadEndCall({
    initialCall: makeCall({
      status: "rejected",
      endedAt: new Date("2026-05-20T08:00:10.000Z"),
      duration: null,
    }),
  });
  const { socket, io, listeners, emitted } = createSocketIo();
  registerEndCall(socket, io);

  await listeners.get("endCall")({ to: receiverId, callId });

  assert.equal(calls.getStoredCall().status, "rejected");
  assert.equal(calls.createCallLogMessage.length, 0);
  assert.equal(emitted.length, 0);
});

test("endCall after missed does not overwrite missed", async () => {
  const { registerEndCall, calls } = loadEndCall({
    initialCall: makeCall({
      status: "missed",
      answeredAt: null,
      endedAt: new Date("2026-05-20T08:00:45.000Z"),
      duration: null,
    }),
  });
  const { socket, io, listeners, emitted } = createSocketIo();
  registerEndCall(socket, io);

  await listeners.get("endCall")({ to: receiverId, callId });

  assert.equal(calls.getStoredCall().status, "missed");
  assert.equal(calls.createCallLogMessage.length, 0);
  assert.equal(emitted.length, 0);
});

test("endCall event payloads remain compatible", async () => {
  const { registerEndCall } = loadEndCall();
  const { socket, io, listeners, emitted } = createSocketIo();
  registerEndCall(socket, io);

  await listeners.get("endCall")({ to: receiverId, callId });

  assert.ok(emitted.some((event) => (
    event.target === callerId &&
    event.eventName === "callHistorySync" &&
    event.payload.direction === "outgoing" &&
    event.payload.status === "completed"
  )));
  assert.ok(emitted.some((event) => (
    event.target === receiverId &&
    event.eventName === "callHistorySync" &&
    event.payload.direction === "incoming" &&
    event.payload.status === "completed"
  )));
  assert.ok(emitted.some((event) => event.eventName === "callEnded"));
});

test("endCall removes Redis timeout due metadata", async () => {
  const { registerEndCall } = loadEndCall();
  const { socket, io, listeners, redisCalls } = createSocketIo();
  registerEndCall(socket, io);

  await listeners.get("endCall")({ to: receiverId, callId });

  assert.ok(redisCalls.some((entry) => (
    entry[0] === "zRem" && entry[1] === "call:timeouts" && entry[2] === callId
  )));
  assert.ok(redisCalls.some((entry) => (
    entry[0] === "del" && entry[1] === `call:timeout:${callId}`
  )));
});
