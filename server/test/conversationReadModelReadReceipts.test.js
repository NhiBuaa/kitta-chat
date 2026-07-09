const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const servicePath = require.resolve("../src/services/conversationReadModelService");
const conversationParticipantPath = require.resolve("../src/models/ConversationParticipant");
const messageHandlerPath = require.resolve("../src/socket/handlers/messageHandler");
const messageModelPath = require.resolve("../src/models/Message");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearCache = () => {
  delete require.cache[servicePath];
  delete require.cache[conversationParticipantPath];
  delete require.cache[messageHandlerPath];
  delete require.cache[messageModelPath];
};

const objectId = (hex) => new mongoose.Types.ObjectId(hex.padStart(24, "0"));

test("markConversationAsRead resets unread count and updates read timestamps", async () => {
  clearCache();
  const calls = [];
  mockModule(conversationParticipantPath, {
    updateOne(query, update) {
      calls.push(["ConversationParticipant.updateOne", query, update]);
      return { nModified: 1 };
    },
  });

  const { markConversationAsRead } = require(servicePath);
  const userId = objectId("a");
  const legacyConversationId = "user-a_user-b";
  const lastReadMessageId = objectId("101");
  const lastReadAt = new Date("2026-06-05T12:00:00.000Z");

  const result = await markConversationAsRead({
    userId,
    legacyConversationId,
    lastReadMessageId,
    lastReadAt,
  });

  assert.ok(result);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], {
    legacyConversationId,
    userId,
  });
  assert.deepEqual(calls[0][2], {
    $set: {
      "state.unreadCount": 0,
      "state.lastReadMessageId": lastReadMessageId,
      "state.lastReadAt": lastReadAt,
    },
  });
});

test("socket markRead event triggers markConversationAsRead for direct chat", async () => {
  clearCache();
  const socketEvents = {};
  const socket = {
    id: "socket-1",
    on(event, handler) {
      socketEvents[event] = handler;
    },
  };

  const updateManyCalls = [];
  mockModule(messageModelPath, {
    async updateMany(query, update) {
      updateManyCalls.push(["Message.updateMany", query, update]);
    },
  });

  const readModelCalls = [];
  mockModule(servicePath, {
    async markConversationAsRead(payload) {
      readModelCalls.push(payload);
      return { nModified: 1 };
    },
  });

  const ioEmitCalls = [];
  const io = {
    to(room) {
      return {
        emit(event, payload) {
          ioEmitCalls.push([room, event, payload]);
        },
      };
    },
  };

  const { createRegisterMessageHandlers } = require(messageHandlerPath);
  const register = createRegisterMessageHandlers();
  register(socket, io);

  const handler = socketEvents.markRead;
  assert.ok(handler);

  await handler({
    isGroup: false,
    senderId: "user-b",
    receiverId: "user-a",
  });

  assert.equal(updateManyCalls.length, 1);
  assert.equal(readModelCalls.length, 1);
  assert.equal(readModelCalls[0].userId.toString(), "user-a");
  assert.equal(readModelCalls[0].legacyConversationId, "user-a_user-b");
});

test("socket markRead event triggers markConversationAsRead for group chat", async () => {
  clearCache();
  const socketEvents = {};
  const socket = {
    id: "socket-1",
    on(event, handler) {
      socketEvents[event] = handler;
    },
  };

  const updateManyCalls = [];
  mockModule(messageModelPath, {
    async updateMany(query, update) {
      updateManyCalls.push(["Message.updateMany", query, update]);
    },
  });

  const readModelCalls = [];
  mockModule(servicePath, {
    async markConversationAsRead(payload) {
      readModelCalls.push(payload);
      return { nModified: 1 };
    },
  });

  const ioEmitCalls = [];
  const io = {
    to(room) {
      return {
        emit(event, payload) {
          ioEmitCalls.push([room, event, payload]);
        },
      };
    },
  };

  const { createRegisterMessageHandlers } = require(messageHandlerPath);
  const register = createRegisterMessageHandlers();
  register(socket, io);

  const handler = socketEvents.markRead;
  assert.ok(handler);

  await handler({
    isGroup: true,
    groupId: "group-1",
    readerId: "user-a",
  });

  assert.equal(updateManyCalls.length, 1);
  assert.equal(readModelCalls.length, 1);
  assert.equal(readModelCalls[0].userId.toString(), "user-a");
  assert.equal(readModelCalls[0].legacyConversationId, "group-1");
});
