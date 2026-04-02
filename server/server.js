const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const path = require("path");

const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/user");
const messageRoutes = require("./src/routes/messages");
const { initSocket } = require("./src/socket");

dotenv.config();

// =========================================================
// EXPRESS APP SETUP
// =========================================================
const app = express();

// CRITICAL: Trust Proxy (Nhận IP thật từ Nginx)
// Đặt TRƯỚC tất cả middleware
app.set("trust proxy", 1);

// SECURITY: Ẩn tech stack
app.disable("x-powered-by");

// SECURITY: Giới hạn JSON payload (chặn OOM attack)
app.use(express.json({ limit: "10kb" }));

// CORS HELPER: Nginx forward Origin as "Accept" header → restore sang req.headers.origin
// để cors package đọc được. Đặt TRƯỚC cors() middleware.
app.use((req, res, next) => {
  if (req.headers.accept && !req.headers.origin) {
    req.headers.origin = req.headers.accept;
  }
  next();
});

app.use(
  cors({
    origin: true, // cho phép mọi origin — chỉ khi credentials: true + origin whitelist
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// =========================================================
// HEALTH CHECK ENDPOINTS
// Docker healthcheck: wget http://localhost:3000/healthz
// Nginx proxy tới backend:3000/healthz
// =========================================================
app.get("/healthz", async (req, res) => {
  const mongoStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";
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
          process.memoryUsage().heapUsed / 1024 / 1024
        )}MB`,
      },
    },
    services: {
      mongo: mongoStatus,
      redis: "unknown",
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

// =========================================================
// ROUTES
// =========================================================
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", require("./src/routes/group"));
app.use("/api/files", require("./src/routes/file"));

// Fallback static file serving (Dev + Prod đã có Nginx)
// Prod: Nginx serve /uploads → Express không bao giờ được gọi
// Dev: Express serve để test trực tiếp
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =========================================================
// 404 HANDLER - Phải đặt TRƯỚC global error handler
// =========================================================
app.use((req, res, next) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// GLOBAL ERROR HANDLER - Phải đặt CUỐI CÙNG
// Không lộ stack trace ra client
// =========================================================
app.use((err, req, res, next) => {
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message);

  // Xử lý lỗi JSON limit
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid JSON payload",
    });
  }

  // Xử lý lỗi payload quá lớn
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload Too Large",
      message: "Request body exceeds 10kb limit",
    });
  }

  // Generic error: KHÔNG lộ stack trace
  res.status(err.status || 500).json({
    error: err.name || "Internal Server Error",
    message: err.message || "Something went wrong",
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// HTTP SERVER
// =========================================================
const server = http.createServer(app);

// =========================================================
// GRACEFUL SHUTDOWN
// =========================================================
const gracefulShutdown = async (signal, err = null) => {
  if (err) {
    console.error(`[Server] ${signal}:`, err.message);
  } else {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  }

  // Nếu là uncaught exception, không start shutdown 2 lần
  if (signal === "UNCAUGHT_EXCEPTION" && !err) {
    process.exit(1);
  }

  // 1. Stop accepting new connections
  server.close(async () => {
    console.log("[Server] HTTP server closed");

    // 2. Disconnect Socket.IO gracefully
    if (global.io) {
      global.io.close(() => {
        console.log("[Socket.IO] Adapter closed");
      });
    }

    // 3. Close MongoDB
    try {
      await mongoose.connection.close();
      console.log("[MongoDB] Connection closed");
    } catch (e) {
      console.error("[MongoDB] Error closing:", e.message);
    }

    console.log("[Server] Graceful shutdown complete");
    process.exit(0);
  });

  // 4. Force exit after 30s
  setTimeout(() => {
    console.error("[Server] Forced shutdown after 30s timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions → graceful shutdown
process.on("uncaughtException", (err) => {
  console.error("[Server] UNCAUGHT EXCEPTION:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Server] UNHANDLED REJECTION:", reason);
});

// =========================================================
// DATABASE + SOCKET.IO + SERVER START
// Chỉ listen KHI MongoDB đã connected (tránh race condition)
// =========================================================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");

    // Init Socket.IO sau khi DB ready
    const io = initSocket(server, app);
    global.io = io;

    const PORT = process.env.PORT || 3000;

    server.listen(PORT, () => {
      const instanceName = process.env.NODE_NAME || "backend";
      console.log(`========================================`);
      console.log(`[Server] ${instanceName} started`);
      console.log(`[Server] PID: ${process.pid}`);
      console.log(`[Server] Port: ${PORT}`);
      console.log(`[Server] Trust Proxy: ON`);
      console.log(`[Server] JSON limit: 10kb`);
      console.log(`========================================`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// MongoDB event handlers
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err);
});
