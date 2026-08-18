const fs = require("node:fs");
const path = require("node:path");
const { collectMeasurementEvidence } = require("./measurementCollectors");

function writeArtifact(directory, name, value) {
  if (!directory) throw new Error("resolved run result directory is required for measurement evidence");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function mergeCapture(start, end) {
  const snapshotNames = new Set([...Object.keys(start.histogram?.snapshots || {}), ...Object.keys(end.histogram?.snapshots || {})]);
  return {
    ...start,
    ...end,
    histogram: {
      ...(start.histogram || {}),
      ...(end.histogram || {}),
      snapshots: Object.fromEntries([...snapshotNames].map((name) => [name, {
        ...(start.histogram?.snapshots?.[name] || {}),
        ...(end.histogram?.snapshots?.[name] || {}),
      }])),
    },
    resource: { ...(start.resource || {}), ...(end.resource || {}) },
    loadGenerator: { ...(start.loadGenerator || {}), ...(end.loadGenerator || {}) },
    replicaAttribution: { before: start.replicaAttribution, after: end.replicaAttribution },
    claimEvidence: { ...(start.claimEvidence || {}), ...(end.claimEvidence || {}) },
    ...(start.activeSocketGauge || end.activeSocketGauge ? {
      activeSocketGauge: {
        ...(start.activeSocketGauge || {}),
        ...(end.activeSocketGauge || {}),
        samples: [...(start.activeSocketGauge?.samples || []), ...(end.activeSocketGauge?.samples || [])],
      },
    } : {}),
  };
}

function materializeSlots(samples, measurementStart, measurementEnd, intervalMs) {
  const expected = Math.ceil((Date.parse(measurementEnd) - Date.parse(measurementStart)) / intervalMs);
  const byIndex = new Map(samples.map((sample) => [sample.slotIndex, sample]));
  return Array.from({ length: expected }, (_, slotIndex) => byIndex.get(slotIndex) || {
    slotIndex,
    timestamp: new Date(Date.parse(measurementStart) + slotIndex * intervalMs).toISOString(),
    status: "missing",
    reason: "no sample completed for cadence slot",
  });
}

function declaredMeasurementWindow(measurementOutput, fallbackStart, fallbackEnd) {
  const declared = measurementOutput?.measurementWindow
    || (measurementOutput?.measurementStart !== undefined && measurementOutput?.measurementEnd !== undefined
      ? {
        start: measurementOutput.measurementStart,
        end: measurementOutput.measurementEnd,
        boundary: "[phase_start, phase_end)",
      }
      : undefined);
  if (declared === undefined || declared === null) return {
    start: fallbackStart,
    end: fallbackEnd,
    source: "observation",
  };
  const normalizeTimestamp = (value, field) => {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`measurement output ${field} must be a valid timestamp`);
      return new Date(value).toISOString();
    }
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new Error(`measurement output ${field} must be a valid timestamp`);
      return value.toISOString();
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return value;
    }
    throw new Error(`measurement output ${field} must be a valid timestamp`);
  };
  const normalizedStart = normalizeTimestamp(declared.start, "start");
  const normalizedEnd = normalizeTimestamp(declared.end, "end");
  const start = Date.parse(normalizedStart);
  const end = Date.parse(normalizedEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("measurement output measurementWindow must have valid positive timestamps");
  }
  return {
    start: normalizedStart,
    end: normalizedEnd,
    ...(declared.boundary ? { boundary: declared.boundary } : {}),
    source: "runner",
  };
}

function rebaseSamples(samples, measurementStart, measurementEnd, intervalMs) {
  const start = Date.parse(measurementStart);
  const end = Date.parse(measurementEnd);
  const byIndex = new Map();
  for (const sample of samples) {
    const timestamp = Date.parse(sample?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end) continue;
    const slotIndex = Math.floor((timestamp - start) / intervalMs);
    const candidate = {
      ...sample,
      slotIndex,
      observationSlotIndex: sample?.slotIndex,
    };
    const previous = byIndex.get(slotIndex);
    if (!previous || (previous.status !== "success" && candidate.status === "success")) byIndex.set(slotIndex, candidate);
  }
  return [...byIndex.values()].sort((left, right) => left.slotIndex - right.slotIndex);
}

