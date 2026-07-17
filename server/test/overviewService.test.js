const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const overviewServicePath = require.resolve("../src/services/overviewService");
const userModelPath = require.resolve("../src/models/User");
const groupModelPath = require.resolve("../src/models/Group");
const presenceServicePath = require.resolve("../src/services/presenceService");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

let mockUsers = [];
let mockGroups = [];
let mockPresences = {};

const UserMock = {
  findById: (id) => {
    const idStr = id.toString();
    const user = mockUsers.find(u => u._id.toString() === idStr);
    return {
      select: () => ({
        lean: async () => user || null
      })
    };
  }
};

const GroupMock = {
  findById: (id) => {
    const idStr = id.toString();
    const group = mockGroups.find(g => g._id.toString() === idStr);
    return {
      select: () => ({
        lean: async () => group || null
      })
    };
  }
};

const presenceServiceMock = {
  getUserPresence: async (userId) => {
    const idStr = userId.toString();
    return mockPresences[idStr] || { status: "offline", lastSeen: null };
  }
};

// Clear cache before requiring service
delete require.cache[overviewServicePath];
delete require.cache[userModelPath];
delete require.cache[groupModelPath];
delete require.cache[presenceServicePath];

mockModule(userModelPath, UserMock);
mockModule(groupModelPath, GroupMock);
mockModule(presenceServicePath, presenceServiceMock);

const overviewService = require("../src/services/overviewService");

test("Direct Chat - returns other user overview and online status correctly", async () => {
  const userId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const conversationId = `${userId.toString()}_${otherUserId.toString()}`;

  mockUsers = [{
    _id: otherUserId,
    displayName: "Nguyen Van A",
    avatar: "http://avatar-url",
    email: "a@gmail.com"
  }];

  mockPresences = {
    [otherUserId.toString()]: { status: "active", lastSeen: Date.now() }
  };

  const overview = await overviewService.getOverview(userId, conversationId);

  assert.equal(overview.kind, "direct");
  assert.equal(overview.name, "Nguyen Van A");
  assert.equal(overview.avatar, "http://avatar-url");
  assert.equal(overview.isOnline, true);
  assert.equal(overview.memberCount, 2);
});

test("Direct Chat - falls back to offline presence on error", async () => {
  const userId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const conversationId = `${userId.toString()}_${otherUserId.toString()}`;

  mockUsers = [{
    _id: otherUserId,
    displayName: "Nguyen Van B",
    avatar: "http://avatar-url-b",
    email: "b@gmail.com"
  }];

  // Bắt presenceServiceMock ném lỗi để kiểm tra fallback offline
  presenceServiceMock.getUserPresence = async () => {
    throw new Error("Redis connection refused");
  };

  const overview = await overviewService.getOverview(userId, conversationId);

  assert.equal(overview.kind, "direct");
  assert.equal(overview.name, "Nguyen Van B");
  assert.equal(overview.isOnline, false); // Fallback offline
  assert.equal(overview.memberCount, 2);
});

test("Group Chat - returns group details and members count correctly", async () => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();

  mockGroups = [{
    _id: groupId,
    name: "Cong Ty A",
    avatar: "http://group-avatar",
    members: [userId, new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  }];

  const overview = await overviewService.getOverview(userId, groupId.toString());

  assert.equal(overview.kind, "group");
  assert.equal(overview.name, "Cong Ty A");
  assert.equal(overview.avatar, "http://group-avatar");
  assert.equal(overview.isOnline, false); // Group is always offline
  assert.equal(overview.memberCount, 3);
});

test("Group Chat - throws 404 error when group not found", async () => {
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();

  mockGroups = [];

  await assert.rejects(
    async () => {
      await overviewService.getOverview(userId, groupId.toString());
    },
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, "NOT_FOUND");
      return true;
    }
  );
});
