const K6_BINDING_MATRIX = Object.freeze({
  backend: Object.freeze([
    "AUTH_COOKIE_SECURE",
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_S3_BUCKET_NAME",
    "AWS_SECRET_ACCESS_KEY",
    "CALL_DISTRIBUTED_TIMEOUT_ENABLED",
    "CALL_DISTRIBUTED_TIMEOUT_POLL_MS",
    "CONVERSATION_DUAL_WRITE_ENABLED",
    "CONVERSATION_PANEL_ENABLED",
    "CONVERSATION_PANEL_RATE_LIMIT",
    "CONVERSATION_PANEL_RESOURCES_ENABLED",
    "CONVERSATION_SHADOW_COMPARE_ENABLED",
    "CONVERSATION_SIDEBAR_READ_MODEL_ENABLED",
    "CORS_ALLOWED_ORIGINS",
    "DEFAULT_AVATAR",
    "JWT_SECRET",
    "K6_CAPABILITY_CALLS",
    "K6_CAPABILITY_GOOGLE_LOGIN",
    "K6_CAPABILITY_ISSUE61_MEASUREMENT",
    "K6_CAPABILITY_RECOVERY",
    "K6_CAPABILITY_UPLOAD",
    "K6_SYNTHETIC_SIGNUP_ONLY",
    "K6_TARGET",
    "METRICS_ENABLED",
    "MONGO_URI",
    "NODE_ENV",
    "NODE_NAME",
    "PORT",
    "RABBITMQ_MAX_ATTEMPTS",
    "RABBITMQ_RETRY_DELAY_MS",
    "RABBITMQ_URL",
    "RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS",
    "RABBITMQ_WORKER_RECONNECT_DELAY_MS",
    "REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES",
    "REDIS_URL",
    "REFRESH_TOKEN_SECRET",
    "URL_FRONTEND",
  ]),
  imageWorker: Object.freeze([
    "AWS_ACCESS_KEY_ID",
    "AWS_REGION",
    "AWS_S3_BUCKET_NAME",
    "AWS_SECRET_ACCESS_KEY",
    "IMAGE_WORKER_CONCURRENCY",
    "MONGO_URI",
    "NODE_ENV",
    "NODE_NAME",
    "RABBITMQ_MAX_ATTEMPTS",
    "RABBITMQ_RETRY_DELAY_MS",
    "RABBITMQ_URL",
    "RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS",
    "RABBITMQ_WORKER_RECONNECT_DELAY_MS",
    "REDIS_URL",
  ]),
  auditWorker: Object.freeze([
    "AUDIT_WORKER_CONCURRENCY",
    "NODE_ENV",
    "NODE_NAME",
    "RABBITMQ_MAX_ATTEMPTS",
    "RABBITMQ_RETRY_DELAY_MS",
    "RABBITMQ_URL",
    "RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS",
    "RABBITMQ_WORKER_RECONNECT_DELAY_MS",
  ]),
  edgeRuntime: Object.freeze([
    "BACKEND_UPSTREAM",
    "K6_CAPABILITY_CALLS",
    "K6_CAPABILITY_GOOGLE_LOGIN",
    "K6_CAPABILITY_ISSUE61_MEASUREMENT",
    "K6_CAPABILITY_RECOVERY",
    "K6_CAPABILITY_UPLOAD",
    "K6_RUNTIME_CONFIG_FILE",
    "K6_TARGET",
  ]),
  edgeBuild: Object.freeze([
    "VITE_API_URL",
    "VITE_API_URL_AUTH",
    "VITE_API_URL_CALLS",
    "VITE_API_URL_FILES",
    "VITE_API_URL_GROUPS",
    "VITE_API_URL_MESSAGES",
    "VITE_API_URL_USERS",
    "VITE_TARGET",
  ]),
  notificationWorker: Object.freeze([]),
  oneOffSeed: Object.freeze([
    "ALLOW_REMOTE_DEMO_SEED",
    "DEMO_SEED_PASSWORD",
    "MONGO_URI",
  ]),
});

class K6EnvironmentValidationError extends Error {
  constructor(service, issues) {
    super(`K6 ${service} environment is invalid: ${issues.join("; ")}`);
    this.name = "K6EnvironmentValidationError";
    this.service = service;
    this.issues = [...issues];
  }
}

