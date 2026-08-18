const { crossReplicaAttribution, sidebarAttribution, socketAttribution } = require("./measurementAttribution");
const { PARSER_VERSION, parseBackendRecords, parseNginxRecords, reconstructSocketLifecycles, sha256 } = require("./attributionLogParser");

const PERSISTENCE_METRIC = "kittachat_message_persistence_duration_seconds";
const ACTIVE_SOCKET_METRIC = "kittachat_socket_active_connections";
const LOG_FLUSH_RETRY_DELAY_MS = 1000;

function parsePrometheusHistogram(text) {
  const buckets = [];
  let count;
  let sum;
  const parseLine = (line) => {
    const match = line.match(/^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{([^}]*)\})?\s+([0-9.eE+-]+)$/);
    if (!match) return null;
    const labels = {};
    for (const part of (match[2] || "").split(",")) {
      if (!part) continue;
      const label = part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)="((?:\\.|[^"\\])*)"\s*$/);
      if (!label) return null;
      labels[label[1]] = label[2].replace(/\\([\\"])/g, "$1");
    }
    return { name: match[1], labels, value: Number(match[3]) };
  };
  for (const line of String(text).split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (!parsed || parsed.labels.outcome !== "success") continue;
    if (parsed.name === `${PERSISTENCE_METRIC}_bucket` && typeof parsed.labels.le === "string") buckets.push({ le: parsed.labels.le, count: parsed.value });
    if (parsed.name === `${PERSISTENCE_METRIC}_count` && Object.keys(parsed.labels).length === 1) count = parsed.value;
    if (parsed.name === `${PERSISTENCE_METRIC}_sum` && Object.keys(parsed.labels).length === 1) sum = parsed.value;
  }
  if (!buckets.length || !Number.isFinite(count) || !Number.isFinite(sum)) throw new Error("persistence histogram is absent or malformed");
  return { metric: PERSISTENCE_METRIC, labels: { outcome: "success" }, buckets, count, sum };
}

function parsePrometheusActiveSocketGauge(text) {
  const samples = String(text).split(/\r?\n/).map((line) => line.match(new RegExp(`^${ACTIVE_SOCKET_METRIC}\\s+([0-9.eE+-]+)$`))).filter(Boolean);
  if (samples.length !== 1 || !Number.isFinite(Number(samples[0][1]))) throw new Error("active socket gauge is absent or malformed");
  return Number(samples[0][1]);
}

function base(plan, role, target) {
  return { runId: plan.runId, project: plan.projectName, role, target };
}

function normalizeLogSource(response, label) {
  const source = response && typeof response === "object" ? { ...response } : {};
  const missing = [];
  for (const field of ["truncated", "rotationGap", "ambiguousClock"]) {
    if (typeof source[field] !== "boolean") missing.push(`${label} source is missing boolean completeness field ${field}`);
  }
  if (!Array.isArray(source.coverageGaps)) missing.push(`${label} source is missing completeness array coverageGaps`);
  if (!Array.isArray(source.parseDiagnostics)) missing.push(`${label} source is missing completeness array parseDiagnostics`);
  return {
    ...source,
    ...(typeof source.truncated === "boolean" ? { truncated: source.truncated } : {}),
    ...(typeof source.rotationGap === "boolean" ? { rotationGap: source.rotationGap } : {}),
    ...(typeof source.ambiguousClock === "boolean" ? { ambiguousClock: source.ambiguousClock } : {}),
    coverageGaps: Array.isArray(source.coverageGaps) ? source.coverageGaps : [],
    parseDiagnostics: [
      ...(Array.isArray(source.parseDiagnostics) ? source.parseDiagnostics : []),
      ...missing.map((message) => ({ kind: "missing-completeness-field", message })),
    ],
  };
}

function mergedBooleanField(left, right, field) {
  if (left == null) return typeof right?.[field] === "boolean" ? right[field] : undefined;
  if (right == null) return typeof left?.[field] === "boolean" ? left[field] : undefined;
  if (typeof left?.[field] !== "boolean" || typeof right?.[field] !== "boolean") return undefined;
  return left[field] || right[field];
}

