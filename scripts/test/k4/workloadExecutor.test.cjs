const assert = require("node:assert/strict");
const test = require("node:test");

const { createWorkloadExecutor, openLoopSlots } = require("../../k4/runner/workload");

test("open-loop slots stay anchored and retain late opportunities as not started", async () => {
  let now = 1000;
  const sleeps = [];
  const opportunities = [];
  const result = await openLoopSlots({
    ratePerSecond: 2,
    durationSeconds: 2,
    clock: () => now,
    sleep: async (delay) => { sleeps.push(delay); now += delay; },
    startOpportunity: async ({ opportunityId, scheduledAt }) => {
      opportunities.push([opportunityId, scheduledAt]);
      if (opportunityId === 0) now = 2000;
      return { ok: true };
    },
    correlationId: (index) => `corr-${index}`,
  });
  assert.deepEqual(result.opportunities.map(({ scheduledAt, status }) => [scheduledAt, status]), [
    [1000, "started"], [1500, "not-started"], [2000, "started"], [2500, "started"],
  ]);
  assert.deepEqual(opportunities.map((item) => item[0]), [0, 2, 3]);
  assert.equal(sleeps.every((delay) => delay <= 500), true);
});

test("open-loop scheduling does not wait for an earlier in-flight opportunity", async () => {
  let now = 0;
  let releaseFirst;
  const started = [];
  const resultPromise = openLoopSlots({
    ratePerSecond: 2,
    durationSeconds: 1,
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    correlationId: (index) => `parallel-${index}`,
    startOpportunity: ({ opportunityId }) => {
      started.push([opportunityId, now]);
      if (opportunityId === 0) return new Promise((resolve) => { releaseFirst = resolve; });
      releaseFirst({ ok: true });
      return Promise.resolve({ ok: true });
    },
  });
  const result = await resultPromise;
  assert.deepEqual(started, [[0, 0], [1, 500]]);
  assert.deepEqual(result.opportunities.map(({ status }) => status), ["started", "started"]);
});

test("sidebar phase sends the locked request through nginx with per-opportunity correlation", async () => {
  const requests = [];
  let now = 0;
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async (url, options) => { requests.push([url, options]); return { ok: true, status: 200 }; },
    createSocket: () => assert.fail("sidebar does not open sockets"),
    correlationId: (index) => `sidebar-${index}`,
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "sidebar", loadModel: { type: "open-loop", ratePerSecond: 2 }, measurement: { durationSeconds: 1 }, pagination: { mode: "page", pageSize: 20 } },
    actorRefs: { alice: { id: "alice-id" } }, actorSecrets: { alice: { token: "secret" } },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0][0], "http://nginx/api/sidebar/conversations?page=1&limit=20");
  assert.equal(requests[0][1].headers["x-request-id"], "sidebar-0");
  assert.equal(result.opportunities.length, 2);
});

test("sidebar phase retains HTTP errors as raw outcomes and binds every started request", async () => {
  let now = 0;
  const requests = [];
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async (url, options) => {
      requests.push([url, options]);
      return { ok: false, status: 503 };
    },
    correlationId: (index) => `sidebar-error-${index}`,
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "sidebar", loadModel: { type: "open-loop", ratePerSecond: 1 }, measurement: { durationSeconds: 1 }, pagination: { mode: "page", pageSize: 20 } },
    actorSecrets: { alice: { token: "secret" } },
  });

  assert.equal(requests.length, 1);
  assert.equal(result.phase, "measurement");
  assert.equal(result.opportunities[0].status, "started");
  assert.equal(result.opportunities[0].outcome, "error");
  assert.equal(result.opportunities[0].responseStatus, 503);
  assert.deepEqual(result.measuredRequestIds, ["sidebar-error-0"]);
});

class FakeSocket {
  constructor(id, clock, mode = "message") {
    this.id = id;
    this.clock = clock;
    this.mode = mode;
    this.connected = false;
    this.listeners = new Map();
  }
  on(event, listener) { this.listeners.set(event, listener); }
  once(event, listener) { this.listeners.set(event, listener); }
  off(event) { this.listeners.delete(event); }
  connect() { this.connected = true; queueMicrotask(() => this.listeners.get("connect")?.()); }
  disconnect() { this.connected = false; }
  emit(event, payload, callback) {
    if (event === "sendMessage") {
      queueMicrotask(() => callback({ success: true, realId: "message-1" }));
      for (const socket of FakeSocket.all) {
        if (socket !== this) queueMicrotask(() => socket.listeners.get("getMessage")?.({
          _id: "message-1",
          idempotencyKey: payload.idempotencyKey,
          sender: { _id: payload.sender },
          receiver: payload.receiverId,
          conversationId: [payload.sender, payload.receiverId].sort().join("_"),
        }));
      }
    }
  }
}
FakeSocket.all = [];

