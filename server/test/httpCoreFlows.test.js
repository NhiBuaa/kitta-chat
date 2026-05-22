const assert = require("node:assert/strict");
const test = require("node:test");

const jwt = require("jsonwebtoken");

const appPath = require.resolve("../src/app");
const authRoutesPath = require.resolve("../src/routes/auth");
const userRoutesPath = require.resolve("../src/routes/user");
const messageRoutesPath = require.resolve("../src/routes/messages");
const authControllerPath = require.resolve("../src/controllers/authController");
const userControllerPath = require.resolve("../src/controllers/userController");
const messageControllerPath = require.resolve("../src/controllers/messageController");
const userModelPath = require.resolve("../src/models/User");
const messageModelPath = require.resolve("../src/models/Message");
const groupModelPath = require.resolve("../src/models/Group");
const firebaseAdminPath = require.resolve("../src/config/firebaseAdmin");
const avatarQueueServicePath = require.resolve("../src/services/avatarQueueService");
const passwordResetNotificationServicePath = require.resolve(
  "../src/services/passwordResetNotificationService",
);
const cacheServicePath = require.resolve("../src/services/cacheService");
const friendCacheServicePath = require.resolve("../src/services/friendCacheService");
const presenceServicePath = require.resolve("../src/services/presenceService");
const conversationCacheServicePath = require.resolve("../src/services/conversationCacheService");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");

const pathsToClear = [
  appPath,
  authRoutesPath,
  userRoutesPath,
  messageRoutesPath,
  authControllerPath,
  userControllerPath,
  messageControllerPath,
  userModelPath,
  messageModelPath,
  groupModelPath,
  firebaseAdminPath,
  avatarQueueServicePath,
  passwordResetNotificationServicePath,
  cacheServicePath,
  friendCacheServicePath,
  presenceServicePath,
  conversationCacheServicePath,
  presenceHandlerPath,
];

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearAppCache = () => {
  for (const path of pathsToClear) {
    delete require.cache[path];
  }
};

const createQuery = (rows) => ({
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  populate() {
    return this;
  },
  select() {
    return this;
  },
  then(resolve, reject) {
    return Promise.resolve(rows).then(resolve, reject);
  },
});

const createInMemoryModels = () => {
  const users = [];
  const messages = [];

  class User {
    constructor(data) {
      Object.assign(this, data);
      this._id = data._id || `user-${users.length + 1}`;
      this.activityStatus = data.activityStatus || {
        state: "active",
        lastSeen: new Date(),
      };
      this.status = data.status || "Chào bạn, tôi đang dùng KittaChat.";
      this.friends = data.friends || [];
      this.friendRequests = data.friendRequests || [];
    }

    async save() {
      const existingIndex = users.findIndex((user) => user._id === this._id);
      if (existingIndex >= 0) {
        users[existingIndex] = this;
      } else {
        users.push(this);
      }
      return this;
    }

    toObject() {
      return { ...this };
    }

    static async findOne(query) {
      if (query.email) {
        return users.find((user) => user.email === query.email) || null;
      }
      return null;
    }

    static async findById(id) {
      return users.find((user) => user._id === id) || null;
    }
  }

  class Message {
    constructor(data) {
      Object.assign(this, data);
      this._id = data._id || `message-${messages.length + 1}`;
      this.createdAt = data.createdAt || new Date();
    }

    async save() {
      messages.push(this);
      return this;
    }

    async populate() {
      return this;
    }

    static find(query) {
      const rows = messages
        .filter((message) => message.conversationId === query.conversationId)
        .sort((left, right) => String(right._id).localeCompare(String(left._id)));
      return createQuery(rows);
    }
  }

  const Group = {
    find() {
      return createQuery([]);
    },
  };

  return { User, Message, Group, users, messages };
};

