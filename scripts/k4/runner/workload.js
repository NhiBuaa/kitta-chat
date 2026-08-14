const crypto = require("node:crypto");

const DEFAULT_TARGET = "http://nginx";

function sleepMs(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function randomCorrelationId(index) {
  return `k4-${index}-${crypto.randomUUID()}`;
}

async function openLoopSlots({ ratePerSecond, durationSeconds, startOpportunity, clock = Date.now, sleep = sleepMs, correlationId = randomCorrelationId }) {
  const phaseStart = clock();
  const intervalMs = 1000 / ratePerSecond;
  const expected = ratePerSecond * durationSeconds;
  const opportunities = [];
  const inFlight = [];
  for (let index = 0; index < expected; index += 1) {
    const scheduledAt = phaseStart + index * intervalMs;
    const slotClosesAt = scheduledAt + intervalMs;
    const delay = scheduledAt - clock();
    if (delay > 0) await sleep(delay);
    const actual = clock();
    const id = correlationId(index);
    if (actual >= slotClosesAt) {
      opportunities.push({ opportunityId: index, correlationId: id, scheduledAt, slotClosesAt, status: "not-started", reason: "slot-deadline-missed" });
      continue;
    }
    const startedAt = clock();
    const record = { opportunityId: index, correlationId: id, scheduledAt, startedAt, status: "started" };
    opportunities.push(record);
    let operation;
    try {
      operation = startOpportunity({ opportunityId: index, correlationId: id, scheduledAt, startedAt });
    } catch (error) {
      operation = Promise.reject(error);
    }
    inFlight.push(Promise.resolve(operation)
      .then((evidence) => { record.evidence = evidence; record.completedAt = clock(); })
      .catch((error) => { record.error = error.message; record.completedAt = clock(); }));
  }
  await Promise.all(inFlight);
  opportunities.sort((left, right) => left.opportunityId - right.opportunityId);
  return { phaseStart, phaseEnd: phaseStart + durationSeconds * 1000, opportunities };
}

function waitForSocket(socket, event, timeoutMs, clock = Date.now, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout) {
  return new Promise((resolve, reject) => {
    const startedAt = clock();
    const timer = setTimeoutFn(() => {
      cleanup();
      reject(new Error(`${event} timeout`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeoutFn(timer);
      socket.off?.(event, onEvent);
      socket.off?.("connect_error", onError);
    };
    const onEvent = (value) => { cleanup(); resolve({ value, timestamp: clock(), startedAt }); };
    const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))); };
    socket.once(event, onEvent);
    if (event === "connect") socket.once("connect_error", onError);
  });
}

async function connectActor({ createSocket, target, actor, token, timeoutMs, clock }) {
  const socket = createSocket(target, {
    path: "/socket.io/",
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    autoConnect: false,
  });
  const connected = waitForSocket(socket, "connect", timeoutMs, clock);
  socket.connect();
  const evidence = await connected;
  socket.emit("addNewUser", actor.id);
  return { socket, actor, connectedAt: evidence.timestamp };
}

function disconnectAll(connections, clock = Date.now) {
  return connections.map(({ socket, actor, connectedAt }) => {
    const disconnectedAt = clock();
    socket.disconnect();
    return { actorRef: actor.id, socketId: socket.id, connectedAt, disconnectedAt };
  });
}

function messageText(bytes) {
  return "x".repeat(bytes);
}

