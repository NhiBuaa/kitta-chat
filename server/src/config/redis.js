const { createClient } = require("redis");

const cacheClient = createClient({
  url: process.env.REDIS_URL,
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