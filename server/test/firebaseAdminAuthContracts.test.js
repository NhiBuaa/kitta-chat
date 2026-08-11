const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

const authControllerPath = require.resolve("../src/controllers/authController");
const firebaseAdminPath = require.resolve("../src/config/firebaseAdmin");
const userModelPath = require.resolve("../src/models/User");
const avatarQueueServicePath = require.resolve("../src/services/avatarQueueService");

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const clearControllerCache = () => {
  delete require.cache[authControllerPath];
  delete require.cache[firebaseAdminPath];
  delete require.cache[userModelPath];
  delete require.cache[avatarQueueServicePath];
};

const loadGoogleLogin = ({ verifyIdToken }) => {
  clearControllerCache();

  class FakeUser {
    constructor(data) {
      Object.assign(this, data);
      this._id = "firebase-auth-contract-user";
    }

    async save() {
      return this;
    }

    static async findOne() {
      FakeUser.findOneCalls += 1;
      return null;
    }
  }
  FakeUser.findOneCalls = 0;

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: FakeUser,
  };
  require.cache[firebaseAdminPath] = {
    id: firebaseAdminPath,
    filename: firebaseAdminPath,
    loaded: true,
    exports: {
      auth() {
        return { verifyIdToken };
      },
    },
  };
  require.cache[avatarQueueServicePath] = {
    id: avatarQueueServicePath,
    filename: avatarQueueServicePath,
    loaded: true,
    exports: {
      async queueRemoteAvatarProcessing() {
        return { queued: true, requestId: "avatar-job-1", queueError: null };
      },
    },
  };

  return { googleLogin: require(authControllerPath).googleLogin, FakeUser };
};

test("firebaseAdmin auth reuses its initialized Admin app for repeated callers", () => {
  const originalLoad = Module._load;
  const syntheticServiceAccount = { project_id: "test-project" };
  const authClient = { verifyIdToken: async () => ({}) };
  const apps = [];
  const initializedApp = { name: "[DEFAULT]" };
  const authApps = [];
  delete require.cache[firebaseAdminPath];

  Module._load = function load(request, parent, isMain) {
    if (request === "firebase-admin/app" && parent?.filename === firebaseAdminPath) {
      return {
        cert: () => ({ type: "synthetic-cert" }),
        getApps: () => apps,
        initializeApp: () => {
          apps.push(initializedApp);
          return initializedApp;
        },
      };
    }
    if (request === "firebase-admin/auth" && parent?.filename === firebaseAdminPath) {
      return {
        getAuth: (app) => {
          authApps.push(app);
          return authClient;
        },
      };
    }
    if (request === "./firebase-service.json" && parent?.filename === firebaseAdminPath) {
      return syntheticServiceAccount;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const firebaseAdmin = require(firebaseAdminPath);

    assert.equal(firebaseAdmin.auth(), authClient);
    assert.equal(firebaseAdmin.auth(), authClient);
    assert.equal(apps.length, 1);
    assert.deepEqual(authApps, [initializedApp, initializedApp]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[firebaseAdminPath];
  }
});

test("googleLogin accepts a valid verified Firebase token", async () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "firebase-auth-contract-test-secret";
  let verifiedToken = null;

  try {
    const { googleLogin, FakeUser } = loadGoogleLogin({
      async verifyIdToken(token) {
        verifiedToken = token;
        return { email: "alice@example.com", name: "Alice" };
      },
    });
    const res = createResponse();

    await googleLogin({ body: { token: "valid-firebase-id-token" } }, res);

    assert.equal(verifiedToken, "valid-firebase-id-token");
    assert.equal(FakeUser.findOneCalls, 1);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, "alice@example.com");
  } finally {
    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }
    clearControllerCache();
  }
});

test("googleLogin sanitizes Firebase token verification failures as 401", async () => {
  const providerFailure = new Error("provider token details must not reach the client");
  const originalError = console.error;
  console.error = () => {};

  try {
    const { googleLogin, FakeUser } = loadGoogleLogin({
      async verifyIdToken() {
        throw providerFailure;
      },
    });
    const res = createResponse();

    await googleLogin({ body: { token: "rejected-firebase-id-token" } }, res);

    assert.equal(FakeUser.findOneCalls, 0);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      success: false,
      message: "Token không hợp lệ",
    });
    assert.doesNotMatch(JSON.stringify(res.body), /provider token details/i);
  } finally {
    console.error = originalError;
    clearControllerCache();
  }
});

test("googleLogin rejects a verified token without an email as 400", async () => {
  try {
    const { googleLogin, FakeUser } = loadGoogleLogin({
      async verifyIdToken() {
        return { name: "Alice" };
      },
    });
    const res = createResponse();

    await googleLogin({ body: { token: "token-without-email" } }, res);

    assert.equal(FakeUser.findOneCalls, 0);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      success: false,
      message: "Token không hợp lệ",
    });
  } finally {
    clearControllerCache();
  }
});
