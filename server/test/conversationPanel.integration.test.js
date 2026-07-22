const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "test-secret-key-for-panel-tests";
process.env.JWT_SECRET = JWT_SECRET;
process.env.MONGO_URI = "mongodb://localhost:27017/shot-chat-test";
process.env.URL_FRONTEND = "http://localhost:5173";
process.env.REDIS_URL = "redis://localhost:6379";

const generateToken = (userId) => {
  return jwt.sign({ id: userId, username: "testuser" }, JWT_SECRET);
};

const permissionServicePath = require.resolve("../src/services/permissionService");
const overviewServicePath = require.resolve("../src/services/overviewService");
const preferenceServicePath = require.resolve("../src/services/preferenceService");
const resourceServicePath = require.resolve("../src/services/resourceService");
const groupModelPath = require.resolve("../src/models/Group");
const participantModelPath = require.resolve("../src/models/ConversationParticipant");
const userModelPath = require.resolve("../src/models/User");
const messageControllerPath = require.resolve("../src/controllers/messageController");
const readModelServicePath = require.resolve("../src/services/conversationReadModelService");

const clearModuleCache = () => {
  delete require.cache[require.resolve("../src/app")];
  delete require.cache[require.resolve("../src/routes/conversationPanel")];
  delete require.cache[require.resolve("../src/controllers/conversationPanelController")];
  delete require.cache[permissionServicePath];
  delete require.cache[overviewServicePath];
  delete require.cache[preferenceServicePath];
  delete require.cache[resourceServicePath];
  delete require.cache[groupModelPath];
  delete require.cache[participantModelPath];
  delete require.cache[userModelPath];
  delete require.cache[messageControllerPath];
  delete require.cache[readModelServicePath];
};

