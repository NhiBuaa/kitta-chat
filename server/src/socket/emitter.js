const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const createSocketEmitter = async () => {
  const io = new Server({
    cors: {
      origin: process.env.URL_FRONTEND,
      methods: ["GET", "POST"],
    },
  });

  const redisUrl = process.env.REDIS_URL || "redis://redis:6379";
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => console.error("[SocketEmitter][RedisPub]", err));
  subClient.on("error", (err) => console.error("[SocketEmitter][RedisSub]", err));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  io.redisClient = pubClient;

  return io;
};

module.exports = { createSocketEmitter };
