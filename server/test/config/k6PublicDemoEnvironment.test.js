const assert = require("node:assert/strict");
const test = require("node:test");

const {
  K6_BINDING_MATRIX,
  validateK6PublicDemoEnvironment,
} = require("../../src/config/k6PublicDemoEnvironment");
const { validateServerEnv } = require("../../src/config/env");

const backendEnv = () => ({
  AUTH_COOKIE_SECURE: "true",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_REGION: "ap-southeast-1",
  AWS_S3_BUCKET_NAME: "kittachat-public-demo-nhibuaa",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  CALL_DISTRIBUTED_TIMEOUT_ENABLED: "false",
  CALL_DISTRIBUTED_TIMEOUT_POLL_MS: "1000",
  CONVERSATION_DUAL_WRITE_ENABLED: "false",
  CONVERSATION_PANEL_ENABLED: "false",
  CONVERSATION_PANEL_RATE_LIMIT: "30",
  CONVERSATION_PANEL_RESOURCES_ENABLED: "false",
  CONVERSATION_SHADOW_COMPARE_ENABLED: "false",
  CONVERSATION_SIDEBAR_READ_MODEL_ENABLED: "false",
  CORS_ALLOWED_ORIGINS: "https://kittachat-public-demo.test",
  DEFAULT_AVATAR: "https://assets.example.test/avatar.png",
  JWT_SECRET: "test-jwt-secret",
  K6_CAPABILITY_CALLS: "true",
  K6_CAPABILITY_GOOGLE_LOGIN: "false",
  K6_CAPABILITY_ISSUE61_MEASUREMENT: "false",
  K6_CAPABILITY_RECOVERY: "false",
  K6_CAPABILITY_UPLOAD: "false",
  K6_SYNTHETIC_SIGNUP_ONLY: "true",
  K6_TARGET: "public-demo",
  METRICS_ENABLED: "false",
  MONGO_URI: "mongodb://database.invalid/shot-chat",
  NODE_ENV: "production",
  NODE_NAME: "backend",
  PORT: "3000",
  RABBITMQ_MAX_ATTEMPTS: "3",
  RABBITMQ_RETRY_DELAY_MS: "30000",
  RABBITMQ_URL: "amqps://broker.invalid/vhost",
  RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "30000",
  RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1000",
  REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES: "",
  REDIS_URL: "rediss://redis.invalid:6379",
  REFRESH_TOKEN_SECRET: "test-refresh-secret",
  URL_FRONTEND: "https://kittachat-public-demo.test",
});

const imageWorkerEnv = () => ({
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_REGION: "ap-southeast-1",
  AWS_S3_BUCKET_NAME: "kittachat-public-demo-nhibuaa",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  IMAGE_WORKER_CONCURRENCY: "2",
  MONGO_URI: "mongodb://database.invalid/shot-chat",
  NODE_ENV: "production",
  NODE_NAME: "image-worker",
  RABBITMQ_MAX_ATTEMPTS: "3",
  RABBITMQ_RETRY_DELAY_MS: "30000",
  RABBITMQ_URL: "amqps://broker.invalid/vhost",
  RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "30000",
  RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1000",
  REDIS_URL: "rediss://redis.invalid:6379",
});

const auditWorkerEnv = () => ({
  AUDIT_WORKER_CONCURRENCY: "10",
  NODE_ENV: "production",
  NODE_NAME: "audit-worker",
  RABBITMQ_MAX_ATTEMPTS: "3",
  RABBITMQ_RETRY_DELAY_MS: "30000",
  RABBITMQ_URL: "amqps://broker.invalid/vhost",
  RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "30000",
  RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1000",
});

test("K6 exposes the exact approved recipient key matrix", () => {
  assert.deepEqual(K6_BINDING_MATRIX.backend, Object.keys(backendEnv()).sort());
  assert.deepEqual(K6_BINDING_MATRIX.imageWorker, Object.keys(imageWorkerEnv()).sort());
  assert.deepEqual(K6_BINDING_MATRIX.auditWorker, Object.keys(auditWorkerEnv()).sort());
  assert.deepEqual(K6_BINDING_MATRIX.edgeRuntime, [
    "BACKEND_UPSTREAM",
    "K6_CAPABILITY_CALLS",
    "K6_CAPABILITY_GOOGLE_LOGIN",
    "K6_CAPABILITY_ISSUE61_MEASUREMENT",
    "K6_CAPABILITY_RECOVERY",
    "K6_CAPABILITY_UPLOAD",
    "K6_RUNTIME_CONFIG_FILE",
    "K6_TARGET",
  ]);
  assert.deepEqual(K6_BINDING_MATRIX.edgeBuild, [
    "VITE_API_URL",
    "VITE_API_URL_AUTH",
    "VITE_API_URL_CALLS",
    "VITE_API_URL_FILES",
    "VITE_API_URL_GROUPS",
    "VITE_API_URL_MESSAGES",
    "VITE_API_URL_USERS",
    "VITE_TARGET",
  ]);
  assert.deepEqual(K6_BINDING_MATRIX.notificationWorker, []);
  assert.deepEqual(K6_BINDING_MATRIX.oneOffSeed, [
    "ALLOW_REMOTE_DEMO_SEED",
    "DEMO_SEED_PASSWORD",
    "MONGO_URI",
  ]);
});