const createTestServer = async ({ authRateLimits } = {}) => {
  clearAppCache();

  const models = createInMemoryModels();

  mockModule(userModelPath, models.User);
  mockModule(messageModelPath, models.Message);
  mockModule(groupModelPath, models.Group);
  mockModule(firebaseAdminPath, {
    auth() {
      return { verifyIdToken: async () => ({}) };
    },
  });
  mockModule(avatarQueueServicePath, {
    queueRemoteAvatarProcessing: async () => ({ queued: false }),
  });
  mockModule(passwordResetNotificationServicePath, {
    queuePasswordResetEmail: async () => ({ queued: false }),
  });
  mockModule(cacheServicePath, {
    invalidateUserProfile: async () => {},
    getCachedUserProfile: async (userId) => {
      const user = await models.User.findById(userId);
      if (!user) return null;
      const userObject = user.toObject();
      delete userObject.password;
      return userObject;
    },
  });
  mockModule(friendCacheServicePath, {
    addFriendWriteThrough: async () => {},
    removeFriendWriteThrough: async () => {},
    getFriendIdsFromCache: async () => [],
  });
  mockModule(presenceServicePath, {
    getMultiPresence: async () => ({}),
    getUserPresence: async () => null,
    setPresenceWriteThrough: async () => {},
  });
  mockModule(conversationCacheServicePath, {
    getRecentConversations: async () => [],
  });
  mockModule(presenceHandlerPath, {
    broadcastUserStatus: async () => {},
  });

  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "http-integration-test-secret";

  const { createApp } = require(appPath);
  const app = createApp({
    rabbitConnectionManager: {
      checkStatus: async () => "mocked",
    },
    authRateLimits,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    models,
    async request(path, options = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });
      const body = await response.json();
      return { response, body };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      if (previousJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousJwtSecret;
      }
      clearAppCache();
    },
  };
};

test("auth register and login work through the Express HTTP API", async () => {
  const testServer = await createTestServer();

  try {
    const registerResult = await testServer.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Alice",
        email: "Alice@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      }),
    });

    assert.equal(registerResult.response.status, 201);
    assert.equal(registerResult.body.success, true);
    assert.equal(registerResult.body.user.email, "alice@example.com");
    assert.equal(registerResult.body.user.password, undefined);

    const loginResult = await testServer.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        password: "Password1!",
      }),
    });

    assert.equal(loginResult.response.status, 200);
    assert.equal(loginResult.body.success, true);
    assert.ok(loginResult.body.token);

    const decoded = jwt.verify(loginResult.body.token, process.env.JWT_SECRET);
    assert.equal(decoded.id, registerResult.body.user._id);
  } finally {
    await testServer.close();
  }
});

test("profile endpoint rejects missing tokens and returns the authenticated user", async () => {
  const testServer = await createTestServer();

  try {
    await testServer.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Alice",
        email: "alice@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      }),
    });
    const loginResult = await testServer.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        password: "Password1!",
      }),
    });

    const missingTokenResult = await testServer.request("/api/users/profile");
    assert.equal(missingTokenResult.response.status, 401);
    assert.equal(missingTokenResult.body.success, false);
    assert.deepEqual(missingTokenResult.body.error, {
      code: "AUTH_REQUIRED",
      message: "Truy cập bị từ chối. Vui lòng đăng nhập!",
    });
    assert.ok(missingTokenResult.body.requestId);

    const profileResult = await testServer.request("/api/users/profile", {
      headers: {
        authorization: `Bearer ${loginResult.body.token}`,
      },
    });

    assert.equal(profileResult.response.status, 200);
    assert.equal(profileResult.body.success, true);
    assert.equal(profileResult.body.user.email, "alice@example.com");
    assert.equal(profileResult.body.user.password, undefined);
  } finally {
    await testServer.close();
  }
});

test("auth login returns a standardized error for invalid credentials", async () => {
  const testServer = await createTestServer();

  try {
    await testServer.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Alice",
        email: "alice@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      }),
    });

    const loginResult = await testServer.request("/api/auth/login", {
      method: "POST",
      headers: {
        "x-request-id": "req-invalid-login",
      },
      body: JSON.stringify({
        email: "alice@example.com",
        password: "WrongPassword1!",
      }),
    });

    assert.equal(loginResult.response.status, 400);
    assert.equal(loginResult.body.success, false);
    assert.deepEqual(loginResult.body.error, {
      code: "INVALID_CREDENTIALS",
      message: "Email hoặc mật khẩu không đúng",
    });
    assert.equal(loginResult.body.message, "Email hoặc mật khẩu không đúng");
    assert.equal(loginResult.body.requestId, "req-invalid-login");
  } finally {
    await testServer.close();
  }
});

