const crypto = require("node:crypto");
const http = require("node:http");
const { Server } = require("socket.io");

const port = Number.parseInt(process.env.PORT || "3000", 10);
let upstreamHitCount = 0;
const upgradeObservations = [];

const writeJson = (response, status, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
};

const safeHeaderObservation = (headers) => ({
  origin: typeof headers.origin === "string" ? headers.origin : null,
  hostPresent: typeof headers.host === "string" && headers.host.length > 0,
  realIpPresent: typeof headers["x-real-ip"] === "string" && headers["x-real-ip"].length > 0,
  forwardedForPresent: typeof headers["x-forwarded-for"] === "string" && headers["x-forwarded-for"].length > 0,
  forwardedProtoPresent: typeof headers["x-forwarded-proto"] === "string" && headers["x-forwarded-proto"].length > 0,
  accept: typeof headers.accept === "string" ? headers.accept : null,
});

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://fixture.invalid");
  if (url.pathname.startsWith("/socket.io/")) return;

  if (url.pathname === "/__control/health") {
    writeJson(response, 200, { healthy: true });
    return;
  }
  if (url.pathname === "/__control/counter") {
    writeJson(response, 200, { count: upstreamHitCount });
    return;
  }
  if (url.pathname === "/__control/socket-state") {
    writeJson(response, 200, {
      upgradeObserved: upgradeObservations.length > 0,
      upgradeHeaderConformant: upgradeObservations.some((item) => item.upgrade === "websocket"),
      connectionHeaderConformant: upgradeObservations.some((item) => item.connectionIncludesUpgrade),
    });
    return;
  }

  if (url.pathname === "/api/probe" || url.pathname === "/api/auth/probe") {
    const hitBefore = upstreamHitCount;
    upstreamHitCount += 1;
    writeJson(response, 200, {
      hitBefore,
      hitAfter: upstreamHitCount,
      headers: safeHeaderObservation(request.headers),
    });
    return;
  }

  writeJson(response, 404, { category: "fixture-not-found" });
});

server.prependListener("upgrade", (request) => {
  const connection = String(request.headers.connection || "").toLowerCase();
  upgradeObservations.push({
    upgrade: String(request.headers.upgrade || "").toLowerCase(),
    connectionIncludesUpgrade: connection.split(",").map((item) => item.trim()).includes("upgrade"),
  });
});

const io = new Server(server, {
  path: "/socket.io/",
  transports: ["polling", "websocket"],
  allowUpgrades: true,
});

io.engine.on("connection", () => {
  upstreamHitCount += 1;
});

io.on("connection", (socket) => {
  const headers = safeHeaderObservation(socket.handshake.headers);
  socket.on("k6:probe", (payload, acknowledge) => {
    const digest = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    acknowledge({ digest, headers });
  });
});

server.listen(port, "0.0.0.0");

const shutdown = () => {
  io.close(() => server.close(() => process.exit(0)));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
