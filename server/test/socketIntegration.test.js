const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const { io: createClient } = require("../../client/node_modules/socket.io-client");

const socketIndexPath = require.resolve("../src/socket/index");
const messageHandlerPath = require.resolve("../src/socket/handlers/messageHandler");
const redisPath = require.resolve("redis");
const redisAdapterPath = require.resolve("@socket.io/redis-adapter");
const presenceHandlerPath = require.resolve("../src/socket/handlers/presenceHandler");
const friendHandlerPath = require.resolve("../src/socket/handlers/friendHandler");
const typingHandlerPath = require.resolve("../src/socket/handlers/typingHandler");
const callHandlerPath = require.resolve("../src/socket/handlers/call/index");
const callTimeoutFinalizerPath = require.resolve("../src/socket/handlers/call/services/callTimeoutFinalizer");
const presenceServicePath = require.resolve("../src/services/presenceService");
const userModelPath = require.resolve("../src/models/User");
const groupModelPath = require.resolve("../src/models/Group");
const messageModelPath = require.resolve("../src/models/Message");
const cacheServicePath = require.resolve("../src/services/cacheService");
const saveMessagePath = require.resolve("../src/utils/saveMessageInBackground");
const auditQueuePath = require.resolve("../src/queues/auditQueue");
const auditJobsPath = require.resolve("../src/queues/auditJobs");

const mockedPaths = [
  socketIndexPath,
  messageHandlerPath,
  redisPath,
  redisAdapterPath,
  presenceHandlerPath,
  friendHandlerPath,
  typingHandlerPath,
  callHandlerPath,
  callTimeoutFinalizerPath,
  presenceServicePath,
  userModelPath,
  groupModelPath,
  messageModelPath,
  cacheServicePath,
  saveMessagePath,
  auditQueuePath,
  auditJobsPath,
];

const mockModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

const clearMocks = () => {
  for (const path of mockedPaths) {
    delete require.cache[path];
  }
};

const createSocketServer = async () => {
  clearMocks();

  process.env.JWT_SECRET = "socket-test-secret";
  process.env.URL_FRONTEND = "http://localhost:5173";

  const savedMessages = [];
  const redisClients = [];

  mockModule(redisPath, {
    createClient() {
      const client = {
        connected: false,
        duplicate() {
          const duplicate = { ...client };
          redisClients.push(duplicate);
          return duplicate;
        },
        on() {},
        async del() {},
        async sAdd() {},
        async sCard() {
          return 1;
        },
        async sRem() {},
        async expire() {},
        async connect() {
          this.connected = true;
        },
      };
      redisClients.push(client);
      return client;
    },
  });

  mockModule(redisAdapterPath, {
    createAdapter() {
      return require("socket.io-adapter").Adapter;
    },
  });

  mockModule(userModelPath, {
    findById() {
      return {
        select: async () => ({ friends: [] }),
      };
    },
  });
  mockModule(groupModelPath, {
    find() {
      const result = Promise.resolve([]);
      return {
        select: async () => [],
        then: result.then.bind(result),
        catch: result.catch.bind(result),
        finally: result.finally.bind(result),
      };
    },
    findById() {
      return {
        select: async () => null,
      };
    },
  });
  mockModule(messageModelPath, {
    async updateMany() {
      return { modifiedCount: 0 };
    },
  });
  mockModule(presenceServicePath, {
    async renewHeartbeat() {},
    async setPresenceWriteThrough() {},
  });
  mockModule(cacheServicePath, {
    async getCachedUserProfile(userId) {
      return {
        _id: userId,
        displayName: userId === "sender-user" ? "Sender User" : "Receiver User",
        avatar: null,
      };
    },
  });
  mockModule(saveMessagePath, async (messageData) => {
    const doc = {
      _id: "message-1",
      ...messageData,
      attachments: messageData.attachments || [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    savedMessages.push(doc);
    return { doc, isDuplicate: false };
  });
  mockModule(auditQueuePath, {
    auditQueue: {
      async publishMessageCreatedJob() {},
    },
  });
  mockModule(auditJobsPath, {
    buildMessageCreatedJob({ message }) {
      return { type: "message.created", messageId: message._id };
    },
  });
  mockModule(friendHandlerPath, {
    registerFriendHandlers() {},
  });
  mockModule(typingHandlerPath, {
    registerTypingHandlers() {},
  });
  mockModule(callHandlerPath, {
    registerCallHandlers() {},
  });
  mockModule(callTimeoutFinalizerPath, {
    createCallTimeoutFinalizer() {
      return {
        start() {},
      };
    },
  });

  const { initSocket } = require(socketIndexPath);
  const app = {
    values: new Map(),
    set(key, value) {
      this.values.set(key, value);
    },
  };
  const httpServer = http.createServer();
  const io = await initSocket(httpServer, app);

  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();

  const close = async () => {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
    clearMocks();
  };

  return {
    close,
    io,
    port,
    savedMessages,
    url: `http://127.0.0.1:${port}`,
  };
};

const connectClient = async (url, token) => {
  const client = createClient(url, {
    auth: token ? { token } : {},
    reconnection: false,
    timeout: 1000,
    transports: ["websocket"],
  });

  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });

  return client;
};