const createTestServer = async (envOverrides = {}) => {
  // Backup env
  const backupEnv = {};
  for (const [key, val] of Object.entries(envOverrides)) {
    backupEnv[key] = process.env[key];
    process.env[key] = val;
  }

  // Clear cache để load module với env mới
  clearModuleCache();

  // Mock PermissionService
  const permissionServiceMock = {
    getPermissions: async (userId, conversationId) => {
      if (conversationId === "forbidden-conv") {
        return {
          canRead: false,
          canWrite: false,
          canLeave: false,
          canArchive: false,
          canDelete: false,
          canMute: false,
          canPin: false,
        };
      }
      if (conversationId === "no-pin-mute-conv") {
        return {
          canRead: true,
          canWrite: true,
          canLeave: true,
          canArchive: true,
          canDelete: true,
          canMute: false,
          canPin: false,
        };
      }
      return {
        canRead: true,
        canWrite: true,
        canLeave: true,
        canArchive: true,
        canDelete: true,
        canMute: true,
        canPin: true,
      };
    }
  };
  require.cache[permissionServicePath] = {
    id: permissionServicePath,
    filename: permissionServicePath,
    loaded: true,
    exports: permissionServiceMock,
  };

  // Mock OverviewService
  let mockOnlineStatus = true;
  const overviewServiceMock = {
    getOverview: async (userId, conversationId) => {
      return {
        kind: conversationId.includes("_") ? "direct" : "group",
        name: "Test Conversation Name",
        avatar: "avatar-url",
        isOnline: conversationId.includes("_") ? mockOnlineStatus : false,
        memberCount: conversationId.includes("_") ? 2 : 10,
      };
    },
    setMockOnlineStatus(status) {
      mockOnlineStatus = status;
    }
  };
  require.cache[overviewServicePath] = {
    id: overviewServicePath,
    filename: overviewServicePath,
    loaded: true,
    exports: overviewServiceMock,
  };

  // Mock PreferenceService
  let mockPreferences = {
    isPinned: false,
    isMuted: false,
    mutedUntil: null,
    customTitle: null,
  };
  const preferenceServiceMock = {
    getPreferences: async (userId, conversationId) => {
      return mockPreferences;
    },
    updatePreferences: async (userId, conversationId, updates) => {
      mockPreferences = {
        ...mockPreferences,
        ...updates,
      };
      return mockPreferences;
    },
    resetPreferences() {
      mockPreferences = {
        isPinned: false,
        isMuted: false,
        mutedUntil: null,
        customTitle: null,
      };
    }
  };
  require.cache[preferenceServicePath] = {
    id: preferenceServicePath,
    filename: preferenceServicePath,
    loaded: true,
    exports: preferenceServiceMock,
  };

  // Mock ResourceService
  let mockMediaResult = { items: [], hasMore: false, nextCursor: null };
  let mockFilesResult = { items: [], hasMore: false, nextCursor: null };
  let mockLinksResult = { items: [], hasMore: false, nextCursor: null };
  let mockMembershipResult = {
    commonGroups: [],
    membersPreview: [],
    hasMoreMembers: false,
    nextMemberCursor: null
  };
  const resourceServiceMock = {
    loadMedia: async (conversationId, limit, cursor, userId) => {
      if (conversationId === "error-media-conv") {
        throw new Error("DB Error");
      }
      if (conversationId === "timeout-media-conv") {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return { items: [], hasMore: false, nextCursor: null };
      }
      return mockMediaResult;
    },
    loadFiles: async (conversationId, limit, cursor, userId) => {
      if (conversationId === "error-files-conv") {
        throw new Error("DB Error");
      }
      if (conversationId === "timeout-files-conv") {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return { items: [], hasMore: false, nextCursor: null };
      }
      return mockFilesResult;
    },
    loadLinks: async (conversationId, limit, cursor, userId) => {
      if (conversationId === "error-links-conv") {
        throw new Error("DB Error");
      }
      if (conversationId === "timeout-links-conv") {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return { items: [], hasMore: false, nextCursor: null };
      }
      return mockLinksResult;
    },
    loadMembership: async (conversationId, limit, cursor, userId) => {
      if (conversationId === "error-membership-conv") {
        throw new Error("DB Error");
      }
      if (conversationId === "timeout-membership-conv") {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return {
          commonGroups: [],
          membersPreview: [],
          hasMoreMembers: false,
          nextMemberCursor: null
        };
      }
      return mockMembershipResult;
    },
    setMockMedia(data) {
      mockMediaResult = data;
    },
    setMockFiles(data) {
      mockFilesResult = data;
    },
    setMockLinks(data) {
      mockLinksResult = data;
    },
    setMockMembership(data) {
      mockMembershipResult = data;
    }
  };
  require.cache[resourceServicePath] = {
    id: resourceServicePath,
    filename: resourceServicePath,
    loaded: true,
    exports: resourceServiceMock,
  };

  // Mock Group Model
  let mockGroup = {
    _id: "group-123",
    admin: "user-1",
    members: ["user-1", "user-2", "user-3"],
    name: "Test Group",
    avatar: "group-avatar",
    save: async function() { return this; },
  };
  const realGroupModel = require("../src/models/Group");
  const groupModelMock = Object.create(realGroupModel);
  groupModelMock.findById = async (id) => {
    if (id === "nonexistent-group") return null;
    return mockGroup;
  };
  groupModelMock.setMockGroup = (data) => {
    mockGroup = { ...mockGroup, ...data };
  };
  require.cache[groupModelPath] = {
    id: groupModelPath,
    filename: groupModelPath,
    loaded: true,
    exports: groupModelMock,
  };

  // Mock ConversationParticipant Model
  let mockParticipant = {
    _id: "participant-123",
    conversationId: "conv-123",
    legacyConversationId: "conv-123",
    userId: "user-1",
    state: {
      deletedAt: null,
      lastMessageId: "m1",
      lastMessageAt: new Date(),
      unreadCount: 5,
    },
  };
  const realParticipantModel = require("../src/models/ConversationParticipant");
  const participantModelMock = Object.create(realParticipantModel);
  participantModelMock.findOne = async (query) => {
    if (query.userId === "nonexistent-user") return null;
    return mockParticipant;
  };
  participantModelMock.updateOne = async (query, update) => {
    if (update.$set) {
      mockParticipant.state = {
        ...mockParticipant.state,
        ...update.$set,
      };
    }
    return { matchedCount: 1, modifiedCount: 1 };
  };
  participantModelMock.setMockParticipant = (data) => {
    mockParticipant = { ...mockParticipant, ...data };
  };
  require.cache[participantModelPath] = {
    id: participantModelPath,
    filename: participantModelPath,
    loaded: true,
    exports: participantModelMock,
  };

  // Mock User Model
  let mockUser = {
    _id: "user-1",
    displayName: "User One",
    username: "userone",
  };
  const realUserModel = require("../src/models/User");
  const userModelMock = Object.create(realUserModel);
  userModelMock.findById = (id) => {
    const result = {
      _id: id,
      displayName: mockUser.displayName,
      username: mockUser.username,
    };
    return {
      select: function(fields) {
        return this;
      },
      then: function(resolve) {
        resolve(result);
      }
    };
  };
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: userModelMock,
  };

  // Mock messageController
  const realMessageController = require("../src/controllers/messageController");
  const messageControllerMock = {
    ...realMessageController,
    createSystemMessage: async (groupId, text, options = {}) => {
      return {
        _id: "system-message-123",
        conversationId: groupId,
        text,
        type: "system",
        createdAt: new Date(),
      };
    }
  };
  require.cache[messageControllerPath] = {
    id: messageControllerPath,
    filename: messageControllerPath,
    loaded: true,
    exports: messageControllerMock,
  };

  // Mock conversationReadModelService
  const realReadModelService = require("../src/services/conversationReadModelService");
  const readModelServiceMock = {
    ...realReadModelService,
    syncGroupLifecycle: async (groupId, action, data) => {
      return;
    }
  };
  require.cache[readModelServicePath] = {
    id: readModelServicePath,
    filename: readModelServicePath,
    loaded: true,
    exports: readModelServiceMock,
  };

  const { createApp } = require("../src/app");

  const app = createApp({
    logger: {
      info() {},
      error() {},
    },
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    overviewMock: overviewServiceMock,
    preferenceMock: preferenceServiceMock,
    resourceMock: resourceServiceMock,
    groupMock: groupModelMock,
    participantMock: participantModelMock,
    async get(path, token, headers = {}) {
      const finalHeaders = { ...headers };
      if (token) {
        finalHeaders["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: finalHeaders,
      });
      let body = null;
      try {
        body = await response.json();
      } catch (err) {
        // Response rỗng hoặc không phải JSON
      }
      return { response, body };
    },
    async patch(path, data, token, headers = {}) {
      const finalHeaders = {
        "Content-Type": "application/json",
        ...headers,
      };
      if (token) {
        finalHeaders["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "PATCH",
        headers: finalHeaders,
        body: JSON.stringify(data),
      });
      let body = null;
      try {
        body = await response.json();
      } catch (err) {
        // Response rỗng hoặc không phải JSON
      }
      return { response, body };
    },
    async post(path, data, token, headers = {}) {
      const finalHeaders = {
        "Content-Type": "application/json",
        ...headers,
      };
      if (token) {
        finalHeaders["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: finalHeaders,
        body: JSON.stringify(data),
      });
      let body = null;
      try {
        body = await response.json();
      } catch (err) {
        // Response rỗng hoặc không phải JSON
      }
      return { response, body };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      // Restore env
      for (const [key, val] of Object.entries(envOverrides)) {
        if (backupEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = backupEnv[key];
        }
      }
      clearModuleCache();
    },
  };
};

