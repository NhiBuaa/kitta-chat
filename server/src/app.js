const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const messageRoutes = require("./routes/messages");
const callHistoryRoutes = require("./routes/callHistory");
const groupRoutes = require("./routes/group");
const fileRoutes = require("./routes/file");
const { connectionManager: defaultRabbitConnectionManager } = require("./queues/rabbitmq");
const { createRequestLoggingMiddleware } = require("./middlewares/requestLogging");
const {
  buildHealthPayload,
  buildReadinessPayload,
  createDefaultHealthChecks,
} = require("./services/healthService");
const { logger: defaultLogger } = require("./utils/logger");

const createApp = ({
  rabbitConnectionManager = defaultRabbitConnectionManager,
  healthChecks = createDefaultHealthChecks({ rabbitConnectionManager }),
  logger = defaultLogger,
} = {}) => {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(createRequestLoggingMiddleware({ logger }));
  app.use(express.json({ limit: "10kb" }));

  app.use((req, res, next) => {
    if (req.headers.accept && !req.headers.origin) {
      req.headers.origin = req.headers.accept;
    }
    next();
  });

  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.get("/healthz", async (req, res) => {
    const payload = await buildHealthPayload(healthChecks);
    res.status(payload.status === "unhealthy" ? 503 : 200).json(payload);
  });

  app.get("/readyz", async (req, res) => {
    const payload = await buildReadinessPayload(healthChecks);
    res.status(payload.status === "ready" ? 200 : 503).json(payload);
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/calls", callHistoryRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/files", fileRoutes);

  app.use((req, res, next) => {
    res.status(404).json({
      error: "Not Found",
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
    });
  });

  app.use((err, req, res, next) => {
    logger.error("http_request_error", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id || req.user?._id,
      reason: err.message,
    });

    if (err.type === "entity.parse.failed") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid JSON payload",
      });
    }

    if (err.type === "entity.too.large") {
      return res.status(413).json({
        error: "Payload Too Large",
        message: "Request body exceeds 10kb limit",
      });
    }

    res.status(err.status || 500).json({
      error: err.name || "Internal Server Error",
      message: err.message || "Something went wrong",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
};

module.exports = { createApp };
