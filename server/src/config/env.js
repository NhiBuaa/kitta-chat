class ConfigValidationError extends Error {
  constructor(context, issues) {
    super(
      `${context} configuration is invalid: ${issues.join("; ")}`,
    );
    this.name = "ConfigValidationError";
    this.context = context;
    this.issues = issues;
  }
}

const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

const requireValue = (env, key, issues) => {
  if (isBlank(env[key])) {
    issues.push(`${key} is required`);
    return undefined;
  }

  return String(env[key]).trim();
};

const parseBooleanFlag = (env, key, fallback, issues) => {
  if (isBlank(env[key])) return fallback;

  const raw = String(env[key]).trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;

  issues.push(`${key} must be either true or false`);
  return fallback;
};

const parsePositiveInteger = (env, key, fallback, issues) => {
  const raw = isBlank(env[key]) ? fallback : env[key];
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    issues.push(`${key} must be a positive integer`);
    return fallback;
  }

  return parsed;
};

const getRedisUrl = (env, issues, { required = true } = {}) => {
  if (!isBlank(env.REDIS_URL)) {
    return String(env.REDIS_URL).trim();
  }

  if (!isBlank(env.REDIS_HOST)) {
    const port = parsePositiveInteger(env, "REDIS_PORT", 6379, issues);
    return `redis://${String(env.REDIS_HOST).trim()}:${port}`;
  }

  if (required) {
    issues.push("REDIS_URL or REDIS_HOST is required");
  }

  return undefined;
};

const throwIfInvalid = (context, issues) => {
  if (issues.length > 0) {
    throw new ConfigValidationError(context, issues);
  }
};

const validateServerEnv = (env = process.env) => {
  const issues = [];
  const mongoUri = requireValue(env, "MONGO_URI", issues);
  const jwtSecret = requireValue(env, "JWT_SECRET", issues);
  const frontendUrl = requireValue(env, "URL_FRONTEND", issues);
  const redisUrl = getRedisUrl(env, issues);
  const port = parsePositiveInteger(env, "PORT", 3000, issues);
  const conversationDualWriteEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_DUAL_WRITE_ENABLED",
    false,
    issues,
  );
  const conversationShadowCompareEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_SHADOW_COMPARE_ENABLED",
    false,
    issues,
  );
  const conversationSidebarReadModelEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_SIDEBAR_READ_MODEL_ENABLED",
    false,
    issues,
  );
  const conversationPanelEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_PANEL_ENABLED",
    false,
    issues,
  );
  const conversationPanelResourcesEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_PANEL_RESOURCES_ENABLED",
    false,
    issues,
  );
  const conversationPanelRateLimit = parsePositiveInteger(
    env,
    "CONVERSATION_PANEL_RATE_LIMIT",
    30,
    issues,
  );
  let browserOriginPolicy = createBrowserOriginPolicy([]);
  try {
    browserOriginPolicy = parseBrowserOriginPolicy({
      rawOrigins: env.CORS_ALLOWED_ORIGINS,
      environment: env.NODE_ENV || (env === process.env ? process.env.NODE_ENV : "test"),
    });
  } catch (error) {
    if (error instanceof BrowserOriginConfigError) {
      issues.push(error.message);
    } else {
      throw error;
    }
  }

  let targetName = "local";
  let capabilities = {
    calls: true,
    googleLogin: true,
    issue61Measurement: false,
    recovery: true,
    syntheticSignupOnly: false,
    upload: true,
  };
  if (!isBlank(env.K6_TARGET)) {
    if (String(env.K6_TARGET) !== "public-demo") {
      issues.push("K6_TARGET must be exactly public-demo when configured");
    } else {
      try {
        const k6Configuration = validateK6PublicDemoEnvironment({
          service: "backend",
          env,
        });
        targetName = k6Configuration.targetName;
        capabilities = { ...k6Configuration.capabilities };
      } catch (error) {
        if (error instanceof K6EnvironmentValidationError) {
          issues.push(...error.issues);
        } else {
          throw error;
        }
      }
    }
  } else if (!isBlank(env.K6_SYNTHETIC_SIGNUP_ONLY)) {
    if (String(env.K6_SYNTHETIC_SIGNUP_ONLY) !== "false") {
      issues.push("K6_SYNTHETIC_SIGNUP_ONLY must be false outside public-demo");
    }
  }

  throwIfInvalid("server", issues);

  return {
    mongoUri,
    jwtSecret,
    frontendUrl,
    redisUrl,
    port,
    conversationDualWriteEnabled,
    conversationShadowCompareEnabled,
    conversationSidebarReadModelEnabled,
    conversationPanelEnabled,
    conversationPanelResourcesEnabled,
    conversationPanelRateLimit,
    browserOriginPolicy,
    targetName,
    capabilities,
  };
};

