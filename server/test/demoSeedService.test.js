const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcryptjs");

const {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  runDemoSeed,
} = require("../src/demo/demoSeedService");
const { canonicalDatasetFingerprint, canonicalizeCollections } = require("../src/demo/k4DatasetContract");

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
      calls.push(["hash", password === undefined ? "default" : password.length]);
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

test("runDemoSeed preserves the fixed demo hash when no credential is supplied", async () => {
  let persistedUsers;

  await runDemoSeed({
    mongoUri: "mongodb://mongo:27017/shot-chat",
    models: { User: { find: () => ({ select() { return this; }, async lean() { return []; } }) } },
    mongooseClient: { async connect() {}, async disconnect() {} },
    repositoryFactory: () => ({
      async apply(dataset) {
        persistedUsers = dataset.users;
        return { users: dataset.users.length, conversations: dataset.conversations.length };
      },
    }),
    logger: { log() {} },
  });

  assert.equal(persistedUsers[0].password, DEMO_PASSWORD_HASH);
});

test("runDemoSeed persists a supplied disposable credential through the repository without logging it", async () => {
  const password = "K4Disposable!2026";
  let persistedUsers;
  const logs = [];

  await runDemoSeed({
    mongoUri: "mongodb://mongo:27017/shot-chat",
    models: { User: { find: () => ({ select() { return this; }, async lean() { return []; } }) } },
    mongooseClient: { async connect() {}, async disconnect() {} },
    repositoryFactory: () => ({
      async apply(dataset) {
        persistedUsers = dataset.users.map((user) => ({ ...user }));
        return { users: dataset.users.length, conversations: dataset.conversations.length };
      },
    }),
    password,
    logger: { log(message) { logs.push(message); } },
  });

  assert.equal(await bcrypt.compare(password, persistedUsers[0].password), true);
  assert.notEqual(persistedUsers[0].password, DEMO_PASSWORD_HASH);
  assert.equal(logs.some((message) => message.includes(password)), false);
});

test("canonical K4 content fingerprint is stable across distinct supplied credential hashes", async () => {
  const datasets = [];
  const repositoryFactory = () => ({
    async apply(dataset) {
      datasets.push(dataset);
      return { users: dataset.users.length, conversations: dataset.conversations.length };
    },
  });
  const options = {
    mongoUri: "mongodb://mongo:27017/shot-chat",
    models: { User: { find: () => ({ select() { return this; }, async lean() { return []; } }) } },
    mongooseClient: { async connect() {}, async disconnect() {} },
    repositoryFactory,
    logger: { log() {} },
  };

  await runDemoSeed({ ...options, password: "K4Disposable!2026" });
  await runDemoSeed({ ...options, password: "K4Disposable!2027" });

  assert.notEqual(datasets[0].users[0].password, datasets[1].users[0].password);
  const collectionNames = ["users", "groups", "files", "messages", "conversations", "participants"];
  const fingerprintFor = (dataset) => canonicalDatasetFingerprint(canonicalizeCollections(
    Object.fromEntries(collectionNames.map((name) => [name, dataset[name]])),
  ));
  assert.equal(
    fingerprintFor(datasets[0]),
    fingerprintFor(datasets[1]),
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
