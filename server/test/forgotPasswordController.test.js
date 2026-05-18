const assert = require("node:assert/strict");
const test = require("node:test");

const authControllerPath = require.resolve("../src/controllers/authController");
const userModelPath = require.resolve("../src/models/User");
const firebaseAdminPath = require.resolve("../src/config/firebaseAdmin");
const passwordResetServicePath = require.resolve("../src/services/passwordResetNotificationService");

const loadAuthController = ({ user, queueResult }) => {
  delete require.cache[authControllerPath];
  delete require.cache[userModelPath];
  delete require.cache[firebaseAdminPath];
  delete require.cache[passwordResetServicePath];

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      async findOne() {
        return user;
      },
    },
  };

  require.cache[firebaseAdminPath] = {
    id: firebaseAdminPath,
    filename: firebaseAdminPath,
    loaded: true,
    exports: {
      auth() {
        return {
          async verifyIdToken() {
            return {};
          },
        };
      },
    },
  };

  require.cache[passwordResetServicePath] = {
    id: passwordResetServicePath,
    filename: passwordResetServicePath,
    loaded: true,
    exports: {
      async queuePasswordResetEmail() {
        return queueResult;
      },
    },
  };

  return require(authControllerPath);
};

const createResponse = () => {
  const response = {
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
  };

  return response;
};

test("forgotPassword returns generic success when password reset email queue publish fails", async () => {
  const previousJwtSecret = process.env.JWT_SECRET;
  const previousFrontendUrl = process.env.URL_FRONTEND;
  const originalError = console.error;
  const logs = [];

  process.env.JWT_SECRET = "test-secret";
  process.env.URL_FRONTEND = "https://app.local";
  console.error = (...args) => logs.push(args);

  try {
    const { forgotPassword } = loadAuthController({
      user: {
        _id: "user-1",
        email: "alice@example.com",
        displayName: "Alice",
        password: "hashed-password",
      },
      queueResult: {
        queued: false,
        requestId: null,
        error: "RabbitMQ unavailable",
      },
    });

    const req = { body: { email: "Alice@Example.com" } };
    const res = createResponse();

    await forgotPassword(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.message, /email/);
    assert.equal(logs.length, 1);
    assert.match(String(logs[0][0]), /queue email failed/);
  } finally {
    console.error = originalError;

    if (previousJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousJwtSecret;
    }

    if (previousFrontendUrl === undefined) {
      delete process.env.URL_FRONTEND;
    } else {
      process.env.URL_FRONTEND = previousFrontendUrl;
    }

    delete require.cache[authControllerPath];
    delete require.cache[userModelPath];
    delete require.cache[firebaseAdminPath];
    delete require.cache[passwordResetServicePath];
  }
});