test("message create and fetch work through the Express HTTP API", async () => {
  const testServer = await createTestServer();

  try {
    const createResult = await testServer.request("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        sender: "user-1",
        receiver: "user-2",
        text: "hello from integration test",
      }),
    });

    assert.equal(createResult.response.status, 200);
    assert.equal(createResult.body.conversationId, "user-1_user-2");
    assert.equal(createResult.body.text, "hello from integration test");

    const fetchResult = await testServer.request("/api/messages/user-1/user-2");

    assert.equal(fetchResult.response.status, 200);
    assert.equal(fetchResult.body.success, true);
    assert.equal(fetchResult.body.data.length, 1);
    assert.equal(fetchResult.body.data[0].text, "hello from integration test");
  } finally {
    await testServer.close();
  }
});

test("message create returns a standardized validation error when receiver is missing", async () => {
  const testServer = await createTestServer();

  try {
    const createResult = await testServer.request("/api/messages", {
      method: "POST",
      headers: {
        "x-request-id": "req-message-validation",
      },
      body: JSON.stringify({
        sender: "user-1",
        text: "missing receiver",
      }),
    });

    assert.equal(createResult.response.status, 400);
    assert.equal(createResult.body.success, false);
    assert.deepEqual(createResult.body.error, {
      code: "MESSAGE_RECIPIENT_REQUIRED",
      message: "Thiếu thông tin người gửi/nhận",
    });
    assert.equal(createResult.body.message, "Thiếu thông tin người gửi/nhận");
    assert.equal(createResult.body.requestId, "req-message-validation");
  } finally {
    await testServer.close();
  }
});


test("auth rate limiter returns standardized 429 after repeated login attempts", async () => {
  const testServer = await createTestServer({
    authRateLimits: {
      login: { windowMs: 60_000, max: 2 },
      register: { windowMs: 60_000, max: 100 },
      forgotPassword: { windowMs: 60_000, max: 100 },
    },
  });

  try {
    await testServer.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Alice",
        email: "alice@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      }),
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await testServer.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: "alice@example.com",
          password: "WrongPassword1!",
        }),
      });
      assert.equal(result.response.status, 400);
    }

    const limitedResult = await testServer.request("/api/auth/login", {
      method: "POST",
      headers: {
        "x-request-id": "req-rate-limit-login",
      },
      body: JSON.stringify({
        email: "alice@example.com",
        password: "WrongPassword1!",
      }),
    });

    assert.equal(limitedResult.response.status, 429);
    assert.equal(limitedResult.body.success, false);
    assert.deepEqual(limitedResult.body.error, {
      code: "RATE_LIMITED",
      message: "Too many login attempts. Please try again later.",
    });
    assert.equal(limitedResult.body.message, "Too many login attempts. Please try again later.");
    assert.equal(limitedResult.body.requestId, "req-rate-limit-login");
  } finally {
    await testServer.close();
  }
});

test("auth rate limiter protects register and forgot-password routes", async () => {
  const testServer = await createTestServer({
    authRateLimits: {
      login: { windowMs: 60_000, max: 100 },
      register: { windowMs: 60_000, max: 1 },
      forgotPassword: { windowMs: 60_000, max: 1 },
    },
  });

  try {
    const firstRegister = await testServer.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Alice",
        email: "alice@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      }),
    });
    assert.equal(firstRegister.response.status, 201);

    const limitedRegister = await testServer.request("/api/auth/register", {
      method: "POST",
      headers: {
        "x-request-id": "req-rate-limit-register",
      },
      body: JSON.stringify({
        displayName: "Bob",
        email: "bob@example.com",
        password: "Password1!",
        confirmPassword: "Password1!",
      }),
    });
    assert.equal(limitedRegister.response.status, 429);
    assert.equal(limitedRegister.body.error.code, "RATE_LIMITED");
    assert.equal(limitedRegister.body.requestId, "req-rate-limit-register");

    const firstForgot = await testServer.request("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    assert.equal(firstForgot.response.status, 200);

    const limitedForgot = await testServer.request("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "x-request-id": "req-rate-limit-forgot",
      },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    assert.equal(limitedForgot.response.status, 429);
    assert.equal(limitedForgot.body.error.code, "RATE_LIMITED");
    assert.equal(limitedForgot.body.requestId, "req-rate-limit-forgot");
  } finally {
    await testServer.close();
  }
});
