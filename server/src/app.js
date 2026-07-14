const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const messageRoutes = require("./routes/messages");
const callHistoryRoutes = require("./routes/callHistory");
const groupRoutes = require("./routes/group");
const fileRoutes = require("./routes/file");
const conversationPanelRoutes = require("./routes/conversationPanel");
const { connectionManager: defaultRabbitConnectionManager } = require("./queues/rabbitmq");
const { createRequestLoggingMiddleware } = require("./middlewares/requestLogging");
const {
  buildHealthPayload,
  buildOpsPayload,
  buildReadinessPayload,
  createDefaultHealthChecks,
} = require("./services/healthService");
const { logger: defaultLogger } = require("./utils/logger");
const { sendError } = require("./utils/apiResponse");

const createApp = ({
  rabbitConnectionManager = defaultRabbitConnectionManager,
  healthChecks = createDefaultHealthChecks({ rabbitConnectionManager }),
  logger = defaultLogger,
  authRateLimits,
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

  app.get("/ops", async (req, res) => {
    const payload = await buildOpsPayload({
      healthChecks,
      io: req.app.get("socketio"),
    });
    res.status(200).json(payload);
  });

  app.use("/api/auth", authRoutes.createAuthRouter
    ? authRoutes.createAuthRouter({ rateLimits: authRateLimits })
    : authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/calls", callHistoryRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/conversations", conversationPanelRoutes);

  app.use((req, res, next) => {
    return sendError(res, {
      status: 404,
      code: "ROUTE_NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
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
      return sendError(res, {
        status: 400,
        code: "BAD_JSON",
        message: "Invalid JSON payload",
      });
    }

    if (err.type === "entity.too.large") {
      return sendError(res, {
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds 10kb limit",
      });
    }

    return sendError(res, {
      status: err.status || 500,
      code: err.code || err.name || "INTERNAL_ERROR",
      message: err.message || "Something went wrong",
    });
  });

  return app;
};

module.exports = { createApp };
