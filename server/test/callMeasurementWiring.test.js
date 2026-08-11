const assert = require("node:assert/strict");
const test = require("node:test");

const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
const { registerCallUser } = require("../src/socket/handlers/call/handlers/callUser");

const createMeasurementCapture = () => {
  const stages = [];
  return {
    stages,
    measurement: {
      beginCallStage(phase, stage) {
        const observation = { phase, stage, outcome: null, abandoned: false };
        stages.push(observation);
        return {
          finish(outcome) {
            observation.outcome = outcome;
          },
          abandon() {
            observation.abandoned = true;
          },
        };
      },
    },
  };
};

const createSocket = () => {
  const listeners = new Map();
  const emissions = [];
  return {
    id: "call-measurement-socket",
    userId: "111111111111111111111111",
    emissions,
    listeners,
    emit(event, payload) {
      emissions.push({ event, payload });
    },
    on(event, listener) {
      listeners.set(event, listener);
    },
  };
};

test("initCall preserves invalid-call return while observing authenticated entry and validation", async () => {
  const socket = createSocket();
  const { measurement, stages } = createMeasurementCapture();

  registerInitCall(socket, {}, { measurement });
  await socket.listeners.get("initCall")({
    userToCall: "222222222222222222222222",
    typeCall: "video",
    callId: "not-a-temp-id",
    from: "call-measurement-socket",
  });

  assert.deepEqual(socket.emissions, []);
  assert.deepEqual(stages, [
    { phase: "init_call", stage: "handler_entry", outcome: "stopped", abandoned: false },
    { phase: "init_call", stage: "syntactic_validation", outcome: "stopped", abandoned: false },
  ]);
});

test("callUser rejects invalid input before distributed admission", async () => {
  const socket = createSocket();
  const { measurement, stages } = createMeasurementCapture();

  registerCallUser(socket, {}, { measurement });
  await socket.listeners.get("callUser")({
    userToCall: "",
    typeCall: "",
  });

  assert.deepEqual(socket.emissions, [
    { event: "callRejected", payload: { reason: "Invalid call parameters" } },
  ]);
  assert.deepEqual(stages, [
    { phase: "call_user", stage: "handler_entry", outcome: "stopped", abandoned: false },
    { phase: "call_user", stage: "syntactic_validation", outcome: "stopped", abandoned: false },
  ]);
});

test("callUser fails closed when distributed admission is unavailable", async () => {
  const socket = createSocket();
  const { measurement, stages } = createMeasurementCapture();

  registerCallUser(socket, {}, { measurement });
  await socket.listeners.get("callUser")({
    userToCall: "222222222222222222222222",
    typeCall: "video",
  });

  assert.deepEqual(socket.emissions, [
    { event: "RATE_LIMIT_UNAVAILABLE", payload: { code: "RATE_LIMIT_UNAVAILABLE" } },
  ]);
  assert.deepEqual(stages, [
    { phase: "call_user", stage: "handler_entry", outcome: "suppressed", abandoned: false },
    { phase: "call_user", stage: "syntactic_validation", outcome: "continued", abandoned: false },
    { phase: "call_user", stage: "current_local_limit", outcome: "suppressed", abandoned: false },
  ]);
});

test("measurement failure cannot alter the distributed unavailable response", async () => {
  const socket = createSocket();
  const failingMeasurement = {
    beginCallStage() {
      throw new Error("measurement unavailable");
    },
  };

  registerCallUser(socket, {}, { measurement: failingMeasurement });
  await socket.listeners.get("callUser")({
    userToCall: "222222222222222222222222",
    typeCall: "video",
  });

  assert.deepEqual(socket.emissions, [
    { event: "RATE_LIMIT_UNAVAILABLE", payload: { code: "RATE_LIMIT_UNAVAILABLE" } },
  ]);
});
