const assert = require("node:assert/strict");
const test = require("node:test");

const userControllerPath = require.resolve("../src/controllers/userController");
const userModelPath = require.resolve("../src/models/User");
const messageModelPath = require.resolve("../src/models/Message");
const profileAvatarQueueServicePath = require.resolve("../src/services/profileAvatarQueueService");
const cacheServicePath = require.resolve("../src/services/cacheService");
const friendCacheServicePath = require.resolve("../src/services/friendCacheService");
const presenceServicePath = require.resolve("../src/services/presenceService");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearControllerCache = () => {
  for (const path of [
    userControllerPath,
    userModelPath,
    messageModelPath,
    profileAvatarQueueServicePath,
    cacheServicePath,
    friendCacheServicePath,
    presenceServicePath,
    presenceHandlerPath,
  ]) {
    delete require.cache[path];
  }
};

const createResponse = () => ({
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
});

const createIo = () => {
  const emissions = [];
  return {
    emissions,
    to(room) {
      return {
        emit(eventName, payload) {
          emissions.push({ room, eventName, payload });
        },
      };
    },
  };
};

const loadUserController = ({ presenceByUserId }) => {
  clearControllerCache();

  mockModule(userModelPath, {
    async findById(userId) {
      if (userId === "receiver-1") {
        return {
          _id: "receiver-1",
          displayName: "Receiver",
          avatar: "receiver.png",
          friendRequests: ["sender-1"],
        };
      }
      if (userId === "sender-1") {
        return {
          _id: "sender-1",
          displayName: "Sender",
          avatar: "sender.png",
          friendRequests: [],
        };
      }
      return null;
    },
    async findByIdAndUpdate() {},
  });
  mockModule(messageModelPath, {});
  mockModule(profileAvatarQueueServicePath, {
    async queueProfileAvatarProcessing() {},
  });
  mockModule(cacheServicePath, {
    invalidateUserProfile: async () => {},
    getCachedUserProfile: async () => null,
  });
  mockModule(friendCacheServicePath, {
    addFriendWriteThrough: async () => {},
    removeFriendWriteThrough: async () => {},
    getFriendIdsFromCache: async () => [],
  });
  mockModule(presenceServicePath, {
    getMultiPresence: async () => ({}),
    getUserPresence: async (userId) => presenceByUserId[userId] || { status: "offline" },
    setPresenceWriteThrough: async () => {},
  });
  mockModule(presenceHandlerPath, {
    broadcastUserStatus: async () => {},
  });

  return require(userControllerPath);
};

const acceptFriend = async ({ presenceByUserId }) => {
  const { accceptFriendRequest } = loadUserController({ presenceByUserId });
  const io = createIo();
  const req = {
    body: { senderId: "sender-1" },
    user: { id: "receiver-1" },
    app: {
      get(key) {
        return key === "socketio" ? io : undefined;
      },
    },
  };
  const res = createResponse();

  await accceptFriendRequest(req, res);

  return { res, emissions: io.emissions };
};

test("accept friend emits receiver online presence to sender when receiver is online", async () => {
  const { res, emissions } = await acceptFriend({
    presenceByUserId: {
      "receiver-1": { status: "online", lastSeen: 100 },
      "sender-1": { status: "offline", lastSeen: 90 },
    },
  });

  assert.equal(res.statusCode, 200);
  assert.ok(
    emissions.some(
      (event) =>
        event.room === "sender-1" &&
        event.eventName === "userStatusChanged" &&
        event.payload.userId === "receiver-1" &&
        event.payload.status === "online",
    ),
  );
});

test("accept friend emits sender online presence to receiver when sender is online", async () => {
  const { emissions } = await acceptFriend({
    presenceByUserId: {
      "receiver-1": { status: "offline", lastSeen: 100 },
      "sender-1": { status: "online", lastSeen: 90 },
    },
  });

  assert.ok(
    emissions.some(
      (event) =>
        event.room === "receiver-1" &&
        event.eventName === "userStatusChanged" &&
        event.payload.userId === "sender-1" &&
        event.payload.status === "online",
    ),
  );
});

test("accept friend does not emit online presence for offline users", async () => {
  const { emissions } = await acceptFriend({
    presenceByUserId: {
      "receiver-1": { status: "offline", lastSeen: 100 },
      "sender-1": { status: "offline", lastSeen: 90 },
    },
  });

  assert.deepEqual(
    emissions.filter((event) => event.eventName === "userStatusChanged"),
    [],
  );
});
