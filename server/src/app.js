const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const messageRoutes = require("./routes/messages");
const callHistoryRoutes = require("./routes/callHistory");
const groupRoutes = require("./routes/group");
const fileRoutes = require("./routes/file");
const { connectionManager: defaultRabbitConnectionManager } = require("./queues/rabbitmq");

const createApp = ({ rabbitConnectionManager = defaultRabbitConnectionManager } = {}) => {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
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
    const mongoStatus =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    const rabbitmqStatus = await rabbitConnectionManager.checkStatus();
    const healthy = mongoStatus === "connected";

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      instance: {
        name: process.env.NODE_NAME || "backend",
        pid: process.pid,
        uptime: Math.floor(process.uptime()),
        memory: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024,
          )}MB`,
        },
      },
      services: {
        mongo: mongoStatus,
        redis: "unknown",
        rabbitmq: rabbitmqStatus,
      },
    });
  });

  app.get("/readyz", async (req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    if (mongoReady) {
      res.status(200).json({ status: "ready" });
    } else {
      res.status(503).json({ status: "not ready", reason: "MongoDB disconnected" });
    }
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
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);

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
