const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const userPath = require.resolve("../src/models/User");
const initCallPath = require.resolve("../src/socket/handlers/call/handlers/initCall");
const callUserPath = require.resolve("../src/socket/handlers/call/handlers/callUser");
const statePath = require.resolve("../src/socket/handlers/call/state");

const clearCallModules = () => {
  [
    callHistoryPath,
    userPath,
    initCallPath,
    callUserPath,
    statePath,
  ].forEach((path) => delete require.cache[path]);
};

const createRedisClient = () => {
  const values = new Map();
  const calls = [];

  return {
    values,
    calls,
    async get(key) {
      calls.push(["get", key]);
      return values.get(key) ?? null;
    },
    async setEx(key, ttl, value) {
      calls.push(["setEx", key, ttl, value]);
      values.set(key, value);
    },
  };
};

const createIo = (redisClient) => {
  const emissions = [];

  return {
    redisClient,
    emissions,
    sockets: {
      adapter: {
        rooms: new Map(),
      },
    },
    to(target) {
      return {
        emit(eventName, payload) {
          emissions.push({ target, eventName, payload });
        },
      };
    },
  };
};

test("callUser on isolated handler state reuses initCall record through Redis temp mapping", async () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ fake: true });

  const redisClient = createRedisClient();
  const callerId = "111111111111111111111111";
  const receiverId = "222222222222222222222222";
  const callHistoryId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const createdRecords = [];

  try {
    clearCallModules();
    require.cache[callHistoryPath] = {
      id: callHistoryPath,
      filename: callHistoryPath,
      loaded: true,
      exports: {
        create: async (payload) => {
          createdRecords.push(payload);
          return { _id: { toString: () => callHistoryId } };
        },
        findOne: () => ({ lean: async () => null }),
        findOneAndUpdate: () => ({
          populate: async () => null,
        }),
      },
    };

    const initListeners = new Map();
    const initSocket = {
      id: "caller-socket-init",
      userId: callerId,
      on(eventName, handler) {
        initListeners.set(eventName, handler);
      },
    };
    const initIo = createIo(redisClient);
    const { registerInitCall } = require("../src/socket/handlers/call/handlers/initCall");
    registerInitCall(initSocket, initIo);

    await initListeners.get("initCall")({
      userToCall: receiverId,
      typeCall: "video",
      callId: "temp_cross_replica",
      from: initSocket.id,
    });

    assert.deepEqual(redisClient.calls, [
      ["setEx", "call:temp:temp_cross_replica", 120, callHistoryId],
    ]);

    delete require.cache[callUserPath];
    delete require.cache[statePath];
    require.cache[userPath] = {
      id: userPath,
      filename: userPath,
      loaded: true,
      exports: {
        findById: () => ({
          select: () => ({
            lean: async () => ({
              _id: callerId,
              displayName: "Caller",
              avatar: "avatar.png",
              username: "caller",
            }),
          }),
        }),
      },
    };

    const callUserListeners = new Map();
    const callUserSocket = {
      id: "caller-socket-offer",
      userId: callerId,
      on(eventName, handler) {
        callUserListeners.set(eventName, handler);
      },
      emit() {},
    };
    const callUserIo = createIo(redisClient);
    const { registerCallUser } = require("../src/socket/handlers/call/handlers/callUser");
    registerCallUser(callUserSocket, callUserIo);

    await callUserListeners.get("callUser")({
      userToCall: receiverId,
      signalData: { type: "offer" },
      from: callUserSocket.id,
      mediaStatus: { cam: true, mic: true },
      typeCall: "video",
      callId: "temp_cross_replica",
    });

    assert.equal(createdRecords.length, 1);
    assert.ok(redisClient.calls.some((call) => (
      call[0] === "get" && call[1] === "call:temp:temp_cross_replica"
    )));
    assert.ok(callUserIo.emissions.some((event) => (
      event.target === receiverId &&
      event.eventName === "callUser" &&
      event.payload.callId === callHistoryId
    )));
  } finally {
    global.setTimeout = originalSetTimeout;
    clearCallModules();
  }
});

