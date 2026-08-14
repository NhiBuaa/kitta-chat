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
