const mongoose = require("mongoose");
const dotenv = require("dotenv");
const http = require("http");

dotenv.config();

const { validateServerEnv } = require("./src/config/env");

const serverConfig = validateServerEnv();
const { createApp } = require("./src/app");
const { initSocket } = require("./src/socket");
const { connectCacheRedis } = require("./src/config/redis");

// =========================================================
// EXPRESS APP SETUP
// =========================================================
const app = createApp();

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

  // Stop accepting new connections
  server.close(async () => {
    console.log("[Server] HTTP server closed");

    // Disconnect Socket.IO gracefully
    if (global.io) {
      global.io.close(() => {
        console.log("[Socket.IO] Adapter closed");
      });
    }

    // Close MongoDB
    try {
      await mongoose.connection.close();
      console.log("[MongoDB] Connection closed");
    } catch (e) {
      console.error("[MongoDB] Error closing:", e.message);
    }

    console.log("[Server] Graceful shutdown complete");
    process.exit(0);
  });

  // Force exit
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
  .connect(serverConfig.mongoUri)
  .then(async () => {
    console.log("✅ MongoDB Connected");

    // Kết nối Redis Cache trước khi khởi tạo Socket
    await connectCacheRedis();

    // Init Socket.IO sau khi DB + Cache ready
    const io = await initSocket(server, app);
    global.io = io;

    const PORT = serverConfig.port;

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
    console.error("[Server] Startup Error:", err);
    process.exit(1);
  });

// MongoDB event handlers
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err);
});
