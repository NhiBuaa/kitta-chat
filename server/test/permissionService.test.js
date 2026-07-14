const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const servicePath = require.resolve("../src/services/permissionService");
const groupPath = require.resolve("../src/models/Group");
const participantPath = require.resolve("../src/models/ConversationParticipant");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

// We will set up mock stores for our queries
let mockGroups = [];
let mockParticipants = [];

const GroupMock = {
  findById: async (id) => {
    return mockGroups.find(g => g._id.toString() === id.toString()) || null;
  }
};

const ConversationParticipantMock = {
  findOne: async (query) => {
    return mockParticipants.find(p => 
      p.legacyConversationId === query.legacyConversationId && 
      p.userId.toString() === query.userId.toString()
    ) || null;
  }
};

// Mock modules
mockModule(groupPath, GroupMock);
mockModule(participantPath, ConversationParticipantMock);

// Now load the service
const permissionService = require("../src/services/permissionService");

test("Direct Chat - member of the conversation gets true for standard flags and false for canLeave", async () => {
  const userId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const conversationId = [userId.toString(), otherUserId.toString()].sort().join("_");

  const permissions = await permissionService.getPermissions(userId, conversationId);

  assert.equal(permissions.canRead, true);
  assert.equal(permissions.canWrite, true);
  assert.equal(permissions.canLeave, false);
  assert.equal(permissions.canArchive, true);
  assert.equal(permissions.canDelete, true);
  assert.equal(permissions.canMute, true);
  assert.equal(permissions.canPin, true);
});

test("Direct Chat - non-member gets false for all flags", async () => {
  const userId = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const conversationId = [userA.toString(), userB.toString()].sort().join("_");

  const permissions = await permissionService.getPermissions(userId, conversationId);

  assert.equal(permissions.canRead, false);
  assert.equal(permissions.canWrite, false);
  assert.equal(permissions.canLeave, false);
  assert.equal(permissions.canArchive, false);
  assert.equal(permissions.canDelete, false);
  assert.equal(permissions.canMute, false);
  assert.equal(permissions.canPin, false);
});

test("Group Chat - active member gets all flags as true", async () => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  
  mockGroups = [{
    _id: groupId,
    members: [userId]
  }];
  mockParticipants = [];

  const permissions = await permissionService.getPermissions(userId, groupId.toString());

  assert.equal(permissions.canRead, true);
  assert.equal(permissions.canWrite, true);
  assert.equal(permissions.canLeave, true);
  assert.equal(permissions.canArchive, true);
  assert.equal(permissions.canDelete, true);
  assert.equal(permissions.canMute, true);
  assert.equal(permissions.canPin, true);
});

test("Group Chat - user who left the group gets canRead and canDelete true, but others false", async () => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  
  mockGroups = [{
    _id: groupId,
    members: [] // left the group
  }];
  mockParticipants = [{
    legacyConversationId: groupId.toString(),
    userId: userId,
    leftAt: new Date()
  }];

  const permissions = await permissionService.getPermissions(userId, groupId.toString());

  assert.equal(permissions.canRead, true);
  assert.equal(permissions.canWrite, false);
  assert.equal(permissions.canLeave, false);
  assert.equal(permissions.canArchive, false);
  assert.equal(permissions.canDelete, true);
  assert.equal(permissions.canMute, false);
  assert.equal(permissions.canPin, false);
});

test("Group Chat - non-member with no history gets false for all flags", async () => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  
  mockGroups = [{
    _id: groupId,
    members: []
  }];
  mockParticipants = [];

  const permissions = await permissionService.getPermissions(userId, groupId.toString());

  assert.equal(permissions.canRead, false);
  assert.equal(permissions.canWrite, false);
  assert.equal(permissions.canLeave, false);
  assert.equal(permissions.canArchive, false);
  assert.equal(permissions.canDelete, false);
  assert.equal(permissions.canMute, false);
  assert.equal(permissions.canPin, false);
});
