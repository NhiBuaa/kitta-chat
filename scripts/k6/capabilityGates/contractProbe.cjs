const fs = require("node:fs");
const path = require("node:path");

const parseArguments = (argv) => {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) {
      throw new Error("contract probe arguments must be named value pairs");
    }
    result[key.slice(2)] = argv[index + 1];
  }
  return result;
};

const mockModule = (file, exports) => {
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports,
  };
};

const routeInventory = (root) => {
  const serverSource = path.join(root, "server", "src");
  const rateMiddleware = path.join(serverSource, "rateLimit", "httpAdmissionMiddleware.js");
  const authMiddleware = path.join(serverSource, "middlewares", "auth.js");
  const authController = path.join(serverSource, "controllers", "authController.js");
  const fileController = path.join(serverSource, "controllers", "fileController.js");
  const callController = path.join(serverSource, "controllers", "callHistoryController.js");
  const handler = () => {};
  mockModule(rateMiddleware, {
    createHttpRateLimitMiddleware({ policyIds }) {
      const middleware = (_req, _res, next) => next();
      middleware.rateLimitPolicyIds = [...policyIds];
      return middleware;
    },
  });
  mockModule(authMiddleware, handler);
  mockModule(authController, {
    forgotPassword: handler,
    googleLogin: handler,
    login: handler,
    logout: handler,
    refresh: handler,
    register: handler,
    resetPassword: handler,
    session: handler,
  });
  mockModule(fileController, {
    complete: handler,
    createDownloadUrl: handler,
    getPresignedUrl: handler,
    init: handler,
    uploadSingleFile: handler,
  });
  mockModule(callController, {
    getCallHistory: handler,
    getMissedCalls: handler,
    markAllCallsRead: handler,
    markCallRead: handler,
  });

  const routers = [
    ["/api/auth", require(path.join(serverSource, "routes", "auth.js"))],
    ["/api/files", require(path.join(serverSource, "routes", "file.js"))],
    ["/api/calls", require(path.join(serverSource, "routes", "callHistory.js"))],
  ];
  const routes = [];
  for (const [prefix, router] of routers) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const method = Object.keys(layer.route.methods).find((key) => layer.route.methods[key]);
      routes.push({
        method: method.toUpperCase(),
        path: `${prefix}${layer.route.path}`,
        policyIds: layer.route.stack.flatMap(
          (entry) => entry.handle.rateLimitPolicyIds || [],
        ),
      });
    }
  }
  return routes.sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`));
};

const responseRecorder = () => ({
  body: null,
  cookies: [],
  req: { requestId: "safe-request-id" },
  statusCode: 200,
  clearCookie() {},
  cookie(name, _value, options) {
    this.cookies.push({
      name,
      attributes: Object.keys(options).sort(),
      httpOnly: options.httpOnly === true,
      sameSite: options.sameSite,
      secure: options.secure === true,
    });
  },
  json(body) {
    this.body = body;
    return this;
  },
  setHeader() {},
  status(code) {
    this.statusCode = code;
    return this;
  },
});

const authShapes = async (root) => {
  const source = path.join(root, "server", "src");
  const modelPath = path.join(source, "models", "User.js");
  const firebasePath = path.join(source, "config", "firebaseAdmin.js");
  const avatarQueuePath = path.join(source, "services", "avatarQueueService.js");
  const resetQueuePath = path.join(source, "services", "passwordResetNotificationService.js");
  let savedUser = null;
  class InMemoryUser {
    constructor(input) {
      Object.assign(this, input);
      this._id = "safe-user-id";
      this.provider = this.provider || "local";
      this.status = "synthetic";
      this.activityStatus = { state: "active" };
    }

    static async findOne() {
      return savedUser;
    }

    async save() {
      savedUser = this;
      return this;
    }
  }
  mockModule(modelPath, InMemoryUser);
  mockModule(firebasePath, { auth: () => ({ verifyIdToken: async () => ({}) }) });
  mockModule(avatarQueuePath, { queueRemoteAvatarProcessing: async () => ({ queued: false }) });
  mockModule(resetQueuePath, { queuePasswordResetEmail: async () => ({ queued: false }) });
  process.env.JWT_SECRET = "test-memory-jwt";
  process.env.REFRESH_TOKEN_SECRET = "test-memory-refresh";
  process.env.NODE_ENV = "production";
  process.env.AUTH_COOKIE_SECURE = "true";

  delete require.cache[path.join(source, "controllers", "authController.js")];
  delete require.cache[path.join(source, "controllers", "registrationController.js")];
  const controller = require(path.join(source, "controllers", "authController.js"));
  const registerResponse = responseRecorder();
  await controller.register({
    app: { get: () => ({ syntheticSignupOnly: false }) },
    body: {
      confirmPassword: "Strong1!Password",
      displayName: "Synthetic User",
      email: "contract-user@example.test",
      password: "Strong1!Password",
    },
  }, registerResponse);
  const loginResponse = responseRecorder();
  await controller.login({
    body: {
      email: "contract-user@example.test",
      password: "Strong1!Password",
    },
  }, loginResponse);

  return {
    loginKeys: Object.keys(loginResponse.body).sort(),
    refreshCookie: registerResponse.cookies.map((entry) => ({
      attributes: entry.attributes,
      httpOnly: entry.httpOnly,
      sameSite: entry.sameSite,
      secure: entry.secure,
    })),
    registerKeys: Object.keys(registerResponse.body).sort(),
  };
};

const assertSourceContains = (file, snippets) => {
  const source = fs.readFileSync(file, "utf8");
  for (const snippet of snippets) {
    if (!source.includes(snippet)) throw new Error(`contract source marker missing: ${path.basename(file)}`);
  }
};

const callShapes = (root) => {
  const directory = path.join(root, "server", "src", "socket", "handlers", "call", "handlers");
  const definitions = {
    initCall: {
      file: "initCall.js",
      inputPayloadKeys: ["callId", "from", "typeCall", "userToCall"],
      outputEvents: ["RATE_LIMITED", "RATE_LIMIT_UNAVAILABLE", "callTimeout"],
      outputPayloadKeys: ["callId", "code", "retryAfterSeconds"],
      ackKeys: [],
      publicIdentifierKeys: ["callId", "conversationId"],
      targetRoomClass: "authenticated-participant-room",
    },
    callUser: {
      file: "callUser.js",
      inputPayloadKeys: ["avatar", "callId", "from", "mediaStatus", "name", "signalData", "typeCall", "userToCall"],
      outputEvents: ["RATE_LIMITED", "RATE_LIMIT_UNAVAILABLE", "callRejected", "callUser", "outgoingCallCreated"],
      outputPayloadKeys: ["avatar", "callId", "callerDbId", "conversationId", "from", "mediaStatus", "name", "signal", "type", "typeCall", "userToCall"],
      ackKeys: [],
      publicIdentifierKeys: ["callId", "conversationId", "callerDbId"],
      targetRoomClass: "authenticated-user-room",
    },
    answerCall: {
      file: "answerCall.js",
      inputPayloadKeys: ["callId", "mediaStatus", "signal", "to"],
      outputEvents: ["callAccepted"],
      outputPayloadKeys: ["answeredAt", "mediaStatus", "signal"],
      ackKeys: ["answeredAt"],
      publicIdentifierKeys: ["callId"],
      targetRoomClass: "authenticated-user-room",
    },
    endCall: {
      file: "endCall.js",
      inputPayloadKeys: ["callId", "to"],
      outputEvents: ["callEnded", "callHistorySync"],
      outputPayloadKeys: [],
      ackKeys: [],
      publicIdentifierKeys: ["callId"],
      targetRoomClass: "participant-rooms",
    },
    rejectCall: {
      file: "rejectCall.js",
      inputPayloadKeys: ["callId", "reason", "to"],
      outputEvents: ["callCancelled", "callEnded", "callRejected", "callHistorySync"],
      outputPayloadKeys: ["callId", "reason"],
      ackKeys: [],
      publicIdentifierKeys: ["callId"],
      targetRoomClass: "participant-rooms",
    },
    toggleMedia: {
      file: "toggleMedia.js",
      inputPayloadKeys: ["cam", "mic", "to"],
      outputEvents: ["updateMediaStatus"],
      outputPayloadKeys: ["cam", "mic"],
      ackKeys: [],
      publicIdentifierKeys: [],
      targetRoomClass: "authenticated-user-room",
    },
  };
  return Object.entries(definitions).map(([inputEvent, definition]) => {
    const file = path.join(directory, definition.file);
    assertSourceContains(file, [`socket.on("${inputEvent}"`]);
    return {
      seam: `call.socket.${inputEvent}`,
      shape: {
        ...definition,
        file: undefined,
        authorizationOutcomeClass: "authenticated-socket-principal",
        inputEvent,
      },
    };
  });
};

const probe = async (root) => {
  const repositoryRoot = path.resolve(root);
  const routes = routeInventory(repositoryRoot);
  const auth = await authShapes(repositoryRoot);
  const sendErrorPath = path.join(repositoryRoot, "server", "src", "utils", "apiResponse.js");
  assertSourceContains(sendErrorPath, ["requestId"]);
  const callController = path.join(repositoryRoot, "server", "src", "controllers", "callHistoryController.js");
  assertSourceContains(callController, ["nextCursor", "hasMore", "modifiedCount", "isReadByCurrentUser"]);

  const checks = [
    { seam: "auth.register.response-keys", shape: auth.registerKeys },
    { seam: "auth.login.response-keys", shape: auth.loginKeys },
    { seam: "auth.refresh.cookie-presence-attributes", shape: auth.refreshCookie },
    { seam: "auth.request-id-field", shape: { key: "requestId", present: true } },
    ...callShapes(repositoryRoot),
    {
      seam: "call.history.response-identifiers",
      shape: {
        routeInventory: routes.filter((route) => route.path.startsWith("/api/calls")),
        publicKeys: ["calls", "hasMore", "isReadByCurrentUser", "modifiedCount", "nextCursor"],
      },
    },
    {
      seam: "file.private-download.delegation",
      shape: routes.find((route) => route.path === "/api/files/:fileId/download-url"),
    },
  ];
  return checks.sort((left, right) => left.seam.localeCompare(right.seam));
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const checks = await probe(options.root || process.cwd());
  process.stdout.write(`${JSON.stringify({ checks })}\n`);
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { probe };