test("Panel endpoints return 404 when CONVERSATION_PANEL_ENABLED=false", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "false",
  });

  try {
    const token = generateToken("user-1");
    
    // Metadata API 404
    const metaRes = await server.get("/api/conversations/conv-123/panel/metadata", token);
    assert.equal(metaRes.response.status, 404);
    assert.equal(metaRes.body.success, false);
    assert.equal(metaRes.body.error.code, "PANEL_DISABLED");

    // Resources API 404
    const resRes = await server.get("/api/conversations/conv-123/panel/resources", token);
    assert.equal(resRes.response.status, 404);
    assert.equal(resRes.body.success, false);
    assert.equal(resRes.body.error.code, "PANEL_DISABLED");
  } finally {
    await server.close();
  }
});

test("Metadata API returns 200, versioning headers and ETag when enabled", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const { response, body } = await server.get("/api/conversations/conv-123/panel/metadata", token);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Panel-Version"), "1");
    assert.ok(response.headers.get("ETag"));
    assert.equal(body.version, 1);
    assert.ok(body.overview);
    assert.ok(body.preference);
    assert.ok(body.permissions);
  } finally {
    await server.close();
  }
});

test("Resources API returns empty when CONVERSATION_PANEL_RESOURCES_ENABLED=false", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "false",
  });

  try {
    const token = generateToken("user-1");
    const { response, body } = await server.get("/api/conversations/conv-123/panel/resources", token);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Panel-Version"), "1");
    assert.equal(body.version, 1);
    assert.deepEqual(body.resourcesPreview.media.items, []);
    assert.deepEqual(body.resourcesPreview.files.items, []);
    assert.deepEqual(body.resourcesPreview.links.items, []);
    assert.deepEqual(body.membership.membersPreview, []);
  } finally {
    await server.close();
  }
});