const workerConcurrencyEnvByName = {
  image: "IMAGE_WORKER_CONCURRENCY",
  notification: "NOTIFICATION_WORKER_CONCURRENCY",
  audit: "AUDIT_WORKER_CONCURRENCY",
};

const getConversationMigrationConfig = (env = process.env) => {
  const issues = [];
  const conversationDualWriteEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_DUAL_WRITE_ENABLED",
    false,
    issues,
  );
  const conversationShadowCompareEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_SHADOW_COMPARE_ENABLED",
    false,
    issues,
  );
  const conversationSidebarReadModelEnabled = parseBooleanFlag(
    env,
    "CONVERSATION_SIDEBAR_READ_MODEL_ENABLED",
    false,
    issues,
  );

  throwIfInvalid("conversation migration", issues);

  return {
    conversationDualWriteEnabled,
    conversationShadowCompareEnabled,
    conversationSidebarReadModelEnabled,
  };
};

const validateWorkerEnv = ({ workerName, env = process.env } = {}) => {
  const name = workerName || "worker";
  const issues = [];
  const concurrencyKey = workerConcurrencyEnvByName[name];
  const mongoRequired = name === "image";

  const mongoUri = mongoRequired ? requireValue(env, "MONGO_URI", issues) : env.MONGO_URI;
  const rabbitmqUrl = requireValue(env, "RABBITMQ_URL", issues);
  const redisUrl = name === "image" ? getRedisUrl(env, issues) : getRedisUrl(env, issues, { required: false });
  const rabbitmqMaxAttempts = parsePositiveInteger(env, "RABBITMQ_MAX_ATTEMPTS", 3, issues);
  const rabbitmqRetryDelayMs = parsePositiveInteger(env, "RABBITMQ_RETRY_DELAY_MS", 30000, issues);
  const workerReconnectDelayMs = parsePositiveInteger(env, "RABBITMQ_WORKER_RECONNECT_DELAY_MS", 1000, issues);
  const workerMaxReconnectDelayMs = parsePositiveInteger(env, "RABBITMQ_WORKER_MAX_RECONNECT_DELAY_MS", 30000, issues);
  const workerConcurrency = concurrencyKey
    ? parsePositiveInteger(env, concurrencyKey, name === "audit" ? 10 : name === "notification" ? 5 : 2, issues)
    : undefined;

  throwIfInvalid(`${name} worker`, issues);

  return {
    workerName: name,
    mongoUri,
    rabbitmqUrl,
    redisUrl,
    rabbitmqMaxAttempts,
    rabbitmqRetryDelayMs,
    workerReconnectDelayMs,
    workerMaxReconnectDelayMs,
    workerConcurrency,
  };
};

module.exports = {
  ConfigValidationError,
  getConversationMigrationConfig,
  validateServerEnv,
  validateWorkerEnv,
};


const {
  BrowserOriginConfigError,
  createBrowserOriginPolicy,
  parseBrowserOriginPolicy,
} = require("./browserOriginPolicy");
const {
  K6EnvironmentValidationError,
  validateK6PublicDemoEnvironment,
} = require("./k6PublicDemoEnvironment");
