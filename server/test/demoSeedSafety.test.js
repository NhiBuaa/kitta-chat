const assert = require("node:assert/strict");
const test = require("node:test");

const { assertDemoSeedTarget } = require("../src/demo/demoSeedSafety");

test("demo seed rejects an unapproved remote MongoDB target without exposing credentials", () => {
  assert.throws(
    () =>
      assertDemoSeedTarget(
        "mongodb://demo-user:demo-password@db.example.com:27017/kittachat",
      ),
    (error) => {
      assert.equal(error.code, "DEMO_SEED_TARGET_NOT_ALLOWED");
      assert.match(error.message, /db\.example\.com/i);
      assert.doesNotMatch(error.message, /demo-user|demo-password/);
      return true;
    },
  );
});

test("demo seed accepts localhost and Docker Compose MongoDB targets", () => {
  assert.deepEqual(
    assertDemoSeedTarget("mongodb://localhost:27018/shot-chat"),
    { databaseName: "shot-chat", hostname: "localhost" },
  );
  assert.deepEqual(
    assertDemoSeedTarget("mongodb://mongo:27017/shot-chat"),
    { databaseName: "shot-chat", hostname: "mongo" },
  );
});

test("demo seed rejects malformed targets and targets without a database name", () => {
  assert.throws(
    () => assertDemoSeedTarget("not-a-mongo-uri"),
    (error) => error.code === "DEMO_SEED_TARGET_INVALID",
  );
  assert.throws(
    () => assertDemoSeedTarget("mongodb://localhost:27017"),
    (error) => error.code === "DEMO_SEED_TARGET_INVALID",
  );
});

test("demo seed allows an explicit remote-target override", () => {
  assert.deepEqual(
    assertDemoSeedTarget("mongodb://db.example.com:27017/kittachat-demo", {
      allowRemote: true,
    }),
    { databaseName: "kittachat-demo", hostname: "db.example.com" },
  );
});