test("message phase keeps persistent actor sockets and correlates send, ack, and delivery", async () => {
  let now = 0;
  FakeSocket.all = [];
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async () => assert.fail("message uses Socket.IO"),
    createSocket: () => { const socket = new FakeSocket(`socket-${FakeSocket.all.length}`, () => now); FakeSocket.all.push(socket); return socket; },
    correlationId: (index) => `message-${index}`,
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "message", loadModel: { type: "open-loop", ratePerSecond: 1 }, measurement: { durationSeconds: 2 }, messageSizeBytes: 128, deliveryTimeoutMs: 5000 },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  assert.equal(FakeSocket.all.length, 2);
  assert.deepEqual(result.opportunities.map((item) => item.evidence.correlationId), ["message-0", "message-1"]);
  assert.equal(result.faultFixture, undefined);
  assert.equal(result.connections.length, 2);
  assert.equal(FakeSocket.all.every((socket) => socket.connected === false), true);
});

class BoundarySocket extends FakeSocket {
  emit(event, payload, callback) {
    if (event !== "sendMessage") return;
    const conversationId = [payload.sender, payload.receiverId].sort().join("_");
    queueMicrotask(() => callback({ success: true, realId: "message-boundary" }));
    for (const socket of BoundarySocket.all) {
      if (socket !== this) queueMicrotask(() => socket.listeners.get("getMessage")?.({
        _id: "message-boundary",
        idempotencyKey: payload.idempotencyKey,
        sender: { _id: payload.sender },
        receiver: payload.receiverId,
        conversationId,
      }));
    }
  }
}
BoundarySocket.all = [];

test("message delivery evidence starts immediately before emit and ends at matched recipient receipt", async () => {
  let now = 1000;
  BoundarySocket.all = [];
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async () => assert.fail("message uses Socket.IO"),
    createSocket: () => {
      const socket = new BoundarySocket(`boundary-${BoundarySocket.all.length}`, () => now);
      BoundarySocket.all.push(socket);
      return socket;
    },
    correlationId: () => "boundary-correlation",
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "message", loadModel: { type: "open-loop", ratePerSecond: 1 }, measurement: { durationSeconds: 1 }, messageSizeBytes: 128, deliveryTimeoutMs: 5000 },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  const delivery = result.opportunities[0].evidence.delivery;
  assert.equal(delivery.sendMessageEmitAt, 1000);
  assert.equal(delivery.receivedAt, 1000);
  assert.equal(delivery.durationMs, 0);
  assert.equal(result.opportunities[0].evidence.acknowledgement.success, true);
  assert.equal(result.opportunities[0].evidence.acknowledgement.realId, "message-boundary");
});

test("message delivery rejects acknowledgement realId or recipient identity mismatches as failure evidence", async () => {
  class MismatchSocket extends BoundarySocket {
    emit(event, payload, callback) {
      if (event !== "sendMessage") return;
      queueMicrotask(() => callback({ success: true, realId: "wrong-message" }));
      for (const socket of MismatchSocket.all) {
        if (socket !== this) queueMicrotask(() => socket.listeners.get("getMessage")?.({
          _id: "message-boundary",
          idempotencyKey: payload.idempotencyKey,
          sender: { _id: payload.sender },
          receiver: payload.receiverId,
          conversationId: [payload.sender, payload.receiverId].sort().join("_"),
        }));
      }
    }
  }
  MismatchSocket.all = [];
  let now = 0;
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async () => assert.fail("message uses Socket.IO"),
    createSocket: () => {
      const socket = new MismatchSocket(`mismatch-${MismatchSocket.all.length}`, () => now);
      MismatchSocket.all.push(socket);
      return socket;
    },
    correlationId: () => "mismatch-correlation",
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "message", loadModel: { type: "open-loop", ratePerSecond: 1 }, measurement: { durationSeconds: 1 }, messageSizeBytes: 128, deliveryTimeoutMs: 5000 },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  assert.equal(result.opportunities[0].status, "failed");
  assert.match(result.opportunities[0].error, /realId|recipient|correlation|timeout/i);
  assert.deepEqual(result.correlationIds, []);
  assert.equal(result.deliveries.length, 0);
});

