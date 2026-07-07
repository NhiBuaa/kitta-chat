const assert = require("node:assert/strict");
const test = require("node:test");

const callLogPath = require.resolve("../src/socket/handlers/call/callLog");
const messageModelPath = require.resolve("../src/models/Message");
const envConfigPath = require.resolve("../src/config/env");
const readModelServicePath = require.resolve("../src/services/conversationReadModelService");
const dualWriteServicePath = require.resolve("../src/services/conversationDualWriteService");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearCallLogCache = () => {
  for (const path of [
    callLogPath,
    messageModelPath,
    envConfigPath,
    readModelServicePath,
    dualWriteServicePath,
  ]) {
    delete require.cache[path];
  }
};

const callRecord = {
  _id: "call-1",
  callerId: "111111111111111111111111",
  receiverId: "222222222222222222222222",
  conversationId: "111111111111111111111111_222222222222222222222222",
  type: "video",
  status: "missed",
  startedAt: new Date("2026-06-06T09:00:00.000Z"),
  duration: 0,
};

const createPopulatedQuery = (calls, message) => ({
  async populate(populate) {
    calls.push(["Message.populate", populate]);
    return message;
  },
});

const loadCallLog = ({ dualWriteEnabled = false, updatedExisting = false, readModelError = null } = {}) => {
  clearCallLogCache();
  const calls = [];
  const savedMessage = {
    _id: "message-call-log",
    conversationId: callRecord.conversationId,
    type: "call_log",
    sender: callRecord.callerId,
    receiver: callRecord.receiverId,
    createdAt: new Date("2026-06-06T09:01:00.000Z"),
    callData: { callHistoryId: callRecord._id },
  };

  mockModule(messageModelPath, {
    async findOneAndUpdate(filter, update, options) {
      calls.push(["Message.findOneAndUpdate", filter, update, options]);
      return {
        value: savedMessage,
        lastErrorObject: { updatedExisting },
      };
    },
    findById(id) {
      calls.push(["Message.findById", id]);
      return createPopulatedQuery(calls, savedMessage);
    },
    findOne() {
      return createPopulatedQuery(calls, savedMessage);
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

  return { callLog: require(callLogPath), calls, savedMessage };
};

test("call_log dual-writes only when Mongo upsert inserts a new message", async () => {
  const { callLog, calls, savedMessage } = loadCallLog({
    dualWriteEnabled: true,
    updatedExisting: false,
  });

  const result = await callLog.createCallLogMessage(callRecord);

  assert.equal(result, savedMessage);
  assert.equal(calls[0][3].includeResultMetadata, true);
  assert.deepEqual(
    calls.filter((call) => call[0] === "ensureConversationForConfirmedMessage"),
    [["ensureConversationForConfirmedMessage", savedMessage]],
  );
});

test("call_log skips dual-write when Mongo upsert updates existing message", async () => {
  const { callLog, calls } = loadCallLog({
    dualWriteEnabled: true,
    updatedExisting: true,
  });

  await callLog.createCallLogMessage(callRecord);

  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), false);
});

test("call_log swallows read-model failure and still returns populated message", async () => {
  const { callLog, calls, savedMessage } = loadCallLog({
    dualWriteEnabled: true,
    updatedExisting: false,
    readModelError: new Error("read model down"),
  });

  const result = await callLog.createCallLogMessage(callRecord);

  assert.equal(result, savedMessage);
  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), true);
});