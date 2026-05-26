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

  throwIfInvalid("server", issues);

  return {
    mongoUri,
    jwtSecret,
    frontendUrl,
    redisUrl,
    port,
  };
};

const workerConcurrencyEnvByName = {
  image: "IMAGE_WORKER_CONCURRENCY",
  notification: "NOTIFICATION_WORKER_CONCURRENCY",
  audit: "AUDIT_WORKER_CONCURRENCY",
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
  validateServerEnv,
  validateWorkerEnv,
};
