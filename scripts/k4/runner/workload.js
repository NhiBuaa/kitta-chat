const crypto = require("node:crypto");
const { executeSocketConcurrency: executeSocketConcurrencyScenario } = require("./socketConcurrency");
const { FAULT_FIXTURES, normalizeFaultFixture } = require("./faultFixtures");

const DEFAULT_TARGET = "http://nginx";

function sleepMs(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function boundedError(error) {
  return String(error?.message || error || "operation failed").slice(0, 256);
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
      opportunities.push({ opportunityId: index, correlationId: id, scheduledAt, slotClosesAt, status: "not-started", outcome: "not-started", reason: "slot-deadline-missed" });
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
      .then((evidence) => {
        record.evidence = evidence;
        record.completedAt = clock();
        record.outcome = evidence?.ok === false || evidence?.outcome === "error" ? "error" : "success";
        if (record.outcome === "error") {
          record.error = boundedError(evidence?.error);
          if (Number.isInteger(evidence?.status)) record.responseStatus = evidence.status;
        }
      })
      .catch((error) => {
        record.status = "failed";
        record.error = boundedError(error);
        record.outcome = "error";
        record.completedAt = clock();
      }));
  }
  await Promise.all(inFlight);
  opportunities.sort((left, right) => left.opportunityId - right.opportunityId);
  return { phaseStart, phaseEnd: phaseStart + durationSeconds * 1000, opportunities };
}

function waitForSocket(socket, event, timeoutMs, clock = Date.now, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, predicate) {
  return new Promise((resolve, reject) => {
    const hasPredicate = typeof predicate === "function";
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
    const onEvent = (value) => {
      if (hasPredicate && !predicate(value)) return;
      cleanup();
      resolve({ value, timestamp: clock(), startedAt });
    };
    const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))); };
    if (hasPredicate) {
      if (typeof socket.on !== "function") throw new Error(`${event} filtered listener adapter is required`);
      socket.on(event, onEvent);
    } else socket.once(event, onEvent);
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

function waitForTimeout(event, timeoutMs, setTimeoutFn = setTimeout) {
  return new Promise((resolve, reject) => {
    setTimeoutFn(() => reject(new Error(`${event} timeout`)), timeoutMs);
  });
}

function legacyConversationId(senderId, recipientId) {
  return [String(senderId), String(recipientId)].sort().join("_");
}

function comparableId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value._id !== undefined) return comparableId(value._id);
  return String(value);
}

function deliveredEnvelopeMatches(delivered, { id, senderId, recipientId, conversationId }) {
  return comparableId(delivered?.idempotencyKey) === comparableId(id)
    && comparableId(delivered?.sender?._id || delivered?.sender) === comparableId(senderId)
    && comparableId(delivered?.receiverId || delivered?.receiver) === comparableId(recipientId)
    && comparableId(delivered?.conversationId) === comparableId(conversationId);
}

function deliveredMessageMatches(delivered, { id, senderId, recipientId, conversationId, realId }) {
  return deliveredEnvelopeMatches(delivered, { id, senderId, recipientId, conversationId })
    && comparableId(delivered?._id) === comparableId(realId);
}