function createMeasurementObservation({ intervalMs, clock = () => new Date().toISOString(), captureStart, captureSample, captureEnd, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("observation intervalMs must be positive");
  if (typeof captureStart !== "function" || typeof captureEnd !== "function") throw new Error("measurement observation capture functions are required");
  let started;
  let sampler;
  let samples = [];
  let inFlight = null;
  let nextSlotIndex = 0;
  return {
    async start(plan) {
      const measurementStart = clock();
      started = { measurementStart, capture: await captureStart(plan, measurementStart) || {} };
      samples = [];
      if (typeof captureSample === "function") {
        const collect = async () => {
          const slotIndex = nextSlotIndex++;
          const slotTimestamp = new Date(Date.parse(measurementStart) + slotIndex * intervalMs).toISOString();
          if (inFlight) {
            samples.push({ slotIndex, timestamp: slotTimestamp, status: "missing", reason: "previous sample still in flight" });
            return;
          }
          inFlight = (async () => {
            try {
              samples.push({ slotIndex, timestamp: slotTimestamp, status: "success", value: await captureSample(plan, { measurementStart, slotIndex, slotTimestamp }) });
            } catch (error) {
              samples.push({ slotIndex, timestamp: slotTimestamp, status: "error", error: error.message });
            }
          })();
          try { await inFlight; } finally { inFlight = null; }
        };
        await collect();
        sampler = setIntervalFn(() => { void collect(); }, intervalMs);
      }
      writeArtifact(plan.resultDirectory, "measurement-observation.raw.json", { measurementStart, start: started.capture });
      return started;
    },
    async finalize(plan, measurementOutput) {
      if (!started) throw new Error("measurement observation was not initialized");
      const observationEnd = clock();
      if (sampler) { clearIntervalFn(sampler); sampler = undefined; }
      if (inFlight) await inFlight;
      const measurementWindow = declaredMeasurementWindow(measurementOutput, started.measurementStart, observationEnd);
      const observationSamples = samples;
      samples = materializeSlots(
        rebaseSamples(observationSamples, measurementWindow.start, measurementWindow.end, intervalMs),
        measurementWindow.start,
        measurementWindow.end,
        intervalMs,
      );
      let end;
      try {
        end = await captureEnd(plan, {
          measurementStart: measurementWindow.start,
          measurementEnd: measurementWindow.end,
          observationWindow: { start: started.measurementStart, end: observationEnd },
          measurementOutput,
          samples,
        }) || {};
      } catch (error) {
        writeArtifact(plan.resultDirectory, "measurement-observation.error.json", {
          measurementStart: measurementWindow.start,
          measurementEnd: measurementWindow.end,
          observationWindow: { start: started.measurementStart, end: observationEnd },
          error: error.message,
        });
        throw error;
      }
      const raw = mergeCapture(started.capture, end);
      const evidence = collectMeasurementEvidence({
        topology: plan.topology || { backendUpstreamMembership: plan.backendUpstreamMembership },
        resource: { measurementStart: measurementWindow.start, measurementEnd: measurementWindow.end, intervalMs, ...(raw.resource || {}) },
        histogram: raw.histogram,
        loadGenerator: raw.loadGenerator,
        activeSocketGauge: raw.activeSocketGauge,
        replicaAttribution: raw.replicaAttribution,
        claimEvidence: raw.claimEvidence,
        qualificationFlags: raw.qualificationFlags,
      });
      writeArtifact(plan.resultDirectory, "measurement-observation-final.raw.json", {
        measurementStart: measurementWindow.start,
        measurementEnd: measurementWindow.end,
        measurementWindow,
        observationWindow: { start: started.measurementStart, end: observationEnd },
        observationSamples,
        samples,
        ...raw,
      });
      writeArtifact(plan.resultDirectory, "measurement-observation.json", evidence);
      return evidence;
    },
  };
}

module.exports = { createMeasurementObservation, declaredMeasurementWindow, materializeSlots, rebaseSamples };
