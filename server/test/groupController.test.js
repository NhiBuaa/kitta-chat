const assert = require("node:assert/strict");
const test = require("node:test");

const groupControllerPath = require.resolve("../src/controllers/groupController");
const groupModelPath = require.resolve("../src/models/Group");
const userModelPath = require.resolve("../src/models/User");
const messageModelPath = require.resolve("../src/models/Message");
const messageControllerPath = require.resolve("../src/controllers/messageController");
const getSafeUserNamePath = require.resolve("../src/utils/getSafeUserName");

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
    groupControllerPath,
    groupModelPath,
    userModelPath,
    messageModelPath,
    messageControllerPath,
    getSafeUserNamePath,
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

const createGroupQuery = (groups) => ({
  populate() {
    return this;
  },
  async sort() {
    return groups;
  },
});

const loadGroupController = ({ groups, aggregateResults, aggregateCalls }) => {
  clearControllerCache();

  mockModule(groupModelPath, {
    find(query) {
      assert.deepEqual(query, { members: "507f1f77bcf86cd799439011" });
      return createGroupQuery(groups);
    },
  });
  mockModule(userModelPath, {});
  mockModule(messageModelPath, {
    async aggregate(pipeline) {
      aggregateCalls.push(pipeline);
      return aggregateResults.shift() || [];
    },
  });
  mockModule(messageControllerPath, {
    createSystemMessage: async () => null,
  });
  mockModule(getSafeUserNamePath, () => "Test User");

  return require(groupControllerPath);
};

const loadGroupActionController = ({ group, systemMessage, user }) => {
  clearControllerCache();

  mockModule(groupModelPath, {
    async findById(id) {
      assert.equal(id, "group-1");
      return group;
    },
  });
  mockModule(userModelPath, {
    findById(id) {
      assert.equal(id, "user-1");
      return {
        async select() {
          return user;
        },
      };
    },
  });
  mockModule(messageModelPath, {});
  mockModule(messageControllerPath, {
    createSystemMessage: async (groupId) => {
      assert.equal(groupId, "group-1");
      return systemMessage;
    },
  });
  mockModule(getSafeUserNamePath, (value) => value.displayName);

  return require(groupControllerPath);
};

const createIoHarness = () => {
  const emissions = [];
  return {
    emissions,
    io: {
      to(room) {
        return {
          emit(eventName, payload) {
            emissions.push({ room, eventName, payload });
          },
        };
      },
    },
  };
};

test("getMyGroups returns lastMessage and unread counts for group sidebar refresh", async () => {
  const aggregateCalls = [];
  const groups = [
    {
      _id: "group-1",
      name: "Project Group",
      admin: "admin-1",
      members: ["507f1f77bcf86cd799439011", "friend-1", "friend-2"],
      avatar: "group.png",
      createdAt: new Date("2026-05-18T08:00:00.000Z"),
      updatedAt: new Date("2026-05-18T08:30:00.000Z"),
      toObject() {
        return {
          _id: this._id,
          name: this.name,
          admin: this.admin,
          members: this.members,
          avatar: this.avatar,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        };
      },
    },
  ];
  const aggregateResults = [
    [
      {
        _id: "group-1",
        lastMsg: {
          _id: "message-1",
          conversationId: "group-1",
          type: "text",
          text: "Latest group message",
          sender: "friend-1",
          createdAt: new Date("2026-05-18T09:00:00.000Z"),
          isRead: false,
          readBy: ["friend-2"],
        },
      },
    ],
    [{ _id: "group-1", count: 2 }],
  ];

  const { getMyGroups } = loadGroupController({
    groups,
    aggregateResults,
    aggregateCalls,
  });
  const req = { user: { id: "507f1f77bcf86cd799439011" } };
  const res = createResponse();

  await getMyGroups(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.groups.length, 1);
  assert.equal(res.body.groups[0]._id, "group-1");
  assert.equal(res.body.groups[0].name, "Project Group");
  assert.equal(res.body.groups[0].lastMessage.content, "Latest group message");
  assert.equal(res.body.groups[0].lastMessage.text, "Latest group message");
  assert.equal(res.body.groups[0].lastMessage.type, "text");
  assert.equal(res.body.groups[0].lastMessage.sender, "friend-1");
  assert.equal(res.body.groups[0].lastMessage.senderId, "friend-1");
  assert.equal(res.body.groups[0].lastMessage.messageId, "message-1");
  assert.deepEqual(res.body.groups[0].lastMessage.readBy, ["friend-2"]);
  assert.equal(res.body.groups[0].hasUnread, true);
  assert.equal(res.body.groups[0].unreadCount, 2);
});