function createWorkloadExecutor({ fetch = globalThis.fetch, createSocket, clock = Date.now, sleep = sleepMs, correlationId = randomCorrelationId, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  if (typeof fetch !== "function") throw new Error("workload fetch adapter is required");

  async function executeSidebar({ phase, target, profile, actorSecrets }) {
    const durationSeconds = profile[phase === "warm-up" ? "warmup" : "measurement"].durationSeconds;
    const request = {
      method: profile.request?.method || "GET",
      path: profile.request?.path || "/api/sidebar/conversations",
    };
    const result = await openLoopSlots({
      ratePerSecond: profile.loadModel.ratePerSecond, durationSeconds, clock, sleep, correlationId,
      startOpportunity: async ({ correlationId: requestId }) => {
        const response = await fetch(`${target}${request.path}?page=1&limit=${profile.pagination.pageSize}`, {
          method: request.method,
          headers: { authorization: `Bearer ${actorSecrets.alice.token}`, "x-request-id": requestId },
        });
        if (!response.ok) {
          return {
            requestId,
            status: response.status,
            ok: false,
            outcome: "error",
            error: `sidebar request failed with ${response.status}`,
          };
        }
        return { requestId, status: response.status, ok: true };
      },
    });
    return decorateFixedRateEvidence(result, profile, phase, {
      scenario: profile.scenario,
      version: profile.version,
      phase,
      request,
      pagination: profile.pagination,
      measuredRequestIds: result.opportunities
        .filter(({ status, completedAt }) => status === "started" && Number.isFinite(completedAt) && completedAt >= result.phaseStart && completedAt < result.phaseEnd)
        .map(({ correlationId: id }) => id),
      measuredActors: ["alice"],
    });
  }

  async function executeMessage({ phase, target, profile, actorRefs, actorSecrets, faultFixture }) {
    if (typeof createSocket !== "function") throw new Error("message workload socket adapter is required");
    const activeFaultFixture = phase === "measurement" ? faultFixture : null;
    const durationSeconds = profile[phase === "warm-up" ? "warmup" : "measurement"].durationSeconds;
    const connections = await Promise.all(["alice", "bob"].map((name) => connectActor({
      createSocket, target, actor: actorRefs[name], token: actorSecrets[name].token,
      timeoutMs: profile.deliveryTimeoutMs, clock,
    })));
    const [sender, recipient] = connections;
    try {
      const result = await openLoopSlots({
        ratePerSecond: profile.loadModel.ratePerSecond, durationSeconds, clock, sleep, correlationId,
        startOpportunity: async ({ correlationId: id }) => {
          const delivery = activeFaultFixture === FAULT_FIXTURES.RECIPIENT_DELIVERY_TIMEOUT
            ? waitForTimeout("getMessage", profile.deliveryTimeoutMs, setTimeoutFn)
            : waitForSocket(recipient.socket, "getMessage", profile.deliveryTimeoutMs, clock, setTimeoutFn, clearTimeoutFn,
              (value) => deliveredEnvelopeMatches(value, {
                id,
                senderId: actorRefs.alice.id,
                recipientId: actorRefs.bob.id,
                conversationId: legacyConversationId(actorRefs.alice.id, actorRefs.bob.id),
              }));
          const conversationId = legacyConversationId(actorRefs.alice.id, actorRefs.bob.id);
          const acknowledgement = new Promise((resolve, reject) => {
            const timer = setTimeoutFn(() => reject(new Error("sendMessage acknowledgement timeout")), profile.deliveryTimeoutMs);
            const sendMessageEmitAt = clock();
            const payload = {
              sender: actorRefs.alice.id,
              receiverId: actorRefs.bob.id,
              text: messageText(profile.messageSizeBytes),
              isGroup: false,
              idempotencyKey: id,
              conversationId,
            };
            const onAcknowledgement = (ack) => {
              clearTimeoutFn(timer);
              if (ack?.success !== true || !ack?.realId) reject(new Error("sendMessage acknowledgement failed"));
              else {
                const acknowledgedAt = clock();
                resolve({ success: true, realId: ack.realId, acknowledgedAt, timestamp: acknowledgedAt, sendMessageEmitAt });
              }
            };
            const callback = activeFaultFixture === FAULT_FIXTURES.ACKNOWLEDGEMENT_TIMEOUT
              ? () => {}
              : activeFaultFixture === FAULT_FIXTURES.ACKNOWLEDGEMENT_FAILURE
                ? () => onAcknowledgement({ success: false })
                : onAcknowledgement;
            sender.socket.emit("sendMessage", payload, callback);
          });
          const [ack, delivered] = await Promise.all([acknowledgement, delivery]);
          if (!deliveredMessageMatches(delivered.value, {
            id,
            senderId: actorRefs.alice.id,
            recipientId: actorRefs.bob.id,
            conversationId,
            realId: activeFaultFixture === FAULT_FIXTURES.CORRELATION_MISMATCH ? `${ack.realId}-fixture-mismatch` : ack.realId,
          })) throw new Error("getMessage correlation mismatch");
          return {
            correlationId: id,
            acknowledgement: ack,
            delivery: {
              sendMessageEmitAt: ack.sendMessageEmitAt,
              receivedAt: delivered.timestamp,
              durationMs: delivered.timestamp - ack.sendMessageEmitAt,
              messageId: delivered.value?._id,
              senderId: actorRefs.alice.id,
              recipientId: actorRefs.bob.id,
              conversationId,
            },
          };
        },
      });
      const successful = result.opportunities.filter(({ status, error }) => status === "started" && !error);
      const attempted = result.opportunities.filter(({ status }) => status === "started" || status === "failed");
      return decorateFixedRateEvidence({ ...result, connections: disconnectAll(connections, clock) }, profile, phase, {
        ...(activeFaultFixture ? { faultFixture: activeFaultFixture } : {}),
        correlationIds: successful.map(({ correlationId: id }) => id),
        attemptedCorrelationIds: attempted.map(({ correlationId: id }) => id),
        attributionComplete: attempted.length > 0 && attempted.length === successful.length && attempted.length === result.opportunities.filter(({ status }) => status !== "not-started").length,
        measuredActors: { sender: actorRefs.alice.id, recipient: actorRefs.bob.id },
        deliveries: successful.map(({ correlationId: id, evidence }) => ({ correlationId: id, success: true, ...evidence.delivery })),
        failures: result.opportunities.filter(({ status }) => status === "failed").map(({ correlationId: id, error }) => ({ correlationId: id, success: false, error })),
      });
    } catch (error) {
      disconnectAll(connections, clock);
      throw error;
    }
  }

  async function execute({ phase, target = DEFAULT_TARGET, profile, actorRefs, actorSecrets, faultFixture }) {
    if (target !== DEFAULT_TARGET) throw new Error("workload target must be nginx");
    const normalizedFaultFixture = normalizeFaultFixture(faultFixture);
    if (normalizedFaultFixture && profile.scenario !== "message") throw new Error("K4 fault fixtures require the message scenario");
    if (profile.scenario === "sidebar") return executeSidebar({ phase, target, profile, actorRefs, actorSecrets });
    if (profile.scenario === "message") return executeMessage({ phase, target, profile, actorRefs, actorSecrets, faultFixture: normalizedFaultFixture });
    if (profile.scenario === "socket-concurrency") {
      if (typeof createSocket !== "function") throw new Error("socket concurrency adapter is required");
      return executeSocketConcurrencyScenario({
        phase, target, profile, actorRefs, actorSecrets, createSocket, clock, sleep,
        correlationId, setTimeoutFn, clearTimeoutFn,
      });
    }
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
  return {
    ...result,
    ...additional,
    phase,
    opportunities: result.opportunities.map((opportunity) => ({ ...opportunity, phase })),
    measurementWindow: {
      start: new Date(result.phaseStart).toISOString(),
      end: new Date(result.phaseEnd).toISOString(),
      boundary: "[phase_start, phase_end)",
    },
    runnerShortfallSamples,
  };
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
  const result = await executor.execute({ phase: environment.K4_PHASE, target: environment.K4_WORKLOAD_URL || DEFAULT_TARGET, profile, actorRefs, actorSecrets, faultFixture: environment.K4_FAULT_FIXTURE });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { connectActor, createWorkloadExecutor, openLoopSlots, waitForSocket };
