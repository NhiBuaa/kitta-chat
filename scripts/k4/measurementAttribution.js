const ATTRIBUTION_SCHEMA = "k4-measurement-attribution-v1";

function completeSource(metadata) {
  const reasons = [];
  for (const key of ["runId", "sourceIdentity", "sourceDigest", "parserVersion", "measurementStart", "measurementEnd"]) {
    if (!metadata?.[key]) reasons.push(`missing ${key}`);
  }
  if (metadata?.truncated || metadata?.rotationGap || metadata?.ambiguousClock) reasons.push("source window is incomplete");
  if (metadata?.parseDiagnostics?.length) reasons.push("source parser reported relevant diagnostics");
  return { complete: reasons.length === 0, reasons };
}

function sidebarAttribution({ records = [], requestIds = [], replicaAddressMap = {}, metadata }) {
  const source = completeSource(metadata);
  const measured = new Set(requestIds);
  const relevant = records.filter((record) => measured.has(record.requestId));
  const ambiguous = relevant.filter((record) => !replicaAddressMap[record.upstreamAddr]);
  const replicas = [...new Set(relevant.map((record) => replicaAddressMap[record.upstreamAddr]).filter(Boolean))];
  const complete = source.complete && ambiguous.length === 0 && relevant.length === measured.size;
  return {
    schema: ATTRIBUTION_SCHEMA,
    source: metadata,
    complete,
    incompleteReasons: [...source.reasons, ...(ambiguous.length ? ["ambiguous upstream mapping"] : []), ...(relevant.length !== measured.size ? ["measured request binding incomplete"] : [])],
    replicas,
    topologyNotExercised: complete && replicas.length === 1,
    claimEligible: complete && replicas.length >= 2,
    supportingRecords: relevant,
  };
}

function timestampMillis(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value !== "string" || !value.trim()) return NaN;
  return Date.parse(value);
}

