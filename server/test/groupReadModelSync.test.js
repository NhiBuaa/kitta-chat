const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const servicePath = require.resolve("../src/services/conversationReadModelService");
const conversationPath = require.resolve("../src/models/Conversation");
const participantPath = require.resolve("../src/models/ConversationParticipant");
const groupPath = require.resolve("../src/models/Group");
const userPath = require.resolve("../src/models/User");
const messagePath = require.resolve("../src/models/Message");
const msgControllerPath = require.resolve("../src/controllers/messageController");
const controllerPath = require.resolve("../src/controllers/groupController");
const envPath = require.resolve("../src/config/env");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearServiceCache = () => {
  for (const path of [
    servicePath,
    conversationPath,
    participantPath,
    groupPath,
    userPath,
    messagePath,
    msgControllerPath,
    controllerPath,
    envPath
  ]) {
    delete require.cache[path];
  }
};

const objectId = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));
const idString = (value) => value?.toString?.() ?? String(value);

// Helper to create Response object
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

function createMemoryStore({ initialGroups = [], dualWriteEnabled = true } = {}) {
  const conversations = [];
  const participants = [];
  const groups = [...initialGroups];
  const calls = [];

  const Conversation = {
    async findOne(query) {
      calls.push(["Conversation.findOne", query]);
      return conversations.find(
        (item) => idString(item.legacyConversationId) === idString(query.legacyConversationId)
      ) || null;
    },
    async create(data) {
      calls.push(["Conversation.create", data]);
      const conversation = {
        _id: objectId(String(conversations.length + 1)),
        ...data,
      };
      conversations.push(conversation);
      return conversation;
    },
    async updateOne(query, update) {
      calls.push(["Conversation.updateOne", query, update]);
      const conversation = conversations.find((c) => idString(c._id) === idString(query._id));
      if (conversation && update.$set) {
        Object.assign(conversation, update.$set);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(query) {
      calls.push(["Conversation.deleteOne", query]);
      const idx = conversations.findIndex((c) => idString(c._id) === idString(query._id));
      if (idx !== -1) conversations.splice(idx, 1);
      return { deletedCount: 1 };
    },
  };

  const ConversationParticipant = {
    async findOne(query) {
      calls.push(["ConversationParticipant.findOne", query]);
      return participants.find(
        (p) =>
          idString(p.conversationId) === idString(query.conversationId) &&
          idString(p.userId) === idString(query.userId)
      ) || null;
    },
    async create(data) {
      calls.push(["ConversationParticipant.create", data]);
      const p = {
        _id: objectId(String(participants.length + 101)),
        leftAt: null,
        joinedAt: null,
        role: null,
        ...data,
      };
      participants.push(p);
      return p;
    },
    async updateOne(query, update) {
      calls.push(["ConversationParticipant.updateOne", query, update]);
      const p = participants.find(
        (item) =>
          idString(item.conversationId) === idString(query.conversationId) &&
          idString(item.userId) === idString(query.userId)
      );
      if (!p) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) {
        Object.assign(p, update.$set);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(query, update) {
      calls.push(["ConversationParticipant.updateMany", query, update]);
      const queryUserIdStrings = (query.userId?.$nin || []).map((id) => idString(id));
      let modifiedCount = 0;
      for (const p of participants) {
        if (
          idString(p.conversationId) === idString(query.conversationId) &&
          !queryUserIdStrings.includes(idString(p.userId)) &&
          p.leftAt === query.leftAt
        ) {
          if (update.$set) {
            Object.assign(p, update.$set);
            modifiedCount++;
          }
        }
      }
      return { matchedCount: modifiedCount, modifiedCount };
    },
    async deleteMany(query) {
      calls.push(["ConversationParticipant.deleteMany", query]);
      let deletedCount = 0;
      for (let i = participants.length - 1; i >= 0; i--) {
        if (idString(participants[i].conversationId) === idString(query.conversationId)) {
          participants.splice(i, 1);
          deletedCount++;
        }
      }
      return { deletedCount };
    },
  };

  function GroupModel(data) {
    Object.assign(this, data);
    this._id = this._id || objectId("301");
    this.save = async function() {
      const idx = groups.findIndex((g) => idString(g._id) === idString(this._id));
      if (idx === -1) {
        groups.push(this);
      } else {
        groups[idx] = this;
      }
      return this;
    };
  }
  GroupModel.findById = function(groupId) {
    const g = groups.find((item) => idString(item._id) === idString(groupId));
    return {
      populate() { return this; },
      then(resolve) { resolve(g || null); }
    };
  };
  GroupModel.findByIdAndDelete = async function(groupId) {
    const idx = groups.findIndex((g) => idString(g._id) === idString(groupId));
    if (idx !== -1) groups.splice(idx, 1);
    return { _id: groupId };
  };

  const User = {
    findById(id) {
      return {
        select() {
          return {
            _id: id,
            displayName: "Test User " + idString(id),
            username: "user" + idString(id),
          };
        },
      };
    },
  };

  const Message = {
    async deleteMany(query) {
      return { deletedCount: 0 };
    },
  };

  const MessageController = {
    async createSystemMessage(groupId, text, options) {
      return {
        _id: objectId("401"),
        conversationId: groupId,
        type: "system",
        text,
        createdAt: new Date(),
      };
    },
  };

  const Env = {
    getConversationMigrationConfig() {
      return {
        conversationDualWriteEnabled: dualWriteEnabled,
      };
    },
  };

  clearServiceCache();
  mockModule(conversationPath, Conversation);
  mockModule(participantPath, ConversationParticipant);
  mockModule(groupPath, GroupModel);
  mockModule(userPath, User);
  mockModule(messagePath, Message);
  mockModule(msgControllerPath, MessageController);
  mockModule(envPath, Env);

  return {
    conversations,
    participants,
    groups,
    calls,
    service: require(servicePath),
    controller: require(controllerPath),
  };
}

const mockIo = {
  to(room) {
    return {
      emit(event, data) {}
    };
  }
};

test("syncGroupLifecycle does nothing if dual write is disabled", async () => {
  const groupId = objectId("301");
  const { service, conversations, participants, calls } = createMemoryStore({
    initialGroups: [{ _id: groupId, admin: objectId("1"), members: [objectId("1"), objectId("2")] }],
    dualWriteEnabled: false,
  });

  await service.syncGroupLifecycle(groupId, "create");

  assert.equal(conversations.length, 0);
  assert.equal(participants.length, 0);
  assert.equal(calls.length, 0);
});

test("syncGroupLifecycle create initializes conversation and participants", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");
  const { service, conversations, participants } = createMemoryStore({
    initialGroups: [{ _id: groupId, admin: adminId, members: [adminId, memberId] }],
    dualWriteEnabled: true,
  });

  await service.syncGroupLifecycle(groupId, "create");

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].kind, "group");
  assert.equal(idString(conversations[0].groupId), idString(groupId));
  assert.deepEqual(
    conversations[0].participantUserIds.map(idString).sort(),
    [idString(adminId), idString(memberId)].sort()
  );

  assert.equal(participants.length, 2);
  const adminPart = participants.find((p) => idString(p.userId) === idString(adminId));
  const memberPart = participants.find((p) => idString(p.userId) === idString(memberId));

  assert.ok(adminPart);
  assert.equal(adminPart.role, "admin");
  assert.equal(adminPart.leftAt, null);
  assert.ok(adminPart.joinedAt);

  assert.ok(memberPart);
  assert.equal(memberPart.role, "member");
  assert.equal(memberPart.leftAt, null);
  assert.ok(memberPart.joinedAt);
});