test("backend public-demo environment resolves explicit capability state", () => {
  const result = validateK6PublicDemoEnvironment({
    service: "backend",
    env: backendEnv(),
    bindingKeys: Object.keys(backendEnv()),
  });

  assert.deepEqual(result.capabilities, {
    calls: true,
    googleLogin: false,
    issue61Measurement: false,
    recovery: false,
    syntheticSignupOnly: true,
    upload: false,
  });
  assert.equal(result.targetName, "public-demo");
  assert.deepEqual(result.bindingKeys, K6_BINDING_MATRIX.backend);
});

test("public-demo validation rejects missing, malformed, excessive, and cross-service bindings without values", () => {
  const cases = [
    { env: { ...backendEnv(), K6_CAPABILITY_CALLS: "enabled" }, mutate: (keys) => keys },
    { env: backendEnv(), mutate: (keys) => keys.filter((key) => key !== "JWT_SECRET") },
    { env: { ...backendEnv(), K6_UNAPPROVED_SETTING: "private-value" }, mutate: (keys) => [...keys, "K6_UNAPPROVED_SETTING"] },
    { env: { ...imageWorkerEnv(), JWT_SECRET: "must-not-leak" }, service: "imageWorker", mutate: (keys) => [...keys, "JWT_SECRET"] },
    { env: { ...auditWorkerEnv(), MONGO_URI: "mongodb://forbidden.invalid/db" }, service: "auditWorker", mutate: (keys) => [...keys, "MONGO_URI"] },
  ];

  for (const entry of cases) {
    const bindingKeys = entry.mutate(Object.keys(entry.env).filter((key) => key !== "K6_UNAPPROVED_SETTING" && !(entry.service && ["JWT_SECRET", "MONGO_URI"].includes(key))));
    assert.throws(
      () => validateK6PublicDemoEnvironment({
        service: entry.service || "backend",
        env: entry.env,
        bindingKeys,
      }),
      (error) => {
        assert.equal(error.name, "K6EnvironmentValidationError");
        assert.doesNotMatch(error.message, /private-value|must-not-leak|forbidden\.invalid/);
        return true;
      },
    );
  }
});

test("platform process variables are outside the explicit binding manifest", () => {
  const env = {
    ...backendEnv(),
    RAILWAY_PROJECT_ID: "platform-owned",
    PATH: "platform-path",
    HOME: "platform-home",
  };
  const result = validateK6PublicDemoEnvironment({
    service: "backend",
    env,
    bindingKeys: Object.keys(backendEnv()),
  });

  assert.deepEqual(result.bindingKeys, K6_BINDING_MATRIX.backend);
});

test("worker validation accepts only the approved fixed public-demo values", () => {
  assert.equal(validateK6PublicDemoEnvironment({
    service: "imageWorker",
    env: imageWorkerEnv(),
    bindingKeys: Object.keys(imageWorkerEnv()),
  }).service, "imageWorker");
  assert.equal(validateK6PublicDemoEnvironment({
    service: "auditWorker",
    env: auditWorkerEnv(),
    bindingKeys: Object.keys(auditWorkerEnv()),
  }).service, "auditWorker");

  for (const [service, env, key, invalid] of [
    ["backend", backendEnv(), "PORT", "8080"],
    ["backend", backendEnv(), "METRICS_ENABLED", "true"],
    ["backend", backendEnv(), "K6_CAPABILITY_UPLOAD", "true"],
    ["imageWorker", imageWorkerEnv(), "IMAGE_WORKER_CONCURRENCY", "3"],
    ["auditWorker", auditWorkerEnv(), "AUDIT_WORKER_CONCURRENCY", "11"],
  ]) {
    assert.throws(
      () => validateK6PublicDemoEnvironment({
        service,
        env: { ...env, [key]: invalid },
        bindingKeys: Object.keys(env),
      }),
      (error) => error.name === "K6EnvironmentValidationError" && error.message.includes(key),
    );
  }
});