function createWorkloadExecutor({ fetch = globalThis.fetch, createSocket, clock = Date.now, sleep = sleepMs, correlationId = randomCorrelationId, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  if (typeof fetch !== "function") throw new Error("workload fetch adapter is required");

  async function executeSidebar({ phase, target, profile, actorSecrets }) {
    const durationSeconds = profile[phase === "warm-up" ? "warmup" : "measurement"].durationSeconds;
    const result = await openLoopSlots({
      ratePerSecond: profile.loadModel.ratePerSecond, durationSeconds, clock, sleep, correlationId,
      startOpportunity: async ({ correlationId: requestId }) => {
        const response = await fetch(`${target}/api/sidebar/conversations?page=1&limit=${profile.pagination.pageSize}`, {
          method: "GET",
          headers: { authorization: `Bearer ${actorSecrets.alice.token}`, "x-request-id": requestId },
        });
        if (!response.ok) throw new Error(`sidebar request failed with ${response.status}`);
        return { requestId, status: response.status };
      },
    });
    return decorateFixedRateEvidence(result, profile, phase, {
      measuredRequestIds: result.opportunities
        .filter(({ evidence, completedAt }) => evidence?.status === 200 && completedAt < result.phaseEnd)
        .map(({ correlationId: id }) => id),
      measuredActors: ["alice"],
    });
  }

  async function executeMessage({ phase, target, profile, actorRefs, actorSecrets }) {
    if (typeof createSocket !== "function") throw new Error("message workload socket adapter is required");
    const durationSeconds = profile[phase === "warm-up" ? "warmup" : "measurement"].durationSeconds;
    const connections = [];
    await Promise.all(["alice", "bob"].map((name) => connectActor({
      createSocket, target, actor: actorRefs[name], token: actorSecrets[name].token,
      timeoutMs: profile.deliveryTimeoutMs, clock,
    }).then((connection) => { connections.push(connection); })));
    const [sender, recipient] = connections;
    try {
      const result = await openLoopSlots({
        ratePerSecond: profile.loadModel.ratePerSecond, durationSeconds, clock, sleep, correlationId,
        startOpportunity: async ({ correlationId: id }) => {
          const delivery = waitForSocket(recipient.socket, "getMessage", profile.deliveryTimeoutMs, clock, setTimeoutFn, clearTimeoutFn);
          const acknowledgement = new Promise((resolve, reject) => {
            const timer = setTimeoutFn(() => reject(new Error("sendMessage acknowledgement timeout")), profile.deliveryTimeoutMs);
            sender.socket.emit("sendMessage", {
              sender: actorRefs.alice.id,
              receiverId: actorRefs.bob.id,
              text: messageText(profile.messageSizeBytes),
              isGroup: false,
              idempotencyKey: id,
            }, (ack) => {
              clearTimeoutFn(timer);
              if (!ack?.success) reject(new Error("sendMessage acknowledgement failed"));
              else resolve({ ...ack, timestamp: clock() });
            });
          });
          const [ack, delivered] = await Promise.all([acknowledgement, delivery]);
          if (delivered.value?.idempotencyKey !== id) throw new Error("getMessage correlation mismatch");
          return { correlationId: id, acknowledgement: ack, delivery: { timestamp: delivered.timestamp, messageId: delivered.value?._id } };
        },
      });
      const successful = result.opportunities.filter(({ status, error }) => status === "started" && !error);
      return decorateFixedRateEvidence({ ...result, connections: disconnectAll(connections, clock) }, profile, phase, {
        correlationIds: successful.map(({ correlationId: id }) => id),
        measuredActors: { sender: actorRefs.alice.id, recipient: actorRefs.bob.id },
        deliveries: successful.map(({ correlationId: id, evidence }) => ({ correlationId: id, success: true, ...evidence.delivery })),
      });
    } catch (error) {
      disconnectAll(connections, clock);
      throw error;
    }
  }

  async function executeSocketConcurrency({ target, profile, actorRefs, actorSecrets }) {
    if (typeof createSocket !== "function") throw new Error("socket concurrency adapter is required");
    const allocation = Object.entries(profile.actorAllocation).flatMap(([name, count]) => Array.from({ length: count }, () => name));
    const rampStartedAt = clock();
    let connections = [];
    try {
      await Promise.all(allocation.map((name) => connectActor({
        createSocket, target, actor: actorRefs[name], token: actorSecrets[name].token,
        timeoutMs: profile.ramp.timeoutMs, clock,
      }).then((connection) => { connections.push(connection); })));
      const targetReachedAt = clock();
      await sleep(profile.settling.durationMs);
      if (connections.some(({ socket }) => !socket.connected)) throw new Error("socket disconnected during settling");
      const measurementStart = clock();
      await sleep(profile.plateau.durationMs);
      if (connections.some(({ socket }) => !socket.connected)) throw new Error("socket disconnected during plateau");
      const measurementEnd = clock();
      return {
        rampStartedAt, targetReachedAt, measurementStart, measurementEnd,
        targetConcurrency: allocation.length,
        measuredActors: allocation.map((name) => actorRefs[name].id),
        runnerShortfallSamples: [],
        connections: disconnectAll(connections, clock),
      };
    } catch (error) {
      disconnectAll(connections, clock);
      throw error;
    }
  }

  async function execute({ phase, target = DEFAULT_TARGET, profile, actorRefs, actorSecrets }) {
    if (target !== DEFAULT_TARGET) throw new Error("workload target must be nginx");
    if (profile.scenario === "sidebar") return executeSidebar({ phase, target, profile, actorRefs, actorSecrets });
    if (profile.scenario === "message") return executeMessage({ phase, target, profile, actorRefs, actorSecrets });
    if (profile.scenario === "socket-concurrency") return executeSocketConcurrency({ phase, target, profile, actorRefs, actorSecrets });
    throw new Error(`unsupported workload scenario: ${profile.scenario}`);
  }

  return { execute };
}

function decorateFixedRateEvidence(result, profile, phase, additional) {
  const started = result.opportunities.filter(({ status }) => status === "started");
  const requested = profile.loadModel.ratePerSecond * profile[phase === "warm-up" ? "warmup" : "measurement"].durationSeconds;
  const runnerShortfallSamples = started.length < requested ? [{
    model: "open-loop",
    start: new Date(result.phaseStart).toISOString(),
    end: new Date(result.phaseEnd).toISOString(),
    requested,
    achieved: started.length,
  }] : [];
  return { ...result, ...additional, runnerShortfallSamples };
}

function decodeBase64Json(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

async function main(environment = process.env) {
  const { io } = require("socket.io-client");
  const profile = decodeBase64Json(environment.K4_PROFILE_B64, "K4_PROFILE_B64");
  const actorRefs = decodeBase64Json(environment.K4_ACTOR_REFS_B64, "K4_ACTOR_REFS_B64");
  const actorSecrets = JSON.parse(environment.K4_ACTOR_SECRETS_JSON || "{}");
  delete environment.K4_ACTOR_SECRETS_JSON;
  const executor = createWorkloadExecutor({ createSocket: io });
  const result = await executor.execute({ phase: environment.K4_PHASE, target: environment.K4_WORKLOAD_URL || DEFAULT_TARGET, profile, actorRefs, actorSecrets });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { connectActor, createWorkloadExecutor, openLoopSlots, waitForSocket };
