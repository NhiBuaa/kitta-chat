const assert = require("node:assert/strict");
const test = require("node:test");

const socketIndexPath = require.resolve("../src/socket/index");
const socketIoPath = require.resolve("socket.io");
const redisPath = require.resolve("redis");
const redisAdapterPath = require.resolve("@socket.io/redis-adapter");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");
const messageHandlerPath = require.resolve("../src/socket/handlers/messageHandler");
const friendHandlerPath = require.resolve("../src/socket/handlers/friendHandler");
const typingHandlerPath = require.resolve("../src/socket/handlers/typingHandler");
const callHandlerPath = require.resolve("../src/socket/handlers/call/index");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearSocketInitCache = () => {
  for (const path of [
    socketIndexPath,
    socketIoPath,
    redisPath,
    redisAdapterPath,
    presenceHandlerPath,
    messageHandlerPath,
    friendHandlerPath,
    typingHandlerPath,
    callHandlerPath,
  ]) {
    delete require.cache[path];
  }
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test("initSocket resolves only after the Redis adapter is connected and attached", async () => {
  clearSocketInitCache();
  process.env.JWT_SECRET = "test-secret";

  const pubConnect = createDeferred();
  const subConnect = createDeferred();
  let adapterAttached = false;

  class FakeServer {
    constructor() {
      this.redisClient = null;
    }

    adapter(adapterInstance) {
      adapterAttached = adapterInstance === "redis-adapter";
    }

    on() {}
    use() {}
    of() {
      return { adapter: { rooms: new Map() } };
    }
  }

  const pubClient = {
    on() {},
    connect: () => pubConnect.promise,
    duplicate() {
      return {
        on() {},
        connect: () => subConnect.promise,
      };
    },
  };

  mockModule(socketIoPath, { Server: FakeServer });
  mockModule(redisPath, { createClient: () => pubClient });
  mockModule(redisAdapterPath, { createAdapter: () => "redis-adapter" });
  mockModule(presenceHandlerPath, { registerPresenceHandlers() {} });
  mockModule(messageHandlerPath, { registerMessageHandlers() {} });
  mockModule(friendHandlerPath, { registerFriendHandlers() {} });
  mockModule(typingHandlerPath, { registerTypingHandlers() {} });
  mockModule(callHandlerPath, { registerCallHandlers() {} });

  const { initSocket } = require(socketIndexPath);
  const appValues = new Map();
  const app = { set: (key, value) => appValues.set(key, value) };

  let resolved = false;
  const initPromise = initSocket({}, app).then((io) => {
    resolved = true;
    return io;
  });

  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(adapterAttached, false);

  pubConnect.resolve();
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(adapterAttached, false);

  subConnect.resolve();
  const io = await initPromise;

  assert.equal(resolved, true);
  assert.equal(adapterAttached, true);
  assert.equal(appValues.get("socketio"), io);
  assert.equal(appValues.get("redisClient"), pubClient);
  assert.equal(io.redisClient, pubClient);
});

test("initSocket rejects when the Redis adapter cannot connect", async () => {
  clearSocketInitCache();
  process.env.JWT_SECRET = "test-secret";

  class FakeServer {
    adapter() {}
    on() {}
    use() {}
    of() {
      return { adapter: { rooms: new Map() } };
    }
  }

  mockModule(socketIoPath, { Server: FakeServer });
  mockModule(redisPath, {
    createClient: () => ({
      on() {},
      connect: async () => {
        throw new Error("redis down");
      },
      duplicate() {
        return { on() {}, connect: async () => {} };
      },
    }),
  });
  mockModule(redisAdapterPath, { createAdapter: () => "redis-adapter" });
  mockModule(presenceHandlerPath, { registerPresenceHandlers() {} });
  mockModule(messageHandlerPath, { registerMessageHandlers() {} });
  mockModule(friendHandlerPath, { registerFriendHandlers() {} });
  mockModule(typingHandlerPath, { registerTypingHandlers() {} });
  mockModule(callHandlerPath, { registerCallHandlers() {} });

  const { initSocket } = require(socketIndexPath);

  await assert.rejects(
    () => initSocket({}, { set() {} }),
    /Redis connection failed: redis down/,
  );
});
