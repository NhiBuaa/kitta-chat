function listen(socket, event, listener) {
  if (typeof socket?.on === "function") {
    socket.on(event, listener);
    return () => socket.off?.(event, listener);
  }
  if (typeof socket?.once === "function") {
    socket.once(event, listener);
    return () => socket.off?.(event, listener);
  }
  return () => {};
}

function timestampValue(clock) {
  return clock();
}

function isoTimestamp(value) {
  if (typeof value === "number") return new Date(value).toISOString();
  return value;
}

function addMilliseconds(value, milliseconds) {
  if (typeof value === "number") return value + milliseconds;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed + milliseconds).toISOString() : value;
}

function createAttemptRecord({ attemptId, actorName, actor, target, timeoutMs, startedAt }) {
  return {
    attemptId,
    correlationId: attemptId,
    actor: actorName,
    actorRef: actor.id,
    target,
    path: "/socket.io/",
    // Keep the effective transport options without serializing the Socket.IO auth object.
    // The actual token is supplied only to createSocket and must remain ephemeral.
    socketOptions: { path: "/socket.io/", transports: ["websocket"], reconnection: false, autoConnect: false },
    handshakeTimeoutMs: timeoutMs,
    startedAt,
    terminalHandshakeOutcome: null,
    authenticated: false,
    events: [],
    reconnectEvents: [],
    disconnects: [],
    unexpectedDisconnects: [],
    teardownDisconnects: [],
  };
}

function openSocketAttempt({ createSocket, target, actorName, actor, token, attemptId, timeoutMs, clock, setTimeoutFn, clearTimeoutFn }) {
  const startedAt = timestampValue(clock);
  const record = createAttemptRecord({ attemptId, actorName, actor, target, timeoutMs, startedAt });
  let socket;
  try {
    socket = createSocket(target, {
      path: "/socket.io/",
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      autoConnect: false,
    });
  } catch (error) {
    record.terminalHandshakeOutcome = "handshake_failure";
    record.handshakeOutcome = "handshake_failure";
    record.status = "handshake_failure";
    record.handshakeError = error.message;
    record.completedAt = timestampValue(clock);
    return Promise.resolve({ record, socket: undefined, markTeardown() {}, cleanup() {} });
  }

  let settled = false;
  let teardownRequested = false;
  let timer;
  const cleanHandshakeListeners = [];
  const disconnectListeners = [];
  const reconnectListeners = [];
  let resolveAttempt;
  const result = new Promise((resolve) => { resolveAttempt = resolve; });

  const finishHandshake = (outcome, error) => {
    if (settled) return false;
    settled = true;
    if (timer !== undefined) clearTimeoutFn(timer);
    if (outcome === "authenticated") for (const cleanup of cleanHandshakeListeners) cleanup();
    record.terminalHandshakeOutcome = outcome;
    record.handshakeOutcome = outcome;
    record.status = outcome;
    record.authenticated = outcome === "authenticated";
    record.completedAt = timestampValue(clock);
    if (error) record.handshakeError = error instanceof Error ? error.message : String(error);
    if (record.authenticated) {
      record.connectedAt = record.completedAt;
      record.socketId = socket.id;
      try { socket.emit?.("addNewUser", actor.id); } catch (emitError) { record.events.push({ event: "addNewUser_error", timestamp: timestampValue(clock), error: emitError.message }); }
    }
    resolveAttempt({ record, socket });
    return true;
  };

  const captureEvent = (event, value) => {
    record.events.push({ event, timestamp: timestampValue(clock), ...(value === undefined ? {} : { value: value instanceof Error ? value.message : value }) });
  };
  const onConnect = () => {
    captureEvent("connect");
    if (!finishHandshake("authenticated")) {
      record.events.push({ event: "late_connect_ignored", timestamp: timestampValue(clock) });
      try { socket.disconnect?.(); } catch (error) { record.events.push({ event: "late_connect_disconnect_error", timestamp: timestampValue(clock), error: error.message }); }
    }
  };
  const onConnectError = (error) => {
    captureEvent("connect_error", error);
    if (!finishHandshake("handshake_failure", error)) record.events.push({ event: "late_connect_error", timestamp: timestampValue(clock) });
  };
  const onDisconnect = (reason) => {
    const timestamp = timestampValue(clock);
    const classification = teardownRequested ? "teardown" : "unexpected_post_success";
    const disconnect = { timestamp, reason: reason instanceof Error ? reason.message : reason, classification };
    record.disconnects.push(disconnect);
    if (classification === "teardown") record.teardownDisconnects.push(disconnect);
    else if (record.authenticated) record.unexpectedDisconnects.push(disconnect);
    captureEvent("disconnect", reason);
  };
  const onReconnect = (event) => (value) => {
    const reconnect = { event, timestamp: timestampValue(clock), ...(value === undefined ? {} : { value: value instanceof Error ? value.message : value }) };
    record.reconnectEvents.push(reconnect);
    record.events.push(reconnect);
  };

  cleanHandshakeListeners.push(listen(socket, "connect", onConnect));
  cleanHandshakeListeners.push(listen(socket, "connect_error", onConnectError));
  disconnectListeners.push(listen(socket, "disconnect", onDisconnect));
  for (const event of ["reconnect", "reconnect_attempt", "reconnect_error", "reconnect_failed"]) reconnectListeners.push(listen(socket, event, onReconnect(event)));
  for (const event of ["reconnect", "reconnect_attempt", "reconnect_error", "reconnect_failed"]) reconnectListeners.push(listen(socket.io, event, onReconnect(event)));

  timer = setTimeoutFn(() => {
    captureEvent("handshake_timeout");
    finishHandshake("handshake_timeout");
  }, timeoutMs);
  try {
    socket.connect?.();
  } catch (error) {
    finishHandshake("handshake_failure", error);
  }

  return result.then((attempt) => ({
    ...attempt,
    connection: attempt.record.authenticated ? {
      socket: attempt.socket,
      actor,
      actorName,
      attemptId,
      record: attempt.record,
      markTeardown() { teardownRequested = true; },
    } : undefined,
    markTeardown() { teardownRequested = true; },
    cleanup() {
      if (record.authenticated) for (const cleanup of cleanHandshakeListeners) cleanup();
      for (const cleanup of disconnectListeners) cleanup();
      for (const cleanup of reconnectListeners) cleanup();
    },
  }));
}

