const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "sidebar-test-secret-key";
process.env.JWT_SECRET = JWT_SECRET;
process.env.NODE_ENV = "test";

const generateToken = (userId) => {
  return jwt.sign({ id: userId, username: "testuser" }, JWT_SECRET);
};

// Paths to clear from require cache
const appPath = require.resolve("../src/app");
const sidebarRoutesPath = require.resolve("../src/routes/sidebar");
const sidebarControllerPath = require.resolve("../src/controllers/sidebarController");
const participantModelPath = require.resolve("../src/models/ConversationParticipant");
const userModelPath = require.resolve("../src/models/User");
const groupModelPath = require.resolve("../src/models/Group");

const clearCache = () => {
  delete require.cache[appPath];
  delete require.cache[sidebarRoutesPath];
  delete require.cache[sidebarControllerPath];
  delete require.cache[participantModelPath];
  delete require.cache[userModelPath];
  delete require.cache[groupModelPath];
};

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

function createMemoryStore() {
  const participants = [];
  const users = [];
  const groups = [];
  const conversations = [];
  const messages = [];

  class ConversationParticipant {
    static find(query) {
      // Logic lọc theo query cơ bản
      let results = [...participants];
      if (query.userId) {
        results = results.filter(p => String(p.userId) === String(query.userId));
      }
      if (query.leftAt === null) {
        results = results.filter(p => p.leftAt === null);
      }
      if (query["state.pinnedAt"] === null) {
        results = results.filter(p => p.state?.pinnedAt === null);
      } else if (query["state.pinnedAt"] && typeof query["state.pinnedAt"] === "object" && "$ne" in query["state.pinnedAt"]) {
        results = results.filter(p => p.state?.pinnedAt !== null);
      }
      if (query.conversationId) {
        if (query.conversationId.$in) {
          const allowedIds = query.conversationId.$in.map(String);
          results = results.filter(p => allowedIds.includes(String(p.conversationId._id || p.conversationId)));
        } else {
          results = results.filter(p => String(p.conversationId._id || p.conversationId) === String(query.conversationId));
        }
      }

      // cursor logic
      if (query.$or) {
        const cursorConds = query.$or;
        // cursorConds[0]: { "state.lastMessageAt": { $lt: cursorTime } }
        // cursorConds[1]: { "state.lastMessageAt": cursorTime, conversationId: { $lt: cursorId } }
        const ltCond = cursorConds[0]["state.lastMessageAt"];
        const eqCond = cursorConds[1]["state.lastMessageAt"];
        const ltId = cursorConds[1].conversationId.$lt;

        results = results.filter(p => {
          const lastMsgAt = p.state?.lastMessageAt ? new Date(p.state.lastMessageAt) : null;
          if (!lastMsgAt) return false;
          if (ltCond && ltCond.$lt) {
            const timeLimit = new Date(ltCond.$lt);
            if (lastMsgAt < timeLimit) return true;
          }
          if (eqCond && String(lastMsgAt.getTime()) === String(new Date(eqCond).getTime())) {
            return String(p.conversationId._id || p.conversationId) < String(ltId);
          }
          return false;
        });
      }

      // Giả lập Query Builder
      const queryBuilder = {
        populate(field) {
          if (field === "conversationId") {
            results = results.map(p => {
              const matchedConv = conversations.find(c => String(c._id) === String(p.conversationId));
              return {
                ...p,
                conversationId: matchedConv || p.conversationId
              };
            });
          }
          return this;
        },
        sort(sortObj) {
          results.sort((a, b) => {
            // pinned sorting
            const aPinned = a.state?.pinnedAt !== null;
            const bPinned = b.state?.pinnedAt !== null;
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            // lastMessageAt sorting
            const aTime = a.state?.lastMessageAt ? new Date(a.state.lastMessageAt).getTime() : 0;
            const bTime = b.state?.lastMessageAt ? new Date(b.state.lastMessageAt).getTime() : 0;
            if (bTime !== aTime) {
              return bTime - aTime;
            }

            // conversationId sorting (ObjectId comparison)
            return String(b.conversationId._id).localeCompare(String(a.conversationId._id));
          });
          return this;
        },
        limit(l) {
          results = results.slice(0, l);
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve(results).then(resolve, reject);
        }
      };

      return queryBuilder;
    }
  }

  const createQuery = (data) => {
    return {
      select() { return this; },
      populate() { return this; },
      lean() { return this; },
      then(resolve, reject) {
        return Promise.resolve(data).then(resolve, reject);
      }
    };
  };

  const User = {
    find(query) {
      let results = [...users];
      if (query._id && query._id.$in) {
        const ids = query._id.$in.map(String);
        results = results.filter(u => ids.includes(String(u._id)));
      }
      return createQuery(results);
    }
  };

  const Group = {
    find(query) {
      let results = [...groups];
      if (query._id && query._id.$in) {
        const ids = query._id.$in.map(String);
        results = results.filter(g => ids.includes(String(g._id)));
      }
      return createQuery(results);
    }
  };

  const Conversation = {
    find(query) {
      let results = [...conversations];
      if (query.kind) {
        results = results.filter(c => c.kind === query.kind);
      }
      return createQuery(results);
    }
  };

  const Message = {
    find(query) {
      let results = [...messages];
      if (query._id && query._id.$in) {
        const ids = query._id.$in.map(String);
        results = results.filter(m => ids.includes(String(m._id)));
      }
      return createQuery(results);
    }
  };

  return { ConversationParticipant, User, Group, Conversation, Message, participants, users, groups, conversations, messages };
}

