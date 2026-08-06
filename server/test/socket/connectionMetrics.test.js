const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createSocketConnectionTracker,
  UNMATCHED_DISCONNECT_EVENT,
} = require("../../src/socket/connectionMetrics");
const {
  createInMemoryMetricsAdapter,
  createMetricsModule,
  createPromClientMetricsAdapter,
} = require("../../src/observability/metrics");

const createFakeSocket = () => {
  const listeners = new Map();
  let disconnectRegistrations = 0;
  let onceRegistrations = 0;

  return {
    emit(event, reason) {
      const registration = listeners.get(event);
      if (!registration) return;
      if (registration.once) listeners.delete(event);
      registration.listener(reason);
    },
    listenerCount(event) {
      return listeners.has(event) ? 1 : 0;
    },
    on(event, listener) {
      disconnectRegistrations += 1;
      listeners.set(event, { listener, once: false });
    },
    once(event, listener) {
      disconnectRegistrations += 1;
      onceRegistrations += 1;
      listeners.set(event, { listener, once: true });
    },
    get disconnectRegistrations() {
      return disconnectRegistrations;
    },
    get onceRegistrations() {
      return onceRegistrations;
    },
  };
};

const createMetrics = (logger) => {
  const adapter = createInMemoryMetricsAdapter();
  const metrics = createMetricsModule({ adapter, logger });
  return { adapter, metrics };
};

const activeCount = (adapter) => {
  const observations = adapter.snapshot().kittachat_socket_active_connections || [];
  return observations.reduce((total, observation) => total + observation.value, 0);
};

test("connection tracker cleans up once and warns on duplicate or unmatched disconnect", () => {
  const warnings = [];
  const logger = {
    warn(event, fields) {
      warnings.push({ event, fields });
    },
  };
  const { adapter, metrics } = createMetrics(logger);
  const tracker = createSocketConnectionTracker({ metrics, logger });
  const socket = createFakeSocket();

  tracker.track(socket);

  assert.equal(socket.disconnectRegistrations, 1);
  assert.equal(socket.onceRegistrations, 1);
  assert.equal(activeCount(adapter), 1);

  socket.emit("disconnect", "client namespace disconnect");
  assert.equal(activeCount(adapter), 0);
  assert.equal(socket.listenerCount("disconnect"), 0);

  socket.emit("disconnect", "duplicate event");
  assert.equal(warnings.length, 0);

  assert.equal(tracker.disconnect(socket, "duplicate cleanup"), false);
  assert.equal(tracker.disconnect({}, "unmatched cleanup"), false);
  assert.equal(activeCount(adapter), 0);
  assert.deepEqual(
    warnings.map(({ event, fields }) => ({ event, reason: fields.reason })),
    [
      { event: UNMATCHED_DISCONNECT_EVENT, reason: "duplicate cleanup" },
      { event: UNMATCHED_DISCONNECT_EVENT, reason: "unmatched cleanup" },
    ],
  );
});

test("connection tracker contains metrics and logger failures", () => {
  const metrics = {
    observeSocketConnection() {
      throw new Error("metrics unavailable");
    },
  };
  const logger = {
    warn() {
      throw new Error("logger unavailable");
    },
  };
  const tracker = createSocketConnectionTracker({ metrics, logger });
  const socket = createFakeSocket();

  assert.doesNotThrow(() => tracker.track(socket));
  assert.doesNotThrow(() => socket.emit("disconnect", "client namespace disconnect"));
  assert.doesNotThrow(() => tracker.disconnect(socket, "duplicate cleanup"));
});

test("connection Gauge exposition contains one unlabeled active-socket sample", async () => {
  const adapter = createPromClientMetricsAdapter();
  const metrics = createMetricsModule({ adapter });
  const tracker = createSocketConnectionTracker({ metrics });

  tracker.track(createFakeSocket());

  const rendered = await metrics.renderPrometheus();
  const samples = rendered.body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("kittachat_socket_active_connections "));

  assert.equal(samples.length, 1);
  assert.match(samples[0], /kittachat_socket_active_connections 1(?:\s|$)/);
  assert.equal(samples[0].includes("{"), false);
});
