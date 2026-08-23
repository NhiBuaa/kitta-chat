import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { SOCKET_EVENTS as CLIENT_SOCKET_EVENTS } from "../../src/constants/socketEvents.js";
import {
  createPublicClientPaths,
} from "../../src/config/publicClientPaths.js";
import {
  createSocketConnection,
} from "../../src/services/socket/socketConnection.js";
import { axiosClient } from "../../src/services/api/axiosClient.js";
import { createGroup } from "../../src/services/api/groupApi.js";
import { getMessages } from "../../src/services/api/messageApi.js";

const require = createRequire(import.meta.url);
const buildConversationId = require("../../../server/src/utils/buildConversationId.js");
const { SOCKET_EVENTS: SERVER_SOCKET_EVENTS } = require(
  "../../../server/src/socket/socketEvents.js",
);

const expectedPaths = {
  socketBase: "/",
  auth: "/api/auth",
  users: "/api/users",
  messages: "/api/messages",
  groups: "/api/groups",
  files: "/api/files",
  calls: "/api/calls",
  runtimeConfig: "/runtime-config.json",
};

test("public client paths resolve to the exact same-origin contract", () => {
  assert.deepEqual(createPublicClientPaths({}), expectedPaths);
  assert.deepEqual(createPublicClientPaths({
    VITE_API_URL: "/",
    VITE_API_URL_AUTH: "/api/auth",
    VITE_API_URL_USERS: "/api/users",
    VITE_API_URL_MESSAGES: "/api/messages",
    VITE_API_URL_GROUPS: "/api/groups",
    VITE_API_URL_FILES: "/api/files",
    VITE_API_URL_CALLS: "/api/calls",
  }), expectedPaths);
});

test("Socket.IO connector uses current origin, the stable path, and unchanged auth payload", () => {
  const calls = [];
  const fakeSocket = { id: "socket-fixture" };
  const ioClient = (...args) => {
    calls.push(args);
    return fakeSocket;
  };

  const result = createSocketConnection({
    authToken: "synthetic-token",
    configuredBase: "/",
    ioClient,
  });

  assert.equal(result, fakeSocket);
  assert.deepEqual(calls, [[undefined, {
    path: "/socket.io",
    transports: ["websocket"],
    auth: { token: "synthetic-token" },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    connectTimeout: 10000,
    pingTimeout: 20000,
    pingInterval: 25000,
  }]]);
});

test("client and server retain exact public Socket.IO event names", () => {
  assert.deepEqual(CLIENT_SOCKET_EVENTS, SERVER_SOCKET_EVENTS);
});

test("direct conversation identity remains the sorted public conversationId", () => {
  assert.equal(buildConversationId("user-b", "user-a"), "user-a_user-b");
  assert.equal(buildConversationId("user-a", "user-b"), "user-a_user-b");
});

test("REST helpers retain same-origin URLs and existing request payload shapes", async () => {
  const observed = [];
  const previousAdapter = axiosClient.defaults.adapter;
  axiosClient.defaults.adapter = async (config) => {
    observed.push(config);
    return {
      config,
      data: { success: true },
      headers: {},
      status: 200,
      statusText: "OK",
    };
  };

  try {
    await createGroup({ name: "Demo Group", members: ["user-b"] });
    await getMessages({
      activeChat: { _id: "user-b" },
      currentUser: { _id: "user-a" },
      cursor: "cursor-1",
      signal: undefined,
    });
  } finally {
    axiosClient.defaults.adapter = previousAdapter;
  }

  assert.equal(observed[0].url, "/api/groups/");
  assert.equal(observed[0].method, "post");
  assert.deepEqual(JSON.parse(observed[0].data), {
    name: "Demo Group",
    members: ["user-b"],
  });
  assert.equal(observed[1].url, "/api/messages/user-a/user-b");
  assert.equal(observed[1].method, "get");
  assert.deepEqual(observed[1].params, { cursor: "cursor-1" });
});

test("Message.conversationId remains the required public string bridge", () => {
  const Message = require("../../../server/src/models/Message.js");
  const conversationId = Message.schema.path("conversationId");

  assert.equal(conversationId.instance, "String");
  assert.equal(conversationId.options.required, true);
});