class ConcurrentSocket {
  constructor(id) {
    this.id = id;
    this.connected = false;
    this.listeners = new Map();
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  off(event, listener) {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    listeners.delete(listener);
    if (!listeners.size) this.listeners.delete(event);
  }

  emitEvent(event, value) {
    for (const listener of [...(this.listeners.get(event) || [])]) listener(value);
  }

  connect() {
    this.connected = true;
    queueMicrotask(() => this.emitEvent("connect"));
  }

  disconnect() {
    this.connected = false;
  }

  emit(event, payload, callback) {
    if (event !== "sendMessage") return;
    const messageId = `message-${payload.idempotencyKey}`;
    queueMicrotask(() => callback({ success: true, realId: messageId }));
    setTimeout(() => {
      for (const socket of ConcurrentSocket.all) {
        if (socket === this) continue;
        socket.emitEvent("getMessage", {
          _id: messageId,
          idempotencyKey: payload.idempotencyKey,
          sender: { _id: payload.sender },
          receiver: payload.receiverId,
          conversationId: payload.conversationId,
        });
      }
    }, 80);
  }
}
ConcurrentSocket.all = [];

test("message phase matches overlapping recipient deliveries by idempotency key", async () => {
  ConcurrentSocket.all = [];
  const executor = createWorkloadExecutor({
    fetch: async () => assert.fail("message uses Socket.IO"),
    createSocket: () => {
      const socket = new ConcurrentSocket(`concurrent-${ConcurrentSocket.all.length}`);
      ConcurrentSocket.all.push(socket);
      return socket;
    },
    correlationId: (index) => `concurrent-correlation-${index}`,
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "message", loadModel: { type: "open-loop", ratePerSecond: 20 }, measurement: { durationSeconds: 0.5 }, messageSizeBytes: 128, deliveryTimeoutMs: 200 },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  assert.equal(result.opportunities.length, 10);
  assert.equal(result.opportunities.filter(({ status }) => status === "failed").length, 0);
  assert.deepEqual(result.correlationIds, Array.from({ length: 10 }, (_, index) => `concurrent-correlation-${index}`));
});

class OutOfOrderSocket extends ConcurrentSocket {
  constructor(id, actor) {
    super(id);
    this.actor = actor;
  }

  connect() {
    this.connected = true;
    setTimeout(() => this.emitEvent("connect"), this.actor === "alice" ? 20 : 0);
  }

  emit(event, payload, callback) {
    if (event === "sendMessage") OutOfOrderSocket.senders.push(this.actor);
    return super.emit(event, payload, callback);
  }
}
OutOfOrderSocket.senders = [];

test("message phase preserves sender and recipient roles when connections resolve out of order", async () => {
  ConcurrentSocket.all = [];
  OutOfOrderSocket.senders = [];
  const executor = createWorkloadExecutor({
    fetch: async () => assert.fail("message uses Socket.IO"),
    createSocket: (target, options) => {
      const actor = options.auth.token === "alice-token" ? "alice" : "bob";
      const socket = new OutOfOrderSocket(`ordered-${ConcurrentSocket.all.length}`, actor);
      ConcurrentSocket.all.push(socket);
      return socket;
    },
    correlationId: () => "ordered-correlation",
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "message", loadModel: { type: "open-loop", ratePerSecond: 1 }, measurement: { durationSeconds: 1 }, messageSizeBytes: 128, deliveryTimeoutMs: 200 },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  assert.deepEqual(OutOfOrderSocket.senders, ["alice"]);
  assert.deepEqual(result.correlationIds, ["ordered-correlation"]);
});

class FixtureSocket extends FakeSocket {
  emit(event, payload, callback) {
    if (event !== "sendMessage") return;
    const fixture = FixtureSocket.fixture;
    if (fixture !== "acknowledgement-timeout") {
      const acknowledgement = fixture === "acknowledgement-failure"
        ? { success: false, realId: "fixture-message" }
        : { success: true, realId: "fixture-message" };
      queueMicrotask(() => callback(acknowledgement));
    }
    if (fixture === "recipient-delivery-timeout") return;
    for (const socket of FixtureSocket.all) {
      if (socket === this) continue;
      queueMicrotask(() => socket.listeners.get("getMessage")?.({
        _id: fixture === "correlation-mismatch" ? "different-message" : "fixture-message",
        idempotencyKey: payload.idempotencyKey,
        sender: { _id: payload.sender },
        receiver: payload.receiverId,
        conversationId: [payload.sender, payload.receiverId].sort().join("_"),
      }));
    }
  }
}
FixtureSocket.all = [];
FixtureSocket.fixture = null;

async function executeFixture(fixture, phase = "measurement") {
  let now = 0;
  FixtureSocket.all = [];
  FixtureSocket.fixture = phase === "measurement" ? fixture : null;
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async () => assert.fail("message uses Socket.IO"),
    createSocket: () => {
      const socket = new FixtureSocket(`fixture-${FixtureSocket.all.length}`, () => now);
      FixtureSocket.all.push(socket);
      return socket;
    },
    correlationId: () => "fixture-correlation",
  });
  return executor.execute({
    phase, target: "http://nginx",
    faultFixture: fixture,
    profile: {
      scenario: "message",
      loadModel: { type: "open-loop", ratePerSecond: 1 },
      warmup: { durationSeconds: 1 },
      measurement: { durationSeconds: 1 },
      messageSizeBytes: 128,
      deliveryTimeoutMs: 5,
    },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
}

for (const [fixture, errorPattern] of [
  ["acknowledgement-failure", /acknowledgement failed/i],
  ["acknowledgement-timeout", /acknowledgement timeout/i],
  ["recipient-delivery-timeout", /getMessage timeout/i],
  ["correlation-mismatch", /correlation mismatch/i],
]) {
  test(`message fault fixture ${fixture} retains failure without latency samples`, async () => {
    const result = await executeFixture(fixture);
    assert.equal(result.faultFixture, fixture);
    assert.equal(result.opportunities[0].status, "failed");
    assert.match(result.opportunities[0].error, errorPattern);
    assert.deepEqual(result.correlationIds, []);
    assert.deepEqual(result.deliveries, []);
    assert.deepEqual(result.attemptedCorrelationIds, ["fixture-correlation"]);
    assert.equal(result.attributionComplete, false);
    assert.equal(result.failures.length, 1);
  });
}

test("message fault fixture is ignored during warm-up so warm-up remains normal", async () => {
  const result = await executeFixture("acknowledgement-failure", "warm-up");
  assert.equal(result.faultFixture, undefined);
  assert.equal(result.opportunities[0].status, "started");
  assert.equal(result.opportunities[0].evidence.acknowledgement.success, true);
  assert.deepEqual(result.correlationIds, ["fixture-correlation"]);
});

test("socket concurrency locks ramp, settling, and plateau around four authenticated sockets", async () => {
  let now = 100;
  FakeSocket.all = [];
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async () => assert.fail("socket scenario uses Socket.IO"),
    createSocket: () => { const socket = new FakeSocket(`socket-${FakeSocket.all.length}`, () => now); FakeSocket.all.push(socket); return socket; },
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "socket-concurrency", actorAllocation: { alice: 2, bob: 2 }, ramp: { timeoutMs: 10000 }, settling: { durationMs: 1000 }, plateau: { durationMs: 2000 } },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  assert.equal(result.targetConcurrency, 4);
  assert.equal(result.measurementStart, 1100);
  assert.equal(result.measurementEnd, 3100);
  assert.equal(result.connections.length, 4);
});

test("socket ramp failure tears down connections that authenticated before the failure", async () => {
  let now = 0;
  FakeSocket.all = [];
  let created = 0;
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => { now += delay; },
    fetch: async () => assert.fail("socket scenario uses Socket.IO"),
    createSocket: () => {
      const socket = new FakeSocket(`socket-${created}`, () => now);
      if (created === 3) socket.connect = function fail() { queueMicrotask(() => this.listeners.get("connect_error")?.(new Error("auth failed"))); };
      created += 1;
      FakeSocket.all.push(socket);
      return socket;
    },
  });
  const result = await executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "socket-concurrency", actorAllocation: { alice: 2, bob: 2 }, ramp: { timeoutMs: 10000 }, settling: { durationMs: 1000 }, plateau: { durationMs: 2000 } },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });
  assert.equal(result.measurementAdmitted, false);
  assert.deepEqual(result.qualificationFlags, ["TARGET_NOT_REACHED"]);
  assert.equal(result.handshakeAccounting.handshakeFailures, 1);
  assert.equal(FakeSocket.all.every((socket) => socket.connected === false), true);
});
