const mongoose = require("mongoose");

const { cacheClient } = require("../config/redis");
const { connectionManager } = require("../queues/rabbitmq");

const normalizeStatus = (status) => {
  if (typeof status === "string") {
    return { status };
  }

  if (!status || typeof status !== "object") {
    return { status: "unknown" };
  }

  return status;
};

const createDefaultHealthChecks = ({
  mongoConnection = mongoose.connection,
  redisClient = cacheClient,
  rabbitConnectionManager = connectionManager,
} = {}) => ({
  mongo: async () => ({
    status: mongoConnection.readyState === 1 ? "connected" : "disconnected",
  }),
  redis: async () => {
    if (!redisClient) {
      return { status: "unknown" };
    }

    if (redisClient.isReady) {
      return { status: "connected" };
    }

    if (redisClient.isOpen) {
      return { status: "degraded" };
    }

    return { status: "unavailable" };
  },
  rabbitmq: async () => {
    if (!rabbitConnectionManager?.checkStatus) {
      return { status: "unknown" };
    }

    return rabbitConnectionManager.checkStatus();
  },
});

const checkServices = async (healthChecks = createDefaultHealthChecks()) => {
  const [mongo, redis, rabbitmq] = await Promise.all([
    healthChecks.mongo(),
    healthChecks.redis(),
    healthChecks.rabbitmq(),
  ]);

  return {
    mongo: normalizeStatus(mongo),
    redis: normalizeStatus(redis),
    rabbitmq: normalizeStatus(rabbitmq),
  };
};

const isRequiredHealthy = (services) =>
  services.mongo.status === "connected" && services.redis.status === "connected";

const getOverallStatus = (services) => {
  if (!isRequiredHealthy(services)) {
    return "unhealthy";
  }

  if (services.rabbitmq.status !== "connected") {
    return "degraded";
  }

  return "healthy";
};

const buildHealthPayload = async (healthChecks) => {
  const services = await checkServices(healthChecks);
  const status = getOverallStatus(services);

  return {
    status,
    timestamp: new Date().toISOString(),
    instance: {
      name: process.env.NODE_NAME || "backend",
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      },
    },
    services,
  };
};

const buildReadinessPayload = async (healthChecks) => {
  const services = await checkServices(healthChecks);
  const ready = isRequiredHealthy(services);

  return {
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    services,
  };
};

const toDependencySummary = (services) => Object.fromEntries(
  Object.entries(services).map(([name, details]) => [
    name,
    { status: details.status || "unknown" },
  ]),
);

const getActiveSocketCount = (io) => {
  const sockets = io?.of?.("/")?.sockets;
  if (!sockets) return null;
  return typeof sockets.size === "number" ? sockets.size : null;
};

const buildOpsPayload = async ({ healthChecks, io } = {}) => {
  const services = await checkServices(healthChecks);
  const memoryUsage = process.memoryUsage();

  return {
    status: getOverallStatus(services),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      rssBytes: memoryUsage.rss,
      heapTotalBytes: memoryUsage.heapTotal,
      heapUsedBytes: memoryUsage.heapUsed,
      externalBytes: memoryUsage.external,
    },
    dependencies: toDependencySummary(services),
    runtime: {
      nodeEnv: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      activeSocketCount: getActiveSocketCount(io),
    },
    monitoring: {
      kind: "lightweight-ops",
      prometheus: false,
    },
  };
};

module.exports = {
  buildHealthPayload,
  buildReadinessPayload,
  buildOpsPayload,
  checkServices,
  createDefaultHealthChecks,
  getOverallStatus,
  isRequiredHealthy,
};