test("syncGroupLifecycle add-member updates conversation and adds/re-adds participant", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");
  const newMemberId = objectId("3");
  const groupDoc = { _id: groupId, admin: adminId, members: [adminId, memberId, newMemberId] };

  const { service, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
    groupId,
    participantUserIds: [adminId, memberId],
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: adminId,
    role: "admin",
    leftAt: null,
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: newMemberId,
    role: "member",
    leftAt: new Date("2026-06-05T08:00:00.000Z"),
  });

  await service.syncGroupLifecycle(groupId, "add-member", { memberId: newMemberId });

  assert.deepEqual(
    conversations[0].participantUserIds.map(idString).sort(),
    [idString(adminId), idString(memberId), idString(newMemberId)].sort()
  );

  const reactivatedPart = participants.find((p) => idString(p.userId) === idString(newMemberId));
  assert.equal(reactivatedPart.leftAt, null);
  assert.equal(reactivatedPart.role, "member");
  assert.ok(reactivatedPart.joinedAt);
});

test("syncGroupLifecycle remove-member marks participant as left and updates conversation", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");
  const groupDoc = { _id: groupId, admin: adminId, members: [adminId] };

  const { service, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
    groupId,
    participantUserIds: [adminId, memberId],
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: adminId,
    role: "admin",
    leftAt: null,
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: memberId,
    role: "member",
    leftAt: null,
  });

  await service.syncGroupLifecycle(groupId, "remove-member", { memberId });

  assert.deepEqual(conversations[0].participantUserIds.map(idString), [idString(adminId)]);
  const leftPart = participants.find((p) => idString(p.userId) === idString(memberId));
  assert.ok(leftPart.leftAt);
  assert.equal(leftPart.role, null);
});

test("syncGroupLifecycle delete removes conversation and participants", async () => {
  const groupId = objectId("301");
  const { service, conversations, participants } = createMemoryStore({
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
  });
  participants.push({ conversationId: objectId("501"), userId: objectId("1") });

  await service.syncGroupLifecycle(groupId, "delete");

  assert.equal(conversations.length, 0);
  assert.equal(participants.length, 0);
});

