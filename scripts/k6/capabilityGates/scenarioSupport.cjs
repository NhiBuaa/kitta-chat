const http = require("node:http");
const path = require("node:path");

const {
  close,
  listen,
} = require("./runnerSupport.cjs");

const disabledCapabilities = Object.freeze({
  calls: false,
  googleLogin: false,
  issue61Measurement: false,
  recovery: false,
  syntheticSignupOnly: true,
  upload: false,
});

const quietLogger = Object.freeze({ info() {}, warn() {}, error() {} });

const requestJson = async ({ origin, method, pathname, body = "{not-json" }) => {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-request-id": "k6-113-safe-request-id",
    },
    body: method === "GET" ? undefined : body,
  });
  return { response, body: await response.json() };
};

const mapHttpObservation = ({ method, pathTemplate, response, body }) => ({
  method,
  pathTemplate,
  status: response.status,
  success: body.success,
  errorCode: body.error?.code ?? null,
  messageEqual: body.message === (
    body.error?.code === "CAPABILITY_DISABLED" ? "Feature unavailable" : body.message
  ),
  requestIdMatched: body.requestId === response.headers.get("x-request-id"),
  retryAfter: response.headers.get("retry-after"),
});

const runDisabledHttp = async ({ root, port, inventory }) => {
  const { createApp } = require(path.join(root, "server", "src", "app.js"));
  let limiter = 0;
  const app = createApp({
    capabilities: disabledCapabilities,
    logger: quietLogger,
    rateLimiter: {
      async admit() {
        limiter += 1;
        return { allowed: true };
      },
    },
  });
  const server = app.listen(port, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const observations = [];
    for (const [method, pathname, pathTemplate = pathname] of inventory) {
      const result = await requestJson({
        origin: `http://127.0.0.1:${port}`,
        method,
        pathname,
      });
      observations.push(mapHttpObservation({ method, pathTemplate, ...result }));
    }
    return { http: observations, limiter };
  } finally {
    await close(server);
  }
};

const createSocket = () => {
  const listeners = new Map();
  const emitted = [];
  return {
    id: "safe-socket-id",
    userId: "safe-user-id",
    listeners,
    emitted,
    on(event, handler) { listeners.set(event, handler); },
    emit(event, payload) { emitted.push({ event, payload }); },
  };
};

const createSyntheticServer = ({ controller, capabilities, counters, port }) => {
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", async () => {
      counters.limiter += 1;
      counters.bodyProcessing += 1;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "Invalid JSON" }));
        return;
      }
      const recorder = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) {
          response.writeHead(this.statusCode, { "content-type": "application/json" });
          response.end(JSON.stringify(payload));
          return this;
        },
      };
      try {
        await controller({ app: { get: () => capabilities }, body }, recorder);
      } catch {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ success: false, message: "Fixture error" }));
      }
    });
  });
  return listen(server, port).then(() => server);
};

const validRegistration = (email) => ({
  displayName: "Synthetic Visitor",
  email,
  password: "Strong1!Password",
  confirmPassword: "Strong1!Password",
});

module.exports = {
  createSocket,
  createSyntheticServer,
  disabledCapabilities,
  runDisabledHttp,
  validRegistration,
};
