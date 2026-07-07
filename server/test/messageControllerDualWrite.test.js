const assert = require("node:assert/strict");
const test = require("node:test");

const controllerPath = require.resolve("../src/controllers/messageController");
const messageModelPath = require.resolve("../src/models/Message");
const groupModelPath = require.resolve("../src/models/Group");
const envConfigPath = require.resolve("../src/config/env");
const readModelServicePath = require.resolve("../src/services/conversationReadModelService");
const dualWriteServicePath = require.resolve("../src/services/conversationDualWriteService");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clearControllerCache = () => {
  for (const path of [
    controllerPath,
    messageModelPath,
    groupModelPath,
    envConfigPath,
    readModelServicePath,
    dualWriteServicePath,
  ]) {
    delete require.cache[path];
  }
};

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const loadMessageController = ({ dualWriteEnabled = false, readModelError = null } = {}) => {
  clearControllerCache();
  const calls = [];

  class Message {
    constructor(data) {
      Object.assign(this, data);
      this._id = data._id || "message-1";
      this.createdAt = data.createdAt || new Date("2026-06-06T08:00:00.000Z");
    }

    async save() {
      calls.push(["Message.save", this]);
      return this;
    }

    async populate(path) {
      calls.push(["Message.populate", path]);
      return this;
    }
  }

  mockModule(messageModelPath, Message);
  mockModule(groupModelPath, {});
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

  return { controller: require(controllerPath), calls };
};

test("REST createMessage dual-writes after confirmed legacy save when enabled", async () => {
  const { controller, calls } = loadMessageController({ dualWriteEnabled: true });
  const req = {
    body: {
      sender: "111111111111111111111111",
      receiver: "222222222222222222222222",
      text: "hello from REST",
      attachments: [],
    },
  };
  const res = createResponse();

  await controller.createMessage(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, "hello from REST");
  assert.deepEqual(
    calls.map((call) => call[0]),
    ["Message.save", "ensureConversationForConfirmedMessage", "Message.populate"],
  );
  assert.equal(calls[1][1], res.body);
});
test("REST createMessage skips dual-write when flag is disabled", async () => {
  const { controller, calls } = loadMessageController({ dualWriteEnabled: false });
  const res = createResponse();

  await controller.createMessage({
    body: {
      sender: "111111111111111111111111",
      receiver: "222222222222222222222222",
      text: "flag off",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), false);
});

test("REST createMessage swallows read-model failure and keeps legacy response", async () => {
  const { controller, calls } = loadMessageController({
    dualWriteEnabled: true,
    readModelError: new Error("read model down"),
  });
  const res = createResponse();

  await controller.createMessage({
    body: {
      sender: "111111111111111111111111",
      receiver: "222222222222222222222222",
      text: "still returns",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, "still returns");
  assert.equal(calls.some((call) => call[0] === "ensureConversationForConfirmedMessage"), true);
});

test("createSystemMessage dual-writes group lifecycle messages when enabled", async () => {
  const { controller, calls } = loadMessageController({ dualWriteEnabled: true });

  const message = await controller.createSystemMessage(
    "333333333333333333333333",
    "Alice created group",
    { readBy: ["111111111111111111111111"] },
  );

  assert.equal(message.type, "system");
  assert.equal(message.conversationId, "333333333333333333333333");
  assert.deepEqual(
    calls.map((call) => call[0]),
    ["Message.save", "ensureConversationForConfirmedMessage"],
  );
  assert.equal(calls[1][1], message);
});