test("createGroup endpoint triggers read model sync", async () => {
  const adminId = objectId("1");
  const memberA = objectId("2");
  const memberB = objectId("3");
  const { controller, conversations, participants } = createMemoryStore({
    dualWriteEnabled: true,
  });

  const req = {
    body: {
      name: "My New Group",
      members: [idString(memberA), idString(memberB)],
    },
    user: { id: idString(adminId) },
    app: { get: () => mockIo },
  };
  const res = createResponse();

  await controller.createGroup(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].kind, "group");
  assert.equal(participants.length, 3);
});

test("addMember endpoint triggers read model sync", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");
  const newMemberId = objectId("3");

  const groupDoc = {
    _id: groupId,
    admin: adminId,
    members: [adminId, memberId],
    async save() {
      this.members.push(newMemberId);
    },
  };

  const { controller, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
    groupId,
    participantUserIds: [adminId, memberId],
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: adminId,
    role: "admin",
    leftAt: null,
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: memberId,
    role: "member",
    leftAt: null,
  });

  const req = {
    params: { groupId: idString(groupId) },
    body: { memberId: idString(newMemberId) },
    user: { id: idString(adminId) },
    app: { get: () => mockIo },
  };
  const res = createResponse();

  await controller.addMember(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(participants.length, 3);
  const newPart = participants.find((p) => idString(p.userId) === idString(newMemberId));
  assert.ok(newPart);
  assert.equal(newPart.leftAt, null);
});

test("removeMember endpoint triggers read model sync", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");

  const groupDoc = {
    _id: groupId,
    admin: adminId,
    members: [adminId, memberId],
    async save() {
      this.members = this.members.filter((m) => idString(m) !== idString(memberId));
    },
  };

  const { controller, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
    groupId,
    participantUserIds: [adminId, memberId],
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: adminId,
    role: "admin",
    leftAt: null,
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: memberId,
    role: "member",
    leftAt: null,
  });

  const req = {
    params: { groupId: idString(groupId) },
    body: { memberId: idString(memberId) },
    user: { id: idString(adminId) },
    app: { get: () => mockIo },
  };
  const res = createResponse();

  await controller.removeMember(req, res);

  assert.equal(res.statusCode, 200);
  const leftPart = participants.find((p) => idString(p.userId) === idString(memberId));
  assert.ok(leftPart.leftAt);
  assert.equal(leftPart.role, null);
});

test("transferAdmin endpoint triggers read model sync", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");

  const groupDoc = {
    _id: groupId,
    admin: adminId,
    members: [adminId, memberId],
    async save() {
      // Stub admin change
    },
  };

  const { controller, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
    groupId,
    participantUserIds: [adminId, memberId],
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: adminId,
    role: "admin",
    leftAt: null,
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: memberId,
    role: "member",
    leftAt: null,
  });

  const req = {
    params: { groupId: idString(groupId) },
    body: { newAdminId: idString(memberId) },
    user: { id: idString(adminId) },
    app: { get: () => mockIo },
  };
  const res = createResponse();

  await controller.transferAdmin(req, res);

  assert.equal(res.statusCode, 200);
  const oldAdminPart = participants.find((p) => idString(p.userId) === idString(adminId));
  const newAdminPart = participants.find((p) => idString(p.userId) === idString(memberId));
  assert.equal(oldAdminPart.role, "member");
  assert.equal(newAdminPart.role, "admin");
});

test("deleteGroup endpoint triggers read model sync", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");

  const groupDoc = {
    _id: groupId,
    admin: adminId,
    members: [adminId, memberId],
  };

  const { controller, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  conversations.push({
    _id: objectId("501"),
    kind: "group",
    legacyConversationId: idString(groupId),
    groupId,
  });
  participants.push({
    conversationId: objectId("501"),
    legacyConversationId: idString(groupId),
    userId: adminId,
  });

  const req = {
    params: { groupId: idString(groupId) },
    user: { id: idString(adminId) },
    app: { get: () => mockIo },
  };
  const res = createResponse();

  await controller.deleteGroup(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(conversations.length, 0);
  assert.equal(participants.length, 0);
});


test("syncGroupLifecycle handles members as populated objects correctly", async () => {
  const groupId = objectId("301");
  const adminId = objectId("1");
  const memberId = objectId("2");
  const groupDoc = {
    _id: groupId,
    admin: { _id: adminId },
    members: [{ _id: adminId }, { _id: memberId }],
  };

  const { service, conversations, participants } = createMemoryStore({
    initialGroups: [groupDoc],
    dualWriteEnabled: true,
  });

  await service.syncGroupLifecycle(groupId, "create");

  assert.equal(conversations.length, 1);
  assert.deepEqual(
    conversations[0].participantUserIds.map(idString).sort(),
    [idString(adminId), idString(memberId)].sort()
  );
  assert.equal(participants.length, 2);
});
