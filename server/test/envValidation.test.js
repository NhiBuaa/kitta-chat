const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getConversationMigrationConfig,
  validateServerEnv,
  validateWorkerEnv,
} = require("../src/config/env");

test("validateServerEnv fails fast with actionable missing variable names", () => {
  assert.throws(
    () => validateServerEnv({}),
    (error) => {
      assert.equal(error.name, "ConfigValidationError");
      assert.match(error.message, /server configuration/i);
      assert.match(error.message, /MONGO_URI/);
      assert.match(error.message, /JWT_SECRET/);
      assert.match(error.message, /URL_FRONTEND/);
      assert.match(error.message, /REDIS_URL/);
      return true;
    },
  );
});

test("validateServerEnv accepts Docker-compatible server configuration", () => {
  const config = validateServerEnv({
    MONGO_URI: "mongodb://mongo:27017/shot-chat",
    JWT_SECRET: "replace-with-a-real-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://redis:6379",
    PORT: "3000",
  });

  assert.equal(config.mongoUri, "mongodb://mongo:27017/shot-chat");
  assert.equal(config.jwtSecret, "replace-with-a-real-secret");
  assert.equal(config.frontendUrl, "http://localhost:5173");
  assert.equal(config.redisUrl, "redis://redis:6379");
  assert.equal(config.port, 3000);
});

test("validateServerEnv accepts Redis host and port fallback", () => {
  const config = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_HOST: "localhost",
    REDIS_PORT: "6380",
  });

  assert.equal(config.redisUrl, "redis://localhost:6380");
});

test("validateWorkerEnv validates required worker dependencies and numeric settings", () => {
  const config = validateWorkerEnv({
    workerName: "image",
    env: {
      MONGO_URI: "mongodb://mongo:27017/shot-chat",
      RABBITMQ_URL: "amqp://guest:guest@rabbitmq:5672",
      REDIS_URL: "redis://redis:6379",
      RABBITMQ_MAX_ATTEMPTS: "5",
      RABBITMQ_RETRY_DELAY_MS: "45000",
      RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1500",
      RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "20000",
      IMAGE_WORKER_CONCURRENCY: "3",
    },
  });

  assert.equal(config.workerName, "image");
  assert.equal(config.mongoUri, "mongodb://mongo:27017/shot-chat");
  assert.equal(config.rabbitmqUrl, "amqp://guest:guest@rabbitmq:5672");
  assert.equal(config.redisUrl, "redis://redis:6379");
  assert.equal(config.rabbitmqMaxAttempts, 5);
  assert.equal(config.rabbitmqRetryDelayMs, 45000);
  assert.equal(config.workerReconnectDelayMs, 1500);
  assert.equal(config.workerMaxReconnectDelayMs, 20000);
  assert.equal(config.workerConcurrency, 3);
});

test("validateWorkerEnv rejects invalid numeric worker settings", () => {
  assert.throws(
    () =>
      validateWorkerEnv({
        workerName: "audit",
        env: {
          RABBITMQ_URL: "amqp://guest:guest@localhost:5672",
          AUDIT_WORKER_CONCURRENCY: "0",
          RABBITMQ_MAX_ATTEMPTS: "not-a-number",
        },
      }),
    (error) => {
      assert.equal(error.name, "ConfigValidationError");
      assert.match(error.message, /audit worker configuration/i);
      assert.match(error.message, /AUDIT_WORKER_CONCURRENCY/);
      assert.match(error.message, /RABBITMQ_MAX_ATTEMPTS/);
      return true;
    },
  );
});

test("validateServerEnv defaults conversation dual-write flag to false", () => {
  const config = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
  });

  assert.equal(config.conversationDualWriteEnabled, false);
});

test("validateServerEnv parses conversation dual-write boolean flag", () => {
  const enabled = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    CONVERSATION_DUAL_WRITE_ENABLED: "true",
  });
  const disabled = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    CONVERSATION_DUAL_WRITE_ENABLED: "false",
  });

  assert.equal(enabled.conversationDualWriteEnabled, true);
  assert.equal(disabled.conversationDualWriteEnabled, false);
});

test("validateServerEnv rejects invalid conversation dual-write flag", () => {
  assert.throws(
    () => validateServerEnv({
      MONGO_URI: "mongodb://localhost:27017/shot-chat",
      JWT_SECRET: "test-secret",
      URL_FRONTEND: "http://localhost:5173",
      REDIS_URL: "redis://localhost:6379",
      CONVERSATION_DUAL_WRITE_ENABLED: "yes",
    }),
    (error) => {
      assert.equal(error.name, "ConfigValidationError");
      assert.match(error.message, /CONVERSATION_DUAL_WRITE_ENABLED/);
      return true;
    },
  );
});

test("validateServerEnv defaults conversation shadow compare flag to false", () => {
  const config = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
  });

  assert.equal(config.conversationShadowCompareEnabled, false);
  assert.equal(config.conversationSidebarReadModelEnabled, false);
});

test("validateServerEnv parses conversation sidebar read-model boolean flag", () => {
  const enabled = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    CONVERSATION_SIDEBAR_READ_MODEL_ENABLED: "true",
  });
  const disabled = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    CONVERSATION_SIDEBAR_READ_MODEL_ENABLED: "false",
  });

  assert.equal(enabled.conversationSidebarReadModelEnabled, true);
  assert.equal(disabled.conversationSidebarReadModelEnabled, false);
});

test("validateServerEnv parses conversation shadow compare boolean flag", () => {
  const enabled = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    CONVERSATION_SHADOW_COMPARE_ENABLED: "true",
  });
  const disabled = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    CONVERSATION_SHADOW_COMPARE_ENABLED: "false",
  });

  assert.equal(enabled.conversationShadowCompareEnabled, true);
  assert.equal(disabled.conversationShadowCompareEnabled, false);
});

test("validateServerEnv rejects invalid conversation shadow compare flag", () => {
  assert.throws(
    () => validateServerEnv({
      MONGO_URI: "mongodb://localhost:27017/shot-chat",
      JWT_SECRET: "test-secret",
      URL_FRONTEND: "http://localhost:5173",
      REDIS_URL: "redis://localhost:6379",
      CONVERSATION_SHADOW_COMPARE_ENABLED: "yes",
    }),
    (error) => {
      assert.equal(error.name, "ConfigValidationError");
      assert.match(error.message, /CONVERSATION_SHADOW_COMPARE_ENABLED/);
      return true;
    },
  );
});
test("getConversationMigrationConfig exposes migration flags", () => {
  const config = getConversationMigrationConfig({
    CONVERSATION_DUAL_WRITE_ENABLED: "false",
    CONVERSATION_SHADOW_COMPARE_ENABLED: "true",
    CONVERSATION_SIDEBAR_READ_MODEL_ENABLED: "true",
  });

  assert.equal(config.conversationDualWriteEnabled, false);
  assert.equal(config.conversationShadowCompareEnabled, true);
  assert.equal(config.conversationSidebarReadModelEnabled, true);
});
