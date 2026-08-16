const assert = require("node:assert/strict");
const test = require("node:test");

const { createWorkloadExecutor } = require("../../k4/runner/workload");
const { claimEvidenceFromMeasurement } = require("../../k4/productionMeasurementObservation");
const { executeRun } = require("../../k4/runner");
const { parsePrometheusActiveSocketGauge } = require("../../k4/productionObservationSources");

class SocketProbe {
  constructor(id, index) {
    this.id = id;
    this.index = index;
    this.connected = false;
    this.listeners = new Map();
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event, listener) {
    if (!listener) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event, ...args) {
    if (event === "addNewUser") return;
    for (const listener of [...(this.listeners.get(event) || [])]) listener(...args);
  }

  connect() {
    if (this.index === 1) queueMicrotask(() => this.emit("connect_error", new Error("handshake rejected")));
    else if (this.index !== 2) {
      this.connected = true;
      queueMicrotask(() => this.emit("connect"));
    }
  }

  disconnect() {
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) this.emit("disconnect", "client namespace disconnect");
  }
}

function profile() {
  return {
    scenario: "socket-concurrency",
    actorAllocation: { alice: 2, bob: 2 },
    ramp: { timeoutMs: 10_000 },
    settling: { durationMs: 1_000 },
    plateau: { durationMs: 2_000 },
  };
}

function setupExecutor({ onSleep, induceHandshakeProblems = false } = {}) {
  let now = 100;
  const sockets = [];
  const executor = createWorkloadExecutor({
    clock: () => now,
    sleep: async (delay) => {
      onSleep?.(delay, sockets, () => now);
      now += delay;
    },
    setTimeoutFn: (callback, delay) => setTimeout(callback, Math.min(delay, 10)),
    clearTimeoutFn: clearTimeout,
    fetch: async () => assert.fail("socket concurrency does not use HTTP"),
    createSocket: (_target, options) => {
      assert.equal(_target, "http://nginx");
      assert.equal(options.path, "/socket.io/");
      assert.equal(options.reconnection, false);
      assert.equal(options.autoConnect, false);
      const socket = new SocketProbe(`socket-${sockets.length}`, induceHandshakeProblems ? sockets.length : -1);
      sockets.push(socket);
      return socket;
    },
    correlationId: (index) => `attempt-${index}`,
  });
  return { executor, sockets };
}

test("Issue 88 socket ramp records immutable attempts and gates plateau on settling", async () => {
  const { executor, sockets } = setupExecutor();
  const result = await executor.execute({
    phase: "measurement",
    target: "http://nginx",
    profile: { ...profile(), actorAllocation: { alice: 2, bob: 2 } },
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });

  assert.equal(sockets.length, 4);
  assert.equal(result.initialAttempts.length, 4);
  assert.equal(result.handshakeAccounting.initialAttempts, 4);
  assert.equal(result.handshakeAccounting.authenticatedSuccesses, 4);
  assert.equal(result.handshakeAccounting.handshakeFailuresOrTimeouts, 0);
  assert.equal(result.targetReachedAt, 100);
  assert.equal(result.measurementStart, 1100);
  assert.equal(result.measurementEnd, 3100);
  assert.equal(result.targetHeldThroughSettling, true);
  assert.equal(result.measurementAdmitted, true);
  assert.equal(result.initialAttempts.every((attempt) => attempt.socketOptions.reconnection === false), true);
  assert.equal(result.connections.every((connection) => connection.teardown === true), true);
});

test("Issue 88 conserves distinct handshake failure and timeout attempts", async () => {
  const { executor } = setupExecutor({ induceHandshakeProblems: true });
  const result = await executor.execute({
    phase: "measurement",
    target: "http://nginx",
    profile: profile(),
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });

  assert.equal(result.measurementAdmitted, false);
  assert.equal(result.qualificationFlags.includes("TARGET_NOT_REACHED"), true);
  assert.equal(result.handshakeAccounting.initialAttempts, 4);
  assert.equal(result.handshakeAccounting.authenticatedSuccesses, 2);
  assert.equal(result.handshakeAccounting.handshakeFailures, 1);
  assert.equal(result.handshakeAccounting.handshakeTimeouts, 1);
  assert.equal(result.handshakeAccounting.authenticatedSuccesses + result.handshakeAccounting.handshakeFailuresOrTimeouts, 4);
  assert.equal(new Set(result.initialAttempts.filter((attempt) => attempt.terminalHandshakeOutcome !== "authenticated").map((attempt) => attempt.attemptId)).size, 2);
  assert.equal(result.measurementStart, undefined);
});