test("Resources API returns mock data when CONVERSATION_PANEL_RESOURCES_ENABLED=true", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const { response, body } = await server.get("/api/conversations/conv-123/panel/resources", token);

    assert.equal(response.status, 200);
    assert.equal(body.version, 1);
    assert.ok(body.resourcesPreview);
    assert.ok(body.membership);
  } finally {
    await server.close();
  }
});

test("Resources API rejects invalid scopes query parameter with 400 Bad Request", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    
    // Hợp lệ
    const validRes = await server.get("/api/conversations/conv-123/panel/resources?scopes=media,files", token);
    assert.equal(validRes.response.status, 200);

    // Không hợp lệ
    const invalidRes = await server.get("/api/conversations/conv-123/panel/resources?scopes=media,invalid_scope", token);
    assert.equal(invalidRes.response.status, 400);
    assert.equal(invalidRes.body.success, false);
    assert.equal(invalidRes.body.error.code, "INVALID_RETRY_SCOPE");
  } finally {
    await server.close();
  }
});

test("Resources API rate limits requests based on CONVERSATION_PANEL_RATE_LIMIT config", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
    CONVERSATION_PANEL_RATE_LIMIT: "3", // Đặt giới hạn cực thấp là 3 để dễ test
  });

  try {
    const token = generateToken("user-1");

    // Request 1
    const res1 = await server.get("/api/conversations/conv-123/panel/resources", token);
    assert.equal(res1.response.status, 200);

    // Request 2
    const res2 = await server.get("/api/conversations/conv-123/panel/resources", token);
    assert.equal(res2.response.status, 200);

    // Request 3
    const res3 = await server.get("/api/conversations/conv-123/panel/resources", token);
    assert.equal(res3.response.status, 200);

    // Request 4 -> RATE LIMITED (429)
    const res4 = await server.get("/api/conversations/conv-123/panel/resources", token);
    assert.equal(res4.response.status, 429);
    assert.equal(res4.response.headers.get("Retry-After"), "60"); // 1 phút window
    assert.equal(res4.body.success, false);
    assert.equal(res4.body.error.code, "PANEL_RATE_LIMITED");

    // Request từ user-1 cho conversation khác (conv-456) -> vẫn 200 vì rate limit theo cặp (user, conversation)
    const resDifferentConv = await server.get("/api/conversations/conv-456/panel/resources", token);
    assert.equal(resDifferentConv.response.status, 200);

    // Request từ user-2 cho conversation conv-123 -> vẫn 200 vì khác user
    const token2 = generateToken("user-2");
    const resDifferentUser = await server.get("/api/conversations/conv-123/panel/resources", token2);
    assert.equal(resDifferentUser.response.status, 200);

  } finally {
    await server.close();
  }
});

