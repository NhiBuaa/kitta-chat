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

class FakeSocket {
  constructor(id, clock, mode = "message") {
    this.id = id;
    this.clock = clock;
    this.mode = mode;
    this.connected = false;
    this.listeners = new Map();
  }
  once(event, listener) { this.listeners.set(event, listener); }
  off(event) { this.listeners.delete(event); }
  connect() { this.connected = true; queueMicrotask(() => this.listeners.get("connect")?.()); }
  disconnect() { this.connected = false; }
  emit(event, payload, callback) {
    if (event === "sendMessage") {
      queueMicrotask(() => callback({ success: true, realId: "message-1" }));
      for (const socket of FakeSocket.all) {
        if (socket !== this) queueMicrotask(() => socket.listeners.get("getMessage")?.({ _id: "message-1", idempotencyKey: payload.idempotencyKey }));
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
  assert.equal(result.connections.length, 2);
  assert.equal(FakeSocket.all.every((socket) => socket.connected === false), true);
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
  await assert.rejects(executor.execute({
    phase: "measurement", target: "http://nginx",
    profile: { scenario: "socket-concurrency", actorAllocation: { alice: 2, bob: 2 }, ramp: { timeoutMs: 10000 }, settling: { durationMs: 1000 }, plateau: { durationMs: 2000 } },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  }), /auth failed/);
  assert.equal(FakeSocket.all.every((socket) => socket.connected === false), true);
});
