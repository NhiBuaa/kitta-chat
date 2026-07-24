const crypto = require("node:crypto");
const fs = require("node:fs");

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content.replace(/\s*$/, "")}\n${line}\n`;
}

function buildDemoEnvironment(template, { randomBytes = crypto.randomBytes } = {}) {
  const jwtSecret = randomBytes(48).toString("hex");
  const refreshSecret = randomBytes(48).toString("hex");
  const values = {
    NODE_ENV: "development",
    URL_FRONTEND: "http://localhost",
    MONGO_URI: "mongodb://localhost:27018/shot-chat",
    JWT_SECRET: jwtSecret,
    REFRESH_TOKEN_SECRET: refreshSecret,
    AUTH_COOKIE_SECURE: "false",
    REDIS_URL: "redis://localhost:6379",
    REDIS_HOST: "localhost",
    REDIS_PORT: "6379",
    RABBITMQ_URL: "amqp://guest:guest@localhost:5672",
    RABBITMQ_USER: "guest",
    RABBITMQ_PASS: "guest",
    CONVERSATION_DUAL_WRITE_ENABLED: "true",
    CONVERSATION_SHADOW_COMPARE_ENABLED: "false",
    CONVERSATION_SIDEBAR_READ_MODEL_ENABLED: "true",
    CONVERSATION_PANEL_ENABLED: "true",
    CONVERSATION_PANEL_RESOURCES_ENABLED: "true",
    CONVERSATION_PANEL_RATE_LIMIT: "120",
  };

  return Object.entries(values).reduce(
    (content, [key, value]) => setEnvValue(content, key, value),
    template,
  );
}

function ensureDemoEnvironment({
  envPath,
  templatePath,
  randomBytes = crypto.randomBytes,
}) {
  if (fs.existsSync(envPath)) {
    return { created: false };
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const content = buildDemoEnvironment(template, { randomBytes });
  try {
    fs.writeFileSync(envPath, content, { encoding: "utf8", flag: "wx" });
    return { created: true };
  } catch (error) {
    if (error.code === "EEXIST") {
      return { created: false };
    }
    throw error;
  }
}

module.exports = {
  buildDemoEnvironment,
  ensureDemoEnvironment,
  setEnvValue,
};