test("Metadata API returns 403 Forbidden when user has no canRead permission", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const { response, body } = await server.get("/api/conversations/forbidden-conv/panel/metadata", token);

    assert.equal(response.status, 403);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "FORBIDDEN");
  } finally {
    await server.close();
  }
});

test("Metadata API returns real Overview and Preference mock data from services", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const { response, body } = await server.get("/api/conversations/user-1_user-2/panel/metadata", token);

    assert.equal(response.status, 200);
    assert.equal(body.overview.name, "Test Conversation Name");
    assert.equal(body.overview.avatar, "avatar-url");
    assert.equal(body.overview.isOnline, true);
    assert.equal(body.overview.memberCount, 2);
    assert.equal(body.preference.isPinned, false);
    assert.equal(body.preference.isMuted, false);
  } finally {
    await server.close();
  }
});

test("Metadata API ETag caching: returns 304 Not Modified when ETag matches, and ignores Presence status in ETag calculation", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const res1 = await server.get("/api/conversations/user-1_user-2/panel/metadata", token);
    const etag = res1.response.headers.get("ETag");
    assert.ok(etag);

    // Gửi lại với If-None-Match
    const res2 = await server.get("/api/conversations/user-1_user-2/panel/metadata", token, {
      "If-None-Match": etag,
    });
    assert.equal(res2.response.status, 304);

    // Thay đổi trạng thái online của user (isOnline: true -> false)
    server.overviewMock.setMockOnlineStatus(false);

    // Gửi lại, ETag vẫn phải khớp và trả về 304 vì Presence không tham gia tính toán ETag
    const res3 = await server.get("/api/conversations/user-1_user-2/panel/metadata", token, {
      "If-None-Match": etag,
    });
    assert.equal(res3.response.status, 304);
  } finally {
    await server.close();
  }
});

test("PATCH /panel/preference updates preferences successfully", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    
    // Ban đầu
    const initialRes = await server.get("/api/conversations/conv-123/panel/metadata", token);
    assert.equal(initialRes.body.preference.isPinned, false);

    // Cập nhật ghim
    const patchRes = await server.patch("/api/conversations/conv-123/panel/preference", {
      isPinned: true,
      customTitle: "My Custom Chat Name",
    }, token);

    assert.equal(patchRes.response.status, 200);
    assert.equal(patchRes.body.preference.isPinned, true);
    assert.equal(patchRes.body.preference.customTitle, "My Custom Chat Name");

    // Lấy lại qua Metadata API xem đã được update chưa
    const updatedRes = await server.get("/api/conversations/conv-123/panel/metadata", token);
    assert.equal(updatedRes.body.preference.isPinned, true);
    assert.equal(updatedRes.body.preference.customTitle, "My Custom Chat Name");
  } finally {
    await server.close();
  }
});

test("PATCH /panel/preference returns 403 Forbidden when user has no permissions to write (pin/mute)", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    
    // Case 1: Không có quyền read
    const patchRes = await server.patch("/api/conversations/forbidden-conv/panel/preference", {
      isPinned: true,
    }, token);
    assert.equal(patchRes.response.status, 403);
    assert.equal(patchRes.body.error.code, "FORBIDDEN");

    // Case 2: Có quyền read nhưng không có quyền pin/mute
    const patchRes2 = await server.patch("/api/conversations/no-pin-mute-conv/panel/preference", {
      isPinned: true,
    }, token);
    assert.equal(patchRes2.response.status, 403);
    assert.equal(patchRes2.body.error.code, "FORBIDDEN");
  } finally {
    await server.close();
  }
});

