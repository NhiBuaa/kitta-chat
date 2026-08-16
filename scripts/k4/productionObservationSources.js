const { crossReplicaAttribution, sidebarAttribution, socketAttribution } = require("./measurementAttribution");
const { PARSER_VERSION, parseBackendRecords, parseNginxRecords, reconstructSocketLifecycles, sha256 } = require("./attributionLogParser");

const PERSISTENCE_METRIC = "kittachat_message_persistence_duration_seconds";
const ACTIVE_SOCKET_METRIC = "kittachat_socket_active_connections";

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

function createProductionObservationSources({ helper } = {}) {
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
        const sources = await Promise.all(replicas.map(async (replica) => [replica, await helper.logs({ ...base(plan, "backend", replica), measurementStart: "1970-01-01T00:00:00.000Z", measurementEnd: measurementStart })]));
        preWindowSources.set(plan.runId, sources);
      }
      return { point: "before", complete: false, deferredUntilMeasurementEnd: true };
    }
    const flushEnd = new Date(Date.parse(measurementEnd) + 1000).toISOString();
    const nginxRaw = await helper.logs({ ...base(plan, "nginx", "nginx"), measurementStart, measurementEnd: flushEnd });
    const backendRaw = await Promise.all(replicas.map(async (replica) => [replica, await helper.logs({ ...base(plan, "backend", replica), measurementStart, measurementEnd: flushEnd })]));
    const inWindow = (timestamp) => timestamp && Date.parse(timestamp) >= Date.parse(measurementStart) && Date.parse(timestamp) < Date.parse(measurementEnd);
    const nginxParsed = parseNginxRecords(nginxRaw.body);
    nginxParsed.records = nginxParsed.records.filter((record) => !record.timestamp || inWindow(record.timestamp));
    const prior = new Map(preWindowSources.get(plan.runId) || []);
    preWindowSources.delete(plan.runId);
    const backendParsed = backendRaw.map(([replica, source]) => {
      const preSource = prior.get(replica);
      const combined = preSource ? { ...source, body: `${preSource.body}\n${source.body}`, truncated: preSource.truncated || source.truncated, rotationGap: preSource.rotationGap || source.rotationGap } : source;
      const parsed = parseBackendRecords(combined.body);
      parsed.records = parsed.records.filter((record) => !record.timestamp || inWindow(record.timestamp)).map((record) => ({
        ...record,
        sourceNodeName: record.nodeName || record.replica,
        ...(record.nodeName ? { nodeName: replica } : {}),
        ...(record.replica ? { replica } : {}),
      }));
      return { replica, source: combined, parsed };
    });
    const rawSources = [
      { role: "nginx", target: "nginx", body: nginxRaw.body, sourceIdentity: nginxRaw.sourceIdentity, sourceDigest: nginxRaw.sourceDigest || sha256(nginxRaw.body) },
      ...backendParsed.map(({ replica, source }) => ({ role: "backend", target: replica, body: source.body, sourceIdentity: source.sourceIdentity, sourceDigest: source.sourceDigest || sha256(source.body) })),
    ];
    const diagnostics = [...nginxParsed.diagnostics, ...backendParsed.flatMap(({ replica, parsed }) => parsed.diagnostics.map((diagnostic) => ({ replica, ...diagnostic })))];
    const metadata = {
      runId: plan.runId,
      sourceIdentity: rawSources.map(({ sourceIdentity }) => sourceIdentity).join(","),
      sourceDigest: sha256(rawSources.map(({ sourceDigest }) => sourceDigest).join("\n")),
      parserVersion: PARSER_VERSION,
      measurementStart,
      measurementEnd,
      truncated: [nginxRaw, ...backendRaw.map(([, source]) => source)].some(({ truncated }) => truncated),
      rotationGap: [nginxRaw, ...backendRaw.map(([, source]) => source)].some(({ rotationGap }) => rotationGap),
      parseDiagnostics: diagnostics,
      rawSources,
    };
    const scenario = plan.workload?.scenario || plan.workload?.snapshot?.scenario;
    if (scenario === "sidebar") {
      const replicaAddressMap = measurementOutput?.replicaAddressMap || Object.fromEntries((await Promise.all(replicas.map(async (replica) => {
        const identity = await helper.identity(base(plan, "backend", replica));
        return (identity.addresses || []).map((address) => [`${address}:3000`, replica]);
      }))).flat());
      return sidebarAttribution({ records: nginxParsed.records, requestIds: measurementOutput?.measuredRequestIds, replicaAddressMap, metadata });
    }
    const backendRecords = backendParsed.flatMap(({ parsed }) => parsed.records);
    if (scenario === "socket-concurrency") {
      const reconstructed = reconstructSocketLifecycles(backendRecords);
      metadata.parseDiagnostics.push(...reconstructed.diagnostics);
      return socketAttribution({ lifecycles: reconstructed.lifecycles, measuredActors: measurementOutput?.measuredActors, measuredConnections: measurementOutput?.measuredConnections, metadata, measurementStart, measurementEnd });
    }
    if (scenario === "message") {
      const correlations = measurementOutput?.correlationIds || [];
      const results = correlations.map((correlationId) => {
        const select = (event) => backendRecords.filter((record) => record.event === event && record.correlationId === correlationId);
        const delivery = measurementOutput?.deliveries?.find((record) => record.correlationId === correlationId);
        return crossReplicaAttribution({ sender: select("message_sender")[0], acknowledgement: select("message_acknowledgement")[0], receiver: select("message_receiver")[0], delivery, measuredActors: measurementOutput?.measuredActors, metadata });
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