const createTestServer = async () => {
  clearCache();

  const store = createMemoryStore();
  const conversationModelPath = require.resolve("../src/models/Conversation");
  const messageModelPath = require.resolve("../src/models/Message");

  mockModule(participantModelPath, store.ConversationParticipant);
  mockModule(userModelPath, store.User);
  mockModule(groupModelPath, store.Group);
  mockModule(conversationModelPath, store.Conversation);
  mockModule(messageModelPath, store.Message);

  // Clear require cache for server.js / app.js dependencies
  const { createApp } = require("../src/app");
  const app = createApp({
    rabbitConnectionManager: { checkStatus: async () => "mocked" }
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    store,
    async request(path, options = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
      const status = response.status;
      let body;
      try {
        body = await response.json();
      } catch (e) {
        body = null;
      }
      return { response, status, body };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      clearCache();
    }
  };
};

test("GET /api/sidebar/conversations returns unified lists correctly on Page 1 (RED first)", async () => {
  const testServer = await createTestServer();
  const currentUserId = "60c72b2f9b1d8a0015f8a3c1";
  const token = generateToken(currentUserId);

  try {
    // Setup mock data
    const user2Id = "60c72b2f9b1d8a0015f8a3c2";
    const groupId1 = "60c72b2f9b1d8a0015f8a3g1";

    testServer.store.users.push({ _id: user2Id, displayName: "Bob", avatar: "bob-avt" });
    testServer.store.groups.push({ _id: groupId1, name: "Design Group", avatar: "group-avt" });

    // Setup conversations
    testServer.store.conversations.push(
      { _id: "60c72b2f9b1d8a0015f8a3d1", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` },
      { _id: "60c72b2f9b1d8a0015f8a3d2", kind: "group", legacyConversationId: groupId1, groupId: groupId1 }
    );

    // Setup messages
    testServer.store.messages.push(
      { _id: "60c72b2f9b1d8a0015f8a3m1", sender: user2Id, text: "Hello friend", createdAt: new Date("2026-07-20T09:00:00Z") },
      { _id: "60c72b2f9b1d8a0015f8a3m2", sender: user2Id, text: "Let's meet at 3", createdAt: new Date("2026-07-20T09:30:00Z") }
    );

    // Mock ConversationParticipants
    testServer.store.participants.push(
      // Pinned direct chat
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d1",
        leftAt: null,
        state: {
          pinnedAt: new Date("2026-07-20T10:00:00Z"),
          lastMessageAt: new Date("2026-07-20T09:00:00Z"),
          unreadCount: 0,
          lastMessageId: "60c72b2f9b1d8a0015f8a3m1"
        },
        legacyConversationId: `${currentUserId}_${user2Id}`
      },
      // Non-pinned group chat
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d2",
        leftAt: null,
        state: {
          pinnedAt: null,
          lastMessageAt: new Date("2026-07-20T09:30:00Z"),
          unreadCount: 2,
          lastMessageId: "60c72b2f9b1d8a0015f8a3m2"
        },
        legacyConversationId: groupId1
      }
    );

    const result = await testServer.request("/api/sidebar/conversations?limit=5", {
      headers: { authorization: `Bearer ${token}` }
    });

    // Check if endpoint is up. Since it's RED, this should be 404
    assert.equal(result.status, 200, "Endpoint should return 200 when implemented");
    assert.equal(result.body.success, true);
    console.log("DEBUG CONVERSATIONS:", JSON.stringify(result.body.conversations, null, 2));
    assert.equal(result.body.conversations.length, 2);
    // Pinned should be first despite lastMessageAt is older
    assert.equal(result.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d1");
    assert.equal(result.body.conversations[0].isPinned, true);
    assert.equal(result.body.conversations[1].conversationId, "60c72b2f9b1d8a0015f8a3d2");
    assert.equal(result.body.conversations[1].isPinned, false);
    // Verify target enrichment
    assert.equal(result.body.conversations[0].target.displayName, "Bob");
    assert.equal(result.body.conversations[1].target.displayName, "Design Group");
    // Verify sender enrichment
    assert.equal(result.body.conversations[0].lastMessage.senderName, "Bob");
  } finally {
    await testServer.close();
  }
});

test("GET /api/sidebar/conversations supports cursor pagination on subsequent pages", async () => {
  const testServer = await createTestServer();
  const currentUserId = "60c72b2f9b1d8a0015f8a3c1";
  const token = generateToken(currentUserId);

  try {
    const user2Id = "60c72b2f9b1d8a0015f8a3c2";
    testServer.store.users.push({ _id: user2Id, displayName: "Bob" });

    // Setup 3 conversations (all non-pinned)
    testServer.store.conversations.push(
      { _id: "60c72b2f9b1d8a0015f8a3d2", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` },
      { _id: "60c72b2f9b1d8a0015f8a3d3", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` },
      { _id: "60c72b2f9b1d8a0015f8a3d4", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` }
    );

    // Setup last messages
    testServer.store.messages.push(
      { _id: "60c72b2f9b1d8a0015f8a3m2", sender: user2Id, text: "Msg 2", createdAt: new Date("2026-07-20T09:30:00Z") },
      { _id: "60c72b2f9b1d8a0015f8a3m3", sender: user2Id, text: "Msg 3", createdAt: new Date("2026-07-20T08:30:00Z") },
      { _id: "60c72b2f9b1d8a0015f8a3m4", sender: user2Id, text: "Msg 4", createdAt: new Date("2026-07-20T07:30:00Z") }
    );

    // Setup participants
    testServer.store.participants.push(
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d2",
        leftAt: null,
        state: {
          pinnedAt: null,
          lastMessageAt: new Date("2026-07-20T09:30:00Z"),
          lastMessageId: "60c72b2f9b1d8a0015f8a3m2"
        },
        legacyConversationId: `${currentUserId}_${user2Id}`
      },
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d3",
        leftAt: null,
        state: {
          pinnedAt: null,
          lastMessageAt: new Date("2026-07-20T08:30:00Z"),
          lastMessageId: "60c72b2f9b1d8a0015f8a3m3"
        },
        legacyConversationId: `${currentUserId}_${user2Id}`
      },
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d4",
        leftAt: null,
        state: {
          pinnedAt: null,
          lastMessageAt: new Date("2026-07-20T07:30:00Z"),
          lastMessageId: "60c72b2f9b1d8a0015f8a3m4"
        },
        legacyConversationId: `${currentUserId}_${user2Id}`
      }
    );

    // Page 1: Fetch 1 item
    const page1 = await testServer.request("/api/sidebar/conversations?limit=1", {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(page1.status, 200);
    assert.equal(page1.body.conversations.length, 1);
    assert.equal(page1.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d2");
    assert.equal(page1.body.hasMore, true);
    assert.ok(page1.body.nextCursor);

    // Page 2: Fetch next items using cursor
    const page2 = await testServer.request(`/api/sidebar/conversations?limit=2&cursor=${page1.body.nextCursor}`, {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(page2.status, 200);
    assert.equal(page2.body.conversations.length, 2);
    assert.equal(page2.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d3");
    assert.equal(page2.body.conversations[1].conversationId, "60c72b2f9b1d8a0015f8a3d4");
    assert.equal(page2.body.hasMore, false);
  } finally {
    await testServer.close();
  }
});

test("GET /api/sidebar/conversations applies kind filtering and keeps independent cursors", async () => {
  const testServer = await createTestServer();
  const currentUserId = "60c72b2f9b1d8a0015f8a3c1";
  const token = generateToken(currentUserId);

  try {
    const user2Id = "60c72b2f9b1d8a0015f8a3c2";
    const groupId1 = "60c72b2f9b1d8a0015f8a3g1";
    const groupId2 = "60c72b2f9b1d8a0015f8a3g2";

    testServer.store.users.push({ _id: user2Id, displayName: "Bob" });
    testServer.store.groups.push(
      { _id: groupId1, displayName: "Group 1", members: [currentUserId] },
      { _id: groupId2, displayName: "Group 2", members: [currentUserId] }
    );

    // Setup conversations
    testServer.store.conversations.push(
      { _id: "60c72b2f9b1d8a0015f8a3d2", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` },
      { _id: "60c72b2f9b1d8a0015f8a3d3", kind: "group", legacyConversationId: groupId1, groupId: groupId1 },
      { _id: "60c72b2f9b1d8a0015f8a3d4", kind: "group", legacyConversationId: groupId2, groupId: groupId2 }
    );

    // Setup messages
    testServer.store.messages.push(
      { _id: "60c72b2f9b1d8a0015f8a3m2", sender: user2Id, text: "Direct Msg", createdAt: new Date("2026-07-20T09:30:00Z") },
      { _id: "60c72b2f9b1d8a0015f8a3m3", sender: user2Id, text: "Group 1 Msg", createdAt: new Date("2026-07-20T08:30:00Z") },
      { _id: "60c72b2f9b1d8a0015f8a3m4", sender: user2Id, text: "Group 2 Msg", createdAt: new Date("2026-07-20T07:30:00Z") }
    );

    // Setup participants
    testServer.store.participants.push(
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d2",
        leftAt: null,
        state: { pinnedAt: null, lastMessageAt: new Date("2026-07-20T09:30:00Z"), lastMessageId: "60c72b2f9b1d8a0015f8a3m2" },
        legacyConversationId: `${currentUserId}_${user2Id}`
      },
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d3",
        leftAt: null,
        state: { pinnedAt: null, lastMessageAt: new Date("2026-07-20T08:30:00Z"), lastMessageId: "60c72b2f9b1d8a0015f8a3m3" },
        legacyConversationId: groupId1
      },
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d4",
        leftAt: null,
        state: { pinnedAt: null, lastMessageAt: new Date("2026-07-20T07:30:00Z"), lastMessageId: "60c72b2f9b1d8a0015f8a3m4" },
        legacyConversationId: groupId2
      }
    );

    // Query kind=group&limit=1
    const groupResult = await testServer.request("/api/sidebar/conversations?kind=group&limit=1", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(groupResult.status, 200);
    assert.equal(groupResult.body.conversations.length, 1);
    assert.equal(groupResult.body.conversations[0].kind, "group");
    assert.equal(groupResult.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d3");
    assert.equal(groupResult.body.hasMore, true);
    const nextCursorGroup = groupResult.body.nextCursor;

    // Query kind=direct&limit=1 starting with cursor = null (should be independent)
    const directResult = await testServer.request("/api/sidebar/conversations?kind=direct&limit=1", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(directResult.status, 200);
    assert.equal(directResult.body.conversations.length, 1);
    assert.equal(directResult.body.conversations[0].kind, "direct");
    assert.equal(directResult.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d2");
    assert.equal(directResult.body.hasMore, false);

    // Query kind=direct with group nextCursor (cross-kind incompatibility handling)
    const crossResult = await testServer.request(`/api/sidebar/conversations?kind=direct&limit=1&cursor=${nextCursorGroup}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(crossResult.status, 200);
    // Since direct item has lastMessageAt "09:30" and group cursor limit is "08:30",
    // direct item (09:30) is newer than cursor limit, so it should not be returned (filtered out because lastMessageAt < cursor limit).
    // This is correct behavior! It won't crash and returns empty array safely.
    assert.equal(crossResult.body.conversations.length, 0);
  } finally {
    await testServer.close();
  }
});

test("GET /api/sidebar/conversations handles tie-breaker sorting when lastMessageAt is identical", async () => {
  const testServer = await createTestServer();
  const currentUserId = "60c72b2f9b1d8a0015f8a3c1";
  const token = generateToken(currentUserId);

  try {
    const user2Id = "60c72b2f9b1d8a0015f8a3c2";
    testServer.store.users.push({ _id: user2Id, displayName: "Bob" });

    const sharedTime = new Date("2026-07-20T09:30:00Z");

    // Setup 2 conversations with identical lastMessageAt
    testServer.store.conversations.push(
      { _id: "60c72b2f9b1d8a0015f8a3d5", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` },
      { _id: "60c72b2f9b1d8a0015f8a3d6", kind: "direct", legacyConversationId: `${currentUserId}_${user2Id}` }
    );

    testServer.store.messages.push(
      { _id: "60c72b2f9b1d8a0015f8a3m5", sender: user2Id, text: "Msg 5", createdAt: sharedTime },
      { _id: "60c72b2f9b1d8a0015f8a3m6", sender: user2Id, text: "Msg 6", createdAt: sharedTime }
    );

    testServer.store.participants.push(
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d5",
        leftAt: null,
        state: { pinnedAt: null, lastMessageAt: sharedTime, lastMessageId: "60c72b2f9b1d8a0015f8a3m5" },
        legacyConversationId: `${currentUserId}_${user2Id}`
      },
      {
        userId: currentUserId,
        conversationId: "60c72b2f9b1d8a0015f8a3d6",
        leftAt: null,
        state: { pinnedAt: null, lastMessageAt: sharedTime, lastMessageId: "60c72b2f9b1d8a0015f8a3m6" },
        legacyConversationId: `${currentUserId}_${user2Id}`
      }
    );

    // Page 1: limit 1. Should return the one with higher ObjectId ID (60c72b2f9b1d8a0015f8a3d6)
    const page1 = await testServer.request("/api/sidebar/conversations?limit=1", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(page1.status, 200);
    assert.equal(page1.body.conversations.length, 1);
    assert.equal(page1.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d6");
    assert.equal(page1.body.hasMore, true);
    assert.ok(page1.body.nextCursor);

    // Page 2: Fetch next item using cursor. Should return 60c72b2f9b1d8a0015f8a3d5
    const page2 = await testServer.request(`/api/sidebar/conversations?limit=1&cursor=${page1.body.nextCursor}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(page2.status, 200);
    assert.equal(page2.body.conversations.length, 1);
    assert.equal(page2.body.conversations[0].conversationId, "60c72b2f9b1d8a0015f8a3d5");
    assert.equal(page2.body.hasMore, false);
  } finally {
    await testServer.close();
  }
});

test("GET /api/sidebar/conversations supports q search parameter for groups with null lastMessageAt", async () => {
  const testServer = await createTestServer();
  const currentUserId = "60c72b2f9b1d8a0015f8a3c1";
  const token = generateToken(currentUserId);

  try {
    const groupId = "60c72b2f9b1d8a0015f8a3g9";
    testServer.store.groups.push({ _id: groupId, name: "Secret Club", members: [currentUserId] });
    testServer.store.conversations.push({ _id: "60c72b2f9b1d8a0015f8a3d9", kind: "group", legacyConversationId: groupId, groupId });

    // Participant with lastMessageAt = null (history cleared)
    testServer.store.participants.push({
      userId: currentUserId,
      conversationId: "60c72b2f9b1d8a0015f8a3d9",
      leftAt: null,
      state: { pinnedAt: null, lastMessageAt: null, lastMessageId: null },
      legacyConversationId: groupId
    });

    const res = await testServer.request("/api/sidebar/conversations?q=Secret", {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.conversations.length, 1);
    assert.equal(res.body.conversations[0].target.displayName, "Secret Club");
  } finally {
    await testServer.close();
  }
});

test("GET /api/sidebar/conversations returns placeholder content for messages with empty text (attachments or call_log)", async () => {
  const testServer = await createTestServer();
  const currentUserId = "60c72b2f9b1d8a0015f8a3c1";
  const token = generateToken(currentUserId);

  try {
    const user2Id = "60c72b2f9b1d8a0015f8a3c2";
    testServer.store.users.push({ _id: user2Id, displayName: "Bob" });

    testServer.store.conversations.push({
      _id: "60c72b2f9b1d8a0015f8a3d8",
      kind: "direct",
      legacyConversationId: `${currentUserId}_${user2Id}`
    });

    // Message with attachments and empty text ""
    testServer.store.messages.push({
      _id: "60c72b2f9b1d8a0015f8a3m8",
      sender: user2Id,
      text: "",
      attachments: ["att-1"],
      type: "file",
      createdAt: new Date("2026-07-20T09:30:00Z")
    });

    testServer.store.participants.push({
      userId: currentUserId,
      conversationId: "60c72b2f9b1d8a0015f8a3d8",
      leftAt: null,
      state: {
        pinnedAt: null,
        lastMessageAt: new Date("2026-07-20T09:30:00Z"),
        lastMessageId: "60c72b2f9b1d8a0015f8a3m8"
      },
      legacyConversationId: `${currentUserId}_${user2Id}`
    });

    const res = await testServer.request("/api/sidebar/conversations", {
      headers: { authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.conversations.length, 1);
    const lastMsg = res.body.conversations[0].lastMessage;
    assert.ok(lastMsg);
    assert.notEqual(lastMsg.content, "", "lastMessage.content should not be empty string when message has attachments");
  } finally {
    await testServer.close();
  }
});

