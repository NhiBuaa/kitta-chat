const assert = require("node:assert/strict");
const test = require("node:test");

const authControllerPath = require.resolve("../src/controllers/authController");
const userModelPath = require.resolve("../src/models/User");
const firebaseAdminPath = require.resolve("../src/config/firebaseAdmin");
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

const loadAuthController = ({ avatarQueueResult }) => {
  delete require.cache[authControllerPath];
  delete require.cache[userModelPath];
  delete require.cache[firebaseAdminPath];
  delete require.cache[avatarQueueServicePath];

  class FakeUser {
    constructor(data) {
      Object.assign(this, data);
      this._id = "user-google-1";
    }

    async save() {
      return this;
    }

    static async findOne() {
      return null;
    }
  }

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
        return {
          async verifyIdToken() {
            return {
              email: "alice@example.com",
              name: "Alice",
              picture: "https://lh3.googleusercontent.com/avatar.jpg",
            };
          },
        };
      },
    },
  };

  require.cache[avatarQueueServicePath] = {
    id: avatarQueueServicePath,
    filename: avatarQueueServicePath,
    loaded: true,
    exports: {
      async queueRemoteAvatarProcessing() {
        return avatarQueueResult;
      },
    },
  };

  return require(authControllerPath);
};

test("googleLogin succeeds and reports safe avatar queue failure state", async () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  const originalError = console.error;
  const logs = [];

  process.env.JWT_SECRET = "test-secret";
  console.error = (...args) => logs.push(args);

  try {
    const { googleLogin } = loadAuthController({
      avatarQueueResult: {
        queued: false,
        requestId: null,
        error: "connect ECONNREFUSED 127.0.0.1:5672",
        queueError: "Background processing is temporarily unavailable. Please try again later.",
      },
    });
    const req = { body: { token: "firebase-id-token" } };
    const res = createResponse();

    await googleLogin(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.avatarQueue.queued, false);
    assert.equal(res.body.avatarQueue.requestId, null);
    assert.match(res.body.avatarQueue.queueError, /temporarily unavailable/i);
    assert.doesNotMatch(res.body.avatarQueue.queueError, /ECONNREFUSED|5672|RabbitMQ/i);
    assert.equal(logs.length, 1);
    assert.match(String(logs[0][0]), /Queue Google avatar failed/);
  } finally {
    console.error = originalError;

    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }

    delete require.cache[authControllerPath];
    delete require.cache[userModelPath];
    delete require.cache[firebaseAdminPath];
    delete require.cache[avatarQueueServicePath];
  }
});
