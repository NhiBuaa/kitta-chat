const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (err) => console.log("❌ Lỗi kết nối Redis:", err));
redisClient.on("connect", () =>
  console.log("✅ Đã kết nối thành công tới Redis!"),
);

const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("Không thể kết nối Redis:", error);
  }
};

module.exports = {
  redisClient,
  connectRedis,
};
