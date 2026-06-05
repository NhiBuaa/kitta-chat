const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const Conversation = require("../src/models/Conversation");
const ConversationParticipant = require("../src/models/ConversationParticipant");

function indexByFields(model, fields) {
  return model.schema.indexes().find(([indexFields]) => {
    return JSON.stringify(indexFields) === JSON.stringify(fields);
  });
}

test("Conversation requires kind and legacyConversationId", () => {
  const conversation = new Conversation({});
  const error = conversation.validateSync();

  assert.ok(error.errors.kind);
  assert.ok(error.errors.legacyConversationId);
});

test("Conversation approved indexes exist", () => {
  const legacyIndex = indexByFields(Conversation, { legacyConversationId: 1 });
  const directKeyIndex = indexByFields(Conversation, { kind: 1, directKey: 1 });
  const groupIdIndex = indexByFields(Conversation, { groupId: 1 });
  const participantIndex = indexByFields(Conversation, {
    participantUserIds: 1,
    lastMessageAt: -1,
  });
  const kindRecencyIndex = indexByFields(Conversation, { kind: 1, lastMessageAt: -1 });

  assert.equal(legacyIndex[1].unique, true);
  assert.equal(directKeyIndex[1].unique, true);
  assert.equal(directKeyIndex[1].sparse, true);
  assert.equal(groupIdIndex[1].unique, true);
  assert.equal(groupIdIndex[1].sparse, true);
  assert.ok(participantIndex);
  assert.ok(kindRecencyIndex);
});

test("ConversationParticipant requires conversationId, legacyConversationId, and userId", () => {
  const participant = new ConversationParticipant({});
  const error = participant.validateSync();

  assert.ok(error.errors.conversationId);
  assert.ok(error.errors.legacyConversationId);
  assert.ok(error.errors.userId);
});

test("ConversationParticipant defaults user state and settings", () => {
  const participant = new ConversationParticipant({
    conversationId: new mongoose.Types.ObjectId(),
    legacyConversationId: "legacy-1",
    userId: new mongoose.Types.ObjectId(),
  });

  assert.equal(participant.state.unreadCount, 0);
  assert.equal(participant.settings.notifications, "default");
  assert.equal(participant.state.pinnedAt, null);
  assert.equal(participant.state.archivedAt, null);
  assert.equal(participant.state.mutedUntil, null);
  assert.equal(participant.state.deletedAt, null);
  assert.equal(participant.state.lastReadAt, null);
  assert.equal(participant.state.lastMessageAt, null);
  assert.equal(participant.state.lastReadMessageId, null);
  assert.equal(participant.state.lastMessageId, null);
});

test("ConversationParticipant approved indexes exist", () => {
  const uniqueParticipantIndex = indexByFields(ConversationParticipant, {
    conversationId: 1,
    userId: 1,
  });
  const activeSidebarIndex = indexByFields(ConversationParticipant, {
    userId: 1,
    leftAt: 1,
    "state.deletedAt": 1,
    "state.pinnedAt": -1,
    "state.lastMessageAt": -1,
  });
  const archiveIndex = indexByFields(ConversationParticipant, {
    userId: 1,
    "state.archivedAt": 1,
    "state.pinnedAt": -1,
    "state.lastMessageAt": -1,
  });
  const unreadIndex = indexByFields(ConversationParticipant, {
    userId: 1,
    "state.unreadCount": -1,
  });
  const legacyUserIndex = indexByFields(ConversationParticipant, {
    legacyConversationId: 1,
    userId: 1,
  });
  const membershipIndex = indexByFields(ConversationParticipant, {
    conversationId: 1,
    leftAt: 1,
  });

  assert.equal(uniqueParticipantIndex[1].unique, true);
  assert.ok(activeSidebarIndex);
  assert.ok(archiveIndex);
  assert.ok(unreadIndex);
  assert.ok(legacyUserIndex);
  assert.ok(membershipIndex);
});

test("Conversation read-model imports do not register legacy model changes", () => {
  const Message = require("../src/models/Message");
  const Group = require("../src/models/Group");

  assert.ok(Message.schema.path("conversationId"));
  assert.equal(Message.schema.path("conversationObjectId"), undefined);
  assert.ok(Group.schema.path("members"));
});