const connectError = async (url, token) => {
  const client = createClient(url, {
    auth: token ? { token } : {},
    reconnection: false,
    timeout: 1000,
    transports: ["websocket"],
  });

  try {
    const error = await new Promise((resolve, reject) => {
      client.once("connect", () => reject(new Error("socket connected unexpectedly")));
      client.once("connect_error", resolve);
    });
    return error;
  } finally {
    client.close();
  }
};

const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 500;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
};

test.afterEach(() => {
  clearMocks();
});

test("socket rejects missing or invalid JWT before connection", async () => {
  const server = await createSocketServer();

  try {
    const missingTokenError = await connectError(server.url);
    const invalidTokenError = await connectError(server.url, "not-a-jwt");

    assert.equal(missingTokenError.message, "Authentication required");
    assert.equal(invalidTokenError.message, "Invalid or expired token");
  } finally {
    await server.close();
  }
});

test("socket accepts valid JWT and joins authenticated user room", async () => {
  const server = await createSocketServer();
  const token = jwt.sign({ id: "sender-user" }, process.env.JWT_SECRET);
  const sender = await connectClient(server.url, token);

  try {
    sender.emit("addNewUser", "sender-user");

    await waitFor(
      () => server.io.of("/").adapter.rooms.get("sender-user")?.has(sender.id),
      "sender should join authenticated user room",
    );

    const room = server.io.of("/").adapter.rooms.get("sender-user");
    assert.ok(room?.has(sender.id));
  } finally {
    sender.close();
    await server.close();
  }
});

test("sendMessage persists and delivers direct message to sender and receiver rooms", async () => {
  const server = await createSocketServer();
  const senderToken = jwt.sign({ id: "sender-user" }, process.env.JWT_SECRET);
  const receiverToken = jwt.sign({ id: "receiver-user" }, process.env.JWT_SECRET);
  const sender = await connectClient(server.url, senderToken);
  const receiver = await connectClient(server.url, receiverToken);

  try {
    sender.emit("addNewUser", "sender-user");
    receiver.emit("addNewUser", "receiver-user");

    await waitFor(
      () => server.io.of("/").adapter.rooms.get("sender-user")?.has(sender.id),
      "sender should join sender user room",
    );
    await waitFor(
      () => server.io.of("/").adapter.rooms.get("receiver-user")?.has(receiver.id),
      "receiver should join receiver user room",
    );

    const senderDelivery = new Promise((resolve) => sender.once("getMessage", resolve));
    const receiverDelivery = new Promise((resolve) => receiver.once("getMessage", resolve));

    const callback = new Promise((resolve) => {
      sender.emit(
        "sendMessage",
        {
          sender: "sender-user",
          receiverId: "receiver-user",
          text: "hello from socket integration",
          isGroup: false,
          idempotencyKey: "idem-socket-1",
        },
        resolve,
      );
    });

    const [callbackPayload, senderPayload, receiverPayload] = await Promise.all([
      callback,
      senderDelivery,
      receiverDelivery,
    ]);

    assert.deepEqual(callbackPayload, {
      success: true,
      realId: "message-1",
      isDuplicate: false,
    });
    assert.equal(server.savedMessages.length, 1);
    assert.equal(server.savedMessages[0].conversationId, "receiver-user_sender-user");
    assert.equal(senderPayload._id, "message-1");
    assert.equal(receiverPayload._id, "message-1");
    assert.equal(receiverPayload.text, "hello from socket integration");
    assert.equal(receiverPayload.sender._id, "sender-user");
    assert.equal(receiverPayload.sender.displayName, "Sender User");
    assert.equal(receiverPayload.receiver, "receiver-user");
    assert.equal(receiverPayload.idempotencyKey, "idem-socket-1");
  } finally {
    sender.close();
    receiver.close();
    await server.close();
  }
});
