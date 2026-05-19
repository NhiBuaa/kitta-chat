const assert = require("node:assert/strict");
const test = require("node:test");

const callHistoryPath = require.resolve("../src/models/CallHistory");
const userPath = require.resolve("../src/models/User");
const callUserPath = require.resolve("../src/socket/handlers/call/handlers/callUser");

test("callUser attempts realtime ringing even when receiver has no local room", async () => {
  const originalSetTimeout = global.setTimeout;
  const timeoutHandles = [];
  global.setTimeout = (callback, delay) => {
    const handle = { callback, delay };
    timeoutHandles.push(handle);
    return handle;
  };

  delete require.cache[callHistoryPath];
  delete require.cache[userPath];
  delete require.cache[callUserPath];

  require.cache[callHistoryPath] = {
    id: callHistoryPath,
    filename: callHistoryPath,
    loaded: true,
    exports: {
      create: async () => ({ _id: { toString: () => "aaaaaaaaaaaaaaaaaaaaaaaa" } }),
      findOne: () => ({ lean: async () => null }),
    },
  };
  require.cache[userPath] = {
    id: userPath,
    filename: userPath,
    loaded: true,
    exports: {
      findById: () => ({
        select: () => ({
          lean: async () => ({
            _id: "111111111111111111111111",
            displayName: "User B",
            avatar: "avatar.png",
            username: "user-b",
          }),
        }),
      }),
    },
  };

  try {
    const { registerCallUser } = require("../src/socket/handlers/call/handlers/callUser");
    const listeners = new Map();
    const socketEmissions = [];
    const ioEmissions = [];
    const socket = {
      id: "socket-b",
      userId: "111111111111111111111111",
      on(eventName, handler) {
        listeners.set(eventName, handler);
      },
      emit(eventName, payload) {
        socketEmissions.push({ eventName, payload });
      },
    };
    const io = {
      sockets: {
        adapter: {
          rooms: new Map(),
        },
      },
      to(target) {
        return {
          emit(eventName, payload) {
            ioEmissions.push({ target, eventName, payload });
          },
        };
      },
    };

    registerCallUser(socket, io);
    await listeners.get("callUser")({
      userToCall: "222222222222222222222222",
      signalData: { type: "offer" },
      from: "socket-b",
      name: "User B",
      mediaStatus: { cam: true, mic: true },
      typeCall: "video",
      avatar: "client-avatar.png",
      callId: "temp_123",
    });

    assert.deepEqual(socketEmissions, []);
    assert.equal(timeoutHandles.length, 1);
    assert.equal(timeoutHandles[0].delay, 45_000);
    assert.ok(ioEmissions.some((event) => (
      event.target === "222222222222222222222222" &&
      event.eventName === "callUser" &&
      event.payload.callId === "aaaaaaaaaaaaaaaaaaaaaaaa"
    )));
  } finally {
    global.setTimeout = originalSetTimeout;
    delete require.cache[callHistoryPath];
    delete require.cache[userPath];
    delete require.cache[callUserPath];
  }
});