test("getMyGroups unread aggregation uses group readBy state and counts system messages", async () => {
  const aggregateCalls = [];
  const aggregateResults = [[], []];
  const { getMyGroups } = loadGroupController({
    groups: [
      {
        _id: "group-1",
        toObject() {
          return { _id: "group-1", name: "Project Group", members: [] };
        },
      },
    ],
    aggregateResults,
    aggregateCalls,
  });
  const req = { user: { id: "507f1f77bcf86cd799439011" } };
  const res = createResponse();

  await getMyGroups(req, res);

  const unreadMatch = aggregateCalls[1][0].$match;
  assert.deepEqual(unreadMatch.conversationId, { $in: ["group-1"] });
  assert.equal(unreadMatch.type, undefined);
  assert.equal(String(unreadMatch.sender.$ne), "507f1f77bcf86cd799439011");
  assert.equal(String(unreadMatch.readBy.$ne), "507f1f77bcf86cd799439011");

  assert.equal(res.body.groups[0].lastMessage, null);
  assert.equal(res.body.groups[0].hasUnread, false);
  assert.equal(res.body.groups[0].unreadCount, 0);
});

test("getMyGroups treats unread system messages as unread last messages", async () => {
  const aggregateCalls = [];
  const groups = [
    {
      _id: "group-1",
      toObject() {
        return { _id: "group-1", name: "Project Group", members: [] };
      },
    },
  ];
  const aggregateResults = [
    [
      {
        _id: "group-1",
        lastMsg: {
          _id: "system-message-1",
          conversationId: "group-1",
          type: "system",
          text: "Bob đổi tên nhóm",
          sender: null,
          createdAt: new Date("2026-05-18T11:00:00.000Z"),
          readBy: [],
        },
      },
    ],
    [{ _id: "group-1", count: 1 }],
  ];
  const { getMyGroups } = loadGroupController({
    groups,
    aggregateResults,
    aggregateCalls,
  });
  const req = { user: { id: "507f1f77bcf86cd799439011" } };
  const res = createResponse();

  await getMyGroups(req, res);

  assert.equal(res.body.groups[0].lastMessage.type, "system");
  assert.equal(res.body.groups[0].lastMessage.content, "Bob đổi tên nhóm");
  assert.equal(res.body.groups[0].lastMessage.isRead, false);
  assert.equal(res.body.groups[0].hasUnread, true);
  assert.equal(res.body.groups[0].unreadCount, 1);
});

test("renameGroup emits a complete realtime system message payload", async () => {
  const { emissions, io } = createIoHarness();
  const { renameGroup } = loadGroupActionController({
    group: {
      _id: "group-1",
      name: "Old Group",
      admin: { toString: () => "user-1" },
      members: [{ toString: () => "user-1" }, { toString: () => "user-2" }],
      avatar: "old.png",
      async save() {},
    },
    systemMessage: {
      _id: "system-message-1",
      text: "Alice đổi tên nhóm từ \"Old Group\" thành \"New Group\"",
      createdAt: new Date("2026-05-18T12:00:00.000Z"),
    },
    user: {
      _id: "user-1",
      displayName: "Alice",
    },
  });
  const req = {
    params: { groupId: "group-1" },
    body: { newName: "New Group" },
    user: { id: "user-1" },
    app: { get: () => io },
  };
  const res = createResponse();

  await renameGroup(req, res);

  const messageEmission = emissions.find((item) => item.eventName === "getMessage");
  assert.deepEqual(messageEmission, {
    room: "group-1",
    eventName: "getMessage",
    payload: {
      _id: "system-message-1",
      conversationId: "group-1",
      senderId: null,
      sender: null,
      receiverId: "group-1",
      receiver: "group-1",
      text: "Alice đổi tên nhóm từ \"Old Group\" thành \"New Group\"",
      type: "system",
      createdAt: new Date("2026-05-18T12:00:00.000Z"),
      isGroup: true,
    },
  });
});
