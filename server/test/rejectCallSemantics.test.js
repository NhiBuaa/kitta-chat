const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const callLogPath = require.resolve("../src/socket/handlers/call/callLog");
const finalizerPath = require.resolve("../src/socket/handlers/call/services/callFinalizer");
const rejectCallPath = require.resolve("../src/socket/handlers/call/handlers/rejectCall");

const callerId = "111111111111111111111111";
const receiverId = "222222222222222222222222";
const callId = "aaaaaaaaaaaaaaaaaaaaaaaa";

const makeCall = (overrides = {}) => ({
  _id: { toString: () => callId },
  callerId,
  receiverId,
  conversationId: `${callerId}_${receiverId}`,
  type: "video",
  status: "pending",
  answeredAt: null,
  endedAt: null,
  endedBy: null,
  readBy: [],
  ...overrides,
});

const populateResult = (value) => ({ populate: async () => value });

const loadRejectCall = ({ initialCall = makeCall() } = {}) => {
  delete require.cache[callHistoryPath];
  delete require.cache[callLogPath];
  delete require.cache[finalizerPath];
  delete require.cache[rejectCallPath];

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
        return {
          populate: async () => storedCall,
          then: (resolve) => Promise.resolve(resolve(storedCall)),
        };
      },
      findOneAndUpdate(filter, update, options) {
        calls.findOneAndUpdate.push({ filter, update, options });
        if (!storedCall || storedCall.endedAt || !filter.status.$in.includes(storedCall.status)) {
          return populateResult(null);
        }
        if (filter.answeredAt === null && storedCall.answeredAt) {
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

  const { registerRejectCall } = require("../src/socket/handlers/call/handlers/rejectCall");
  return { registerRejectCall, calls };
};

const createSocketIo = () => {
  const listeners = new Map();
  const emitted = [];
  const redisCalls = [];
  const socket = {
    id: "receiver-socket",
    userId: receiverId,
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

test("rejectCall with reason rejected stores status rejected", async () => {
  const { registerRejectCall, calls } = loadRejectCall();
  const { socket, io, listeners } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "rejected" });

  assert.equal(calls.findOneAndUpdate[0].update.$set.status, "rejected");
  assert.equal(calls.getStoredCall().status, "rejected");
  assert.equal(calls.createCallLogMessage.length, 1);
});

test("rejectCall with reason rejected emits callRejected to the caller", async () => {
  const { registerRejectCall } = loadRejectCall();
  const { socket, io, listeners, emitted } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "rejected" });

  assert.ok(emitted.some((event) => (
    event.target === callerId &&
    event.eventName === "callRejected" &&
    event.payload.reason === "rejected"
  )));
});

test("rejectCall with reason cancelled preserves caller-cancel missed behavior", async () => {
  const { registerRejectCall, calls } = loadRejectCall();
  const { socket, io, listeners, emitted } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "cancelled" });

  assert.equal(calls.findOneAndUpdate[0].update.$set.status, "missed");
  assert.equal(calls.getStoredCall().status, "missed");
  assert.ok(emitted.some((event) => event.target === callerId && event.eventName === "callCancelled"));
});

test("repeated rejectCall for the same call does not create duplicate call_log", async () => {
  const { registerRejectCall, calls } = loadRejectCall();
  const { socket, io, listeners, emitted } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "rejected" });
  const firstEmitCount = emitted.length;
  await listeners.get("rejectCall")({ to: callerId, callId, reason: "rejected" });

  assert.equal(calls.createCallLogMessage.length, 1);
  assert.equal(calls.getStoredCall().status, "rejected");
  assert.equal(emitted.length, firstEmitCount);
});

test("rejectCall removes Redis timeout due metadata", async () => {
  const { registerRejectCall } = loadRejectCall();
  const { socket, io, listeners, redisCalls } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "rejected" });

  assert.ok(redisCalls.some((entry) => (
    entry[0] === "zRem" && entry[1] === "call:timeouts" && entry[2] === callId
  )));
  assert.ok(redisCalls.some((entry) => (
    entry[0] === "del" && entry[1] === `call:timeout:${callId}`
  )));
});

test("timeout-style missed reject cannot overwrite an already rejected call", async () => {
  const { registerRejectCall, calls } = loadRejectCall({
    initialCall: makeCall({
      status: "rejected",
      endedAt: new Date("2026-05-20T08:00:05.000Z"),
    }),
  });
  const { socket, io, listeners, emitted } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "cancelled" });

  assert.equal(calls.getStoredCall().status, "rejected");
  assert.equal(calls.createCallLogMessage.length, 0);
  assert.equal(emitted.length, 0);
});

test("rejected reject cannot overwrite an answered completed call", async () => {
  const { registerRejectCall, calls } = loadRejectCall({
    initialCall: makeCall({
      status: "completed",
      answeredAt: new Date("2026-05-20T08:00:02.000Z"),
      endedAt: new Date("2026-05-20T08:10:00.000Z"),
    }),
  });
  const { socket, io, listeners, emitted } = createSocketIo();
  registerRejectCall(socket, io);

  await listeners.get("rejectCall")({ to: callerId, callId, reason: "rejected" });

  assert.equal(calls.getStoredCall().status, "completed");
  assert.equal(calls.createCallLogMessage.length, 0);
  assert.equal(emitted.length, 0);
});
