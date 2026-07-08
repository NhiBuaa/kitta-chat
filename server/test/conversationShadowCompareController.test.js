const assert = require("node:assert/strict");
const test = require("node:test");

const userControllerPath = require.resolve("../src/controllers/userController");
const groupControllerPath = require.resolve("../src/controllers/groupController");
const userModelPath = require.resolve("../src/models/User");
const messageModelPath = require.resolve("../src/models/Message");
const groupModelPath = require.resolve("../src/models/Group");
const configPath = require.resolve("../src/config/env");
const shadowServicePath = require.resolve("../src/services/conversationShadowCompareService");
const sidebarCandidateServicePath = require.resolve("../src/services/conversationSidebarCandidateService");
const cacheServicePath = require.resolve("../src/services/cacheService");
const friendCacheServicePath = require.resolve("../src/services/friendCacheService");
const presenceServicePath = require.resolve("../src/services/presenceService");
const conversationCacheServicePath = require.resolve("../src/services/conversationCacheService");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");
const profileAvatarQueueServicePath = require.resolve("../src/services/profileAvatarQueueService");
const messageControllerPath = require.resolve("../src/controllers/messageController");
const getSafeUserNamePath = require.resolve("../src/utils/getSafeUserName");

const paths = [
  userControllerPath,
  groupControllerPath,
  userModelPath,
  messageModelPath,
  groupModelPath,
  configPath,
  shadowServicePath,
  sidebarCandidateServicePath,
  cacheServicePath,
  friendCacheServicePath,
  presenceServicePath,
  conversationCacheServicePath,
  presenceHandlerPath,
  profileAvatarQueueServicePath,
  messageControllerPath,
  getSafeUserNamePath,
];

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearCache = () => {
  for (const path of paths) delete require.cache[path];
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

const createUserQuery = (rows) => ({
  select() {
    return rows;
  },
});

const createGroupQuery = (rows) => ({
  populate() {
    return this;
  },
  async sort() {
    return rows;
  },
});

const installSharedUserControllerMocks = ({
  shadowEnabled,
  shadowCalls,
  shadowFailure,
  sidebarReadModelEnabled = false,
  sidebarCandidates = [],
  sidebarCandidateFailure = false,
  sidebarCandidateCalls = [],
}) => {
  mockModule(configPath, {
    getConversationMigrationConfig: () => ({
      conversationShadowCompareEnabled: shadowEnabled,
      conversationSidebarReadModelEnabled: sidebarReadModelEnabled,
    }),
  });
  mockModule(shadowServicePath, {
    async compareSidebarForUser(payload) {
      shadowCalls.push(payload);
      if (shadowFailure) throw new Error("shadow failed");
      return { mismatches: [] };
    },
  });
  mockModule(sidebarCandidateServicePath, {
    async getSidebarCandidatesForUser(payload) {
      sidebarCandidateCalls.push(payload);
      if (sidebarCandidateFailure) throw new Error("candidate failed");
      return sidebarCandidates;
    },
  });
  mockModule(cacheServicePath, { invalidateUserProfile() {}, getCachedUserProfile: async () => null });
  mockModule(friendCacheServicePath, {
    addFriendWriteThrough: async () => ({}),
    removeFriendWriteThrough: async () => ({}),
    getFriendIdsFromCache: async () => ["507f1f77bcf86cd799439012"],
  });
  mockModule(presenceServicePath, {
    getMultiPresence: async () => ({}),
    getUserPresence: async () => ({}),
    setPresenceWriteThrough: async () => ({}),
  });
  mockModule(conversationCacheServicePath, {
    getRecentConversations: async () => [
      "507f1f77bcf86cd799439011_507f1f77bcf86cd799439012",
    ],
  });
  mockModule(presenceHandlerPath, { broadcastUserStatus() {} });
  mockModule(profileAvatarQueueServicePath, { queueProfileAvatarProcessing: async () => ({}) });
};

const loadUserController = ({
  shadowEnabled,
  shadowCalls,
  shadowFailure = false,
  sidebarReadModelEnabled = false,
  sidebarCandidates = [],
  sidebarCandidateFailure = false,
  sidebarCandidateCalls = [],
}) => {
  clearCache();
  installSharedUserControllerMocks({
    shadowEnabled,
    shadowCalls,
    shadowFailure,
    sidebarReadModelEnabled,
    sidebarCandidates,
    sidebarCandidateFailure,
    sidebarCandidateCalls,
  });
  mockModule(userModelPath, {
    findById() {
      return {
        select: async () => ({ friends: ["507f1f77bcf86cd799439012"], friendRequests: [] }),
      };
    },
    find() {
      return createUserQuery([
        {
          _id: { toString: () => "507f1f77bcf86cd799439012" },
          friends: ["507f1f77bcf86cd799439011"],
          friendRequests: [],
          toObject() {
            return {
              _id: "507f1f77bcf86cd799439012",
              displayName: "Bob",
              friends: this.friends,
              friendRequests: this.friendRequests,
            };
          },
        },
      ]);
    },
  });
  mockModule(messageModelPath, {
    async aggregate(pipeline) {
      if (pipeline.some((stage) => stage.$match?.isRead === false)) {
        return [{ _id: "507f1f77bcf86cd799439011_507f1f77bcf86cd799439012", count: 1 }];
      }
      return [
        {
          _id: "507f1f77bcf86cd799439011_507f1f77bcf86cd799439012",
          lastMsg: {
            _id: "507f1f77bcf86cd799439099",
            text: "hello",
            sender: "507f1f77bcf86cd799439012",
            createdAt: new Date("2026-06-05T08:00:00.000Z"),
            isRead: false,
          },
        },
      ];
    },
  });
  return require(userControllerPath);
};

const loadGroupController = ({
  shadowEnabled,
  shadowCalls,
  shadowFailure = false,
  sidebarReadModelEnabled = false,
  sidebarCandidates = [],
  sidebarCandidateFailure = false,
  sidebarCandidateCalls = [],
}) => {
  clearCache();
  mockModule(configPath, {
    getConversationMigrationConfig: () => ({
      conversationShadowCompareEnabled: shadowEnabled,
      conversationSidebarReadModelEnabled: sidebarReadModelEnabled,
    }),
  });
  mockModule(shadowServicePath, {
    async compareSidebarForUser(payload) {
      shadowCalls.push(payload);
      if (shadowFailure) throw new Error("shadow failed");
      return { mismatches: [] };
    },
  });
  mockModule(sidebarCandidateServicePath, {
    async getSidebarCandidatesForUser(payload) {
      sidebarCandidateCalls.push(payload);
      if (sidebarCandidateFailure) throw new Error("candidate failed");
      return sidebarCandidates;
    },
  });
  mockModule(groupModelPath, {
    find() {
      return createGroupQuery([
        {
          _id: { toString: () => "507f1f77bcf86cd799439022" },
          name: "Group",
          members: ["507f1f77bcf86cd799439011"],
          toObject() {
            return { _id: "507f1f77bcf86cd799439022", name: "Group", members: this.members };
          },
        },
      ]);
    },
  });
  mockModule(userModelPath, {});
  mockModule(messageModelPath, {
    async aggregate(pipeline) {
      if (pipeline.some((stage) => stage.$match?.readBy)) {
        return [{ _id: "507f1f77bcf86cd799439022", count: 1 }];
      }
      return [
        {
          _id: "507f1f77bcf86cd799439022",
          lastMsg: {
            _id: "507f1f77bcf86cd799439088",
            conversationId: "507f1f77bcf86cd799439022",
            type: "text",
            text: "group hello",
            sender: "507f1f77bcf86cd799439012",
            createdAt: new Date("2026-06-05T08:00:00.000Z"),
            readBy: [],
          },
        },
      ];
    },
  });
  mockModule(messageControllerPath, { createSystemMessage: async () => null });
  mockModule(getSafeUserNamePath, () => "Test User");
  return require(groupControllerPath);
};

test("direct sidebar does not call shadow compare when flag is off", async () => {
  const shadowCalls = [];
  const { getSidebarUsers } = loadUserController({ shadowEnabled: false, shadowCalls });
  const res = createResponse();

  await getSidebarUsers({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(shadowCalls.length, 0);
});

test("direct sidebar calls shadow compare when flag is on and keeps legacy response", async () => {
  const shadowCalls = [];
  const { getSidebarUsers } = loadUserController({ shadowEnabled: true, shadowCalls });
  const res = createResponse();

  await getSidebarUsers({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.users[0].displayName, "Bob");
  assert.equal(shadowCalls.length, 1);
  assert.equal(shadowCalls[0].scope, "direct");
  assert.equal(shadowCalls[0].legacyItems, res.body.users);
});

test("direct sidebar uses read-model candidates when read switch flag is on", async () => {
  const shadowCalls = [];
  const sidebarCandidateCalls = [];
  const { getSidebarUsers } = loadUserController({
    shadowEnabled: false,
    shadowCalls,
    sidebarReadModelEnabled: true,
    sidebarCandidateCalls,
    sidebarCandidates: [{
      kind: "direct",
      conversationId: "507f1f77bcf86cd799439011_507f1f77bcf86cd799439012",
      legacyConversationId: "507f1f77bcf86cd799439011_507f1f77bcf86cd799439012",
      unreadCount: 1,
      hasUnread: true,
      lastMessageId: "507f1f77bcf86cd799439099",
      lastMessageAt: new Date("2026-06-05T08:00:00.000Z").toISOString(),
    }],
  });
  const res = createResponse();

  await getSidebarUsers({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.users[0].displayName, "Bob");
  assert.equal(res.body.users[0].lastMessage.messageId, "507f1f77bcf86cd799439099");
  assert.equal(res.body.users[0].hasUnread, true);
  assert.equal(res.body.users[0].unreadCount, 1);
  assert.equal(JSON.stringify(res.body.users).includes("conversationId"), false);
  assert.equal(sidebarCandidateCalls.length, 1);
});

test("direct sidebar falls back to legacy response when read-model candidates fail", async () => {
  const shadowCalls = [];
  const sidebarCandidateCalls = [];
  const { getSidebarUsers } = loadUserController({
    shadowEnabled: false,
    shadowCalls,
    sidebarReadModelEnabled: true,
    sidebarCandidateCalls,
    sidebarCandidateFailure: true,
  });
  const res = createResponse();

  await getSidebarUsers({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.users[0].displayName, "Bob");
  assert.equal(res.body.users[0].lastMessage.messageId, "507f1f77bcf86cd799439099");
  assert.equal(sidebarCandidateCalls.length, 1);
});

test("group sidebar calls shadow compare when flag is on and keeps legacy response", async () => {
  const shadowCalls = [];
  const { getMyGroups } = loadGroupController({ shadowEnabled: true, shadowCalls });
  const res = createResponse();

  await getMyGroups({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.groups[0].name, "Group");
  assert.equal(shadowCalls.length, 1);
  assert.equal(shadowCalls[0].scope, "group");
  assert.equal(shadowCalls[0].legacyItems, res.body.groups);
});

test("shadow compare failures are swallowed for sidebar responses", async () => {
  const shadowCalls = [];
  const { getSidebarUsers } = loadUserController({
    shadowEnabled: true,
    shadowCalls,
    shadowFailure: true,
  });
  const res = createResponse();

  await getSidebarUsers({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(shadowCalls.length, 1);
});

test("group sidebar uses read-model candidates when read switch flag is on", async () => {
  const shadowCalls = [];
  const sidebarCandidateCalls = [];
  const { getMyGroups } = loadGroupController({
    shadowEnabled: false,
    shadowCalls,
    sidebarReadModelEnabled: true,
    sidebarCandidateCalls,
    sidebarCandidates: [{
      kind: "group",
      conversationId: "507f1f77bcf86cd799439022",
      legacyConversationId: "507f1f77bcf86cd799439022",
      unreadCount: 2,
      hasUnread: true,
      lastMessageId: "507f1f77bcf86cd799439088",
      lastMessageAt: new Date("2026-06-05T08:00:00.000Z").toISOString(),
    }],
  });
  const res = createResponse();

  await getMyGroups({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.groups[0].name, "Group");
  assert.equal(res.body.groups[0].unreadCount, 2);
  assert.equal(res.body.groups[0].hasUnread, true);
  assert.equal(sidebarCandidateCalls.length, 1);
});

test("group sidebar falls back to legacy response when read-model candidates fail", async () => {
  const shadowCalls = [];
  const sidebarCandidateCalls = [];
  const { getMyGroups } = loadGroupController({
    shadowEnabled: false,
    shadowCalls,
    sidebarReadModelEnabled: true,
    sidebarCandidateCalls,
    sidebarCandidateFailure: true,
  });
  const res = createResponse();

  await getMyGroups({ user: { id: "507f1f77bcf86cd799439011" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.groups[0].name, "Group");
  assert.equal(res.body.groups[0].unreadCount, 1); // fallback returns 1 from mock legacy Message.aggregate
  assert.equal(sidebarCandidateCalls.length, 1);
});