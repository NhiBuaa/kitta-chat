const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const preferenceServicePath = require.resolve("../src/services/preferenceService");
const conversationPath = require.resolve("../src/models/Conversation");
const participantPath = require.resolve("../src/models/ConversationParticipant");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

let mockConversations = [];
let mockParticipants = [];

const ConversationMock = {
  findOne: async (query) => {
    return mockConversations.find(c => c.legacyConversationId === query.legacyConversationId) || null;
  },
  create: async (data) => {
    const newConv = {
      _id: new mongoose.Types.ObjectId(),
      ...data,
    };
    mockConversations.push(newConv);
    return newConv;
  }
};

const ConversationParticipantMock = {
  findOne: (query) => {
    const participant = mockParticipants.find(p => 
      p.legacyConversationId === query.legacyConversationId &&
      p.userId.toString() === query.userId.toString()
    );
    return {
      lean: async () => participant || null
    };
  },
  findOneAndUpdate: async (query, update, options) => {
    let participant = mockParticipants.find(p => 
      p.legacyConversationId === query.legacyConversationId &&
      p.userId.toString() === query.userId.toString()
    );

    const updateDoc = update.$set || {};

    if (!participant && options.upsert) {
      participant = {
        _id: new mongoose.Types.ObjectId(),
        legacyConversationId: query.legacyConversationId,
        userId: query.userId,
        state: {
          pinnedAt: null,
          mutedUntil: null,
        },
        settings: {
          customTitle: null,
        },
        ...update.$setOnInsert,
      };
      mockParticipants.push(participant);
    }

    if (participant) {
      if (updateDoc["state.pinnedAt"] !== undefined) {
        participant.state.pinnedAt = updateDoc["state.pinnedAt"];
      }
      if (updateDoc["state.mutedUntil"] !== undefined) {
        participant.state.mutedUntil = updateDoc["state.mutedUntil"];
      }
      if (updateDoc["settings.customTitle"] !== undefined) {
        participant.settings.customTitle = updateDoc["settings.customTitle"];
      }
    }

    return participant;
  }
};

// Clear cache before requiring
delete require.cache[preferenceServicePath];
delete require.cache[conversationPath];
delete require.cache[participantPath];

mockModule(conversationPath, ConversationMock);
mockModule(participantPath, ConversationParticipantMock);

const preferenceService = require("../src/services/preferenceService");

test("getPreferences - returns default preferences when participant not found", async () => {
  const userId = new mongoose.Types.ObjectId();
  const conversationId = "conv-123";

  mockParticipants = [];

  const prefs = await preferenceService.getPreferences(userId, conversationId);

  assert.equal(prefs.isPinned, false);
  assert.equal(prefs.isMuted, false);
  assert.equal(prefs.mutedUntil, null);
  assert.equal(prefs.customTitle, null);
});

test("getPreferences - returns correct stored preferences", async () => {
  const userId = new mongoose.Types.ObjectId();
  const conversationId = "conv-123";

  const pinnedAt = new Date();
  const mutedUntil = new Date(Date.now() + 60000); // mute trong 1 phút nữa

  mockParticipants = [{
    legacyConversationId: conversationId,
    userId,
    state: {
      pinnedAt,
      mutedUntil,
    },
    settings: {
      customTitle: "My Custom Name",
    }
  }];

  const prefs = await preferenceService.getPreferences(userId, conversationId);

  assert.equal(prefs.isPinned, true);
  assert.equal(prefs.isMuted, true);
  assert.equal(prefs.mutedUntil.getTime(), mutedUntil.getTime());
  assert.equal(prefs.customTitle, "My Custom Name");
});

test("updatePreferences - performs upsert and updates fields correctly", async () => {
  const userId = new mongoose.Types.ObjectId();
  const conversationId = "user-1_user-2"; // direct conversation

  mockConversations = [];
  mockParticipants = [];

  // Update pin
  const res1 = await preferenceService.updatePreferences(userId, conversationId, {
    isPinned: true,
  });

  assert.equal(res1.isPinned, true);
  assert.ok(mockParticipants[0].state.pinnedAt);
  assert.equal(mockConversations.length, 1); // Đã tạo Conversation do chưa có

  // Update mute và custom title
  const res2 = await preferenceService.updatePreferences(userId, conversationId, {
    isMuted: true,
    customTitle: "Another Title",
  });

  assert.equal(res2.isMuted, true);
  assert.equal(res2.customTitle, "Another Title");
  assert.ok(mockParticipants[0].state.mutedUntil);
  assert.equal(mockParticipants[0].settings.customTitle, "Another Title");
});