test("Resources API - returns media items correctly when requested", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const mockMedia = {
      items: [
        { _id: "f1", messageId: "m1", originalName: "pic.png", mimeType: "image/png", size: 100, url: "http://url" }
      ],
      hasMore: false,
      nextCursor: null
    };
    server.resourceMock.setMockMedia(mockMedia);

    const { response, body } = await server.get("/api/conversations/conv-123/panel/resources?scopes=media", token);

    assert.equal(response.status, 200);
    assert.equal(body.version, 1);
    assert.equal(body.resourcesPreview.media.status, "success");
    assert.deepEqual(body.resourcesPreview.media.items, mockMedia.items);
    assert.equal(body.resourcesPreview.media.hasMore, false);
    // Các scope khác không được yêu cầu sẽ không chạy
    assert.equal(body.resourcesPreview.files, undefined);
    assert.equal(body.resourcesPreview.links, undefined);
  } finally {
    await server.close();
  }
});

test("Resources API - handles error and timeout in loaders and returns 200 with status error", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");

    // Case 1: Lỗi ném ra từ loader
    const resError = await server.get("/api/conversations/error-media-conv/panel/resources?scopes=media", token);
    assert.equal(resError.response.status, 200);
    assert.equal(resError.body.resourcesPreview.media.status, "error");
    assert.deepEqual(resError.body.resourcesPreview.media.items, []);

    // Case 2: Loader bị timeout
    const resTimeout = await server.get("/api/conversations/timeout-media-conv/panel/resources?scopes=media", token);
    assert.equal(resTimeout.response.status, 200);
    assert.equal(resTimeout.body.resourcesPreview.media.status, "error");
    assert.deepEqual(resTimeout.body.resourcesPreview.media.items, []);
  } finally {
    await server.close();
  }
});

test("Resources API - returns files and links correctly when requested", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const mockFiles = {
      items: [
        { _id: "f2", messageId: "m2", originalName: "doc.pdf", mimeType: "application/pdf", size: 500, url: "http://url-doc" }
      ],
      hasMore: false,
      nextCursor: null
    };
    const mockLinks = {
      items: [
        { url: "https://google.com", hostname: "google.com", messageId: "m3" }
      ],
      hasMore: false,
      nextCursor: null
    };
    server.resourceMock.setMockFiles(mockFiles);
    server.resourceMock.setMockLinks(mockLinks);

    const { response, body } = await server.get("/api/conversations/conv-123/panel/resources?scopes=files,links", token);

    assert.equal(response.status, 200);
    assert.equal(body.version, 1);
    assert.equal(body.resourcesPreview.files.status, "success");
    assert.deepEqual(body.resourcesPreview.files.items, mockFiles.items);
    assert.equal(body.resourcesPreview.links.status, "success");
    assert.deepEqual(body.resourcesPreview.links.items, mockLinks.items);
    assert.equal(body.resourcesPreview.media, undefined);
  } finally {
    await server.close();
  }
});

test("Resources API - handles error and timeout in files and links loaders", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");

    // Lỗi loader files
    const resErrorFiles = await server.get("/api/conversations/error-files-conv/panel/resources?scopes=files", token);
    assert.equal(resErrorFiles.response.status, 200);
    assert.equal(resErrorFiles.body.resourcesPreview.files.status, "error");

    // Timeout loader links
    const resTimeoutLinks = await server.get("/api/conversations/timeout-links-conv/panel/resources?scopes=links", token);
    assert.equal(resTimeoutLinks.response.status, 200);
    assert.equal(resTimeoutLinks.body.resourcesPreview.links.status, "error");
  } finally {
    await server.close();
  }
});