function activeConnections(connections) {
  return connections.filter(({ socket }) => socket?.connected === true);
}

function lifecycleEvidence(attempts) {
  const initialAttempts = attempts.map(({ record }) => record);
  const authenticated = initialAttempts.filter((attempt) => attempt.terminalHandshakeOutcome === "authenticated");
  const failures = initialAttempts.filter((attempt) => attempt.terminalHandshakeOutcome === "handshake_failure");
  const timeouts = initialAttempts.filter((attempt) => attempt.terminalHandshakeOutcome === "handshake_timeout");
  const unexpectedDisconnects = initialAttempts.flatMap((attempt) => attempt.unexpectedDisconnects.map((disconnect) => ({ ...disconnect, attemptId: attempt.attemptId, actorRef: attempt.actorRef })));
  const reconnectEvents = initialAttempts.flatMap((attempt) => attempt.reconnectEvents.map((event) => ({ ...event, attemptId: attempt.attemptId, actorRef: attempt.actorRef })));
  return {
    initialAttempts,
    authenticatedSuccesses: authenticated,
    handshakeFailures: failures,
    handshakeTimeouts: timeouts,
    handshakeAccounting: {
      initialAttempts: initialAttempts.length,
      authenticatedSuccesses: authenticated.length,
      handshakeFailures: failures.length,
      handshakeTimeouts: timeouts.length,
      handshakeFailuresOrTimeouts: failures.length + timeouts.length,
      conserved: initialAttempts.length === authenticated.length + failures.length + timeouts.length,
    },
    stability: { unexpectedDisconnects, reconnectEvents, teardownDisconnects: initialAttempts.flatMap((attempt) => attempt.teardownDisconnects.map((disconnect) => ({ ...disconnect, attemptId: attempt.attemptId, actorRef: attempt.actorRef }))) },
  };
}