test("edge, excluded notification, and one-off seed adapters enforce exact bindings", () => {
  const edgeRuntime = {
    BACKEND_UPSTREAM: "backend.railway.internal:3000",
    K6_CAPABILITY_CALLS: "true",
    K6_CAPABILITY_GOOGLE_LOGIN: "false",
    K6_CAPABILITY_ISSUE61_MEASUREMENT: "false",
    K6_CAPABILITY_RECOVERY: "false",
    K6_CAPABILITY_UPLOAD: "false",
    K6_RUNTIME_CONFIG_FILE: "/etc/nginx/runtime-config.json",
    K6_TARGET: "public-demo",
  };
  const edgeBuild = {
    VITE_API_URL: "/",
    VITE_API_URL_AUTH: "/api/auth",
    VITE_API_URL_CALLS: "/api/calls",
    VITE_API_URL_FILES: "/api/files",
    VITE_API_URL_GROUPS: "/api/groups",
    VITE_API_URL_MESSAGES: "/api/messages",
    VITE_API_URL_USERS: "/api/users",
    VITE_TARGET: "public-demo",
  };
  const seed = {
    ALLOW_REMOTE_DEMO_SEED: "true",
    DEMO_SEED_PASSWORD: "test-memory-password",
    MONGO_URI: "mongodb://database.invalid/shot-chat",
  };

  for (const [service, env] of [
    ["edgeRuntime", edgeRuntime],
    ["edgeBuild", edgeBuild],
    ["notificationWorker", {}],
    ["oneOffSeed", seed],
  ]) {
    assert.equal(validateK6PublicDemoEnvironment({
      service,
      env,
      bindingKeys: Object.keys(env),
    }).service, service);
  }

  for (const [service, env, mutation] of [
    ["edgeRuntime", edgeRuntime, { BACKEND_UPSTREAM: "https://backend.railway.internal:3000" }],
    ["edgeBuild", edgeBuild, { VITE_API_URL_AUTH: "https://public.example/api/auth" }],
    ["edgeBuild", edgeBuild, { VITE_DEFAULT_AVATAR: "https://assets.example/avatar.png" }],
    ["notificationWorker", {}, { RABBITMQ_URL: "amqps://forbidden.invalid/vhost" }],
    ["oneOffSeed", seed, { ALLOW_REMOTE_DEMO_SEED: "false" }],
  ]) {
    const invalid = { ...env, ...mutation };
    assert.throws(
      () => validateK6PublicDemoEnvironment({
        service,
        env: invalid,
        bindingKeys: Object.keys(invalid),
      }),
      (error) => error.name === "K6EnvironmentValidationError",
    );
  }
});

test("server startup composes the validated public-demo capability contract", () => {
  const config = validateServerEnv(backendEnv());

  assert.equal(config.targetName, "public-demo");
  assert.deepEqual(config.capabilities, {
    calls: true,
    googleLogin: false,
    issue61Measurement: false,
    recovery: false,
    syntheticSignupOnly: true,
    upload: false,
  });
});

test("ordinary local startup preserves legacy capabilities only with synthetic-only false", () => {
  const config = validateServerEnv({
    MONGO_URI: "mongodb://localhost:27017/shot-chat",
    JWT_SECRET: "local-test-secret",
    URL_FRONTEND: "http://localhost:5173",
    REDIS_URL: "redis://localhost:6379",
    K6_SYNTHETIC_SIGNUP_ONLY: "false",
  });

  assert.equal(config.targetName, "local");
  assert.deepEqual(config.capabilities, {
    calls: true,
    googleLogin: true,
    issue61Measurement: false,
    recovery: true,
    syntheticSignupOnly: false,
    upload: true,
  });

  assert.throws(
    () => validateServerEnv({
      MONGO_URI: "mongodb://localhost:27017/shot-chat",
      JWT_SECRET: "local-test-secret",
      URL_FRONTEND: "http://localhost:5173",
      REDIS_URL: "redis://localhost:6379",
      K6_SYNTHETIC_SIGNUP_ONLY: "true",
    }),
    /K6_SYNTHETIC_SIGNUP_ONLY/,
  );
});

test("server startup rejects unapproved public-demo bindings and never reports values", () => {
  for (const [key, value] of [
    ["EMAIL_PASS", "forbidden-email-secret"],
    ["JWT_UNAPPROVED_SETTING", "forbidden-jwt-setting"],
  ]) {
    assert.throws(
      () => validateServerEnv({ ...backendEnv(), [key]: value }),
      (error) => {
        assert.match(error.message, /approved recipient matrix/);
        assert.doesNotMatch(error.message, /forbidden-email-secret|forbidden-jwt-setting/);
        return true;
      },
    );
  }
});
