const assert = require("node:assert/strict");
const test = require("node:test");

const saveMessagePath = require.resolve("../src/utils/saveMessageInBackground");
const messageModelPath = require.resolve("../src/models/Message");
const redisConfigPath = require.resolve("../src/config/redis");
const envConfigPath = require.resolve("../src/config/env");
const readModelServicePath = require.resolve("../src/services/conversationReadModelService");
const dualWriteServicePath = require.resolve("../src/services/conversationDualWriteService");

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearSaveMessageCache = () => {
  for (const path of [
    saveMessagePath,
    messageModelPath,
    redisConfigPath,
    envConfigPath,
    readModelServicePath,
    dualWriteServicePath,
  ]) {
    delete require.cache[path];
  }
};

const loadSaveMessage = ({
  findOneAndUpdateResult,
  findOneAndUpdateError,
  findOneResult,
  findOneError,
  findByIdResult,
  findByIdError,
  createResult,
  createError,
  dualWriteEnabled = false,
  readModelError = null,
  redisOpen = false,
  events = [],
} = {}) => {
  clearSaveMessageCache();

  const calls = [];
  const recordCall = (call) => {
    calls.push(call);
    events.push(call[0]);
  };

  mockModule(messageModelPath, {
    async findOneAndUpdate(query, update, options) {
      recordCall(["findOneAndUpdate", query, update, options]);
      if (findOneAndUpdateError) throw findOneAndUpdateError;
      return findOneAndUpdateResult;
    },
    async findOne(query) {
      recordCall(["findOne", query]);
      if (findOneError) throw findOneError;
      return findOneResult;
    },
    async findById(id) {
      recordCall(["findById", id]);
      if (findByIdError) throw findByIdError;
      return findByIdResult;
    },
    async create(data) {
      recordCall(["create", data]);
      if (createError) throw createError;
      return createResult;
    },
  });
  mockModule(redisConfigPath, {
    cacheClient: {
      isOpen: redisOpen,
      multi() {
        recordCall(["redis.multi"]);
        return {
          lPush(key, value) {
            recordCall(["redis.lPush", key, value]);
            return this;
          },
          lTrim(key, start, stop) {
            recordCall(["redis.lTrim", key, start, stop]);
            return this;
          },
          async exec() {
            recordCall(["redis.exec"]);
          },
        };
      },
    },
  });

  mockModule(envConfigPath, {
    getConversationMigrationConfig() {
      return { conversationDualWriteEnabled: dualWriteEnabled };
    },
  });
  mockModule(readModelServicePath, {
    async ensureConversationForConfirmedMessage(message) {
      recordCall(["ensureConversationForConfirmedMessage", message]);
      if (readModelError) throw readModelError;
    },
  });

  return { saveMessage: require(saveMessagePath), calls };
};

const insertedDoc = {
  _id: "msg-new",
  sender: "user-1",
  receiver: "user-2",
  conversationId: "user-1_user-2",
  createdAt: new Date("2026-05-17T10:00:00.000Z"),
  attachments: [],
};

const createMetricsSpy = () => {
  const observations = [];
  return {
    observations,
    observeMessagePersistence(observation) {
      observations.push(observation);
    },
  };
};

const createClock = (...ticks) => {
  let index = 0;
  return () => ticks[index++];
};

test("saveMessageInBackground records one acknowledged Mongo persistence success in seconds", async () => {
  const metrics = createMetricsSpy();
  const { saveMessage } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
  });

  const result = await saveMessage(
    { sender: { _id: "user-1" }, receiverId: "user-2", text: "first", idempotencyKey: "idem-metric-success" },
    {
      metricsModule: metrics,
      clock: createClock(1_000_000_000n, 1_250_000_000n),
    },
  );

  assert.equal(result.doc, insertedDoc);
  assert.deepEqual(metrics.observations, [
    { outcome: "success", durationSeconds: 0.25 },
  ]);
});

test("saveMessageInBackground records Message.create persistence success exactly once", async () => {
  const metrics = createMetricsSpy();
  const { saveMessage } = loadSaveMessage({ createResult: insertedDoc });

  await saveMessage(
    { sender: { _id: "user-1" }, receiverId: "user-2", text: "created", type: "text" },
    {
      metricsModule: metrics,
      clock: createClock(2_000_000_000n, 2_400_000_000n),
    },
  );

  assert.deepEqual(metrics.observations, [
    { outcome: "success", durationSeconds: 0.4 },
  ]);
});

