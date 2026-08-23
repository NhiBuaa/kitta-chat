const crypto = require("node:crypto");
const path = require("node:path");
const { createRequire } = require("node:module");

const ORIGIN_SENTINEL = "https://browser.internal.test";

const parseJson = (body, category) => {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`EDGE_SCENARIO_ERROR=${category}_JSON`);
  }
};

const contentCategory = ({ status, headers, body }, route) => {
  const contentType = (headers.get("content-type") || "").toLowerCase();
  const lowerBody = body.trimStart().toLowerCase();
  if (route.startsWith("/socket.io/") && status === 200) return "socket-io";
  if (route === "/healthz" && status === 200 && body === "OK") return "edge-liveness";
  if (route === "/runtime-config.json" && contentType.includes("application/json")) return "runtime-json";
  if (contentType.includes("javascript")) return "javascript-asset";
  if (contentType.includes("text/html") || lowerBody.startsWith("<!doctype html")) return "spa-entry";
  if (contentType.includes("application/json") && route.startsWith("/api/")) return "backend-json";
  if (!contentType.includes("text/html")) return "generic-non-html";
  return "unexpected-html";
};

const appendHttp = (observation, route, result, method = "GET") => {
  const row = {
    method,
    path: route,
    status: result.response.status,
    contentCategory: contentCategory(result.response, route),
    upstreamHitCountBefore: result.before,
    upstreamHitCountAfter: result.after,
    upstreamHitDelta: result.after - result.before,
  };
  observation.http.push(row);
  return row;
};

const headersFrom = (response) => parseJson(response.body, "BACKEND_RESPONSE").headers;

const appendCombinedHeaderCheck = (observation, seam, present, absent) => {
  observation.headerChecks.push({
    seam,
    originEqual: present.origin === ORIGIN_SENTINEL,
    originAbsent: absent.origin === null,
    hostPresent: present.hostPresent && absent.hostPresent,
    realIpPresent: present.realIpPresent && absent.realIpPresent,
    forwardedForPresent: present.forwardedForPresent && absent.forwardedForPresent,
    forwardedProtoPresent: present.forwardedProtoPresent && absent.forwardedProtoPresent,
    forbiddenSubstitutionAbsent: present.accept !== ORIGIN_SENTINEL && absent.accept !== ORIGIN_SENTINEL,
  });
};

const runRestOrigin = async (harness, observation) => {
  for (const [seam, route] of [["rest", "/api/probe"], ["auth", "/api/auth/probe"]]) {
    const present = await harness.requestWithCounter(route, {
      headers: { Origin: ORIGIN_SENTINEL, Accept: "application/json" },
    });
    appendHttp(observation, route, present);
    const absent = await harness.requestWithCounter(route, {
      headers: { Accept: "application/json" },
    });
    appendHttp(observation, route, absent);
    appendCombinedHeaderCheck(
      observation,
      seam,
      headersFrom(present.response),
      headersFrom(absent.response),
    );
  }
  observation.artifactChecks.push({
    name: "rest-origin-matrix",
    matched: observation.headerChecks.every((check) => Object.values(check).slice(1).every(Boolean)),
  });
};

const connectSocket = async (repository, edgePort, origin) => {
  const requireFromServer = createRequire(path.join(repository, "server", "package.json"));
  const { io } = requireFromServer("socket.io-client");
  const socket = io(`http://127.0.0.1:${edgePort}`, {
    path: "/socket.io/",
    transports: ["polling", "websocket"],
    upgrade: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 250,
    timeout: 5_000,
    ...(origin ? { extraHeaders: { Origin: origin } } : {}),
  });
  let pollingConnected = false;
  socket.io.on("open", () => {
    pollingConnected ||= socket.io.engine?.transport?.name === "polling";
  });
  const connected = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("EDGE_SCENARIO_ERROR=SOCKET_CONNECT_TIMEOUT")), 15_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(new Error(`EDGE_SCENARIO_ERROR=SOCKET_CONNECT_${error ? "FAILED" : "UNKNOWN"}`));
    });
  });
  socket.connect();
  await connected;

  let upgraded = socket.io.engine?.transport?.name === "websocket";
  for (let attempt = 0; attempt < 100 && !upgraded; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    upgraded = socket.io.engine?.transport?.name === "websocket";
  }
  return { socket, pollingConnected, upgraded };
};

const socketProbe = (socket, sequence) => new Promise((resolve, reject) => {
  const payload = { kind: "k6-edge-probe", sequence };
  const expectedDigest = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  socket.timeout(5_000).emit("k6:probe", payload, (error, response) => {
    if (error || !response) {
      reject(new Error("EDGE_SCENARIO_ERROR=SOCKET_PROBE"));
      return;
    }
    resolve({ ...response, expectedDigest });
  });
});

