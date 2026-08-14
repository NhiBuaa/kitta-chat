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

function socketAttribution({ lifecycles = [], measuredActors = [], metadata, measurementStart, measurementEnd }) {
  const source = completeSource(metadata);
  const actors = new Set(measuredActors);
  const start = Date.parse(measurementStart);
  const end = Date.parse(measurementEnd);
  const relevant = lifecycles.filter((entry) => actors.has(entry.actorRef));
  const invalid = relevant.filter((entry) => !entry.socketId || !entry.nodeName || !entry.authenticatedAt || (entry.disconnectedAt && Date.parse(entry.disconnectedAt) < Date.parse(entry.authenticatedAt)));
  const overlapping = relevant.filter((entry) => Date.parse(entry.authenticatedAt) < end && (!entry.disconnectedAt || Date.parse(entry.disconnectedAt) > start));
  const replicas = [...new Set(overlapping.map((entry) => entry.nodeName))];
  const complete = source.complete && invalid.length === 0 && new Set(relevant.map((entry) => entry.actorRef)).size === actors.size;
  return {
    schema: ATTRIBUTION_SCHEMA,
    source: metadata,
    complete,
    incompleteReasons: [...source.reasons, ...(invalid.length ? ["invalid socket lifecycle"] : []), ...(new Set(relevant.map((entry) => entry.actorRef)).size !== actors.size ? ["measured actor lifecycle incomplete"] : [])],
    replicas,
    topologyNotExercised: complete && replicas.length === 1,
    claimEligible: complete && replicas.length >= 2,
    supportingRecords: overlapping,
  };
}

function comparableId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value._id !== undefined) return comparableId(value._id);
  return String(value);
}

function crossReplicaAttribution({ sender, acknowledgement, receiver, delivery, measuredActors, metadata }) {
  const source = completeSource(metadata);
  const records = [sender, acknowledgement, receiver, delivery];
  const recordCorrelations = records.map((record) => record?.correlationId);
  const correlations = new Set(recordCorrelations.filter(Boolean));
  const correlationId = recordCorrelations.every(Boolean) && correlations.size === 1 ? [...correlations][0] : null;
  const senderId = comparableId(measuredActors?.sender);
  const recipientId = comparableId(measuredActors?.recipient);
  const actorsMatch = comparableId(sender?.actorRef) === senderId
    && comparableId(sender?.recipientRef) === recipientId
    && comparableId(acknowledgement?.actorRef) === senderId
    && comparableId(acknowledgement?.recipientRef) === recipientId
    && comparableId(receiver?.actorRef) === recipientId
    && comparableId(receiver?.senderRef) === senderId
    && comparableId(delivery?.senderId) === senderId
    && comparableId(delivery?.recipientId) === recipientId;
  const conversationValues = records.map((record) => comparableId(record?.conversationId));
  const conversationIds = new Set(conversationValues.filter(Boolean));
  const messageValues = [
    comparableId(acknowledgement?.realId || acknowledgement?.messageId),
    comparableId(receiver?.messageId),
    comparableId(delivery?.messageId),
  ];
  const messageIds = new Set(messageValues.filter(Boolean));
  const identityMatch = conversationValues.every(Boolean) && conversationIds.size === 1
    && messageValues.every(Boolean) && messageIds.size === 1;
  const replicaIdentity = [sender?.replica, receiver?.replica].every((replica) => replica !== null && replica !== undefined && String(replica).length > 0);
  const complete = source.complete && correlationId !== null && records.every(Boolean) && actorsMatch && identityMatch && replicaIdentity;
  const distinct = complete && sender.replica !== receiver.replica;
  const succeeded = acknowledgement.success === true && delivery.success === true;
  const deliveryEligible = complete && succeeded;
  const sampleEligible = deliveryEligible && distinct;
  return {
    schema: ATTRIBUTION_SCHEMA,
    source: metadata,
    complete,
    incompleteReasons: [...source.reasons, ...(correlationId === null ? ["correlation evidence mismatch"] : []), ...(!actorsMatch ? ["measured actor binding mismatch"] : []), ...(!identityMatch ? ["message identity evidence mismatch"] : []), ...(!replicaIdentity ? ["replica identity missing"] : [])],
    deliveryEligible,
    sampleEligible,
    claimEligible: sampleEligible,
    topologyNotExercised: complete && !distinct,
    senderReplica: sender?.replica,
    receiverReplica: receiver?.replica,
    correlationId,
    conversationId: conversationIds.size === 1 ? [...conversationIds][0] : null,
    messageId: messageIds.size === 1 ? [...messageIds][0] : null,
  };
}

module.exports = { ATTRIBUTION_SCHEMA, completeSource, crossReplicaAttribution, sidebarAttribution, socketAttribution };
