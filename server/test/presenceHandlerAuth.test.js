const assert = require("node:assert/strict");
const test = require("node:test");

const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");
const userModelPath = require.resolve("../src/models/User");
const groupModelPath = require.resolve("../src/models/Group");
const presenceServicePath = require.resolve("../src/services/presenceService");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearPresenceHandlerCache = () => {
  for (const path of [
    presenceHandlerPath,
    userModelPath,
    groupModelPath,
    presenceServicePath,
  ]) {
    delete require.cache[path];
  }
};

const createSocket = (userId = "auth-user") => {
  const handlers = new Map();
  const joinedRooms = [];

  return {
    id: "socket-1",
    userId,
    userRegistered: false,
    rooms: new Set(["socket-1"]),
    joinedRooms,
    emitted: [],
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    join(room) {
      joinedRooms.push(room);
      this.rooms.add(String(room));
    },
    emit(eventName, payload) {
      this.emitted.push({ eventName, payload });
    },
    async trigger(eventName, payload) {
      const handler = handlers.get(eventName);
      assert.ok(handler, `missing handler for ${eventName}`);
      await handler(payload);
    },
  };
};

const createRedisClient = () => {
  const calls = [];

  return {
    calls,
    async del(key) {
      calls.push(["del", key]);
    },
    async sAdd(key, value) {
      calls.push(["sAdd", key, value]);
    },
    async sCard(key) {
      calls.push(["sCard", key]);
      return 2;
    },
  };
};

const loadPresenceHandler = ({ groups = [] } = {}) => {
  clearPresenceHandlerCache();

  const presenceCalls = [];

  mockModule(userModelPath, {});
  mockModule(groupModelPath, {
    async find(query) {
      presenceCalls.push(["Group.find", query]);
      return groups;
    },
  });
  mockModule(presenceServicePath, {
    async setPresenceWriteThrough(userId, status) {
      presenceCalls.push(["setPresenceWriteThrough", userId, status]);
    },
    async renewHeartbeat(userId) {
      presenceCalls.push(["renewHeartbeat", userId]);
    },
  });

  const { registerPresenceHandlers } = require(presenceHandlerPath);
  return { registerPresenceHandlers, presenceCalls };
};

test("addNewUser rejects payload userId that does not match authenticated socket user", async () => {
  const { registerPresenceHandlers, presenceCalls } = loadPresenceHandler({
    groups: [{ _id: "group-1" }],
  });
  const redisClient = createRedisClient();
  const socket = createSocket("auth-user");

  registerPresenceHandlers(socket, { redisClient });
  await socket.trigger("addNewUser", "other-user");

  assert.equal(socket.userId, "auth-user");
  assert.equal(socket.userRegistered, false);
  assert.deepEqual(socket.joinedRooms, []);
  assert.deepEqual(redisClient.calls, []);
  assert.deepEqual(presenceCalls, []);
});

test("addNewUser accepts matching authenticated user and joins user plus group rooms", async () => {
  const { registerPresenceHandlers, presenceCalls } = loadPresenceHandler({
    groups: [{ _id: "group-1" }, { _id: "group-2" }],
  });
  const redisClient = createRedisClient();
  const socket = createSocket("auth-user");

  registerPresenceHandlers(socket, { redisClient });
  await socket.trigger("addNewUser", "auth-user");

  assert.equal(socket.userId, "auth-user");
  assert.equal(socket.userRegistered, true);
  assert.deepEqual(socket.joinedRooms, ["auth-user", "group-1", "group-2"]);
  assert.deepEqual(redisClient.calls, [
    ["del", "offline_timer:auth-user"],
    ["sAdd", "user_sockets:auth-user", "socket-1"],
    ["sCard", "user_sockets:auth-user"],
  ]);
  assert.deepEqual(presenceCalls, [
    ["Group.find", { members: "auth-user" }],
    ["renewHeartbeat", "auth-user"],
  ]);
});