test("Resources API - supports membership scope query parameter", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const mockMembership = {
      commonGroups: [],
      membersPreview: [
        { _id: "u1", displayName: "User One", avatar: "avatar1", role: "admin", isOnline: true }
      ],
      hasMoreMembers: false,
      nextMemberCursor: null
    };
    server.resourceMock.setMockMembership(mockMembership);

    const { response, body } = await server.get("/api/conversations/conv-123/panel/resources?scopes=membership", token);

    assert.equal(response.status, 200);
    assert.equal(body.version, 1);
    assert.equal(body.membership.status, "success");
    assert.deepEqual(body.membership.membersPreview, mockMembership.membersPreview);
    assert.equal(body.resourcesPreview, undefined);
  } finally {
    await server.close();
  }
});

test("Resources API - handles error and timeout in membership loader", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");

    // Lỗi loader membership
    const resError = await server.get("/api/conversations/error-membership-conv/panel/resources?scopes=membership", token);
    assert.equal(resError.response.status, 200);
    assert.equal(resError.body.membership.status, "error");
    assert.deepEqual(resError.body.membership.membersPreview, []);

    // Timeout loader membership
    const resTimeout = await server.get("/api/conversations/timeout-membership-conv/panel/resources?scopes=membership", token);
    assert.equal(resTimeout.response.status, 200);
    assert.equal(resTimeout.body.membership.status, "error");
  } finally {
    await server.close();
  }
});

test("Action API - POST /panel/leave successfully leaves group", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    server.groupMock.setMockGroup({ admin: "user-2" });
    const { response, body } = await server.post("/api/conversations/group-123/panel/leave", {}, token);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Rời nhóm thành công");
  } finally {
    await server.close();
  }
});

test("Action API - POST /panel/leave returns 403 when canLeave is false", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const { response } = await server.post("/api/conversations/forbidden-conv/panel/leave", {}, token);

    assert.equal(response.status, 403);
  } finally {
    await server.close();
  }
});

test("Action API - POST /panel/delete successfully soft-deletes history", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");
    const { response, body } = await server.post("/api/conversations/conv-123/panel/delete", {}, token);

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Xóa lịch sử trò chuyện thành công");
  } finally {
    await server.close();
  }
});

test("Resources API - passes specific preview limits to loaders (media: 6, files: 3, links: 3, direct membership: 3, group membership: 5)", async () => {
  const server = await createTestServer({
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
  });

  try {
    const token = generateToken("user-1");

    const limitsCaptured = {};
    server.resourceMock.loadMedia = async (conversationId, limit, cursor, userId) => {
      limitsCaptured.media = limit;
      return { items: [], hasMore: false, nextCursor: null };
    };
    server.resourceMock.loadFiles = async (conversationId, limit, cursor, userId) => {
      limitsCaptured.files = limit;
      return { items: [], hasMore: false, nextCursor: null };
    };
    server.resourceMock.loadLinks = async (conversationId, limit, cursor, userId) => {
      limitsCaptured.links = limit;
      return { items: [], hasMore: false, nextCursor: null };
    };
    server.resourceMock.loadMembership = async (conversationId, limit, cursor, userId) => {
      limitsCaptured.membership = limit;
      return { commonGroups: [], membersPreview: [], hasMoreMembers: false, nextMemberCursor: null };
    };

    // Call for direct chat
    await server.get("/api/conversations/user-1_user-2/panel/resources", token);

    assert.equal(limitsCaptured.media, 6);
    assert.equal(limitsCaptured.files, 3);
    assert.equal(limitsCaptured.links, 3);
    assert.equal(limitsCaptured.membership, 3);

    // Call for group chat
    await server.get("/api/conversations/group-123/panel/resources?scopes=membership", token);
    assert.equal(limitsCaptured.membership, 5);
  } finally {
    await server.close();
  }
});



