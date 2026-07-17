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

const clearModuleCache = () => {
  delete require.cache[require.resolve("../src/app")];
  delete require.cache[require.resolve("../src/routes/conversationPanel")];
  delete require.cache[require.resolve("../src/controllers/conversationPanelController")];
  delete require.cache[permissionServicePath];
  delete require.cache[overviewServicePath];
  delete require.cache[preferenceServicePath];
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