test("saveMessageInBackground finishes persistence timing before Redis cache work", async () => {
  const events = [];
  const metrics = {
    observeMessagePersistence(observation) {
      events.push("metric");
      assert.equal(observation.outcome, "success");
    },
  };
  const { saveMessage } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    redisOpen: true,
    events,
  });

  await saveMessage(
    { sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-boundary" },
    {
      metricsModule: metrics,
      clock: createClock(2_500_000_000n, 2_700_000_000n),
    },
  );

  assert.ok(events.indexOf("metric") >= 0);
  assert.ok(events.indexOf("metric") < events.indexOf("redis.multi"));
});

test("saveMessageInBackground classifies terminal Mongo failure modes as failed", async () => {
  const failures = [
    ["timeout", Object.assign(new Error("operation timed out"), { name: "MongoTimeoutError" })],
    ["write concern", Object.assign(new Error("write concern failed"), { code: 64 })],
    ["transaction abort", Object.assign(new Error("transaction aborted"), { name: "MongoTransactionError" })],
    ["exhausted retry", Object.assign(new Error("retry exhausted"), { name: "MongoRetryExhaustedError" })],
    ["ambiguous result", Object.assign(new Error("ambiguous result"), { name: "MongoAmbiguousResultError" })],
  ];

  for (const [index, [label, error]] of failures.entries()) {
    const metrics = createMetricsSpy();
    const { saveMessage } = loadSaveMessage({ findOneAndUpdateError: error });
    const start = 10_000_000_000n + BigInt(index) * 1_000_000_000n;

    const result = await saveMessage(
      { sender: { _id: "user-1" }, receiverId: "user-2", text: label, idempotencyKey: `idem-${label}` },
      {
        metricsModule: metrics,
        clock: createClock(start, start + 100_000_000n),
      },
    );

    assert.deepEqual(result, { doc: null, isDuplicate: false }, label);
    assert.deepEqual(metrics.observations, [
      { outcome: "failed", durationSeconds: 0.1 },
    ], label);
  }
});

test("saveMessageInBackground records Mongo write failure exactly once", async () => {
  const metrics = createMetricsSpy();
  const error = Object.assign(new Error("write concern failed"), { code: 64 });
  const { saveMessage } = loadSaveMessage({ findOneAndUpdateError: error });

  const result = await saveMessage(
    { sender: { _id: "user-1" }, receiverId: "user-2", text: "failed", idempotencyKey: "idem-metric-failure" },
    {
      metricsModule: metrics,
      clock: createClock(3_000_000_000n, 3_700_000_000n),
    },
  );

  assert.deepEqual(result, { doc: null, isDuplicate: false });
  assert.deepEqual(metrics.observations, [
    { outcome: "failed", durationSeconds: 0.7 },
  ]);
});

test("saveMessageInBackground excludes the already-persisted message lookup from persistence timing", async () => {
  const metrics = createMetricsSpy();
  const existingDoc = { _id: "msg-rest", sender: "user-1" };
  const { saveMessage, calls } = loadSaveMessage({ findByIdResult: existingDoc });

  const result = await saveMessage(
    { _id: "msg-rest", sender: "user-1", receiverId: "user-2" },
    {
      metricsModule: metrics,
      clock: createClock(8_000_000_000n, 8_500_000_000n),
    },
  );

  assert.equal(result.doc, existingDoc);
  assert.equal(result.isDuplicate, false);
  assert.equal(calls.some((call) => call[0] === "findById"), true);
  assert.deepEqual(metrics.observations, []);
});

test("saveMessageInBackground keeps the persistence result when metrics observation fails", async () => {
  const inserted = { ...insertedDoc, _id: "msg-metric-failure" };
  const metrics = {
    observeMessagePersistence() {
      throw new Error("metrics unavailable");
    },
  };
  const { saveMessage } = loadSaveMessage({ createResult: inserted });

  const result = await saveMessage(
    { sender: { _id: "user-1" }, receiverId: "user-2", text: "still persisted" },
    {
      metricsModule: metrics,
      clock: createClock(9_000_000_000n, 9_200_000_000n),
    },
  );

  assert.equal(result.doc, inserted);
  assert.equal(result.isDuplicate, false);
});

