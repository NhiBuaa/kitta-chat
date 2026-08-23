const REQUIRED_SAME_ORIGIN_PATHS = Object.freeze({
  VITE_API_URL: "/",
  VITE_API_URL_AUTH: "/api/auth",
  VITE_API_URL_USERS: "/api/users",
  VITE_API_URL_MESSAGES: "/api/messages",
  VITE_API_URL_GROUPS: "/api/groups",
  VITE_API_URL_FILES: "/api/files",
  VITE_API_URL_CALLS: "/api/calls",
});

const K6_TARGET_ENV_KEY = "VITE_TARGET";
const K6_TARGET_NAME = "public-demo";

const ALLOWED_K6_VITE_KEYS = new Set([
  K6_TARGET_ENV_KEY,
  ...Object.keys(REQUIRED_SAME_ORIGIN_PATHS),
]);

const D2_RUNTIME_KEYS = Object.freeze([
  "URL_FRONTEND",
  "CORS_ALLOWED_ORIGINS",
  "BACKEND_UPSTREAM",
]);

const hasValue = (value) => value !== undefined
  && value !== null
  && String(value).trim() !== "";

const hasK6SameOriginBuildInput = (env = {}) => (
  env[K6_TARGET_ENV_KEY] === K6_TARGET_NAME
);

const validateK6SameOriginBuildConfig = (env = {}) => {
  const issues = [];

  if (env[K6_TARGET_ENV_KEY] !== K6_TARGET_NAME) {
    issues.push(`${K6_TARGET_ENV_KEY} must be exactly ${K6_TARGET_NAME}`);
  }

  for (const [key, expected] of Object.entries(REQUIRED_SAME_ORIGIN_PATHS)) {
    if (env[key] !== expected) {
      issues.push(`${key} must be exactly ${expected}`);
    }
  }

  for (const key of D2_RUNTIME_KEYS) {
    if (hasValue(env[key])) issues.push(`${key} must not be a frontend build input`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (
      key.startsWith("VITE_")
      && !ALLOWED_K6_VITE_KEYS.has(key)
      && hasValue(value)
    ) {
      issues.push(`${key} is not an approved public-demo build input`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    values: issues.length === 0
      ? {
        [K6_TARGET_ENV_KEY]: K6_TARGET_NAME,
        ...REQUIRED_SAME_ORIGIN_PATHS,
      }
      : {},
  };
};

export {
  hasK6SameOriginBuildInput,
  validateK6SameOriginBuildConfig,
};