function disconnectAll(attempts, clock) {
  return attempts.map(({ connection, record, socket }) => {
    const actualSocket = connection?.socket || socket;
    const disconnectedAt = timestampValue(clock);
    connection?.markTeardown();
    attempts.find((attempt) => attempt.record === record)?.markTeardown?.();
    const teardownCountBefore = record.teardownDisconnects.length;
    try { actualSocket?.disconnect?.(); } catch (error) { record.events.push({ event: "teardown_disconnect_error", timestamp: timestampValue(clock), error: error.message }); }
    if (record.teardownDisconnects.length === teardownCountBefore) {
      const disconnect = { timestamp: disconnectedAt, reason: "runner teardown", classification: "teardown" };
      record.disconnects.push(disconnect);
      record.teardownDisconnects.push(disconnect);
    }
    const teardown = { actorRef: record.actorRef, actor: record.actor, attemptId: record.attemptId, socketId: actualSocket?.id, connectedAt: record.connectedAt, disconnectedAt, teardown: true };
    record.teardownAt = disconnectedAt;
    return teardown;
  });
}

function executeSocketConcurrency({ phase, target, profile, actorRefs, actorSecrets, createSocket, clock = Date.now, sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)), correlationId = (index) => `socket-attempt-${index}`, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  if (target !== "http://nginx") throw new Error("socket concurrency workload target must be nginx");
  const allocation = Object.entries(profile.actorAllocation || {}).flatMap(([name, count]) => Array.from({ length: count }, () => name));
  const targetConcurrency = profile.loadModel?.targetConcurrency ?? allocation.length;
  const rampStartedAt = timestampValue(clock);
  const timeoutMs = profile.ramp?.timeoutMs;
  const targetDeadline = addMilliseconds(rampStartedAt, timeoutMs);
  const attemptsPromise = Promise.all(allocation.map((actorName, index) => openSocketAttempt({
    createSocket,
    target,
    actorName,
    actor: actorRefs[actorName],
    token: actorSecrets[actorName].token,
    attemptId: correlationId(index),
    timeoutMs,
    clock,
    setTimeoutFn,
    clearTimeoutFn,
  })));
  return attemptsPromise.then(async (attempts) => {
    const lifecycle = lifecycleEvidence(attempts);
    const successful = attempts.filter(({ record }) => record.terminalHandshakeOutcome === "authenticated");
    const connections = successful.map(({ connection }) => connection);
    const activeAtTarget = activeConnections(connections).length;
    const targetReachedAt = activeAtTarget === targetConcurrency && successful.length === targetConcurrency ? timestampValue(clock) : undefined;
    const samples = [
      { phase: "ramp-start", timestamp: rampStartedAt, activeCount: 0 },
      { phase: targetReachedAt === undefined ? "ramp-timeout" : "target-reached", timestamp: targetReachedAt || timestampValue(clock), activeCount: activeAtTarget },
    ];
    if (targetReachedAt === undefined) {
      const teardown = disconnectAll(attempts, clock);
      for (const attempt of attempts) attempt.cleanup();
      return {
        ...lifecycleEvidence(attempts),
        rampStartedAt,
        rampTimeoutMs: timeoutMs,
        rampDeadline: targetDeadline,
        rampMode: profile.ramp?.mode,
        actorAllocation: { ...profile.actorAllocation },
        settlingDurationMs: profile.settling.durationMs,
        targetConcurrency,
        achievedConcurrency: activeAtTarget,
        targetReachedAt: undefined,
        targetHeldThroughSettling: false,
        measurementAdmitted: false,
        activeCountEvidence: { targetConcurrency, activeAtTarget, activeAtSettlingEnd: activeAtTarget, minimumDuringMeasurement: null, targetHeldThroughSettling: false, targetHeldThroughMeasurement: false, complete: true, samples },
        qualificationFlags: ["TARGET_NOT_REACHED"],
        claimEvidence: { targetConcurrency: false },
        runnerShortfallSamples: [{ model: "connection-ramp", start: isoTimestamp(rampStartedAt), end: isoTimestamp(targetDeadline), requested: targetConcurrency, achieved: activeAtTarget }],
        connections: teardown,
        ...(phase === "measurement" ? { executionOutcome: "MEASURED" } : {}),
      };
    }

    const settlingStartedAt = timestampValue(clock);
    await sleep(profile.settling.durationMs);
    const activeAtSettlingEnd = activeConnections(connections).length;
    const settlingStability = lifecycleEvidence(attempts).stability;
    const settlingStable = activeAtSettlingEnd === targetConcurrency && settlingStability.unexpectedDisconnects.length === 0 && settlingStability.reconnectEvents.length === 0;
    samples.push({ phase: "settling-end", timestamp: timestampValue(clock), activeCount: activeAtSettlingEnd });
    if (!settlingStable) {
      const teardown = disconnectAll(attempts, clock);
      for (const attempt of attempts) attempt.cleanup();
      return {
        ...lifecycleEvidence(attempts),
        rampStartedAt,
        rampTimeoutMs: timeoutMs,
        rampDeadline: targetDeadline,
        rampMode: profile.ramp?.mode,
        actorAllocation: { ...profile.actorAllocation },
        settlingDurationMs: profile.settling.durationMs,
        targetConcurrency,
        achievedConcurrency: activeAtSettlingEnd,
        targetReachedAt,
        settlingStartedAt,
        settlingEndedAt: timestampValue(clock),
        targetHeldThroughSettling: false,
        measurementAdmitted: false,
        activeCountEvidence: { targetConcurrency, activeAtTarget, activeAtSettlingEnd, minimumDuringMeasurement: null, targetHeldThroughSettling: false, targetHeldThroughMeasurement: false, complete: true, samples },
        qualificationFlags: ["TARGET_NOT_REACHED"],
        claimEvidence: { targetConcurrency: false },
        runnerShortfallSamples: [{ model: "connection-ramp", start: isoTimestamp(rampStartedAt), end: isoTimestamp(timestampValue(clock)), requested: targetConcurrency, achieved: activeAtSettlingEnd }],
        connections: teardown,
        ...(phase === "measurement" ? { executionOutcome: "MEASURED" } : {}),
      };
    }

    const measurementStart = timestampValue(clock);
    const measurementSamples = [{ phase: "measurement-start", timestamp: measurementStart, activeCount: activeAtSettlingEnd }];
    samples.push(measurementSamples[0]);
    await sleep(profile.plateau.durationMs);
    const measurementEnd = timestampValue(clock);
    const activeAtMeasurementEnd = activeConnections(connections).length;
    const minimumDuringMeasurement = Math.min(...measurementSamples.map((sample) => sample.activeCount), activeAtMeasurementEnd);
    const measurementStability = lifecycleEvidence(attempts).stability;
    const targetHeldThroughMeasurement = minimumDuringMeasurement === targetConcurrency
      && measurementStability.unexpectedDisconnects.length === 0
      && measurementStability.reconnectEvents.length === 0;
    const measurementEndSample = { phase: "measurement-end", timestamp: measurementEnd, activeCount: activeAtMeasurementEnd };
    measurementSamples.push(measurementEndSample);
    samples.push(measurementEndSample);
    const teardown = disconnectAll(attempts, clock);
    for (const attempt of attempts) attempt.cleanup();
    return {
      ...lifecycleEvidence(attempts),
      rampStartedAt,
      rampTimeoutMs: timeoutMs,
      rampDeadline: targetDeadline,
      rampMode: profile.ramp?.mode,
      actorAllocation: { ...profile.actorAllocation },
      settlingDurationMs: profile.settling.durationMs,
      targetConcurrency,
      achievedConcurrency: activeAtMeasurementEnd,
      targetReachedAt,
      settlingStartedAt,
      settlingEndedAt: measurementStart,
      measurementStart,
      measurementEnd,
      plateauDurationMs: profile.plateau.durationMs,
      targetHeldThroughSettling: true,
      measurementAdmitted: true,
      activeCountEvidence: { targetConcurrency, activeAtTarget, activeAtSettlingEnd, activeAtMeasurementStart: activeAtSettlingEnd, activeAtMeasurementEnd, minimumDuringMeasurement, targetHeldThroughSettling: true, targetHeldThroughMeasurement, complete: true, samples },
      qualificationFlags: [],
      claimEvidence: { targetConcurrency: targetHeldThroughMeasurement },
      measuredActors: allocation.map((name) => actorRefs[name].id),
      measuredConnections: successful.map(({ record }) => ({ attemptId: record.attemptId, actorRef: record.actorRef, socketId: record.socketId, connectedAt: record.connectedAt })),
      connections: teardown,
      ...(phase === "measurement" ? { executionOutcome: "MEASURED" } : {}),
    };
  });
}

module.exports = { createAttemptRecord, disconnectAll, executeSocketConcurrency, lifecycleEvidence, openSocketAttempt };
