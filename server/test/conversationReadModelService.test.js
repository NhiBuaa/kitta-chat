const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const servicePath = require.resolve("../src/services/conversationReadModelService");
const conversationPath = require.resolve("../src/models/Conversation");
const participantPath = require.resolve("../src/models/ConversationParticipant");
const groupPath = require.resolve("../src/models/Group");
const messagePath = require.resolve("../src/models/Message");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearServiceCache = () => {
  for (const path of [servicePath, conversationPath, participantPath, groupPath]) {
    delete require.cache[path];
  }
};

const objectId = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));
const idString = (value) => value?.toString?.() ?? String(value);

function createMemoryStore({ groups = [] } = {}) {
  const conversations = [];
  const participants = [];
  const calls = [];

  const Conversation = {
    async findOneAndUpdate(query, update) {
      calls.push(["Conversation.findOneAndUpdate", query, update]);
      let conversation = conversations.find(
        (item) => item.legacyConversationId === query.legacyConversationId,
      );
      if (!conversation) {
        conversation = {
          _id: objectId(String(conversations.length + 1)),
          ...update.$setOnInsert,
        };
        conversations.push(conversation);
      }
      Object.assign(conversation, update.$set);
      return conversation;
    },
  };

  const ConversationParticipant = {
    async findOne(query) {
      calls.push(["ConversationParticipant.findOne", query]);
      return participants.find(
        (participant) =>
          idString(participant.conversationId) === idString(query.conversationId) &&
          idString(participant.userId) === idString(query.userId),
      ) || null;
    },
    async create(data) {
      calls.push(["ConversationParticipant.create", data]);
      const participant = {
        _id: objectId(String(participants.length + 101)),
        role: null,
        joinedAt: null,
        leftAt: null,
        state: {
          pinnedAt: null,
          archivedAt: null,
          mutedUntil: null,
          deletedAt: null,
          lastReadMessageId: null,
          lastReadAt: null,
          unreadCount: 0,
          lastMessageId: null,
          lastMessageAt: null,
          ...(data.state || {}),
        },
        settings: {
          notifications: "default",
          customTitle: null,
          ...(data.settings || {}),
        },
        ...data,
      };
      participants.push(participant);
      return participant;
    },
    async updateOne(query, update) {
      calls.push(["ConversationParticipant.updateOne", query, update]);
      const participant = participants.find(
        (item) =>
          idString(item.conversationId) === idString(query.conversationId) &&
          idString(item.userId) === idString(query.userId),
      );
      if (!participant) return { matchedCount: 0, modifiedCount: 0 };
      if (update.$set) {
        for (const [path, value] of Object.entries(update.$set)) {
          const segments = path.split(".");
          let target = participant;
          while (segments.length > 1) {
            target = target[segments.shift()];
          }
          target[segments[0]] = value;
        }
      }
      if (update.$inc?.["state.unreadCount"]) {
        participant.state.unreadCount += update.$inc["state.unreadCount"];
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };

  const Group = {
    async findById(groupId) {
      calls.push(["Group.findById", groupId]);
      return groups.find((group) => idString(group._id) === idString(groupId)) || null;
    },
  };

  clearServiceCache();
  mockModule(conversationPath, Conversation);
  mockModule(participantPath, ConversationParticipant);
  mockModule(groupPath, Group);

  return {
    conversations,
    participants,
    calls,
    service: require(servicePath),
  };
}

function directMessage(overrides = {}) {
  return {
    _id: objectId("201"),
    conversationId: `${objectId("a")}_${objectId("b")}`,
    sender: objectId("a"),
    receiver: objectId("b"),
    createdAt: new Date("2026-06-05T08:00:00.000Z"),
    ...overrides,
  };
}

function groupMessage({ groupId = objectId("301"), sender = objectId("a"), createdAt } = {}) {
  return {
    _id: objectId("202"),
    conversationId: groupId.toString(),
    sender,
    receiver: groupId,
    createdAt: createdAt || new Date("2026-06-05T09:00:00.000Z"),
  };
}

test("ensureConversationForConfirmedMessage creates direct conversation from first confirmed message", async () => {
  const { service, conversations, participants } = createMemoryStore();
  const message = directMessage();

  await service.ensureConversationForConfirmedMessage(message);

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].kind, "direct");
  assert.equal(conversations[0].legacyConversationId, message.conversationId);
  assert.equal(conversations[0].directKey, message.conversationId);
  assert.equal(participants.length, 2);
});