function socketAttribution({ lifecycles = [], measuredActors = [], measuredConnections, metadata, measurementStart, measurementEnd } = {}) {
  const source = completeSource(metadata);
  const reasons = [...source.reasons];
  const diagnostics = [];
  const actors = new Set(Array.isArray(measuredActors) ? measuredActors.filter((actor) => typeof actor === "string" && actor) : []);
  const bindingSupplied = measuredConnections !== undefined;
  const expectedBySocket = new Map();
  let bindingValid = bindingSupplied;

  if (!bindingSupplied) {
    reasons.push("measured connection binding missing");
  } else if (!Array.isArray(measuredConnections) || measuredConnections.length === 0) {
    reasons.push("measured connection binding incomplete");
    bindingValid = false;
  } else {
    for (const connection of measuredConnections) {
      const socketId = connection?.socketId;
      const actorRef = connection?.actorRef;
      if (typeof socketId !== "string" || !socketId || typeof actorRef !== "string" || !actorRef) {
        reasons.push("invalid measured connection binding");
        bindingValid = false;
        continue;
      }
      if (expectedBySocket.has(socketId)) {
        reasons.push("duplicate measured socket binding");
        bindingValid = false;
      }
      else expectedBySocket.set(socketId, actorRef);
    }
  }

  const expectedSockets = new Set(expectedBySocket.keys());
  const expectedActors = new Set(expectedBySocket.values());
  if (expectedActors.size && [...expectedActors].some((actor) => !actors.has(actor))) reasons.push("measured actor binding incomplete");
  if (actors.size && [...actors].some((actor) => !expectedActors.has(actor))) reasons.push("measured actor binding incomplete");
  const start = timestampMillis(measurementStart);
  const end = timestampMillis(measurementEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) reasons.push("invalid measurement window");

  const relevant = Array.isArray(lifecycles)
    ? lifecycles.filter((entry) => expectedSockets.has(entry?.socketId) || expectedActors.has(entry?.actorRef))
    : [];
  const socketCounts = new Map();
  const invalid = [];
  const overlapping = [];
  for (const entry of relevant) {
    const socketId = entry?.socketId;
    socketCounts.set(socketId, (socketCounts.get(socketId) || 0) + 1);
    const authenticatedAt = timestampMillis(entry?.authenticatedAt);
    const disconnectedAt = entry?.disconnectedAt == null ? null : timestampMillis(entry.disconnectedAt);
    const stillConnected = entry?.disconnectedAt === null || entry?.stillConnectedAtWindowEnd === true;
    if (!socketId || !entry?.nodeName || !Number.isFinite(authenticatedAt) || entry?.disconnectedTimestampMissing === true || (entry?.disconnectedAt != null && !Number.isFinite(disconnectedAt)) || (entry?.disconnectedAt === undefined && !stillConnected) || (entry?.stillConnectedAtWindowEnd === false && entry?.disconnectedAt == null)) {
      invalid.push(entry);
      diagnostics.push("invalid socket lifecycle timestamp or identity");
      continue;
    }
    if (disconnectedAt != null && disconnectedAt <= authenticatedAt) {
      invalid.push(entry);
      diagnostics.push("ambiguous socket lifecycle timing");
      continue;
    }
    if (expectedBySocket.has(socketId) && expectedBySocket.get(socketId) !== entry.actorRef) {
      invalid.push(entry);
      diagnostics.push("measured actor binding mismatch");
    }
    if (!expectedBySocket.has(socketId)) {
      invalid.push(entry);
      diagnostics.push("unexpected measured socket lifecycle");
    }
    if (Number.isFinite(start) && Number.isFinite(end) && authenticatedAt < end && (disconnectedAt == null || disconnectedAt > start)) overlapping.push(entry);
  }
  for (const count of socketCounts.values()) if (count > 1) diagnostics.push("duplicate socket lifecycle");
  if (invalid.length) reasons.push("invalid socket lifecycle");
  const lifecycleSockets = new Set(socketCounts.keys());
  const socketSetsMatch = lifecycleSockets.size === expectedSockets.size && [...lifecycleSockets].every((socketId) => expectedSockets.has(socketId));
  if (!socketSetsMatch) diagnostics.push("measured socket lifecycle incomplete");
  const replicas = [...new Set(overlapping.map((entry) => entry.nodeName))];
  const completeBinding = bindingValid
    && expectedBySocket.size > 0
    && socketSetsMatch
    && relevant.length === expectedBySocket.size
    && invalid.length === 0
    && [...socketCounts.values()].every((count) => count === 1)
    && actors.size === expectedActors.size
    && [...expectedActors].every((actor) => actors.has(actor));
  const allReasons = [...new Set([...reasons, ...diagnostics])];
  const complete = source.complete && Number.isFinite(start) && Number.isFinite(end) && end > start && completeBinding;
  return {
    schema: ATTRIBUTION_SCHEMA,
    source: metadata,
    complete,
    incompleteReasons: allReasons,
    diagnostics: diagnostics.map((message) => ({ message })),
    replicas,
    topologyNotExercised: complete && replicas.length === 1,
    claimEligible: complete && replicas.length >= 2,
    supportingRecords: overlapping,
  };
}

function crossReplicaAttribution({ sender, acknowledgement, receiver, delivery, measuredActors, metadata }) {
  const source = completeSource(metadata);
  const records = [sender, acknowledgement, receiver, delivery];
  const correlations = new Set(records.map((record) => record?.correlationId).filter(Boolean));
  const actorsMatch = sender?.actorRef === measuredActors?.sender && receiver?.actorRef === measuredActors?.recipient;
  const complete = source.complete && correlations.size === 1 && records.every(Boolean) && actorsMatch;
  const distinct = complete && sender.replica !== receiver.replica;
  const succeeded = acknowledgement.success === true && delivery.success === true;
  return {
    schema: ATTRIBUTION_SCHEMA,
    source: metadata,
    complete,
    incompleteReasons: [...source.reasons, ...(correlations.size !== 1 ? ["correlation evidence mismatch"] : []), ...(!actorsMatch ? ["measured actor binding mismatch"] : [])],
    claimEligible: complete && distinct && succeeded,
    topologyNotExercised: complete && !distinct,
    senderReplica: sender?.replica,
    receiverReplica: receiver?.replica,
    correlationId: correlations.size === 1 ? [...correlations][0] : null,
  };
}

module.exports = { ATTRIBUTION_SCHEMA, completeSource, crossReplicaAttribution, sidebarAttribution, socketAttribution };
