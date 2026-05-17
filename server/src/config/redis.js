const { createClient } = require("redis");

const redisUrl =
  process.env.REDIS_URL ||
  `redis://${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || 6379}`;

const cacheClient = createClient({
  url: redisUrl,
});

cacheClient.on("error", (err) => console.log("❌ Lỗi kết nối Redis Cache:", err));
cacheClient.on("connect", () =>
  console.log("✅ Đã kết nối thành công tới Redis Cache!"),
);

const connectCacheRedis = async () => {
  try {
    await cacheClient.connect();
  } catch (error) {
    console.error("Không thể kết nối Redis Cache:", error);
  }
};

const redisClient = cacheClient;

module.exports = {
  cacheClient,
  redisClient,
  connectCacheRedis,
};
