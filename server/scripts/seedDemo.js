const path = require("node:path");
const dotenv = require("dotenv");
const { runDemoSeed } = require("../src/demo/demoSeedService");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const seedOptions = {
  mongoUri: process.env.MONGO_URI,
  allowRemote: process.env.ALLOW_REMOTE_DEMO_SEED === "true",
};

if (process.env.DEMO_SEED_PASSWORD !== undefined) {
  seedOptions.password = process.env.DEMO_SEED_PASSWORD;
}

runDemoSeed(seedOptions).catch((error) => {
  const code = error.code ? `${error.code}: ` : "";
  console.error(`[DemoSeed] ${code}${error.message}`);
  process.exitCode = 1;
});