test("ensureConversationForConfirmedMessage creates group conversation from first confirmed message", async () => {
  const groupId = objectId("301");
  const senderId = objectId("a");
  const memberId = objectId("b");
  const { service, conversations, participants } = createMemoryStore({
    groups: [{ _id: groupId, admin: senderId, members: [senderId, memberId] }],
  });

  await service.ensureConversationForConfirmedMessage(groupMessage({ groupId, sender: senderId }));

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].kind, "group");
  assert.equal(idString(conversations[0].groupId), groupId.toString());
  assert.deepEqual(
    participants.map((participant) => idString(participant.userId)).sort(),
    [senderId.toString(), memberId.toString()].sort(),
  );
  assert.equal(participants.find((participant) => idString(participant.userId) === senderId.toString()).role, "admin");
});

test("ensureConversationForConfirmedMessage is idempotent for repeated calls", async () => {
  const { service, conversations, participants } = createMemoryStore();
  const message = directMessage();

  await service.ensureConversationForConfirmedMessage(message);
  await service.ensureConversationForConfirmedMessage(message);

  const recipient = participants.find((participant) => idString(participant.userId) === idString(message.receiver));
  assert.equal(conversations.length, 1);
  assert.equal(participants.length, 2);
  assert.equal(recipient.state.unreadCount, 1);
});

test("ensureConversationForConfirmedMessage updates global and participant last message fields", async () => {
  const { service, conversations, participants } = createMemoryStore();
  const message = directMessage({
    _id: objectId("211"),
    createdAt: new Date("2026-06-05T10:00:00.000Z"),
  });

  await service.ensureConversationForConfirmedMessage(message);

  assert.equal(idString(conversations[0].lastMessageId), idString(message._id));
  assert.equal(conversations[0].lastMessageAt.toISOString(), message.createdAt.toISOString());
  for (const participant of participants) {
    assert.equal(idString(participant.state.lastMessageId), idString(message._id));
    assert.equal(participant.state.lastMessageAt.toISOString(), message.createdAt.toISOString());
  }
});

test("ensureConversationForConfirmedMessage increments unread only for recipients", async () => {
  const { service, participants } = createMemoryStore();
  const message = directMessage();

  await service.ensureConversationForConfirmedMessage(message);

  const sender = participants.find((participant) => idString(participant.userId) === idString(message.sender));
  const recipient = participants.find((participant) => idString(participant.userId) === idString(message.receiver));
  assert.equal(sender.state.unreadCount, 0);
  assert.equal(recipient.state.unreadCount, 1);
});

test("ensureConversationForConfirmedMessage respects deleted participant visibility", async () => {
  const { service, participants } = createMemoryStore();
  const message = directMessage();

  await service.ensureConversationForConfirmedMessage(message);
  const recipient = participants.find((participant) => idString(participant.userId) === idString(message.receiver));
  recipient.state.deletedAt = new Date("2026-06-05T08:30:00.000Z");

  await service.ensureConversationForConfirmedMessage(
    directMessage({ _id: objectId("212"), createdAt: new Date("2026-06-05T09:00:00.000Z") }),
  );

  assert.equal(recipient.state.unreadCount, 1);
  assert.equal(idString(recipient.state.lastMessageId), idString(message._id));
});

test("ensureConversationForConfirmedMessage reuses existing participant rows", async () => {
  const { service, participants } = createMemoryStore();
  const message = directMessage();

  await service.ensureConversationForConfirmedMessage(message);
  const existingParticipantIds = participants.map((participant) => idString(participant._id));
  await service.ensureConversationForConfirmedMessage(
    directMessage({ _id: objectId("213"), createdAt: new Date("2026-06-05T11:00:00.000Z") }),
  );

  assert.deepEqual(participants.map((participant) => idString(participant._id)), existingParticipantIds);
});

test("ensureConversationForConfirmedMessage skips duplicate or unconfirmed messages", async () => {
  const { service, conversations, participants } = createMemoryStore();

  await service.ensureConversationForConfirmedMessage(null);
  await service.ensureConversationForConfirmedMessage(directMessage({ isDuplicate: true }));

  assert.equal(conversations.length, 0);
  assert.equal(participants.length, 0);
});

test("ensureConversationForConfirmedMessage does not change Message schema", async () => {
  const Message = require(messagePath);
  const beforePaths = Object.keys(Message.schema.paths).sort();
  const { service } = createMemoryStore();

  await service.ensureConversationForConfirmedMessage(directMessage());

  const afterPaths = Object.keys(Message.schema.paths).sort();
  assert.deepEqual(afterPaths, beforePaths);
  assert.equal(Message.schema.path("conversationObjectId"), undefined);
});