function createProductionObservationSources({ helper, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {}) {
  if (!helper) throw new Error("production observation requires an injected typed observer bridge");
  const preWindowSources = new Map();
  async function snapshotPersistenceHistogram({ plan, replica }) {
    const response = await helper.metrics(base(plan, "backend", replica));
    const histogram = parsePrometheusHistogram(response.body);
    return {
      ...histogram,
      source: {
        sourceIdentity: response.sourceIdentity || `metrics:${replica}`,
        sourceDigest: response.sourceDigest || sha256(response.body),
      },
    };
  }
  async function snapshotActiveSocketGauge({ plan, replica }) {
    const response = await helper.metrics(base(plan, "backend", replica));
    return {
      replica,
      activeConnections: parsePrometheusActiveSocketGauge(response.body),
      sourceIdentity: response.sourceIdentity,
      sourceDigest: response.sourceDigest || sha256(response.body),
    };
  }
  async function captureTopologyInventory({ plan, point, replicas }) {
    const containers = await Promise.all(replicas.map((replica) => helper.identity(base(plan, "backend", replica))));
    return { point, containers, evidenceType: "topology-inventory" };
  }
  async function captureReplicaAttribution({ plan, measurementStart, measurementEnd, measurementOutput, replicas = [] }) {
    if (!measurementEnd) {
      if ((plan.workload?.scenario || plan.workload?.snapshot?.scenario) === "socket-concurrency") {
        const sources = await Promise.all(replicas.map(async (replica) => [replica, normalizeLogSource(await helper.logs({ ...base(plan, "backend", replica), measurementStart: "1970-01-01T00:00:00.000Z", measurementEnd: measurementStart }), `backend:${replica}:pre-window`)]));
        preWindowSources.set(plan.runId, sources);
      }
      return { point: "before", complete: false, deferredUntilMeasurementEnd: true };
    }
    const flushEnd = new Date(Date.parse(measurementEnd) + 5000).toISOString();
    const scenario = plan.workload?.scenario || plan.workload?.snapshot?.scenario;
    const measuredSidebarRequestIds = new Set((measurementOutput?.measuredRequestIds || []).map(String));
    const nginxRequest = { ...base(plan, "nginx", "nginx"), measurementStart, measurementEnd: flushEnd };
    let nginxRaw = normalizeLogSource(await helper.logs(nginxRequest), "nginx");
    if (scenario === "sidebar" && measuredSidebarRequestIds.size > 0) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const seen = new Set(parseNginxRecords(nginxRaw.body, { includeRequestDetails: true }).records
          .filter((record) => measuredSidebarRequestIds.has(String(record.requestId)))
          .map((record) => String(record.requestId)));
        if (seen.size === measuredSidebarRequestIds.size || attempt === 2) break;
        await sleep(LOG_FLUSH_RETRY_DELAY_MS);
        nginxRaw = normalizeLogSource(await helper.logs(nginxRequest), "nginx");
      }
    }
    const backendRaw = await Promise.all(replicas.map(async (replica) => [replica, normalizeLogSource(await helper.logs({ ...base(plan, "backend", replica), measurementStart, measurementEnd: flushEnd }), `backend:${replica}`)]));
    const inWindow = (timestamp) => timestamp && Date.parse(timestamp) >= Date.parse(measurementStart) && Date.parse(timestamp) < Date.parse(measurementEnd);
    const nginxParsed = parseNginxRecords(nginxRaw.body, { includeRequestDetails: scenario === "sidebar" });
    if (scenario !== "sidebar") nginxParsed.records = nginxParsed.records.filter((record) => !record.timestamp || inWindow(record.timestamp));
    const prior = new Map(preWindowSources.get(plan.runId) || []);
    preWindowSources.delete(plan.runId);
    const backendParsed = backendRaw.map(([replica, source]) => {
      const preSource = prior.get(replica);
      const combinedBody = preSource ? `${preSource.body}\n${source.body}` : source.body;
      const combined = {
        ...source,
        body: combinedBody,
        sourceDigest: sha256(combinedBody),
        ...(source.sourceDigest ? { helperSourceDigest: source.sourceDigest } : {}),
        ...(preSource?.sourceDigest ? { preWindowSourceDigest: preSource.sourceDigest } : {}),
        ...(mergedBooleanField(preSource, source, "truncated") !== undefined ? { truncated: mergedBooleanField(preSource, source, "truncated") } : {}),
        ...(mergedBooleanField(preSource, source, "rotationGap") !== undefined ? { rotationGap: mergedBooleanField(preSource, source, "rotationGap") } : {}),
        ...(mergedBooleanField(preSource, source, "ambiguousClock") !== undefined ? { ambiguousClock: mergedBooleanField(preSource, source, "ambiguousClock") } : {}),
        coverageGaps: [...(preSource?.coverageGaps || []), ...(source.coverageGaps || [])],
        parseDiagnostics: [...(preSource?.parseDiagnostics || []), ...(source.parseDiagnostics || [])],
      };
      const parsed = parseBackendRecords(combined.body);
      parsed.records = parsed.records.filter((record) => !record.timestamp || inWindow(record.timestamp)).map((record) => ({
        ...record,
        sourceNodeName: record.nodeName || record.replica,
        ...(record.nodeName ? { nodeName: replica } : {}),
        ...(record.replica ? { replica } : {}),
      }));
      return { replica, source: combined, parsed };
    });
    const backendRecords = backendParsed.flatMap(({ parsed }) => parsed.records);
    const socketReconstruction = scenario === "socket-concurrency"
      ? reconstructSocketLifecycles(backendRecords)
      : null;
    const socketDiagnosticsForReplica = (replica, parsed) => {
      if (!socketReconstruction) return [];
      const socketIds = new Set(parsed.records.map((record) => record.socketId).filter(Boolean));
      return socketReconstruction.diagnostics
        .filter((diagnostic) => !diagnostic.socketId || socketIds.has(diagnostic.socketId))
        .map((diagnostic) => ({ ...diagnostic, kind: `socket-reconstruction:${diagnostic.kind}`, replica }));
    };
    const rawSources = [
      {
        role: "nginx",
        target: "nginx",
        body: nginxRaw.body,
        sourceIdentity: nginxRaw.sourceIdentity,
        sourceDigest: sha256(nginxRaw.body),
        ...(typeof nginxRaw.truncated === "boolean" ? { truncated: nginxRaw.truncated } : {}),
        ...(typeof nginxRaw.rotationGap === "boolean" ? { rotationGap: nginxRaw.rotationGap } : {}),
        ...(typeof nginxRaw.ambiguousClock === "boolean" ? { ambiguousClock: nginxRaw.ambiguousClock } : {}),
        coverageGaps: Array.isArray(nginxRaw.coverageGaps) ? nginxRaw.coverageGaps : [],
        parseDiagnostics: [
          ...(Array.isArray(nginxRaw.parseDiagnostics) ? nginxRaw.parseDiagnostics : []),
          ...nginxParsed.diagnostics,
        ],
        ...(nginxRaw.sourceDigest ? { helperSourceDigest: nginxRaw.sourceDigest } : {}),
      },
      ...backendParsed.map(({ replica, source, parsed }) => ({
        role: "backend",
        target: replica,
        body: source.body,
        sourceIdentity: source.sourceIdentity,
        sourceDigest: sha256(source.body),
        ...(typeof source.truncated === "boolean" ? { truncated: source.truncated } : {}),
        ...(typeof source.rotationGap === "boolean" ? { rotationGap: source.rotationGap } : {}),
        ...(typeof source.ambiguousClock === "boolean" ? { ambiguousClock: source.ambiguousClock } : {}),
        coverageGaps: Array.isArray(source.coverageGaps) ? source.coverageGaps : [],
        parseDiagnostics: [
          ...(Array.isArray(source.parseDiagnostics) ? source.parseDiagnostics : []),
          ...parsed.diagnostics,
          ...socketDiagnosticsForReplica(replica, parsed),
        ],
        ...(source.helperSourceDigest ? { helperSourceDigest: source.helperSourceDigest } : {}),
        ...(source.preWindowSourceDigest ? { preWindowSourceDigest: source.preWindowSourceDigest } : {}),
      })),
    ];
    const metadata = {
      schema: "k4-measurement-attribution-v1",
      runId: plan.runId,
      scenario,
      workloadDigest: plan.workload?.digest || plan.workload?.profileDigest,
      profileDigest: plan.workload?.digest || plan.workload?.profileDigest,
      topologyMembership: [...replicas],
      sourceIdentity: rawSources.map(({ sourceIdentity }) => sourceIdentity).join(","),
      sourceDigest: sha256(rawSources.map(({ sourceDigest }) => sourceDigest).join("\n")),
      parserVersion: PARSER_VERSION,
      measurementStart,
      measurementEnd,
      ...(rawSources.every((raw) => typeof raw.truncated === "boolean") ? { truncated: rawSources.some(({ truncated }) => truncated) } : {}),
      ...(rawSources.every((raw) => typeof raw.rotationGap === "boolean") ? { rotationGap: rawSources.some(({ rotationGap }) => rotationGap) } : {}),
      ...(rawSources.every((raw) => typeof raw.ambiguousClock === "boolean") ? { ambiguousClock: rawSources.some(({ ambiguousClock }) => ambiguousClock) } : {}),
      coverageGaps: rawSources.flatMap(({ coverageGaps }) => coverageGaps),
      parseDiagnostics: rawSources.flatMap(({ parseDiagnostics }) => parseDiagnostics),
      rawSources,
    };
    if (scenario === "sidebar") {
      const replicaAddressMap = measurementOutput?.replicaAddressMap || Object.fromEntries((await Promise.all(replicas.map(async (replica) => {
        const identity = await helper.identity(base(plan, "backend", replica));
        return (identity.addresses || []).map((address) => [`${address}:3000`, replica]);
      }))).flat());
      const selectedRecords = [...measuredSidebarRequestIds].flatMap((requestId) => {
        const candidates = nginxParsed.records.filter((record) => String(record.requestId) === requestId);
        const inWindowCandidates = candidates.filter((record) => !record.timestamp
          ? inWindow(record.wrapperTimestamp)
          : inWindow(record.timestamp) || inWindow(record.wrapperTimestamp));
        if (!inWindowCandidates.length) return [];
        return [inWindowCandidates.sort((left, right) => {
          const leftAccess = inWindow(left.timestamp) ? 1 : 0;
          const rightAccess = inWindow(right.timestamp) ? 1 : 0;
          if (leftAccess !== rightAccess) return rightAccess - leftAccess;
          return Date.parse(right.wrapperTimestamp || right.timestamp) - Date.parse(left.wrapperTimestamp || left.timestamp);
        })[0]];
      });
      return sidebarAttribution({ records: selectedRecords, requestIds: measurementOutput?.measuredRequestIds, replicaAddressMap, metadata });
    }
    if (scenario === "socket-concurrency") {
      return socketAttribution({ lifecycles: socketReconstruction.lifecycles, measuredActors: measurementOutput?.measuredActors, measuredConnections: measurementOutput?.measuredConnections, metadata, measurementStart, measurementEnd });
    }
    if (scenario === "message") {
      const correlations = measurementOutput?.correlationIds || [];
      const results = correlations.map((correlationId) => {
        const select = (event) => backendRecords.filter((record) => record.event === event && record.correlationId === correlationId);
        const delivery = measurementOutput?.deliveries?.find((record) => record.correlationId === correlationId);
        const sender = select("message_sender")[0];
        const acknowledgement = select("message_acknowledgement")[0];
        const receiver = select("message_receiver")[0];
        const attribution = crossReplicaAttribution({ sender, acknowledgement, receiver, delivery, measuredActors: measurementOutput?.measuredActors, metadata });
        return { ...attribution, eventChain: { sender, acknowledgement, receiver, delivery }, source: metadata };
      });
      const attempted = measurementOutput?.attemptedCorrelationIds || [];
      const covered = measurementOutput?.attributionComplete === true
        && attempted.length > 0
        && attempted.length === correlations.length
        && attempted.every((correlationId) => correlations.includes(correlationId))
        && results.length === attempted.length
        && results.every(({ complete }) => complete);
      const observedReplicas = new Set(results.flatMap(({ senderReplica, receiverReplica }) => [senderReplica, receiverReplica]).filter(Boolean));
      const runTopologyNotExercised = covered && observedReplicas.size === 1;
      return {
        scenario: "message",
        source: metadata,
        complete: correlations.length > 0 && results.every(({ complete }) => complete),
        deliveryEligible: results.length > 0 && results.every(({ deliveryEligible }) => deliveryEligible),
        claimEligible: results.length > 0 && results.every(({ claimEligible }) => claimEligible),
        topologyNotExercised: runTopologyNotExercised,
        sampleTopologyNotExercised: results.some(({ topologyNotExercised }) => topologyNotExercised),
        correlations: results,
      };
    }
    throw new Error(`unsupported attribution scenario: ${scenario}`);
  }
  async function collectResourceSamples({ plan, requiredContainers, slotTimestamp }) {
    const timestamp = slotTimestamp || new Date().toISOString();
    const observations = await Promise.all(requiredContainers.map(async (target) => {
      const role = target.startsWith("backend") ? "backend" : target;
      try {
        const response = await helper.stats({ ...base(plan, role, target), slotTimestamp: timestamp });
        return [target, [{ timestamp, status: "success", sample: response.sample, source: response.helperIdentity }]];
      } catch (error) {
        return [target, [{ timestamp, status: "error", error: error.message, source: "observer-helper" }]];
      }
    }));
    return Object.fromEntries(observations);
  }
  async function captureRunnerCgroupEvidence({ plan, slotTimestamp }) {
    const timestamp = slotTimestamp || new Date().toISOString();
    try {
      return await helper.runnerCgroup({ ...base(plan, "runner", "runner"), path: "cpu.stat", paths: ["cpu.stat", "cpu.max", "cpuset.cpus.effective", "memory.max", "memory.events"], slotTimestamp: timestamp });
    } catch (error) {
      return { status: "error", sourceIdentity: "observer-helper", error: error.message, slotTimestamp: timestamp };
    }
  }
  async function captureRunnerShortfall({ measurementOutput }) {
    if (!Array.isArray(measurementOutput?.runnerShortfallSamples) || measurementOutput.runnerShortfallSamples.length === 0) return null;
    const samples = measurementOutput.runnerShortfallSamples.map((sample) => ({
      ...sample,
      start: typeof sample.start === "number" ? new Date(sample.start).toISOString() : sample.start,
      end: typeof sample.end === "number" ? new Date(sample.end).toISOString() : sample.end,
      timestamp: typeof sample.timestamp === "number" ? new Date(sample.timestamp).toISOString() : sample.timestamp,
      source: "runner-phase-output",
    }));
    return samples.length === 1 ? samples[0] : samples;
  }
  return { snapshotPersistenceHistogram, snapshotActiveSocketGauge, captureTopologyInventory, captureReplicaAttribution, collectResourceSamples, captureRunnerCgroupEvidence, captureRunnerShortfall, identity: { principal: "k4-observer", dockerManagement: false, workloadCapability: false, routingMutation: false, helperPolicy: "k4-observer-helper-v1" } };
}

module.exports = { ACTIVE_SOCKET_METRIC, createProductionObservationSources, parsePrometheusActiveSocketGauge, parsePrometheusHistogram };
