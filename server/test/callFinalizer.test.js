const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const callLogPath = require.resolve("../src/socket/handlers/call/callLog");
const finalizerPath = require.resolve("../src/socket/handlers/call/services/callFinalizer");

const makeCall = (overrides = {}) => ({
  _id: { toString: () => "aaaaaaaaaaaaaaaaaaaaaaaa" },
  callerId: "111111111111111111111111",
  receiverId: "222222222222222222222222",
  conversationId: "111111111111111111111111_222222222222222222222222",
  type: "video",
  status: "pending",
  startedAt: new Date("2026-05-20T08:00:00.000Z"),
  answeredAt: null,
  endedAt: null,
  duration: null,
  readBy: [],
  ...overrides,
});

const populateResult = (value) => ({
  populate: async () => value,
});

const loadFinalizer = ({ updateResults = [], existingCall = null } = {}) => {
  delete require.cache[callHistoryPath];
  delete require.cache[callLogPath];
  delete require.cache[finalizerPath];

  const calls = {
    findOneAndUpdate: [],
    findById: [],
    createCallLogMessage: [],
  };

  require.cache[callHistoryPath] = {
    id: callHistoryPath,
    filename: callHistoryPath,
    loaded: true,
    exports: {
      findOneAndUpdate(filter, update, options) {
        calls.findOneAndUpdate.push({ filter, update, options });
        return populateResult(updateResults.shift() ?? null);
      },
      findById(callId) {
        calls.findById.push(callId);
        return populateResult(existingCall);
      },
    },
  };

  require.cache[callLogPath] = {
    id: callLogPath,
    filename: callLogPath,
    loaded: true,
    exports: {
      createCallLogMessage: async (call) => {
        calls.createCallLogMessage.push(call);
        return { _id: "call-log-message", callData: { callHistoryId: call._id } };
      },
    },
  };

  return {
    finalizer: require("../src/socket/handlers/call/services/callFinalizer"),
    calls,
  };
};

test("pending call finalizes once through a Mongo conditional update", async () => {
  const finalizedCall = makeCall({
    status: "rejected",
    endedAt: new Date("2026-05-20T08:00:05.000Z"),
    endedBy: "111111111111111111111111",
  });
  const { finalizer, calls } = loadFinalizer({ updateResults: [finalizedCall] });

  const result = await finalizer.finalizeCallOnce({
    callId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "rejected",
    endedBy: "111111111111111111111111",
    endedAt: new Date("2026-05-20T08:00:05.000Z"),
  });

  assert.equal(result.finalized, true);
  assert.equal(result.alreadyFinalized, false);
  assert.equal(result.call, finalizedCall);
  assert.equal(calls.createCallLogMessage.length, 1);
  assert.deepEqual(calls.findOneAndUpdate[0].filter, {
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    endedAt: null,
    status: { $in: ["pending"] },
  });
});

test("second finalize attempt is reported as already finalized and skips call_log creation", async () => {
  const existingCall = makeCall({
    status: "rejected",
    endedAt: new Date("2026-05-20T08:00:05.000Z"),
  });
  const { finalizer, calls } = loadFinalizer({
    updateResults: [null],
    existingCall,
  });

  const result = await finalizer.finalizeCallOnce({
    callId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "missed",
    endedBy: "222222222222222222222222",
  });

  assert.equal(result.finalized, false);
  assert.equal(result.alreadyFinalized, true);
  assert.equal(result.call, existingCall);
  assert.equal(calls.createCallLogMessage.length, 0);
});

test("final status is not overwritten once a call is already finalized", async () => {
  const existingCall = makeCall({
    status: "busy",
    endedAt: new Date("2026-05-20T08:00:05.000Z"),
  });
  const { finalizer, calls } = loadFinalizer({
    updateResults: [null],
    existingCall,
  });

  const result = await finalizer.finalizeCallOnce({
    callId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "missed",
    endedBy: "111111111111111111111111",
  });

  assert.equal(result.finalized, false);
  assert.equal(result.call.status, "busy");
  assert.equal(calls.findOneAndUpdate[0].update.$set.status, "missed");
  assert.equal(calls.createCallLogMessage.length, 0);
});

test("timeout cannot mark an answered call as missed", async () => {
  const answeredCall = makeCall({
    status: "pending",
    answeredAt: new Date("2026-05-20T08:00:02.000Z"),
  });
  const { finalizer, calls } = loadFinalizer({
    updateResults: [null],
    existingCall: answeredCall,
  });

  const result = await finalizer.finalizeCallOnce({
    callId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "missed",
    endedAt: new Date("2026-05-20T08:00:45.000Z"),
    requireUnanswered: true,
  });

  assert.equal(result.finalized, false);
  assert.equal(result.alreadyFinalized, false);
  assert.equal(result.call, answeredCall);
  assert.equal(calls.findOneAndUpdate[0].filter.answeredAt, null);
  assert.equal(calls.createCallLogMessage.length, 0);
});

test("call_log creation remains idempotent behind the Mongo gate", async () => {
  const finalizedCall = makeCall({
    status: "rejected",
    endedAt: new Date("2026-05-20T08:00:05.000Z"),
  });
  const existingCall = makeCall({
    status: "rejected",
    endedAt: new Date("2026-05-20T08:00:05.000Z"),
  });
  const { finalizer, calls } = loadFinalizer({
    updateResults: [finalizedCall, null],
    existingCall,
  });

  await finalizer.finalizeCallOnce({
    callId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "rejected",
  });
  await finalizer.finalizeCallOnce({
    callId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    status: "rejected",
  });

  assert.equal(calls.findOneAndUpdate.length, 2);
  assert.equal(calls.createCallLogMessage.length, 1);
});