test("Issue 88 retains post-admission disconnect as stability evidence and ineligible target claim", async () => {
  const { executor } = setupExecutor({
    onSleep: (delay, sockets) => {
      if (delay === 2_000) {
        sockets[0].connected = false;
        sockets[0].emit("disconnect", "transport close");
      }
    },
  });
  const result = await executor.execute({
    phase: "measurement",
    target: "http://nginx",
    profile: profile(),
    actorRefs: { alice: { id: "alice-id" }, bob: { id: "bob-id" } },
    actorSecrets: { alice: { token: "alice-token" }, bob: { token: "bob-token" } },
  });

  assert.equal(result.measurementAdmitted, true);
  assert.equal(result.executionOutcome, "MEASURED");
  assert.equal(result.activeCountEvidence.targetConcurrency, 4);
  assert.equal(result.activeCountEvidence.minimumDuringMeasurement, 3);
  assert.equal(result.activeCountEvidence.targetHeldThroughMeasurement, false);
  assert.equal(result.claimEvidence.targetConcurrency, false);
  assert.equal(result.qualificationFlags.includes("TARGET_NOT_REACHED"), false);
  assert.equal(result.stability.unexpectedDisconnects.length, 1);
  assert.equal(result.stability.unexpectedDisconnects[0].attemptId, result.initialAttempts[0].attemptId);
});

test("Issue 88 claim evidence rejects a complete post-admission active-count drop without a new flag", () => {
  const evidence = claimEvidenceFromMeasurement({
    plan: { workload: { scenario: "socket-concurrency", snapshot: { loadModel: { targetConcurrency: 4 } } } },
    measurementOutput: {
      targetReachedAt: "2026-08-14T00:00:01.000Z",
      targetConcurrency: 4,
      measurementAdmitted: true,
      activeCountEvidence: { complete: true, targetHeldThroughMeasurement: false },
      qualificationFlags: [],
    },
    attribution: { claimEligible: true },
  });
  assert.equal(evidence.targetConcurrency, false);
});

test("Issue 88 claim evidence rejects pre-admission shortfall and incomplete active-count observation", () => {
  const shortfall = claimEvidenceFromMeasurement({
    plan: { workload: { scenario: "socket-concurrency", snapshot: { loadModel: { targetConcurrency: 4 } } } },
    measurementOutput: { measurementAdmitted: false, targetConcurrency: 3, qualificationFlags: ["TARGET_NOT_REACHED"] },
    attribution: { claimEligible: true },
  });
  assert.equal(shortfall.targetConcurrency, false);

  const incomplete = claimEvidenceFromMeasurement({
    plan: { workload: { scenario: "socket-concurrency", snapshot: { loadModel: { targetConcurrency: 4 } } } },
    measurementOutput: { targetReachedAt: "2026-08-14T00:00:01.000Z", targetConcurrency: 4, measurementAdmitted: true, activeCountEvidence: { complete: false, targetHeldThroughMeasurement: true }, qualificationFlags: ["OBSERVATION_INCOMPLETE"] },
    attribution: { claimEligible: true },
  });
  assert.equal(incomplete.targetConcurrency, false);
});

test("Issue 88 preserves measured execution and completed artifacts when target drops after admission", async () => {
  const result = await executeRun({ runId: "issue-88-status" }, {
    executePhase: async (phase) => {
      if (phase === "setup/seed") return { resourcesCreated: true };
      if (phase === "measurement") return {
        executionOutcome: "MEASURED",
        artifactStatus: "COMPLETED",
        claimEvidence: { targetConcurrency: false },
        activeCountEvidence: { complete: true, targetHeldThroughMeasurement: false },
      };
      return {};
    },
  });
  assert.equal(result.executionOutcome, "MEASURED");
  assert.equal(result.artifactStatus, "COMPLETED");
  assert.equal(result.execution_outcome, "MEASURED");
  assert.equal(result.artifact_status, "COMPLETED");
});

test("Issue 88 parses the unlabeled active-socket gauge as corroborating evidence", () => {
  assert.equal(parsePrometheusActiveSocketGauge([
    "# HELP kittachat_socket_active_connections Active Socket.IO connections",
    "kittachat_socket_active_connections 3",
  ].join("\n")), 3);
  assert.throws(() => parsePrometheusActiveSocketGauge("kittachat_socket_active_connections{node=\"backend-1\"} 3"), /absent or malformed/);
});
