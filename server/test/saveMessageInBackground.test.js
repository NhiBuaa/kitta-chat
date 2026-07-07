const assert = require("node:assert/strict");
const test = require("node:test");

const saveMessagePath = require.resolve("../src/utils/saveMessageInBackground");
const messageModelPath = require.resolve("../src/models/Message");
const redisConfigPath = require.resolve("../src/config/redis");
const conversationCacheServicePath = require.resolve("../src/services/conversationCacheService");
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
    conversationCacheServicePath,
    envConfigPath,
    readModelServicePath,
    dualWriteServicePath,
  ]) {
    delete require.cache[path];
  }
};

const loadSaveMessage = ({
  findOneAndUpdateResult,
  createResult,
  dualWriteEnabled = false,
  readModelError = null,
  redisOpen = false,
} = {}) => {
  clearSaveMessageCache();

  const calls = [];

  mockModule(messageModelPath, {
    async findOneAndUpdate(query, update, options) {
      calls.push(["findOneAndUpdate", query, update, options]);
      return findOneAndUpdateResult;
    },
    async create(data) {
      calls.push(["create", data]);
      return createResult;
    },
  });
  mockModule(redisConfigPath, {
    cacheClient: {
      isOpen: redisOpen,
      multi() {
        calls.push(["redis.multi"]);
        return {
          lPush(key, value) {
            calls.push(["redis.lPush", key, value]);
            return this;
          },
          lTrim(key, start, stop) {
            calls.push(["redis.lTrim", key, start, stop]);
            return this;
          },
          async exec() {
            calls.push(["redis.exec"]);
          },
        };
      },
    },
  });
  mockModule(conversationCacheServicePath, {
    async updateConversationWriteThrough(conversationId, participantIds, timestamp) {
      calls.push(["updateConversationWriteThrough", conversationId, participantIds, timestamp]);
    },
  });
  mockModule(envConfigPath, {
    getConversationMigrationConfig() {
      return { conversationDualWriteEnabled: dualWriteEnabled };
    },
  });
  mockModule(readModelServicePath, {
    async ensureConversationForConfirmedMessage(message) {
      calls.push(["ensureConversationForConfirmedMessage", message]);
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

test("saveMessageInBackground marks idempotency retry as duplicate and returns existing document", async () => {
  const existingDoc = {
    _id: "msg-existing",
    sender: "user-1",
    receiver: "user-2",
    conversationId: "user-1_user-2",
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
    attachments: [],
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
  });

  assert.equal(result.doc, existingDoc);
  assert.equal(result.isDuplicate, true);
  assert.equal(calls[0][0], "findOneAndUpdate");
  assert.equal(calls[0][3].includeResultMetadata, true);
  assert.deepEqual(calls[1].slice(0, 3), [
    "updateConversationWriteThrough",
    "user-1_user-2",
    ["user-1", "user-2"],
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
  assert.equal(calls.some((call) => call[0] === "updateConversationWriteThrough"), true);
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
  assert.equal(calls.some((call) => call[0] === "updateConversationWriteThrough"), true);
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
  assert.equal(calls.some((call) => call[0] === "updateConversationWriteThrough"), true);
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
  assert.equal(calls.some((call) => call[0] === "updateConversationWriteThrough"), true);
});
