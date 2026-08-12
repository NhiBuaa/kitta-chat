const assert = require("node:assert/strict");
const test = require("node:test");

const controllerPath = require.resolve("../src/controllers/messageController");
const messagePath = require.resolve("../src/models/Message");
const groupPath = require.resolve("../src/models/Group");
const participantPath = require.resolve("../src/models/ConversationParticipant");

const mockModule = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const clear = () => [controllerPath, messagePath, groupPath, participantPath].forEach((path) => delete require.cache[path]);
const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

function load({ groupMember = true, participant = null } = {}) {
  clear();
  const calls = [];
  class Message {
    constructor(data) { Object.assign(this, data); }
    async save() { calls.push("save"); return this; }
    async populate() { return this; }
    static find(query) {
      calls.push(["find", query]);
      return { sort() { return this; }, limit(value) { calls.push(["limit", value]); return this; }, populate() { return this; }, then(resolve) { return Promise.resolve([]).then(resolve); } };
    }
  }
  mockModule(messagePath, Message);
  mockModule(groupPath, { findOne(query) { calls.push(["group", query]); return { lean: async () => groupMember ? { _id: query._id } : null }; } });
  mockModule(participantPath, { findOne() { return { lean: async () => participant }; } });
  return { controller: require(controllerPath), calls };
}

test("M1 rejects caller sender impersonation before save", async () => {
  const { controller, calls } = load();
  const res = response();
  await controller.createMessage({ user: { id: "principal" }, body: { sender: "other", receiver: "peer", text: "x" } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.includes("save"), false);
});

test("M1 derives direct sender from authenticated principal", async () => {
  const { controller, calls } = load();
  const res = response();
  await controller.createMessage({ user: { id: "principal" }, body: { receiver: "peer", text: "x" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sender, "principal");
  assert.equal(res.body.conversationId, "peer_principal");
  assert.equal(calls.includes("save"), true);
});

test("M1 rejects public system messages and former group members before save", async () => {
  const system = load();
  const systemRes = response();
  await system.controller.createMessage({ user: { id: "principal" }, body: { receiver: "507f1f77bcf86cd799439011", isGroup: true, type: "system" } }, systemRes);
  assert.equal(systemRes.statusCode, 400);
  assert.equal(system.calls.includes("save"), false);

  const group = load({
    groupMember: false,
    participant: {
      legacyConversationId: "507f1f77bcf86cd799439011",
      userId: "principal",
      leftAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const groupRes = response();
  await group.controller.createMessage({ user: { id: "principal" }, body: { receiver: "507f1f77bcf86cd799439011", isGroup: true, text: "x" } }, groupRes);
  assert.equal(groupRes.statusCode, 403);
  assert.equal(group.calls.includes("save"), false);
});

test("Q3 rejects malformed and operator-shaped group receivers before membership query or save", async () => {
  for (const receiver of ["not-an-object-id", { $ne: null }]) {
    const { controller, calls } = load();
    const res = response();

    await controller.createMessage({
      user: { id: "principal" },
      body: { receiver, isGroup: true, text: "x" },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "group"), false);
    assert.equal(calls.includes("save"), false);
  }
});

test("M2 rejects a direct caller outside the pair and caps public limit", async () => {
  const denied = load();
  const deniedRes = response();
  await denied.controller.getMessages({ user: { id: "principal" }, params: { userId1: "a", userId2: "b" }, query: {} }, deniedRes);
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(denied.calls.some((call) => Array.isArray(call) && call[0] === "find"), false);

  const allowed = load();
  const allowedRes = response();
  await allowed.controller.getMessages({ user: { id: "principal" }, params: { userId1: "principal", userId2: "peer" }, query: { limit: "9999" } }, allowedRes);
  assert.equal(allowedRes.statusCode, 200);
  assert.deepEqual(allowed.calls.find((call) => Array.isArray(call) && call[0] === "limit"), ["limit", 200]);
});
