const assert = require("node:assert/strict");
const test = require("node:test");

const saveMessagePath = require.resolve("../src/utils/saveMessageInBackground");
const messageModelPath = require.resolve("../src/models/Message");
const redisConfigPath = require.resolve("../src/config/redis");
const conversationCacheServicePath = require.resolve("../src/services/conversationCacheService");

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
  ]) {
    delete require.cache[path];
  }
};

const loadSaveMessage = ({ findOneAndUpdateResult }) => {
  clearSaveMessageCache();

  const calls = [];

  mockModule(messageModelPath, {
    async findOneAndUpdate(query, update, options) {
      calls.push(["findOneAndUpdate", query, update, options]);
      return findOneAndUpdateResult;
    },
  });
  mockModule(redisConfigPath, {
    cacheClient: {
      isOpen: false,
    },
  });
  mockModule(conversationCacheServicePath, {
    async updateConversationWriteThrough(conversationId, participantIds, timestamp) {
      calls.push(["updateConversationWriteThrough", conversationId, participantIds, timestamp]);
    },
  });

  return { saveMessage: require(saveMessagePath), calls };
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
  const insertedDoc = {
    _id: "msg-new",
    sender: "user-1",
    receiver: "user-2",
    conversationId: "user-1_user-2",
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
    attachments: [],
  };
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