test("saveMessageInBackground marks idempotency retry as duplicate and returns existing document", async () => {
  const metrics = createMetricsSpy();
  const existingDoc = {
    _id: "msg-existing",
    sender: "user-1",
    receiver: "user-2",
    conversationId: "user-1_user-2",
    type: "text",
    text: "retry",
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
    attachments: [],
    isRead: false,
    idempotencyKey: "idem-1",
    hasLink: false,
    links: [],
  };
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: existingDoc,
      lastErrorObject: { updatedExisting: true },
    },
  });

  const result = await saveMessage({
    sender: { _id: "user-1" },
    receiverId: "user-2",
    text: "retry",
    idempotencyKey: "idem-1",
  }, {
    metricsModule: metrics,
    clock: createClock(4_000_000_000n, 4_300_000_000n),
  });

  assert.equal(result.doc, existingDoc);
  assert.equal(result.isDuplicate, true);
  assert.equal(calls[0][0], "findOneAndUpdate");
  assert.equal(calls[0][3].includeResultMetadata, true);
  assert.deepEqual(metrics.observations, [
    { outcome: "success", durationSeconds: 0.3 },
  ]);
});

test("saveMessageInBackground rejects an idempotency duplicate with a mismatched payload", async () => {
  const metrics = createMetricsSpy();
  const existingDoc = {
    _id: "msg-mismatch",
    sender: "user-1",
    receiver: "user-2",
    conversationId: "user-1_user-2",
    type: "text",
    text: "persisted-original",
    attachments: [],
    isRead: false,
    idempotencyKey: "idem-mismatch",
    hasLink: false,
    links: [],
  };
  const { saveMessage } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: existingDoc,
      lastErrorObject: { updatedExisting: true },
    },
  });

  const result = await saveMessage(
    {
      sender: { _id: "user-1" },
      receiverId: "user-2",
      text: "new-payload",
      idempotencyKey: "idem-mismatch",
    },
    {
      metricsModule: metrics,
      clock: createClock(5_000_000_000n, 5_200_000_000n),
    },
  );

  assert.deepEqual(result, { doc: null, isDuplicate: false });
  assert.deepEqual(metrics.observations, [
    { outcome: "failed", durationSeconds: 0.2 },
  ]);
});

test("saveMessageInBackground verifies duplicate-key recovery before recording success", async () => {
  const metrics = createMetricsSpy();
  const duplicateError = Object.assign(new Error("duplicate idempotency key"), { code: 11000 });
  const existingDoc = {
    _id: "msg-duplicate-key",
    sender: "user-1",
    receiver: "user-2",
    conversationId: "user-1_user-2",
    type: "text",
    text: "duplicate payload",
    attachments: [],
    isRead: true,
    idempotencyKey: "idem-duplicate-key",
    hasLink: false,
    links: [],
  };
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateError: duplicateError,
    findOneResult: existingDoc,
  });

  const result = await saveMessage(
    {
      sender: { _id: "user-1" },
      receiverId: "user-2",
      text: "duplicate payload",
      idempotencyKey: "idem-duplicate-key",
    },
    {
      metricsModule: metrics,
      clock: createClock(6_000_000_000n, 6_900_000_000n),
    },
  );

  assert.equal(result.doc, existingDoc);
  assert.equal(result.isDuplicate, true);
  assert.equal(calls.filter((call) => call[0] === "findOne").length, 1);
  assert.deepEqual(metrics.observations, [
    { outcome: "success", durationSeconds: 0.9 },
  ]);
});

