const assert = require("node:assert/strict");
const test = require("node:test");

const { registerCallHandlers } = require("../../src/socket/handlers/call");
const cleanupPath = require.resolve("../../src/socket/handlers/call/cleanup");

const callEvents = [
  "initCall",
  "callUser",
  "answerCall",
  "endCall",
  "rejectCall",
  "toggleMedia",
];

const createSocket = () => {
  const listeners = new Map();
  const emitted = [];
  return {
    id: "safe-socket-id",
    userId: "safe-user-id",
    listeners,
    emitted,
    on(event, handler) {
      listeners.set(event, handler);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };
};

test("disabled calls register only fail-closed handlers with the exact public event", async () => {
  const socket = createSocket();
  let ioSideEffects = 0;
  const io = new Proxy({}, {
    get() {
      ioSideEffects += 1;
      throw new Error("disabled calls must not read Socket.IO collaborators");
    },
  });

  registerCallHandlers(socket, io, {
    capabilities: { calls: false },
    rateLimiter: {
      async admitLogicalCall() {
        throw new Error("disabled calls must not reach rate limiting");
      },
    },
  });

  assert.deepEqual([...socket.listeners.keys()].sort(), [...callEvents].sort());
  for (const inputEvent of callEvents) {
    socket.emitted.length = 0;
    await socket.listeners.get(inputEvent)({ unsafe: "ignored" }, () => {
      throw new Error("disabled calls must not invoke enabled ACKs");
    });
    assert.deepEqual(socket.emitted, [{
      event: "callRejected",
      payload: { reason: "Call feature unavailable" },
    }], inputEvent);
  }
  assert.equal(ioSideEffects, 0);
});

test("explicitly enabled calls preserve the existing listener inventory", () => {
  require.cache[cleanupPath] = {
    id: cleanupPath,
    filename: cleanupPath,
    loaded: true,
    exports: { runCleanup: async () => {} },
  };
  const socket = createSocket();
  const io = {
    rateLimiter: {},
    redisClient: {},
  };

  registerCallHandlers(socket, io, {
    capabilities: { calls: true },
    measurement: {},
    rateLimiter: {},
  });

  assert.deepEqual(
    [...socket.listeners.keys()].sort(),
    [...callEvents, "disconnect"].sort(),
  );
  delete require.cache[cleanupPath];
});
