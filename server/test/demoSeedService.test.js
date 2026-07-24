const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");

const {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  runDemoSeed,
} = require("../src/demo/demoSeedService");

test("demo credentials use a stable bcrypt hash for idempotent upserts", async () => {
  assert.equal(await bcrypt.compare(DEMO_PASSWORD, DEMO_PASSWORD_HASH), true);
});

test("runDemoSeed hydrates existing ids, applies the dataset, and disconnects safely", async () => {
  const calls = [];
  const existingAliceId = "65a000000000000000000001";
  const models = {
    User: {
      find() {
        return {
          select() {
            return this;
          },
          async lean() {
            return [{ _id: existingAliceId, email: "alice@kittachat.test" }];
          },
        };
      },
    },
  };
  let appliedDataset = null;

  const result = await runDemoSeed({
    mongoUri: "mongodb://mongo:27017/shot-chat",
    models,
    mongooseClient: {
      async connect(uri) {
        calls.push(["connect", uri]);
      },
      async disconnect() {
        calls.push(["disconnect"]);
      },
    },
    hashPassword: async (password) => {
      calls.push(["hash", password.length]);
      return "hashed-demo-password";
    },
    repositoryFactory: () => ({
      async apply(dataset) {
        appliedDataset = dataset;
        return {
          users: dataset.users.length,
          conversations: dataset.conversations.length,
        };
      },
    }),
    logger: {
      log(message) {
        calls.push(["log", message]);
      },
    },
  });

  assert.equal(
    appliedDataset.users.find((user) => user.email === "alice@kittachat.test")._id,
    existingAliceId,
  );
  assert.equal(appliedDataset.conversations.length, 24);
  assert.deepEqual(result, { users: 19, conversations: 24 });
  assert.equal(calls[0][0], "connect");
  assert.equal(calls.at(-1)[0], "disconnect");
  assert.equal(
    calls.some(([type, value]) =>
      type === "log" && /KittaChatDemo|hashed-demo-password|mongodb:\/\//.test(value),
    ),
    false,
  );
});

test("runDemoSeed refuses remote targets before connecting", async () => {
  let connectCalls = 0;

  await assert.rejects(
    () =>
      runDemoSeed({
        mongoUri: "mongodb://user:password@db.example.com:27017/kittachat",
        mongooseClient: {
          async connect() {
            connectCalls += 1;
          },
          async disconnect() {},
        },
      }),
    (error) => error.code === "DEMO_SEED_TARGET_NOT_ALLOWED",
  );

  assert.equal(connectCalls, 0);
});