test("saveMessageInBackground classifies an unverified duplicate-key result as failed", async () => {
  const metrics = createMetricsSpy();
  const duplicateError = Object.assign(new Error("duplicate idempotency key"), { code: 11000 });
  const { saveMessage } = loadSaveMessage({
    findOneAndUpdateError: duplicateError,
    findOneResult: null,
  });

  const result = await saveMessage(
    {
      sender: { _id: "user-1" },
      receiverId: "user-2",
      text: "unverified duplicate",
      idempotencyKey: "idem-unverified",
    },
    {
      metricsModule: metrics,
      clock: createClock(7_000_000_000n, 7_100_000_000n),
    },
  );

  assert.deepEqual(result, { doc: null, isDuplicate: false });
  assert.deepEqual(metrics.observations, [
    { outcome: "failed", durationSeconds: 0.1 },
  ]);
});

test("saveMessageInBackground rejects duplicate-key recovery without idempotency identity", async () => {
  const metrics = createMetricsSpy();
  const duplicateError = Object.assign(new Error("duplicate unique key"), { code: 11000 });
  const existingDoc = {
    _id: "msg-non-idempotent-duplicate",
    sender: "user-1",
    receiver: "user-2",
    conversationId: "user-1_user-2",
    type: "text",
    text: "non-idempotent message",
    attachments: [],
    hasLink: false,
    links: [],
    idempotencyKey: null,
  };
  const { saveMessage } = loadSaveMessage({
    createError: duplicateError,
    findOneResult: existingDoc,
  });

  const result = await saveMessage(
    { sender: { _id: "user-1" }, receiverId: "user-2", text: "non-idempotent message" },
    {
      metricsModule: metrics,
      clock: createClock(7_500_000_000n, 7_700_000_000n),
    },
  );

  assert.deepEqual(result, { doc: null, isDuplicate: false });
  assert.deepEqual(metrics.observations, [
    { outcome: "failed", durationSeconds: 0.2 },
  ]);
});

test("saveMessageInBackground marks first idempotent save as non-duplicate", async () => {
  const { saveMessage } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
  });

  const result = await saveMessage({
    sender: { _id: "user-1" },
    receiverId: "user-2",
    text: "first",
    idempotencyKey: "idem-2",
  });

  assert.equal(result.doc, insertedDoc);
  assert.equal(result.isDuplicate, false);
});

test("dual-write default disabled flag performs no read-model service call", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    dualWriteEnabled: false,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-disabled" });

  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), false);
});

test("enabled dual-write calls read-model service for first idempotent insert", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    dualWriteEnabled: true,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-enabled" });

  const dualWriteCalls = calls.filter((call) => call[0] === "ensureConversationForConfirmedMessage");
  assert.equal(dualWriteCalls.length, 1);
  assert.equal(dualWriteCalls[0][1], insertedDoc);
});

test("enabled dual-write skips duplicate idempotency retry", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: true },
    },
    dualWriteEnabled: true,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-duplicate" });

  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), false);
});

test("enabled dual-write calls read-model service for Message.create insert", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    createResult: insertedDoc,
    dualWriteEnabled: true,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", text: "no idem" });

  assert.equal(calls.filter((call) => call[0] === "ensureConversationForConfirmedMessage").length, 1);
});

test("dual-write failure is swallowed and original result still returns", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    dualWriteEnabled: true,
    readModelError: new Error("read model down"),
  });

  const result = await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-fail" });

  assert.equal(result.doc, insertedDoc);
  assert.equal(result.isDuplicate, false);
});

test("Redis cache and recency still update when dual-write disabled", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    dualWriteEnabled: false,
    redisOpen: true,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-cache-disabled" });

  assert.equal(calls.some((call) => call[0] === "redis.lPush"), true);
});

test("Redis cache and recency still update when dual-write succeeds", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    dualWriteEnabled: true,
    redisOpen: true,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-cache-success" });

  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), true);
  assert.equal(calls.some((call) => call[0] === "redis.lPush"), true);
});

test("Redis cache and recency still update when dual-write fails", async () => {
  const { saveMessage, calls } = loadSaveMessage({
    findOneAndUpdateResult: {
      value: insertedDoc,
      lastErrorObject: { updatedExisting: false },
    },
    dualWriteEnabled: true,
    readModelError: new Error("read model fail"),
    redisOpen: true,
  });

  await saveMessage({ sender: { _id: "user-1" }, receiverId: "user-2", idempotencyKey: "idem-cache-fail" });

  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), true);
  assert.equal(calls.some((call) => call[0] === "redis.lPush"), true);
});