const FIXED_VALUES = Object.freeze({
  backend: Object.freeze({
    AUTH_COOKIE_SECURE: "true",
    AWS_REGION: "ap-southeast-1",
    AWS_S3_BUCKET_NAME: "kittachat-public-demo-nhibuaa",
    CALL_DISTRIBUTED_TIMEOUT_ENABLED: "false",
    CALL_DISTRIBUTED_TIMEOUT_POLL_MS: "1000",
    CONVERSATION_DUAL_WRITE_ENABLED: "false",
    CONVERSATION_PANEL_ENABLED: "false",
    CONVERSATION_PANEL_RATE_LIMIT: "30",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "false",
    CONVERSATION_SHADOW_COMPARE_ENABLED: "false",
    CONVERSATION_SIDEBAR_READ_MODEL_ENABLED: "false",
    K6_CAPABILITY_CALLS: "true",
    K6_CAPABILITY_GOOGLE_LOGIN: "false",
    K6_CAPABILITY_ISSUE61_MEASUREMENT: "false",
    K6_CAPABILITY_RECOVERY: "false",
    K6_CAPABILITY_UPLOAD: "false",
    K6_SYNTHETIC_SIGNUP_ONLY: "true",
    K6_TARGET: "public-demo",
    METRICS_ENABLED: "false",
    NODE_ENV: "production",
    NODE_NAME: "backend",
    PORT: "3000",
    RABBITMQ_MAX_ATTEMPTS: "3",
    RABBITMQ_RETRY_DELAY_MS: "30000",
    RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "30000",
    RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1000",
    REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES: "",
  }),
  imageWorker: Object.freeze({
    AWS_REGION: "ap-southeast-1",
    AWS_S3_BUCKET_NAME: "kittachat-public-demo-nhibuaa",
    IMAGE_WORKER_CONCURRENCY: "2",
    NODE_ENV: "production",
    NODE_NAME: "image-worker",
    RABBITMQ_MAX_ATTEMPTS: "3",
    RABBITMQ_RETRY_DELAY_MS: "30000",
    RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "30000",
    RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1000",
  }),
  auditWorker: Object.freeze({
    AUDIT_WORKER_CONCURRENCY: "10",
    NODE_ENV: "production",
    NODE_NAME: "audit-worker",
    RABBITMQ_MAX_ATTEMPTS: "3",
    RABBITMQ_RETRY_DELAY_MS: "30000",
    RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS: "30000",
    RABBITMQ_WORKER_RECONNECT_DELAY_MS: "1000",
  }),
  edgeRuntime: Object.freeze({
    K6_CAPABILITY_CALLS: "true",
    K6_CAPABILITY_GOOGLE_LOGIN: "false",
    K6_CAPABILITY_ISSUE61_MEASUREMENT: "false",
    K6_CAPABILITY_RECOVERY: "false",
    K6_CAPABILITY_UPLOAD: "false",
    K6_TARGET: "public-demo",
  }),
  edgeBuild: Object.freeze({
    VITE_API_URL: "/",
    VITE_API_URL_AUTH: "/api/auth",
    VITE_API_URL_CALLS: "/api/calls",
    VITE_API_URL_FILES: "/api/files",
    VITE_API_URL_GROUPS: "/api/groups",
    VITE_API_URL_MESSAGES: "/api/messages",
    VITE_API_URL_USERS: "/api/users",
    VITE_TARGET: "public-demo",
  }),
  notificationWorker: Object.freeze({}),
  oneOffSeed: Object.freeze({
    ALLOW_REMOTE_DEMO_SEED: "true",
  }),
});

const SECRET_KEYS = new Set([
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "JWT_SECRET",
  "MONGO_URI",
  "RABBITMQ_URL",
  "REDIS_URL",
  "REFRESH_TOKEN_SECRET",
]);

const MANAGED_EXACT_KEYS = new Set(
  Object.values(K6_BINDING_MATRIX).flat(),
);
const MANAGED_PREFIXES = Object.freeze([
  "ALLOW_",
  "AUDIT_",
  "AUTH_",
  "AWS_",
  "CALL_DISTRIBUTED_",
  "CONVERSATION_",
  "CORS_",
  "DEFAULT_",
  "DEMO_",
  "EMAIL_",
  "FIREBASE_",
  "GOOGLE_",
  "IMAGE_",
  "JWT_",
  "K6_",
  "METRICS_",
  "MONGO_",
  "NODE_",
  "PORT_",
  "RABBITMQ_",
  "REDIS_",
  "REFRESH_",
  "URL_",
  "VITE_",
]);

