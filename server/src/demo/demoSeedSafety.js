const LOCAL_DEMO_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "mongo",
]);

class DemoSeedSafetyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DemoSeedSafetyError";
    this.code = code;
  }
}

function parseMongoTarget(mongoUri) {
  let parsed;
  try {
    parsed = new URL(mongoUri);
  } catch {
    throw new DemoSeedSafetyError(
      "DEMO_SEED_TARGET_INVALID",
      "Demo seed MongoDB target is malformed.",
    );
  }

  if (parsed.protocol !== "mongodb:" && parsed.protocol !== "mongodb+srv:") {
    throw new DemoSeedSafetyError(
      "DEMO_SEED_TARGET_INVALID",
      "Demo seed target must use a MongoDB URI.",
    );
  }

  const databaseName = parsed.pathname.replace(/^\//, "").trim();
  if (!databaseName) {
    throw new DemoSeedSafetyError(
      "DEMO_SEED_TARGET_INVALID",
      "Demo seed MongoDB target must include a database name.",
    );
  }

  return {
    databaseName,
    hostname: parsed.hostname.toLowerCase(),
  };
}

function assertDemoSeedTarget(mongoUri, { allowRemote = false } = {}) {
  const target = parseMongoTarget(mongoUri);
  if (!allowRemote && !LOCAL_DEMO_HOSTS.has(target.hostname)) {
    throw new DemoSeedSafetyError(
      "DEMO_SEED_TARGET_NOT_ALLOWED",
      `Demo seed target host "${target.hostname}" is not approved.`,
    );
  }

  return target;
}

module.exports = {
  DemoSeedSafetyError,
  assertDemoSeedTarget,
  parseMongoTarget,
};
