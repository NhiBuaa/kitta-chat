const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AUDIT_EVENTS_QUEUE,
  buildMessageCreatedJob,
} = require("../src/queues/auditJobs");
const { createAuditQueue } = require("../src/queues/auditQueue");
const { createRegisterMessageHandlers } = require("../src/socket/handlers/messageHandler");

const createSocketHarness = () => {
  const handlers = {};
  const emissions = [];
  const socket = {
    id: "socket-1",
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
  };
  const io = {
    to(room) {
      return {
        emit(eventName, payload) {
          emissions.push({ room, eventName, payload });
        },
      };
    },
    serverSideEmit() {},
  };

  return { handlers, emissions, socket, io };
};

test("buildMessageCreatedJob records audit/statistics metadata without message body", () => {
  const job = buildMessageCreatedJob({
    message: {
      _id: "msg-1",
      conversationId: "user-1_user-2",
      sender: "user-1",
      receiver: "user-2",
      type: "text",
      attachments: [{ _id: "file-1" }],
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
    },
    isGroup: false,
    isDuplicate: false,
  });

  assert.equal(job.type, "message.created");
  assert.equal(job.messageId, "msg-1");
  assert.equal(job.conversationId, "user-1_user-2");
  assert.equal(job.senderId, "user-1");
  assert.equal(job.receiverId, "user-2");
  assert.equal(job.messageType, "text");
  assert.equal(job.attachmentCount, 1);
  assert.equal(job.text, undefined);
  assert.equal(job.createdAt, "2026-05-17T10:00:00.000Z");
});

test("audit queue publishes message.created jobs to the audit events queue", async () => {
  const published = [];
  const auditQueue = createAuditQueue({
    producer: {
      async publish(queueName, job) {
        published.push({ queueName, job });
      },
    },
  });

  await auditQueue.publishMessageCreatedJob({ messageId: "msg-1" });

  assert.deepEqual(published, [
    {
      queueName: AUDIT_EVENTS_QUEUE,
      job: { messageId: "msg-1" },
    },
  ]);
});

test("sendMessage publishes message.created after realtime delivery succeeds", async () => {
  const { handlers, emissions, socket, io } = createSocketHarness();
  const published = [];
  const registerMessageHandlers = createRegisterMessageHandlers({
    getCachedUserProfile: async () => ({ displayName: "Alice", avatar: "a.png" }),
    saveMessage: async () => ({
      doc: {
        _id: "msg-1",
        conversationId: "user-1_user-2",
        sender: "user-1",
        receiver: "user-2",
        type: "text",
        attachments: [],
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
      },
      isDuplicate: false,
    }),
    auditQueue: {
      async publishMessageCreatedJob(job) {
        published.push(job);
      },
    },
  });

  registerMessageHandlers(socket, io);

  let callbackPayload;
  await handlers.sendMessage(
    {
      sender: "user-1",
      receiverId: "user-2",
      text: "secret body",
      idempotencyKey: "idem-1",
    },
    (payload) => {
      callbackPayload = payload;
    },
  );

  assert.equal(callbackPayload.success, true);
  assert.equal(emissions.length, 2);
  assert.deepEqual(emissions.map((item) => item.room), ["user-2", "user-1"]);
  assert.deepEqual(emissions.map((item) => item.eventName), ["getMessage", "getMessage"]);
  assert.equal(published.length, 1);
  assert.equal(published[0].type, "message.created");
  assert.equal(published[0].messageId, "msg-1");
  assert.equal(published[0].text, undefined);
});

test("sendMessage duplicate retry returns existing message and does not publish audit again", async () => {
  const { handlers, emissions, socket, io } = createSocketHarness();
  const published = [];
  const callbacks = [];
  const savedDoc = {
    _id: "msg-existing",
    conversationId: "user-1_user-2",
    sender: "user-1",
    receiver: "user-2",
    type: "text",
    attachments: [],
    createdAt: new Date("2026-05-17T10:00:00.000Z"),
  };
  const saveResults = [
    { doc: savedDoc, isDuplicate: false },
    { doc: savedDoc, isDuplicate: true },
  ];
  const registerMessageHandlers = createRegisterMessageHandlers({
    getCachedUserProfile: async () => ({ displayName: "Alice", avatar: "a.png" }),
    saveMessage: async () => saveResults.shift(),
    auditQueue: {
      async publishMessageCreatedJob(job) {
        published.push(job);
      },
    },
  });

  registerMessageHandlers(socket, io);

  const messagePayload = {
    sender: "user-1",
    receiverId: "user-2",
    text: "hello once",
    idempotencyKey: "idem-duplicate",
  };

  await handlers.sendMessage(messagePayload, (payload) => callbacks.push(payload));
  await handlers.sendMessage(messagePayload, (payload) => callbacks.push(payload));

  assert.deepEqual(callbacks, [
    { success: true, realId: "msg-existing", isDuplicate: false },
    { success: true, realId: "msg-existing", isDuplicate: true },
  ]);
  assert.equal(emissions.length, 4);
  assert.equal(published.length, 1);
  assert.equal(published[0].messageId, "msg-existing");
});

test("sendMessage remains successful when message.created job publish fails", async () => {
  const { handlers, emissions, socket, io } = createSocketHarness();
  const registerMessageHandlers = createRegisterMessageHandlers({
    getCachedUserProfile: async () => ({ displayName: "Alice" }),
    saveMessage: async () => ({
      doc: {
        _id: "msg-1",
        conversationId: "user-1_user-2",
        sender: "user-1",
        receiver: "user-2",
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
      },
      isDuplicate: false,
    }),
    auditQueue: {
      async publishMessageCreatedJob() {
        throw new Error("rabbit down");
      },
    },
    logger: { error() {}, warn() {}, log() {} },
  });

  registerMessageHandlers(socket, io);

  let callbackPayload;
  await handlers.sendMessage(
    { sender: "user-1", receiverId: "user-2", text: "hello" },
    (payload) => {
      callbackPayload = payload;
    },
  );

  assert.equal(callbackPayload.success, true);
  assert.equal(emissions.length, 2);
  assert.deepEqual(emissions.map((item) => item.eventName), ["getMessage", "getMessage"]);
});

test("group markRead marks system messages read and is idempotent", async () => {
  const { handlers, emissions, socket, io } = createSocketHarness();
  const updates = [];
  const registerMessageHandlers = createRegisterMessageHandlers({
    MessageModel: {
      async updateMany(query, update) {
        updates.push({ query, update });
      },
    },
    logger: { error() {}, warn() {}, log() {} },
  });

  registerMessageHandlers(socket, io);

  await handlers.markRead({
    isGroup: true,
    groupId: "group-1",
    readerId: "user-1",
  });

  assert.deepEqual(updates, [
    {
      query: {
        conversationId: "group-1",
        readBy: { $ne: "user-1" },
      },
      update: { $addToSet: { readBy: "user-1" } },
    },
  ]);
  assert.deepEqual(emissions, [
    {
      room: "group-1",
      eventName: "groupUserRead",
      payload: { groupId: "group-1", readerId: "user-1" },
    },
  ]);
});