const runSocketReconnect = async (harness, observation) => {
  let present;
  let absent;
  try {
    present = await connectSocket(harness.repository, harness.edgePort, ORIGIN_SENTINEL);
    const firstProbe = await socketProbe(present.socket, 1);
    const reconnected = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("EDGE_SCENARIO_ERROR=SOCKET_RECONNECT_TIMEOUT")), 30_000);
      present.socket.io.once("reconnect", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    await harness.restartBackend();
    await reconnected;
    const secondProbe = await socketProbe(present.socket, 2);
    absent = await connectSocket(harness.repository, harness.edgePort, null);
    const absentProbe = await socketProbe(absent.socket, 3);
    const socketState = await harness.backendControl("/__control/socket-state");

    const presentHeaders = secondProbe.headers;
    const absentHeaders = absentProbe.headers;
    observation.headerChecks.push({
      seam: "socket",
      originEqual: presentHeaders.origin === ORIGIN_SENTINEL,
      originAbsent: absentHeaders.origin === null,
      hostPresent: presentHeaders.hostPresent && absentHeaders.hostPresent,
      realIpPresent: presentHeaders.realIpPresent && absentHeaders.realIpPresent,
      forwardedForPresent: presentHeaders.forwardedForPresent && absentHeaders.forwardedForPresent,
      forwardedProtoPresent: presentHeaders.forwardedProtoPresent && absentHeaders.forwardedProtoPresent,
      forbiddenSubstitutionAbsent: presentHeaders.origin === ORIGIN_SENTINEL && absentHeaders.origin === null,
    });
    observation.socket = {
      pollingConnected: present.pollingConnected,
      upgraded: present.upgraded,
      reconnected: true,
      originEqual: presentHeaders.origin === ORIGIN_SENTINEL,
      originAbsent: absentHeaders.origin === null,
      upgradeHeaderConformant: socketState.upgradeObserved === true && socketState.upgradeHeaderConformant === true,
      connectionHeaderConformant: socketState.connectionHeaderConformant === true,
      payloadDigestEqual: firstProbe.digest === firstProbe.expectedDigest
        && secondProbe.digest === secondProbe.expectedDigest
        && absentProbe.digest === absentProbe.expectedDigest,
    };
    observation.artifactChecks.push({
      name: "socket-payload-contract",
      matched: observation.socket.payloadDigestEqual,
    });
  } finally {
    present?.socket?.close();
    absent?.socket?.close();
  }
};

const runBackendDown = async (harness, observation) => {
  const before = await harness.counter();
  await harness.stopBackend();
  const response = await harness.edgeFetch("/healthz");
  await harness.restartBackend();
  const after = await harness.counter();
  const row = appendHttp(observation, "/healthz", { response, before, after });
  const forbidden = /(mongo|redis|rabbit|provider|hostname|dependency|process|memory|stack|secret)/i;
  observation.artifactChecks.push({
    name: "edge-health-minimal",
    matched: row.status === 200
      && row.contentCategory === "edge-liveness"
      && response.body === "OK"
      && !forbidden.test(response.body),
  });
};

const routeMatrix = Object.freeze([
  "/readyz", "/readyz/", "/readyz/child",
  "/ops", "/ops/", "/ops/child",
  "/metrics", "/metrics/", "/metrics/child",
  "/backend-healthz", "/backend-healthz/", "/backend-healthz/child",
  "/api", "/socket.io",
  "/api/probe", "/api/auth/probe",
  "/socket.io/?EIO=4&transport=polling",
  "/healthz", "/runtime-config.json",
  "/login", "/__k6_unknown_navigation__",
]);

const runRouteMatrix = async (harness, observation) => {
  for (const route of routeMatrix) {
    const result = await harness.requestWithCounter(route, {
      headers: { Accept: "application/json,text/html;q=0.9" },
    });
    appendHttp(observation, route, result);
  }
  const deniedPrefixes = ["/readyz", "/ops", "/metrics", "/backend-healthz"];
  const deniedRows = observation.http.filter((row) => deniedPrefixes.some((prefix) => row.path === prefix || row.path.startsWith(`${prefix}/`)));
  const reservedRows = observation.http.filter((row) => row.path === "/api" || row.path === "/socket.io");
  const proxiedRows = observation.http.filter((row) => row.path === "/api/probe" || row.path === "/api/auth/probe");
  observation.artifactChecks.push({
    name: "route-matrix-complete",
    matched: observation.http.length === routeMatrix.length
      && deniedRows.every((row) => row.status === 404 && row.contentCategory === "generic-non-html" && row.upstreamHitDelta === 0)
      && reservedRows.every((row) => row.status === 404 && row.contentCategory === "generic-non-html" && row.upstreamHitDelta === 0)
      && proxiedRows.every((row) => row.status === 200 && row.upstreamHitDelta > 0),
  });
};

const runSpaPrecedence = async (harness, observation) => {
  const navigation = await harness.requestWithCounter("/login");
  appendHttp(observation, "/login", navigation);
  const scriptMatch = navigation.response.body.match(/<script[^>]+src="([^"?#]+\.js)"/i);
  if (!scriptMatch || !scriptMatch[1].startsWith("/")) {
    throw new Error("EDGE_SCENARIO_ERROR=SPA_SCRIPT_NOT_FOUND");
  }
  const asset = await harness.requestWithCounter(scriptMatch[1]);
  const assetRow = appendHttp(observation, scriptMatch[1], asset);
  const reservedRoutes = [
    "/api", "/socket.io", "/healthz", "/runtime-config.json", "/readyz", "/ops",
  ];
  for (const route of reservedRoutes) {
    appendHttp(observation, route, await harness.requestWithCounter(route));
  }
  observation.artifactChecks.push({
    name: "spa-static-precedence",
    matched: observation.http[0].contentCategory === "spa-entry"
      && assetRow.status === 200
      && assetRow.contentCategory === "javascript-asset"
      && observation.http.slice(2).every((row) => row.contentCategory !== "spa-entry"),
  });
};

const SCENARIO_RUNNERS = Object.freeze({
  "rest-origin": runRestOrigin,
  "socket-reconnect": runSocketReconnect,
  "backend-down": runBackendDown,
  "route-matrix": runRouteMatrix,
  "spa-precedence": runSpaPrecedence,
});

module.exports = { SCENARIO_RUNNERS };