const collectK6BindingKeys = (env = {}) => Object.keys(env)
  .filter((key) => MANAGED_EXACT_KEYS.has(key)
    || MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix))
    || key === "CLOUDFRONT_URL")
  .sort();

const hasExactKeys = (actualKeys, expectedKeys) => actualKeys.length === expectedKeys.length
  && new Set(actualKeys).size === actualKeys.length
  && expectedKeys.every((key) => actualKeys.includes(key));

const isBlank = (value) => value === undefined
  || value === null
  || String(value).trim() === "";

const parseCapability = (env, key) => String(env[key]).toLowerCase() === "true";

const validateK6PublicDemoEnvironment = ({ service, env, bindingKeys } = {}) => {
  const expectedKeys = K6_BINDING_MATRIX[service];
  if (!expectedKeys || !Object.hasOwn(FIXED_VALUES, service)) {
    throw new K6EnvironmentValidationError(service || "unknown", ["service is not a runtime K6 recipient"]);
  }

  const source = env && typeof env === "object" && !Array.isArray(env) ? env : {};
  const actualKeys = Array.isArray(bindingKeys)
    ? [...bindingKeys].sort()
    : collectK6BindingKeys(source);
  const issues = [];

  if (!hasExactKeys(actualKeys, expectedKeys)) {
    issues.push("binding key names must match the approved recipient matrix exactly");
  }

  for (const key of expectedKeys) {
    if (key === "REDIS_RATE_LIMIT_CLUSTER_ROOT_NODES") continue;
    if (isBlank(source[key])) issues.push(`${key} is required`);
  }

  for (const [key, expected] of Object.entries(FIXED_VALUES[service])) {
    if (String(source[key] ?? "") !== expected) {
      issues.push(`${key} must use the approved public-demo value`);
    }
  }

  if (service === "backend") {
    if (source.URL_FRONTEND !== source.CORS_ALLOWED_ORIGINS) {
      issues.push("URL_FRONTEND and CORS_ALLOWED_ORIGINS must be the same exact origin");
    }
    for (const key of [
      "K6_CAPABILITY_CALLS",
      "K6_CAPABILITY_GOOGLE_LOGIN",
      "K6_CAPABILITY_ISSUE61_MEASUREMENT",
      "K6_CAPABILITY_RECOVERY",
      "K6_CAPABILITY_UPLOAD",
      "K6_SYNTHETIC_SIGNUP_ONLY",
    ]) {
      if (!["true", "false"].includes(String(source[key]))) {
        issues.push(`${key} must be an explicit boolean`);
      }
    }
  }

  if (service === "edgeRuntime") {
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:3000$/i.test(String(source.BACKEND_UPSTREAM || ""))) {
      issues.push("BACKEND_UPSTREAM must be a private hostname with port 3000 and no scheme");
    }
    if (!/^\/[A-Za-z0-9._/-]+\.json$/.test(String(source.K6_RUNTIME_CONFIG_FILE || ""))) {
      issues.push("K6_RUNTIME_CONFIG_FILE must be an absolute JSON path");
    }
  }

  if (service === "edgeBuild" && !isBlank(source.VITE_DEFAULT_AVATAR)) {
    issues.push("VITE_DEFAULT_AVATAR must remain an internal empty default");
  }

  for (const key of SECRET_KEYS) {
    if (expectedKeys.includes(key) && isBlank(source[key])) {
      issues.push(`${key} must be bound by the approved secret owner`);
    }
  }

  if (issues.length > 0) {
    throw new K6EnvironmentValidationError(service, [...new Set(issues)]);
  }

  const result = {
    service,
    targetName: "public-demo",
    bindingKeys: [...expectedKeys],
  };
  if (service === "backend") {
    result.capabilities = Object.freeze({
      calls: parseCapability(source, "K6_CAPABILITY_CALLS"),
      googleLogin: parseCapability(source, "K6_CAPABILITY_GOOGLE_LOGIN"),
      issue61Measurement: parseCapability(source, "K6_CAPABILITY_ISSUE61_MEASUREMENT"),
      recovery: parseCapability(source, "K6_CAPABILITY_RECOVERY"),
      syntheticSignupOnly: parseCapability(source, "K6_SYNTHETIC_SIGNUP_ONLY"),
      upload: parseCapability(source, "K6_CAPABILITY_UPLOAD"),
    });
  }
  return Object.freeze(result);
};

module.exports = {
  K6_BINDING_MATRIX,
  K6EnvironmentValidationError,
  collectK6BindingKeys,
  validateK6PublicDemoEnvironment,
};
