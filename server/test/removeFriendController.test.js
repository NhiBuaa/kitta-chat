const assert = require("node:assert/strict");
const test = require("node:test");

const controllerPath = require.resolve("../src/controllers/userController");
const userPath = require.resolve("../src/models/User");
const messagePath = require.resolve("../src/models/Message");
const friendCachePath = require.resolve("../src/services/friendCacheService");
const cacheServicePath = require.resolve("../src/services/cacheService");
const presenceServicePath = require.resolve("../src/services/presenceService");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");
const profileAvatarQueuePath = require.resolve("../src/services/profileAvatarQueueService");
const callHistoryPath = require.resolve("../src/models/CallHistory");

const currentUserId = "111111111111111111111111";
const friendId = "222222222222222222222222";
const conversationId = `${currentUserId}_${friendId}`;

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearModules = () => {
  [
    controllerPath,
    userPath,
    messagePath,
    friendCachePath,
    cacheServicePath,
    presenceServicePath,
    presenceHandlerPath,
    profileAvatarQueuePath,
    callHistoryPath,
  ].forEach((path) => delete require.cache[path]);
};

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

const createIo = () => {
  const emitted = [];
  return {
    emitted,
    to(target) {
      return {
        emit(eventName, payload) {
          emitted.push({ target, eventName, payload });
        },
      };
    },
  };
};

const loadController = ({
  currentUser = { _id: currentUserId, friends: [friendId], friendRequests: [] },
  targetUser = { _id: friendId, friends: [currentUserId], friendRequests: [] },
  removeFriendImpl = async () => ({ conversationId, hadMessages: true }),
} = {}) => {
  clearModules();
  const calls = {
    removeFriendWriteThrough: [],
    messageDeleteMany: [],
    callHistoryDeleteMany: [],
  };

  mockModule(userPath, {
    async findById(id) {
      if (String(id) === currentUserId) return currentUser;
      if (String(id) === friendId) return targetUser;
      return null;
    },
  });
  mockModule(messagePath, {
    async deleteMany(query) {
      calls.messageDeleteMany.push(query);
    },
  });
  mockModule(callHistoryPath, {
    async deleteMany(query) {
      calls.callHistoryDeleteMany.push(query);
    },
  });
  mockModule(friendCachePath, {
    async removeFriendWriteThrough(userIdA, userIdB) {
      calls.removeFriendWriteThrough.push([userIdA, userIdB]);
      return removeFriendImpl(userIdA, userIdB);
    },
    addFriendWriteThrough: async () => {},
    getFriendIdsFromCache: async () => [],
  });
  mockModule(cacheServicePath, {
    invalidateUserProfile: async () => {},
    getCachedUserProfile: async () => null,
  });
  mockModule(presenceServicePath, {
    getMultiPresence: async () => ({}),
    getUserPresence: async () => null,
    setPresenceWriteThrough: async () => {},
  });
  mockModule(presenceHandlerPath, {
    broadcastUserStatus: () => {},
  });
  mockModule(profileAvatarQueuePath, {
    queueProfileAvatarProcessing: async () => {},
  });

  return {
    controller: require("../src/controllers/userController"),
    calls,
  };
};

test.afterEach(clearModules);

test("removeFriend rejects self-remove", async () => {
  const { controller } = loadController();
  const res = createRes();

  await controller.removeFriend({
    user: { id: currentUserId },
    body: { friendId: currentUserId },
    app: { get: () => createIo() },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test("removeFriend returns 404 for missing target user", async () => {
  const { controller } = loadController({ targetUser: null });
  const res = createRes();

  await controller.removeFriend({
    user: { id: currentUserId },
    body: { friendId },
    app: { get: () => createIo() },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
});

test("removeFriend returns idempotent success when already not friends", async () => {
  const { controller, calls } = loadController({
    currentUser: { _id: currentUserId, friends: [], friendRequests: [] },
  });
  const res = createRes();

  await controller.removeFriend({
    user: { id: currentUserId },
    body: { friendId },
    app: { get: () => createIo() },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, alreadyRemoved: true });
  assert.deepEqual(calls.removeFriendWriteThrough, []);
});

test("removeFriend removes friendship through write-through service", async () => {
  const { controller, calls } = loadController();
  const res = createRes();

  await controller.removeFriend({
    user: { id: currentUserId },
    body: { friendId },
    app: { get: () => createIo() },
  }, res);

  assert.equal(res.body.success, true);
  assert.deepEqual(calls.removeFriendWriteThrough, [[currentUserId, friendId]]);
});

test("removeFriend emits friendRemoved to both user rooms with expected payloads", async () => {
  const { controller } = loadController({
    removeFriendImpl: async () => ({ conversationId, hadMessages: false }),
  });
  const io = createIo();
  const res = createRes();

  await controller.removeFriend({
    user: { id: currentUserId },
    body: { friendId },
    app: { get: () => io },
  }, res);

  assert.deepEqual(io.emitted, [
    {
      target: currentUserId,
      eventName: "friendRemoved",
      payload: {
        removedUserId: friendId,
        byUserId: currentUserId,
        conversationId,
        hadMessages: false,
      },
    },
    {
      target: friendId,
      eventName: "friendRemoved",
      payload: {
        removedUserId: currentUserId,
        byUserId: currentUserId,
        conversationId,
        hadMessages: false,
      },
    },
  ]);
});

test("removeFriend does not delete messages or call histories", async () => {
  const { controller, calls } = loadController();
  const res = createRes();

  await controller.removeFriend({
    user: { id: currentUserId },
    body: { friendId },
    app: { get: () => createIo() },
  }, res);

  assert.deepEqual(calls.messageDeleteMany, []);
  assert.deepEqual(calls.callHistoryDeleteMany, []);
});
