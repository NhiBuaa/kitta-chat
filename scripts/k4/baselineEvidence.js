const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { approvedWorkloadProfile } = require("./workloadProfiles");
const { validateRunLifecycleEvidence } = require("./preflight");
const { crossReplicaAttribution, socketAttribution, ATTRIBUTION_SCHEMA } = require("./measurementAttribution");
const { requiredContainersForTopology } = require("./measurementCollectors");

const BASELINE_DOMAINS = Object.freeze([
  Object.freeze({ domain: "sidebar", label: "Sidebar latency", scenario: "sidebar", profileName: "sidebar:2" }),
  Object.freeze({ domain: "message", label: "Message persistence and recipient delivery", scenario: "message", profileName: "message:2" }),
  Object.freeze({ domain: "socket-concurrency", label: "Socket.IO concurrency", scenario: "socket-concurrency", profileName: "socket-concurrency:2" }),
]);
const BASELINE_TOPOLOGIES = Object.freeze(["single-replica", "multi-replica"]);
const BASELINE_MATRIX = Object.freeze(BASELINE_DOMAINS.flatMap((domain) => BASELINE_TOPOLOGIES.map((topology) => Object.freeze({
  cellId: `${domain.domain}:${topology}`,
  domain: domain.domain,
  label: domain.label,
  scenario: domain.scenario,
  profileName: domain.profileName,
  topology,
  required: true,
}))));
const PHASES = Object.freeze(["setup/seed", "warm-up", "measurement", "teardown"]);
const OUTCOMES = Object.freeze(["MEASURED", "FAILED_SETUP", "NOT_RUN"]);
const QUALIFICATION_FLAGS = Object.freeze([
  "TARGET_NOT_REACHED",
  "TOPOLOGY_NOT_EXERCISED",
  "OBSERVATION_INCOMPLETE",
  "LOAD_GENERATOR_LIMITED",
]);
const TOPOLOGY_FIELDS = Object.freeze([
  { label: "commit", paths: ["commit", "commitSha", "commit_sha", "provenance.commit", "provenance.commitSha"] },
  { label: "hardware", paths: ["hardware", "hardwareLimits", "testMachine", "provenance.hardware", "provenance.hardwareLimits"] },
  { label: "runner placement", paths: ["runnerPlacement", "testRunnerPlacement", "provenance.runnerPlacement", "configuration.runnerPlacement", "configuration.runner"] },
  { label: "non-topology runtime configuration", paths: ["nonTopologyConfiguration", "nonTreatmentConfiguration", "runtimeConfiguration", "configuration", "provenance.nonTopologyConfiguration"] },
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    if (Buffer.isBuffer(value)) return value.toString("base64");
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(stable(value)));
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function profileDigestValue(value) {
  const text = String(value || "");
  const prefixed = text.match(/^sha256:([a-f0-9]{64})$/i);
  if (prefixed) return prefixed[1].toLowerCase();
  return /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : text;
}

function sameProfileDigest(left, right) {
  return profileDigestValue(left) === profileDigestValue(right);
}

function logicalReplicaMembership(values, projectName) {
  if (!Array.isArray(values)) return [];
  const prefix = projectName ? `${String(projectName)}-` : null;
  return values.map((value) => {
    const text = String(value);
    if (/^backend-\d+$/.test(text)) return text;
    if (prefix && text.startsWith(prefix)) {
      const suffix = text.slice(prefix.length);
      if (/^backend-\d+$/.test(suffix)) return suffix;
    }
    return text;
  });
}

function valueAt(value, paths) {
  for (const path of paths) {
    const result = path.split(".").reduce((current, key) => current?.[key], value);
    if (result !== undefined && result !== null) return result;
  }
  return undefined;
}

function profileEvidence(domain, profileResolver = approvedWorkloadProfile) {
  const resolved = profileResolver(domain.scenario, 2);
  const representation = resolved.representation || (resolved.bytes && Buffer.from(resolved.bytes).toString("utf8"));
  const profileDigest = resolved.digest && String(resolved.digest).startsWith("sha256:") ? resolved.digest : `sha256:${resolved.digest || digest(representation).slice(7)}`;
  return {
    name: domain.profileName,
    scenario: domain.scenario,
    version: 2,
    digest: profileDigest,
    bytes: representation,
    representation,
    snapshot: resolved.snapshot,
  };
}

function createBaselineMatrix({ runIdPrefix = "k4-issue89", profileResolver = approvedWorkloadProfile, dataset, provenance = {}, attemptFactory } = {}) {
  const prefix = String(runIdPrefix || "k4-issue89");
  return BASELINE_MATRIX.map((cell, index) => {
    const profile = profileEvidence(cell, profileResolver);
    const attemptId = attemptFactory ? attemptFactory(cell, index) : `${prefix}-${cell.domain}-${cell.topology}`;
    return {
      ...cell,
      attemptId: String(attemptId),
      profile,
      profileDigest: profile.digest,
      workload: {
        scenario: cell.scenario,
        version: profile.version,
        identity: cell.profileName,
        digest: profile.digest,
        snapshot: profile.snapshot,
      },
      workloadIdentity: cell.profileName,
      workloadDigest: profile.digest,
      topologyEvidence: expectedTopologyEvidence(cell.topology),
      ...(dataset ? { dataset: stable(dataset) } : {}),
      ...(Object.keys(provenance).length ? { provenance: stable(provenance) } : {}),
    };
  });
}

function canonicalOutcome(record) {
  const value = record?.outcome || record?.execution_outcome || record?.executionOutcome;
  if (value === "MEASURED" && record?.phases?.["setup/seed"] && !deterministicDatasetEvidence(record).valid) return "FAILED_SETUP";
  if (OUTCOMES.includes(value)) return value;
  if (record?.failure?.phase === "setup/seed" || record?.failure?.phase === "warm-up") return "FAILED_SETUP";
  if (record?.phases?.measurement?.completed === true) return "MEASURED";
  return "NOT_RUN";
}

function exactEvidence(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function canonicalRetainedRecord(input = {}) {
  const resultDirectory = input.resultDirectory || input?.artifacts?.resultDirectory || input?.artifactEvidence?.resultDirectory;
  if (!resultDirectory) return input;
  const diagnostics = [...(input?._canonicalDiagnostics || [])];
  try {
    const { loadCanonicalRetainedRun } = require("./runArtifacts");
    const retained = loadCanonicalRetainedRun({ resultDirectory, expectedRunId: input.attemptId || input.attempt_id });
    const { manifest, runStatus, marker } = retained;
    const workload = manifest.workload || {};
    const topology = manifest.topology || {};
    const scenario = workload.scenario;
    const topologyProfile = topology.profile || manifest.plan?.profile;
    const topologyEvidence = {
      replicaCount: topology.backendReplicaCount,
      upstreamMembership: topology.backendUpstreamMembership,
      backendReplicaCount: topology.backendReplicaCount,
      backendUpstreamMembership: topology.backendUpstreamMembership,
    };
    const provenance = {
      commit: manifest.commitSha,
      hardware: manifest.testMachine,
      runnerPlacement: manifest.configuration?.runnerPlacement || manifest.configuration?.runner?.placement || manifest.configuration?.runner,
      nonTopologyConfiguration: manifest.configuration,
    };
    const dataset = manifest.dataset ? { ...manifest.dataset, digest: manifest.dataset.digest || manifest.dataset.fingerprint } : manifest.dataset;
    const expectedClaimEligibility = runStatus.phases?.measurement?.output?.claimEligibility
      || runStatus.phases?.measurement?.output?.observation?.claimEligibility;
    const suppliedTopology = input.topologyEvidence || input.topologyDetails;
    const comparableTopology = suppliedTopology && {
      replicaCount: suppliedTopology.replicaCount ?? suppliedTopology.backendReplicaCount,
      upstreamMembership: suppliedTopology.upstreamMembership ?? suppliedTopology.backendUpstreamMembership,
    };
    const comparisons = [
      ["phases", input.phases, runStatus.phases],
      ["topology evidence", comparableTopology, { replicaCount: topologyEvidence.replicaCount, upstreamMembership: topologyEvidence.upstreamMembership }],
      ["provenance", input.provenance, provenance],
      ["manifest", input.manifest || input.runManifest, manifest],
      ["completion marker", input.marker || input.completionMarker, marker],
      ["source inventory", input.sourceInventory || input.source_inventory, retained.sourceInventory],
      ["bundle inventory", input.bundle || input.bundleInventory, retained.bundleInventory],
      ["claim eligibility", input.claimEligibility || input.claim_eligibility, expectedClaimEligibility],
    ];
    for (const [label, supplied, canonical] of comparisons) {
      if (supplied !== undefined && !exactEvidence(supplied, canonical)) diagnostics.push(`in-memory ${label} overlay does not match the canonical retained run`);
    }
    const suppliedSourceDigest = sourceDigestFor(input);
    const suppliedBundleDigest = bundleDigestFor(input);
    if (suppliedSourceDigest && suppliedSourceDigest !== retained.sourceInventorySha256) diagnostics.push("in-memory source inventory digest does not match the canonical retained run");
    if (suppliedBundleDigest && suppliedBundleDigest !== retained.bundleInventorySha256) diagnostics.push("in-memory bundle inventory digest does not match the canonical retained run");
    return {
      cellId: input.cellId || input.cell?.cellId || (scenario && topologyProfile ? `${scenario}:${topologyProfile}` : undefined),
      domain: input.domain || scenario,
      scenario,
      label: input.label,
      required: input.required,
      attemptId: retained.runId,
      outcome: marker.execution_outcome,
      artifact_status: marker.artifact_status,
      execution_outcome: marker.execution_outcome,
      qualification_flags: marker.qualification_flags,
      topology: topologyProfile,
      topologyEvidence,
      profile: {
        name: `${scenario}:${workload.version}`,
        scenario,
        version: workload.version,
        digest: workload.digest,
        bytes: workload.representation,
        representation: workload.representation,
        snapshot: workload.snapshot,
      },
      workload,
      dataset,
      provenance,
      phases: runStatus.phases,
      failure: runStatus.failure,
      reason: runStatus.reason || runStatus.phases?.measurement?.output?.reason,
      cleanup: runStatus.cleanup,
      resultDirectory: retained.resultDirectory,
      artifacts: {
        resultDirectory: retained.resultDirectory,
        sourceInventorySha256: retained.sourceInventorySha256,
        bundleInventorySha256: retained.bundleInventorySha256,
        verification: retained.verification,
      },
      artifactVerification: retained.verification,
      manifest,
      report: retained.report,
      marker,
      sourceInventory: retained.sourceInventory,
      bundle: retained.bundleInventory,
      _canonicalDiagnostics: diagnostics,
    };
  } catch (error) {
    return { ...input, _canonicalDiagnostics: [`canonical retained-run loading failed: ${error.message}`] };
  }
}

function normalizeBaselineRecord(input = {}) {
  input = canonicalRetainedRecord(input);
  const manifest = input.manifest || input.runManifest || {};
  const marker = input.marker || input.completionMarker || {};
  const artifacts = input.artifacts || input.artifactEvidence || {};
  const topologyEvidence = input.topologyEvidence || input.topologyDetails || manifest.topology;
  const workload = input.workload || manifest.workload;
  const dataset = input.dataset || manifest.dataset;
  return {
    ...input,
    cellId: input.cellId || input.cell?.cellId,
    attemptId: input.attemptId || input.attempt_id || manifest.runId || marker.runId,
    topology: input.topology || topologyEvidence?.profile || manifest.plan?.profile,
    topologyEvidence,
    profile: input.profile || {
      name: input.profileName || workload?.identity || workload?.scenario && `${workload.scenario}:${workload.version}`,
      scenario: workload?.scenario,
      version: workload?.version,
      digest: input.profileDigest || workload?.digest,
      bytes: input.profileBytes || workload?.representation,
    },
    workload,
    dataset: dataset ? { ...dataset, digest: dataset.digest || dataset.fingerprint } : dataset,
    provenance: input.provenance || {
      commit: manifest.commitSha,
      hardware: manifest.testMachine,
      runnerPlacement: manifest.configuration?.runnerPlacement || manifest.configuration?.runner?.placement || manifest.configuration?.runner || manifest.plan?.runner,
      nonTopologyConfiguration: manifest.configuration || manifest.plan,
    },
    artifact_status: input.artifact_status ?? input.artifactStatus ?? marker.artifact_status ?? manifest.artifact_status,
    execution_outcome: input.execution_outcome ?? input.executionOutcome ?? marker.execution_outcome ?? manifest.execution_outcome,
    qualification_flags: input.qualification_flags ?? input.qualificationFlags ?? marker.qualification_flags ?? manifest.qualification_flags,
    resultDirectory: input.resultDirectory || artifacts.resultDirectory || manifest.resultDirectory || manifest.result_directory,
    artifactVerification: input.artifactVerification || artifacts.verification,
  };
}

function phaseComplete(phase) {
  return phase?.started === true && phase?.completed === true;
}

function phaseTimingComplete(phase) {
  const startedAt = phase?.startedAt || phase?.started_at || phase?.start;
  const completedAt = phase?.completedAt || phase?.completed_at || phase?.endedAt || phase?.end;
  return Boolean(startedAt && completedAt);
}

function reasonFrom(record) {
  return record?.reason || record?.failure?.reason || record?.failure?.error || record?.error || record?.limitation?.reason;
}

function hasMeasurementClaim(record) {
  const output = record?.phases?.measurement?.output;
  return Boolean(record?.measurement || record?.measurementEvidence || record?.measurementWindow || record?.publishable
    || output?.numbers !== undefined || output?.measurementWindow || output?.measurementStart || output?.measurementEnd);
}

function timestampMillis(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  return typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
}

function sameInstant(left, right) {
  const leftMs = timestampMillis(left);
  const rightMs = timestampMillis(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function phaseBounds(phase) {
  const start = phase?.startedAt || phase?.started_at || phase?.start;
  const end = phase?.completedAt || phase?.completed_at || phase?.endedAt || phase?.end;
  return { start, end, startMs: timestampMillis(start), endMs: timestampMillis(end) };
}

function measurementWindowFor(record) {
  const output = record?.phases?.measurement?.output || {};
  return record?.measurementWindow
    || record?.phases?.measurement?.measurementWindow
    || record?.measurement?.window
    || output.measurementWindow
    || output.observation?.measurementWindow
    || output.observation?.resourceEvidence?.measurementWindow
    || (output.measurementStart && output.measurementEnd ? { start: output.measurementStart, end: output.measurementEnd } : undefined);
}

function deterministicDatasetEvidence(record) {
  const setupPhase = record?.phases?.["setup/seed"];
  const setupOutput = setupPhase?.output || {};
  const preflight = setupOutput.setupPreflight || setupOutput.preflight || record?.setupPreflight || {};
  const dataset = preflight.dataset || record?.dataset || {};
  const declared = dataset.declared || preflight.declaredDataset || record?.dataset?.declared;
  const observed = dataset.observed || preflight.observedDataset || record?.dataset?.observed;
  const diagnostics = [];
  const lifecycle = setupOutput.datasetLifecycle || setupOutput.volumeLifecycle || preflight.datasetLifecycle || record?.datasetLifecycle || {};
  const cleanInitialState = setupOutput.cleanInitialState === true
    || preflight.cleanInitialState === true
    || record?.cleanInitialState === true
    || lifecycle.initialState === "CLEAN"
    || lifecycle.cleanInitialState === true;
  const ownerRunId = lifecycle.ownerRunId
    || setupOutput.ownerRunId
    || preflight.ownerRunId
    || record?.datasetLifecycle?.ownerRunId;
  const runScoped = ownerRunId === record?.attemptId
    && (setupOutput.runScoped === true
      || setupOutput.runScopedVolume === true
      || preflight.runScoped === true
      || lifecycle.runScoped === true
      || lifecycle.volumeScope === "run");
  if (setupOutput.resourcesCreated !== true || !runScoped || !cleanInitialState) diagnostics.push("clean run-scoped dataset creation evidence is missing");
  if (!ownerRunId) diagnostics.push("dataset lifecycle owner run ID is missing");
  else if (ownerRunId !== record?.attemptId) diagnostics.push("dataset lifecycle owner run ID does not match the current attempt");
  if (preflight.verification?.status !== "VERIFIED") diagnostics.push("deterministic dataset seed verification is not VERIFIED");
  const lifecycleEvidence = validateRunLifecycleEvidence({
    runId: record?.attemptId,
    lifecycle: {
      ...lifecycle,
      runId: lifecycle.runId || record?.attemptId,
      ownerRunId: lifecycle.ownerRunId || ownerRunId,
      runScoped,
      cleanInitialState,
      initialState: lifecycle.initialState || (cleanInitialState ? "CLEAN" : undefined),
      verify: lifecycle.verify,
    },
  }, record?.attemptId);
  diagnostics.push(...lifecycleEvidence.diagnostics);
  const fields = ["generatorVersion", "schemaVersion", "contentSeed", "cardinalities", "fingerprint"];
  for (const field of fields) {
    if (declared?.[field] === undefined) diagnostics.push(`declared dataset ${field} is missing`);
    if (observed?.[field] === undefined) diagnostics.push(`observed dataset ${field} is missing`);
    if (declared?.[field] !== undefined && observed?.[field] !== undefined
      && JSON.stringify(stable(declared[field])) !== JSON.stringify(stable(observed[field]))) diagnostics.push(`declared and observed dataset ${field} differ`);
  }
  const datasetFingerprint = dataset.fingerprint || dataset.digest;
  if (datasetFingerprint && observed?.fingerprint && datasetFingerprint !== observed.fingerprint) diagnostics.push("dataset fingerprint does not match observed seed");
  if (dataset.size?.cardinalities && observed?.cardinalities && JSON.stringify(stable(dataset.size.cardinalities)) !== JSON.stringify(stable(observed.cardinalities))) diagnostics.push("dataset cardinalities do not match observed seed");
  return { valid: diagnostics.length === 0, diagnostics, declared, observed, preflight };
}

function phaseOrderDiagnostics(record) {
  const diagnostics = [];
  const bounds = PHASES.map((name) => ({ name, ...phaseBounds(record?.phases?.[name]) }));
  for (const phase of bounds) {
    if (!Number.isFinite(phase.startMs) || !Number.isFinite(phase.endMs)) {
      diagnostics.push(`${phase.name} timestamps are not valid ISO-8601 or epoch values`);
    } else if (phase.endMs <= phase.startMs) {
      diagnostics.push(`${phase.name} must end after it starts`);
    }
  }
  for (let index = 1; index < bounds.length; index += 1) {
    const previous = bounds[index - 1];
    const current = bounds[index];
    if (Number.isFinite(previous.endMs) && Number.isFinite(current.startMs) && current.startMs < previous.endMs) {
      diagnostics.push(`${current.name} starts before ${previous.name} ends`);
    }
  }
  const measurement = bounds.find((phase) => phase.name === "measurement");
  const window = measurementWindowFor(record);
  const windowStart = timestampMillis(window?.start);
  const windowEnd = timestampMillis(window?.end);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    diagnostics.push("measurement window timestamps are invalid or empty");
  } else if (Number.isFinite(measurement?.startMs) && Number.isFinite(measurement?.endMs)
    && (windowStart < measurement.startMs || windowEnd > measurement.endMs)) {
    diagnostics.push("measurement window must be contained within the measurement phase");
  }
  return diagnostics;
}

function observationEvidence(record) {
  const output = record?.phases?.measurement?.output || {};
  const observation = output.observation || record?.observation || record?.measurementEvidence?.observation || {};
  return {
    output,
    observation,
    claims: output.claimEvidence || observation.claimEvidence || output.claimEligibility || observation.claimEligibility || record?.claimEvidence || record?.claim_eligibility || {},
  };
}

function resourceQualificationEvidence(record) {
  const resourceEvidence = record?.phases?.measurement?.output?.observation?.resourceEvidence;
  const diagnostics = [];
  if (!resourceEvidence || typeof resourceEvidence !== "object") {
    return { valid: false, incomplete: true, resourceEvidence: null, diagnostics: ["canonical measurement resourceEvidence is missing"] };
  }
  const topology = record?.topologyEvidence || record?.topologyDetails || record?.manifest?.topology || {};
  let requiredContainers;
  try {
    requiredContainers = requiredContainersForTopology({ backendUpstreamMembership: topology.backendUpstreamMembership || topology.upstreamMembership });
  } catch (error) {
    diagnostics.push(`canonical resource coverage cannot resolve required containers: ${error.message}`);
    return { valid: false, incomplete: true, resourceEvidence, diagnostics };
  }
  const declaredContainers = Array.isArray(resourceEvidence.requiredContainers) ? resourceEvidence.requiredContainers.map(String) : [];
  if (JSON.stringify([...declaredContainers].sort()) !== JSON.stringify([...requiredContainers].sort())) diagnostics.push("canonical resource coverage required-container declaration does not match resolved topology");
  const expectedCount = Number(resourceEvidence.expectedCount);
  if (!Number.isInteger(expectedCount) || expectedCount <= 0) diagnostics.push("canonical resource coverage expectedCount is missing or invalid");
  const intervalMs = Number(resourceEvidence.intervalMs);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) diagnostics.push("canonical resource coverage intervalMs is missing or invalid");
  const measurementWindow = measurementWindowFor(record);
  const declaredWindow = resourceEvidence.measurementWindow;
  if (!declaredWindow || !sameInstant(declaredWindow.start, measurementWindow?.start) || !sameInstant(declaredWindow.end, measurementWindow?.end) || declaredWindow.boundary !== "[measurement_start, measurement_end)") {
    diagnostics.push("canonical resource coverage measurement window is not bound to the declared half-open measurement window");
  }
  const windowStart = timestampMillis(measurementWindow?.start);
  const windowEnd = timestampMillis(measurementWindow?.end);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    diagnostics.push("canonical resource coverage measurement window timestamps are invalid");
  } else if (Number.isFinite(intervalMs) && intervalMs > 0 && Number.isInteger(expectedCount) && expectedCount > 0) {
    const derivedExpectedCount = Math.ceil((windowEnd - windowStart) / intervalMs);
    if (expectedCount !== derivedExpectedCount) diagnostics.push(`canonical resource coverage expectedCount ${expectedCount} does not match cadence-derived count ${derivedExpectedCount}`);
  }
  const byContainer = resourceEvidence.byContainer;
  if (!byContainer || typeof byContainer !== "object") diagnostics.push("canonical resource coverage byContainer declaration is missing");
  else {
    for (const container of requiredContainers) {
      const entry = byContainer[container];
      const counts = entry?.counts;
      if (!entry || !counts) {
        diagnostics.push(`canonical resource coverage is missing container ${container}`);
        continue;
      }
      const successful = Number(counts.successful);
      const errors = Number(counts.error);
      const missing = Number(counts.missing);
      const declaredExpected = Number(counts.expected);
      if (![successful, errors, missing, declaredExpected].every(Number.isInteger) || [successful, errors, missing, declaredExpected].some((value) => value < 0) || declaredExpected !== expectedCount || successful + errors + missing !== expectedCount) {
        diagnostics.push(`canonical resource coverage counts are invalid for ${container}`);
        continue;
      }
      const coverage = Number(entry.coverage);
      const sufficient = entry.sufficient === true;
      if (!Number.isFinite(coverage) || coverage !== successful / expectedCount || sufficient !== (successful >= 1 && coverage >= 0.90)) diagnostics.push(`canonical resource coverage declaration is invalid for ${container}`);
      if (successful < 1 || coverage < 0.90) diagnostics.push(`canonical resource coverage for ${container} is below the authority minimum of 90%`);
    }
    const unexpected = Object.keys(byContainer).filter((container) => !requiredContainers.includes(container));
    if (unexpected.length) diagnostics.push(`canonical resource coverage contains unexpected containers: ${unexpected.join(", ")}`);
  }
  const declaredIncomplete = Array.isArray(resourceEvidence.qualificationFlags) && resourceEvidence.qualificationFlags.includes("OBSERVATION_INCOMPLETE");
  const observedIncomplete = diagnostics.length > 0;
  const incomplete = observedIncomplete || declaredIncomplete;
  if (observedIncomplete && !declaredIncomplete) diagnostics.push("canonical resource coverage must declare OBSERVATION_INCOMPLETE when coverage is absent or insufficient");
  if (!observedIncomplete && declaredIncomplete) diagnostics.push("canonical resource coverage declares OBSERVATION_INCOMPLETE despite sufficient coverage");
  return { valid: diagnostics.length === 0, incomplete, resourceEvidence, diagnostics };
}

function claimIsEligible(value) {
  return value === true || value?.eligible === true;
}

function attributionSourceComplete(value, record) {
  const source = value?.source;
  const expectedTopology = record?.topologyEvidence || record?.topologyDetails || {};
  const expectedMembership = Array.isArray(expectedTopology.upstreamMembership)
    ? expectedTopology.upstreamMembership.map(String).sort()
    : [];
  const sourceMembership = Array.isArray(source?.topologyMembership)
    ? source.topologyMembership.map(String).sort()
    : [];
  const workloadDigest = record?.workload?.digest || record?.profile?.digest;
  const window = measurementWindowFor(record);
  const sourceStart = timestampMillis(source?.measurementStart);
  const sourceEnd = timestampMillis(source?.measurementEnd);
  const windowStart = timestampMillis(window?.start);
  const windowEnd = timestampMillis(window?.end);
  const rawSources = Array.isArray(source?.rawSources) ? source.rawSources : [];
  const completenessFlags = ["truncated", "rotationGap", "ambiguousClock"];
  const hasExplicitCompleteness = (entry) => completenessFlags.every((field) => Object.prototype.hasOwnProperty.call(entry || {}, field)
    && typeof entry[field] === "boolean")
    && Array.isArray(entry?.coverageGaps)
    && Array.isArray(entry?.parseDiagnostics);
  const rawSourcesComplete = rawSources.length > 0 && rawSources.every((raw) => hasExplicitCompleteness(raw)
    && raw?.sourceIdentity
    && raw?.sourceDigest
    && typeof raw?.body === "string"
    && digest(raw.body) === raw.sourceDigest);
  const compositeDigest = rawSourcesComplete ? digest(rawSources.map(({ sourceDigest }) => sourceDigest).join("\n")) : null;
  const coverageGaps = source?.coverageGaps;
  const rawCoverageGaps = rawSources.flatMap((raw) => raw.coverageGaps);
  const rawParseDiagnostics = rawSources.flatMap((raw) => raw.parseDiagnostics);
  const sourceFlagsMatchRaw = hasExplicitCompleteness(source)
    && completenessFlags.every((field) => source[field] === rawSources.some((raw) => raw[field]));
  return Boolean(value?.complete === true
    && source
    && (source.schema === ATTRIBUTION_SCHEMA || source.schema === "k4-measurement-attribution-v1")
    && source.runId
    && source.sourceIdentity
    && source.sourceDigest
    && source.parserVersion
    && source.measurementStart
    && source.measurementEnd
    && source.runId === record?.attemptId
    && source.scenario === record?.scenario
    && sameProfileDigest(source.workloadDigest, workloadDigest)
    && sameProfileDigest(source.profileDigest, record?.profile?.digest || workloadDigest)
    && expectedMembership.length > 0
    && JSON.stringify(sourceMembership) === JSON.stringify(expectedMembership)
    && Number.isFinite(sourceStart)
    && Number.isFinite(sourceEnd)
    && Number.isFinite(windowStart)
    && Number.isFinite(windowEnd)
    && sourceStart <= windowStart
    && sourceEnd >= windowEnd
    && sourceEnd > sourceStart
    && Array.isArray(coverageGaps)
    && coverageGaps.length === 0
    && JSON.stringify(stable(coverageGaps)) === JSON.stringify(stable(rawCoverageGaps))
    && JSON.stringify(stable(source.parseDiagnostics)) === JSON.stringify(stable(rawParseDiagnostics))
    && sourceFlagsMatchRaw
    && rawSourcesComplete
    && source.sourceDigest === compositeDigest
    && !source.truncated
    && !source.rotationGap
    && !source.ambiguousClock
    && source.parseDiagnostics.length === 0);
}

function attributionViewComplete(value, record) {
  if (!attributionSourceComplete(value, record)) return false;
  const scenario = record?.scenario;
  if (scenario === "sidebar") {
    if (!Array.isArray(value.supportingRecords) || value.supportingRecords.length === 0) return false;
    const output = observationEvidence(record).output;
    const measuredRequestIds = new Set((output.measuredRequestIds || []).map(String));
    const supportingRequestIds = value.supportingRecords.map((row) => String(row?.requestId || ""));
    const supportingRequestIdSet = new Set(supportingRequestIds);
    if (supportingRequestIds.some((requestId) => !requestId)
      || supportingRequestIdSet.size !== supportingRequestIds.length
      || supportingRequestIdSet.size !== measuredRequestIds.size
      || [...supportingRequestIdSet].some((requestId) => !measuredRequestIds.has(requestId))) return false;
    const measuredActors = new Set((output.measuredActors || []).map(String));
    const window = measurementWindowFor(record);
    const start = timestampMillis(window?.start);
    const end = timestampMillis(window?.end);
    return value.supportingRecords.every((row) => {
      if (!row || !row.requestId || !measuredRequestIds.has(String(row.requestId))) return false;
      if (!row.nodeName && !row.replica && !row.upstreamAddr) return false;
      const accessTimestamp = timestampMillis(row.timestamp);
      const wrapperTimestamp = timestampMillis(row.wrapperTimestamp);
      const timestamp = Number.isFinite(accessTimestamp) && accessTimestamp >= start && accessTimestamp < end
        ? accessTimestamp
        : (Number.isFinite(wrapperTimestamp) ? wrapperTimestamp : timestampMillis(row.startedAt || row.authenticatedAt));
      if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end) return false;
      if (row.actorRef && measuredActors.size && !measuredActors.has(String(row.actorRef))) return false;
      return true;
    });
  }
  if (scenario === "socket-concurrency") {
    const output = observationEvidence(record).output;
    const window = measurementWindowFor(record);
    const derived = socketAttribution({
      lifecycles: value.supportingRecords,
      measuredActors: output.measuredActors,
      measuredConnections: output.measuredConnections,
      metadata: value.source,
      measurementStart: window?.start,
      measurementEnd: window?.end,
    });
    const expectedMembership = new Set((record?.topologyEvidence?.upstreamMembership || []).map(String));
    return derived.complete === true
      && derived.supportingRecords.length > 0
      && derived.replicas.every((replica) => expectedMembership.has(String(replica)));
  }
  if (scenario === "message") {
    const output = observationEvidence(record).output;
    const window = measurementWindowFor(record);
    const start = timestampMillis(window?.start);
    const end = timestampMillis(window?.end);
    return Array.isArray(value.correlations)
      && value.correlations.length > 0
      && value.correlations.every((row) => {
        if (row?.schema !== ATTRIBUTION_SCHEMA || !attributionSourceComplete(row, record) || !row?.eventChain) return false;
        const records = [row.eventChain.sender, row.eventChain.acknowledgement, row.eventChain.receiver, row.eventChain.delivery];
        if (records.some((event) => {
          const timestamp = timestampMillis(event?.timestamp || event?.emittedAt || event?.acknowledgedAt || event?.receivedAt || event?.deliveredAt);
          return !Number.isFinite(timestamp) || timestamp < start || timestamp >= end;
        })) return false;
        const strict = crossReplicaAttribution({
          sender: row.eventChain.sender,
          acknowledgement: row.eventChain.acknowledgement,
          receiver: row.eventChain.receiver,
          delivery: row.eventChain.delivery,
          measuredActors: output.measuredActors,
          metadata: row.source || value.source,
        });
        return strict.complete === true && strict.deliveryEligible === true;
      });
  }
  return false;
}

function replicaExerciseEvidence(record) {
  const { output, observation } = observationEvidence(record);
  const rootAttribution = observation.replicaAttribution || record?.replicaAttribution || {};
  const attributionViews = [rootAttribution, rootAttribution.after, rootAttribution.before]
    .filter((value) => value && typeof value === "object")
    .filter((value) => attributionViewComplete(value, record));
  const correlationRows = attributionViews.flatMap((value) => Array.isArray(value.correlations) ? value.correlations : []);
  const measuredRequestIds = new Set((output.measuredRequestIds || []).map(String));
  const expectedMembership = new Set((record?.topologyEvidence?.upstreamMembership || []).map(String));
  const window = measurementWindowFor(record);
  const windowStart = timestampMillis(window?.start);
  const windowEnd = timestampMillis(window?.end);
  const attributedRows = attributionViews.flatMap((value) => value.supportingRecords || []);
  const replicas = new Set([
    ...attributedRows.filter((row) => record?.scenario !== "socket-concurrency"
      || (timestampMillis(row?.authenticatedAt) < windowEnd
        && (row?.disconnectedAt == null || timestampMillis(row.disconnectedAt) > windowStart)))
      .map((row) => row?.nodeName || row?.replica),
    ...correlationRows.flatMap((row) => [row.senderReplica || row?.eventChain?.sender?.replica, row.receiverReplica || row?.eventChain?.receiver?.replica]).filter(Boolean),
  ].filter(Boolean).map(String));
  const membershipBound = replicas.size > 0 && [...replicas].every((replica) => expectedMembership.has(replica));
  const multiReplica = record?.topology === "multi-replica"
    && replicas.size >= 2
    && membershipBound
    && attributionViews.length > 0
    && (record?.scenario !== "sidebar" || attributionViews.every((view) => !Array.isArray(view.supportingRecords)
      || view.supportingRecords.every((row) => row?.requestId && measuredRequestIds.has(String(row.requestId)))));
  const crossReplicaRows = correlationRows.filter((row) => row?.senderReplica != null
    && row?.receiverReplica != null
    && String(row.senderReplica) !== String(row.receiverReplica)
    && row?.correlationId
    && row?.conversationId
    && row?.messageId
    && row.eventChain
    && row.eventChain.sender
    && row.eventChain.acknowledgement
    && row.eventChain.receiver
    && row.eventChain.delivery
    && membershipBound
    && (() => {
      const output = observationEvidence(record).output;
      const source = row.source || observation.replicaAttribution?.source;
      const measuredActors = output.measuredActors;
      const derived = crossReplicaAttribution({
        sender: row.eventChain.sender,
        acknowledgement: row.eventChain.acknowledgement,
        receiver: row.eventChain.receiver,
        delivery: row.eventChain.delivery,
        measuredActors,
        metadata: source,
      });
      return derived.claimEligible === true;
    })());
  const crossReplica = record?.scenario === "message"
    && record?.topology === "multi-replica"
    && crossReplicaRows.length > 0;
  return {
    multiReplica,
    crossReplica,
    replicas: [...replicas],
    topologyExercise: multiReplica ? "MULTI_REPLICA_EXERCISED" : null,
    crossReplicaDelivery: crossReplica ? "CROSS_REPLICA_DELIVERY_EXERCISED" : null,
  };
}

function sourceDigestFor(record) {
  return record?.source_inventory_sha256 || record?.sourceInventorySha256 || record?.artifacts?.sourceInventorySha256 || record?.artifactEvidence?.sourceInventorySha256 || record?.marker?.source_inventory_sha256 || record?.completionMarker?.source_inventory_sha256;
}

function bundleDigestFor(record) {
  return record?.bundle_inventory_sha256 || record?.bundleInventorySha256 || record?.artifacts?.bundleInventorySha256 || record?.artifactEvidence?.bundleInventorySha256 || record?.marker?.bundle_inventory_sha256 || record?.completionMarker?.bundle_inventory_sha256;
}

function retainedJson(record, name) {
  const directory = record?.resultDirectory;
  if (!directory) return undefined;
  try { return JSON.parse(fs.readFileSync(require("node:path").join(directory, name), "utf8")); } catch { return undefined; }
}

function validateMeasuredProvenance(record) {
  const diagnostics = [];
  const manifest = record?.manifest || record?.runManifest || retainedJson(record, "manifest.json");
  const report = record?.report || retainedJson(record, "report.json");
  const provenance = manifest?.provenance || record?.provenance || {};
  const effectiveRuntimeEvidence = manifest?.effectiveRuntimeEvidence;
  const commitSha = manifest?.commitSha || provenance.commit || provenance.commitSha;
  const machine = manifest?.testMachine || provenance.hardware || provenance.testMachine;
  if (provenance.status !== "COMPLETE") diagnostics.push("measured environment manifest provenance must be COMPLETE");
  if (!/^[0-9a-f]{40}$/i.test(String(commitSha || ""))) diagnostics.push("measured environment commit SHA must be a valid 40-hex value");
  for (const field of ["hostname", "cpuModel", "logicalProcessors", "memoryBytes"]) {
    const value = machine?.[field];
    if (value === undefined || value === null || value === "" || ((field === "logicalProcessors" || field === "memoryBytes") && (!Number.isFinite(Number(value)) || Number(value) <= 0))) {
      diagnostics.push(`measured test-machine ${field} provenance is unresolved`);
    }
  }
  const hardwareLimits = report?.hardwareLimits || report?.hardware_limits;
  if (!hardwareLimits || typeof hardwareLimits !== "object" || Object.keys(hardwareLimits).length === 0) diagnostics.push("measured report hardware limits are required");
  if (report && report.profileArtifact && report.profileArtifact !== "manifest.json") diagnostics.push("measured report hardware limits must link to manifest.json");
  if (hardwareLimits && machine) {
    for (const field of ["cpuModel", "logicalProcessors", "memoryBytes"]) {
      const alias = field === "cpuModel" ? ["cpuModel", "cpu"] : [field];
      const key = alias.find((candidate) => hardwareLimits[candidate] !== undefined);
      if (!key) diagnostics.push(`measured report hardware limits omit manifest ${field}`);
      else if (String(hardwareLimits[key]) !== String(machine[field])) diagnostics.push(`measured report hardware limits do not match manifest ${field}`);
    }
  }
  const toolVersions = manifest?.toolVersions || manifest?.tool_versions;
  if (!toolVersions || typeof toolVersions !== "object") diagnostics.push("measured tool version manifest is unresolved");
  else for (const field of ["node", "k6"]) if (typeof toolVersions[field] !== "string" || !toolVersions[field].trim()) diagnostics.push(`measured tool version ${field} is unresolved`);
  const resolvedTopology = manifest?.resolvedTopology || manifest?.effectiveTopology;
  const expectedTopology = record?.topologyEvidence || {};
  const projectName = manifest?.configuration?.projectName || manifest?.plan?.projectName || manifest?.runtimeConfiguration?.projectName;
  if (!effectiveRuntimeEvidence || effectiveRuntimeEvidence.status !== "ATTESTED" || effectiveRuntimeEvidence.source !== "effective-runtime-attestation") diagnostics.push("measured effective runtime provenance is unresolved");
  const runtimeEvidenceArtifact = manifest?.runtimeEvidenceArtifact;
  const sourceInventory = record?.sourceInventory || record?.source_inventory || retainedJson(record, "source-inventory.json");
  if (!runtimeEvidenceArtifact) diagnostics.push("measured effective runtime raw artifact is unresolved");
  else if (!sourceInventory?.entries?.some((entry) => entry.path === runtimeEvidenceArtifact)) diagnostics.push("measured effective runtime raw artifact is not source-inventoried");
  else if (effectiveRuntimeEvidence?.artifactSha256 && record?.resultDirectory) {
    try {
      const bytes = fs.readFileSync(path.join(record.resultDirectory, runtimeEvidenceArtifact));
      const digest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
      if (digest !== effectiveRuntimeEvidence.artifactSha256) diagnostics.push("measured effective runtime raw artifact digest does not match the manifest");
    } catch (error) {
      diagnostics.push(`measured effective runtime raw artifact is unreadable: ${error.message}`);
    }
  }
  if (!resolvedTopology || resolvedTopology.status !== "ATTESTED" || resolvedTopology.source !== "effective-runtime-attestation") diagnostics.push("measured resolved topology attestation is unresolved");
  else {
    if (Number(resolvedTopology.backendReplicaCount) !== Number(expectedTopology.backendReplicaCount || expectedTopology.replicaCount)) diagnostics.push("measured resolved topology replica count does not match the retained topology");
    const resolvedMembership = logicalReplicaMembership(resolvedTopology.backendUpstreamMembership || [], projectName).sort();
    const expectedMembership = logicalReplicaMembership(expectedTopology.backendUpstreamMembership || expectedTopology.upstreamMembership || [], projectName).sort();
    if (JSON.stringify(resolvedMembership) !== JSON.stringify(expectedMembership)) diagnostics.push("measured resolved topology membership does not match the retained topology");
  }
  const dependencyTopology = manifest?.dependencyTopology;
  if (!dependencyTopology || typeof dependencyTopology !== "object" || Object.keys(dependencyTopology).length === 0) diagnostics.push("measured dependency topology is unresolved");
  const runnerPlacement = manifest?.runnerPlacement || manifest?.configuration?.runnerPlacement;
  if (!runnerPlacement || (typeof runnerPlacement === "object" && Object.keys(runnerPlacement).length === 0)) diagnostics.push("measured runner placement is unresolved");
  const runtimeConfiguration = manifest?.runtimeConfiguration;
  if (!runtimeConfiguration || typeof runtimeConfiguration !== "object" || Object.keys(runtimeConfiguration).length === 0) diagnostics.push("measured runtime configuration is unresolved");
  const observerBoundary = manifest?.observerBoundary;
  if (!observerBoundary || typeof observerBoundary !== "object" || observerBoundary.status !== "ATTESTED" || observerBoundary.source !== "effective-runtime-attestation") diagnostics.push("measured observer boundary is unresolved");
  else {
    for (const field of ["observerIdentity", "helperIdentity", "helperPolicyVersion", "helperSchemaVersion"]) if (typeof observerBoundary[field] !== "string" || !observerBoundary[field].trim()) diagnostics.push(`measured observer boundary ${field} is unresolved`);
    const networks = observerBoundary.observationNetworkMembership;
    if (!networks?.observer?.length || !networks?.helper?.length || !networks?.runner?.length) diagnostics.push("measured observer boundary network membership is unresolved");
    if (Array.isArray(networks?.runner) && networks.runner.some((network) => networks.observer.includes(network) || networks.helper.includes(network))) diagnostics.push("measured observer boundary runner network overlaps observation network");
    if (!Array.isArray(observerBoundary.deniedOperationDiagnostics) || observerBoundary.deniedOperationDiagnostics.length === 0 || observerBoundary.deniedOperationDiagnostics.some((entry) => entry?.status !== "DENIED" || typeof entry?.source !== "string" || !entry.source)) diagnostics.push("measured observer denied-operation diagnostics are unresolved");
    const inspection = observerBoundary.effectiveInspection;
    for (const role of ["runner", "observer", "helper"]) {
      if (!inspection?.[role]?.containerId || !Array.isArray(inspection[role].mountTargets) || !Array.isArray(inspection[role].environmentKeys)) diagnostics.push(`measured observer effective ${role} inspection is unresolved`);
    }
    const access = observerBoundary.runnerAccess;
    if (!access || access.helper !== false || access.helperCredential !== false || access.dockerSocket !== false || access.dockerApi !== false || access.backend !== false) diagnostics.push("measured observer boundary does not prove runner isolation");
  }
  return diagnostics;
}

function validateArtifactBoundary(record) {
  const diagnostics = [];
  const artifacts = record?.artifacts || record?.artifactEvidence || {};
  const marker = record?.marker || record?.completionMarker || artifacts.marker;
  const bundle = record?.bundle || record?.bundleInventory || artifacts.bundle;
  const source = record?.sourceInventory || record?.source_inventory || artifacts.sourceInventory;
  const sourceDigest = record?.source_inventory_sha256 || record?.sourceInventorySha256 || artifacts.sourceInventorySha256;
  const bundleDigest = record?.bundle_inventory_sha256 || record?.bundleInventorySha256 || artifacts.bundleInventorySha256;
  if (!sourceDigest) diagnostics.push("source inventory digest is missing");
  if (!bundleDigest) diagnostics.push("bundle inventory digest is missing");
  if (!marker || typeof marker !== "object") diagnostics.push("completion marker evidence is missing");
  else {
    for (const field of ["artifact_status", "execution_outcome", "qualification_flags", "source_inventory_sha256", "bundle_inventory_sha256"]) if (marker[field] === undefined) diagnostics.push(`completion marker field is missing: ${field}`);
    if (marker.source_inventory_sha256 !== sourceDigest) diagnostics.push("completion marker source inventory digest is not linked");
    if (marker.bundle_inventory_sha256 !== bundleDigest) diagnostics.push("completion marker bundle inventory digest is not linked");
    const artifactAxis = record?.artifact_status ?? record?.artifactStatus;
    const executionAxis = record?.execution_outcome ?? record?.executionOutcome;
    const flags = record?.qualification_flags ?? record?.qualificationFlags;
    if (artifactAxis !== undefined && marker.artifact_status !== artifactAxis) diagnostics.push("completion marker artifact status does not match the retained run");
    if (executionAxis !== undefined && marker.execution_outcome !== executionAxis) diagnostics.push("completion marker execution outcome does not match the retained run");
    if (Array.isArray(flags) && JSON.stringify([...new Set(flags)].sort()) !== JSON.stringify([...new Set(marker.qualification_flags || [])].sort())) diagnostics.push("completion marker qualification flags do not match the retained run");
  }
  if (!bundle || !Array.isArray(bundle.entries)) diagnostics.push("bundle inventory evidence is missing");
  else {
    if (bundle.entries.some((entry) => ["bundle-inventory.json", "COMPLETED"].includes(entry.path))) diagnostics.push("bundle inventory must exclude itself and the non-inventoried completion marker");
    if (bundle.source_inventory_sha256 !== undefined && bundle.source_inventory_sha256 !== sourceDigest) diagnostics.push("bundle inventory source digest is not linked");
  }
  if (!source || !Array.isArray(source.entries)) diagnostics.push("source inventory evidence is missing");
  else if (source.entries.some((entry) => ["source-inventory.json", "bundle-inventory.json", "COMPLETED"].includes(entry.path))) diagnostics.push("source inventory must exclude inventories and the completion marker");
  const expectedRunId = record?.attemptId || marker?.runId;
  if (expectedRunId && !marker?.runId) diagnostics.push("completion marker run ID is required");
  if (expectedRunId && marker?.runId && String(marker.runId) !== String(expectedRunId)) diagnostics.push("completion marker run ID does not match the retained attempt");
  if (expectedRunId && source && !source.runId) diagnostics.push("source inventory run ID is required");
  if (expectedRunId && source?.runId && String(source.runId) !== String(expectedRunId)) diagnostics.push("source inventory run ID does not match the retained attempt");
  if (expectedRunId && bundle && !bundle.runId) diagnostics.push("bundle inventory run ID is required");
  if (expectedRunId && bundle?.runId && String(bundle.runId) !== String(expectedRunId)) diagnostics.push("bundle inventory run ID does not match the retained attempt");
  const resultDirectory = record?.resultDirectory || artifacts?.resultDirectory;
  if (resultDirectory) {
    try {
      const { validateRunArtifacts } = require("./runArtifacts");
      const outcome = canonicalOutcome(record);
      const verification = validateRunArtifacts({ resultDirectory, expectedRunId, reportPath: record?.reportPath || "report.json", requireReport: outcome === "MEASURED", allowIncomplete: outcome !== "MEASURED" });
      const validCompleted = ["VERIFIED", "PUBLISHABLE"].includes(verification?.status);
      const validIncomplete = outcome !== "MEASURED" && verification?.status === "INCOMPLETE" && verification?.incompleteVerified === true;
      if (!verification || (!validCompleted && !validIncomplete)) diagnostics.push("canonical artifact verification did not pass");
    } catch (error) {
      diagnostics.push(`canonical artifact verification failed: ${error.message}`);
    }
  } else if (canonicalOutcome(record) === "MEASURED") {
    diagnostics.push("canonical result directory artifact verification is required");
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function validateBaselineCell(record) {
  record = normalizeBaselineRecord(record);
  const diagnostics = [...(record?._canonicalDiagnostics || [])];
  const outcome = canonicalOutcome(record);
  const datasetEvidence = record?.phases?.["setup/seed"] ? deterministicDatasetEvidence(record) : null;
  if (!record?.cellId) diagnostics.push("cell identity is required");
  if (!record?.attemptId) diagnostics.push("attempt identity is required");
  if (!record?.topology || !BASELINE_TOPOLOGIES.includes(record.topology)) diagnostics.push("approved topology is required");
  if (!record?.profile?.digest) diagnostics.push("resolved profile digest is required");
  if (!record?.workload?.digest) diagnostics.push("workload identity/digest is required");

  const artifactAxis = record?.artifact_status ?? record?.artifactStatus;
  const executionAxis = record?.execution_outcome ?? record?.executionOutcome;
  const flags = record?.qualification_flags ?? record?.qualificationFlags;
  if (artifactAxis === undefined) diagnostics.push("artifact_status axis is required");
  if (executionAxis === undefined) diagnostics.push("execution_outcome axis is required");
  if (!Array.isArray(flags)) diagnostics.push("qualification_flags axis is required");
  else for (const flag of flags) if (!QUALIFICATION_FLAGS.includes(flag)) diagnostics.push(`unknown qualification flag: ${flag}`);
  if (outcome !== "NOT_RUN") for (const field of TOPOLOGY_FIELDS) if (topologyValue(record, field) === undefined) diagnostics.push(`${field.label} provenance is required`);

  if (!OUTCOMES.includes(outcome)) diagnostics.push("outcome must be MEASURED, FAILED_SETUP, or NOT_RUN");
  let measuredProvenanceDiagnostics = [];
  if (outcome === "MEASURED") {
    if (!record?.dataset?.identity && !record?.dataset?.fingerprint) diagnostics.push("dataset identity is required");
    if (!record?.dataset?.size || typeof record.dataset.size !== "object") diagnostics.push("dataset size is required");
    if (!record?.dataset?.digest && !record?.dataset?.fingerprint) diagnostics.push("dataset digest is required");
    if (artifactAxis !== undefined && artifactAxis !== "COMPLETED") diagnostics.push("MEASURED run artifact status is not COMPLETED");
    if (executionAxis !== undefined && executionAxis !== "MEASURED") diagnostics.push("MEASURED run execution outcome is not MEASURED");
    for (const phase of PHASES) {
      if (!phaseComplete(record.phases?.[phase])) diagnostics.push(`MEASURED run is missing completed ${phase}`);
      else if (!phaseTimingComplete(record.phases?.[phase])) diagnostics.push(`MEASURED run is missing timestamps for ${phase}`);
    }
    const window = measurementWindowFor(record);
    if (!window?.start || !window?.end) diagnostics.push("MEASURED run requires a measurement window");
    if (!record.measurement && !record.phases?.measurement?.output && !record.measurementEvidence) diagnostics.push("MEASURED run requires measurement evidence");
    diagnostics.push(...deterministicDatasetEvidence(record).diagnostics);
    diagnostics.push(...phaseOrderDiagnostics(record));
    diagnostics.push(...validateArtifactBoundary(record).diagnostics);
    measuredProvenanceDiagnostics = validateMeasuredProvenance(record);
    diagnostics.push(...measuredProvenanceDiagnostics);
  }
  if (outcome === "FAILED_SETUP") {
    if (datasetEvidence && record?.phases?.["setup/seed"]?.output?.setupPreflight?.verification?.status === "VERIFIED" && datasetEvidence.diagnostics.length) diagnostics.push(...datasetEvidence.diagnostics);
    if (executionAxis !== undefined && executionAxis !== "FAILED_SETUP") diagnostics.push("FAILED_SETUP execution outcome axis is inconsistent");
    if (artifactAxis !== undefined && artifactAxis !== "INCOMPLETE") diagnostics.push("FAILED_SETUP artifact status must be INCOMPLETE");
    const phase = record.failure?.phase || record.failurePhase;
    if (!phase || !["setup/seed", "warm-up"].includes(phase)) diagnostics.push("FAILED_SETUP requires the actual setup or warm-up failure point");
    if (!reasonFrom(record)) diagnostics.push("FAILED_SETUP requires a concrete reason");
    const cleanup = record.cleanup || record.teardown;
    if (!cleanup || cleanup.attempted !== true || typeof cleanup.completed !== "boolean" || cleanup.ownershipSafe !== true) diagnostics.push("FAILED_SETUP requires retained ownership-safe cleanup evidence");
    if (hasMeasurementClaim(record)) diagnostics.push("FAILED_SETUP cannot contain a measurement claim");
    if (record?.resultDirectory || record?.artifacts || record?.artifactEvidence || record?.marker || record?.completionMarker || record?.sourceInventory || record?.bundle || record?.source_inventory_sha256 || record?.bundle_inventory_sha256) {
      diagnostics.push(...validateArtifactBoundary(record).diagnostics);
    }
  }
  if (outcome === "NOT_RUN") {
    if (executionAxis !== undefined && executionAxis !== "NOT_RUN") diagnostics.push("NOT_RUN execution outcome axis is inconsistent");
    if (!reasonFrom(record)) diagnostics.push("NOT_RUN requires a concrete unavailable reason");
    const measurementPhase = record.phases?.measurement;
    if (measurementPhase?.started === true || measurementPhase?.completed === true) diagnostics.push("NOT_RUN cannot reach the measurement phase");
    if (hasMeasurementClaim(record)) diagnostics.push("NOT_RUN cannot contain a measurement claim");
    const cleanup = record.cleanup || record.teardown;
    if (!cleanup || cleanup.attempted !== true || typeof cleanup.completed !== "boolean" || cleanup.ownershipSafe !== true) diagnostics.push("NOT_RUN requires retained ownership-safe cleanup evidence");
    if (cleanup?.noResources !== true) diagnostics.push("pre-admission NOT_RUN requires explicit noResources evidence");
  }
  return { valid: diagnostics.length === 0, outcome, diagnostics, provenanceDiagnostics: measuredProvenanceDiagnostics };
}

function topologyValue(record, field) {
  const value = valueAt(record, field.paths);
  if (field.label !== "non-topology runtime configuration" || !value || typeof value !== "object") return value;
  const rootTopologyKeys = new Set(["topology", "profile", "replicaCount", "backendReplicaCount", "backend_replica_count", "upstreamMembership", "backendUpstreamMembership", "backend_upstream_membership", "projectName", "runId", "resultDirectory", "K4_RUN_ID", "K4_PROJECT_NAME"]);
  const nestedTopologyContainers = new Set(["topology", "topologyConfig", "replicaConfig", "upstreamConfig"]);
  const nestedTopologyKeys = new Set(["replicaCount", "backendReplicaCount", "backend_replica_count", "upstreamMembership", "backendUpstreamMembership", "backend_upstream_membership"]);
  const stripTopology = (current, path = []) => {
    if (Array.isArray(current)) return current.map((child) => stripTopology(child, path));
    if (!current || typeof current !== "object") return current;
    const atRoot = path.length === 0;
    const insideTopologyContainer = path.some((segment) => nestedTopologyContainers.has(segment));
    return Object.fromEntries(Object.entries(current)
      .filter(([key]) => !(atRoot && rootTopologyKeys.has(key)) && !(insideTopologyContainer && nestedTopologyKeys.has(key)))
      .map(([key, child]) => [key, stripTopology(child, [...path, key])]));
  };
  return stripTopology(value);
}

function profilePairDiagnostics(left, right) {
  const diagnostics = [];
  if (!sameProfileDigest(left.profile?.digest, right.profile?.digest)) diagnostics.push("topology pair profile digest differs");
  if (left.profile?.bytes !== undefined && right.profile?.bytes !== undefined && left.profile.bytes !== right.profile.bytes) diagnostics.push("topology pair profile bytes differ");
  if (JSON.stringify(stable(left.workload)) !== JSON.stringify(stable(right.workload))) diagnostics.push("topology pair workload identity differs");
  const leftDataset = left.dataset || {};
  const rightDataset = right.dataset || {};
  const leftDatasetIdentity = leftDataset.identity || leftDataset.fingerprint;
  const rightDatasetIdentity = rightDataset.identity || rightDataset.fingerprint;
  if (leftDatasetIdentity !== rightDatasetIdentity) diagnostics.push("topology pair dataset identity differs");
  if (JSON.stringify(stable(leftDataset.size)) !== JSON.stringify(stable(rightDataset.size))) diagnostics.push("topology pair dataset size differs");
  if (leftDataset.digest !== rightDataset.digest) diagnostics.push("topology pair dataset digest differs");
  for (const field of TOPOLOGY_FIELDS) {
    if (JSON.stringify(stable(topologyValue(left, field))) !== JSON.stringify(stable(topologyValue(right, field)))) diagnostics.push(`topology pair ${field.label} differs`);
  }
  return diagnostics;
}

function expectedTopologyEvidence(topology) {
  return topology === "single-replica" ? { replicaCount: 1, upstreamMembership: ["backend-1"] } : { replicaCount: 3, upstreamMembership: ["backend-1", "backend-2", "backend-3"] };
}

function validateBaselineMatrix(records, { expectedMatrix = createBaselineMatrix() } = {}) {
  const list = Array.isArray(records) ? records : records?.cells;
  const diagnostics = [];
  if (!Array.isArray(list)) return { valid: false, status: "INVALID", diagnostics: ["baseline matrix records are required"], cells: [] };
  const byId = new Map();
  for (const record of list) {
    const normalized = normalizeBaselineRecord(record);
    if (!normalized?.cellId) diagnostics.push("record without cell identity");
    else if (byId.has(normalized.cellId)) diagnostics.push(`duplicate baseline cell: ${normalized.cellId}`);
    else byId.set(normalized.cellId, normalized);
  }
  const cells = expectedMatrix.map((expected) => {
    const record = byId.get(expected.cellId);
    if (!record) {
      diagnostics.push(`missing mandatory baseline cell: ${expected.cellId}`);
      return { ...expected, valid: false, outcome: "NOT_RUN", diagnostics: ["mandatory cell has no retained attempt"] };
    }
    if (record.topology !== expected.topology || record.domain !== expected.domain || record.scenario !== expected.scenario) diagnostics.push(`baseline cell identity mismatch: ${expected.cellId}`);
    if (record.profile?.name && record.profile.name !== expected.profile?.name) diagnostics.push(`${expected.cellId}: profile name does not match the approved scenario:version`);
    if (record.profile?.scenario && record.profile.scenario !== expected.scenario) diagnostics.push(`${expected.cellId}: profile scenario does not match the baseline domain`);
    if (record.profile?.version !== undefined && record.profile.version !== 2) diagnostics.push(`${expected.cellId}: profile version is not the approved v2 profile`);
    if (expected.profile?.digest && !sameProfileDigest(record.profile?.digest, expected.profile.digest)) diagnostics.push(`${expected.cellId}: profile digest does not match the approved profile bytes`);
    if (record.workload?.digest && record.profile?.digest && !sameProfileDigest(record.workload.digest, record.profile.digest)) diagnostics.push(`${expected.cellId}: workload digest does not match resolved profile digest`);
    const validation = validateBaselineCell(record);
    diagnostics.push(...validation.diagnostics.map((reason) => `${expected.cellId}: ${reason}`));
    const topology = record.topologyEvidence || record.topologyDetails;
    const expectedTopology = expectedTopologyEvidence(expected.topology);
    if (topology?.replicaCount !== undefined && topology.replicaCount !== expectedTopology.replicaCount) diagnostics.push(`${expected.cellId}: topology replica count does not match ${expected.topology}`);
    if (topology?.upstreamMembership && JSON.stringify(topology.upstreamMembership) !== JSON.stringify(expectedTopology.upstreamMembership)) diagnostics.push(`${expected.cellId}: topology upstream membership does not match ${expected.topology}`);
    return { ...record, ...validation, expectedTopology };
  });
  for (const record of byId.values()) if (!expectedMatrix.some((expected) => expected.cellId === record?.cellId)) diagnostics.push(`unexpected baseline cell: ${record?.cellId || "unknown"}`);
  for (const domain of BASELINE_DOMAINS) {
    const left = byId.get(`${domain.domain}:single-replica`);
    const right = byId.get(`${domain.domain}:multi-replica`);
    if (left && right && canonicalOutcome(left) === "MEASURED" && canonicalOutcome(right) === "MEASURED") {
      diagnostics.push(...profilePairDiagnostics(left, right).map((reason) => `${domain.domain}: ${reason}`));
    }
  }
  const valid = diagnostics.length === 0;
  return {
    valid,
    status: valid ? "VALID" : "INVALID",
    diagnostics,
    cells,
    pairs: BASELINE_DOMAINS.map((domain) => ({
      domain: domain.domain,
      singleReplica: byId.get(`${domain.domain}:single-replica`) || null,
      multiReplica: byId.get(`${domain.domain}:multi-replica`) || null,
      equivalent: Boolean(byId.get(`${domain.domain}:single-replica`) && byId.get(`${domain.domain}:multi-replica`)
        && canonicalOutcome(byId.get(`${domain.domain}:single-replica`)) === "MEASURED"
        && canonicalOutcome(byId.get(`${domain.domain}:multi-replica`)) === "MEASURED"
        && profilePairDiagnostics(byId.get(`${domain.domain}:single-replica`), byId.get(`${domain.domain}:multi-replica`)).length === 0),
    })),
  };
}

function claimEligibilityForCell(record, claim = "latency") {
  record = normalizeBaselineRecord(record);
  const outcome = canonicalOutcome(record);
  const flags = new Set(record?.qualification_flags || record?.qualificationFlags || []);
  const reasons = [];
  const lifecycle = validateBaselineCell(record);
  const exercise = replicaExerciseEvidence(record);
  const blackBoxClaim = ["latency", "persistenceHistogramDerivedLatency", "endToEndDelivery"].includes(claim);
  const lifecycleDiagnostics = blackBoxClaim && flags.has("OBSERVATION_INCOMPLETE")
    ? lifecycle.diagnostics.filter((reason) => !lifecycle.provenanceDiagnostics.includes(reason))
    : lifecycle.diagnostics;
  if (lifecycleDiagnostics.length) reasons.push(...lifecycleDiagnostics);
  if (outcome !== "MEASURED") reasons.push(`execution outcome is ${outcome}`);
  if (record?.artifact_status && record.artifact_status !== "COMPLETED") reasons.push("artifact status is not COMPLETED");
  if (["topology", "multiReplica"].includes(claim) && (!exercise.multiReplica || flags.has("TOPOLOGY_NOT_EXERCISED"))) reasons.push("MULTI_REPLICA_EXERCISED is not proven");
  if (claim === "crossReplica" && (!exercise.crossReplica || flags.has("TOPOLOGY_NOT_EXERCISED"))) reasons.push("CROSS_REPLICA_DELIVERY_EXERCISED is not proven");
  if (["target", "targetConcurrency", "throughput", "capacity", "scalable", "high-performance", "production-ready"].includes(claim) && flags.has("TARGET_NOT_REACHED")) reasons.push("TARGET_NOT_REACHED");
  if (["resource", "cpu", "memory", "bottleneck", "bottleneckSutCeiling"].includes(claim) && flags.has("OBSERVATION_INCOMPLETE")) reasons.push("OBSERVATION_INCOMPLETE");
  if (["target", "targetConcurrency", "throughput", "capacity", "bottleneck", "bottleneckSutCeiling", "sutCeiling", "scalable", "high-performance", "production-ready"].includes(claim) && flags.has("LOAD_GENERATOR_LIMITED")) reasons.push("LOAD_GENERATOR_LIMITED");
  const resourceEvidence = ["resource", "cpu", "memory", "bottleneck", "bottleneckSutCeiling"].includes(claim)
    ? resourceQualificationEvidence(record)
    : null;
  if (resourceEvidence && !resourceEvidence.valid) {
    if (!reasons.includes("OBSERVATION_INCOMPLETE")) reasons.push("OBSERVATION_INCOMPLETE");
    reasons.push(...resourceEvidence.diagnostics);
  }
  const { output, observation, claims } = observationEvidence(record);
  const observedClaims = claims || {};
  const histogram = observation.histogramEvidence || output.histogramEvidence || observation.histogram || output.histogram;
  const histogramDelta = histogram?.aggregate || (histogram?.deltas && Object.values(histogram.deltas)[0]);
  const histogramProven = Boolean(histogram && histogramDelta && Array.isArray(histogramDelta.buckets)
    && Number.isFinite(histogramDelta.count) && histogramDelta.count > 0
    && Number.isFinite(histogramDelta.sum) && histogramDelta.sum >= 0
    && (histogram.snapshots || histogram.deltas));
  const attributionEnvelope = observation.replicaAttribution;
  const attributionProven = Boolean(attributionEnvelope && [
    attributionEnvelope,
    attributionEnvelope.after,
    attributionEnvelope.before,
  ].some((view) => attributionViewComplete(view, record)));
  const deliveryProven = record?.scenario === "message"
    && attributionProven
    && Array.isArray(observation.replicaAttribution.correlations)
    && observation.replicaAttribution.correlations.every((row) => crossReplicaAttribution({
      sender: row?.eventChain?.sender,
      acknowledgement: row?.eventChain?.acknowledgement,
      receiver: row?.eventChain?.receiver,
      delivery: row?.eventChain?.delivery,
      measuredActors: output.measuredActors,
      metadata: row?.source || observation.replicaAttribution.source,
    }).deliveryEligible === true);
  const resolvedTarget = Number(output.targetConcurrency
    ?? output.activeCountEvidence?.targetConcurrency
    ?? record?.profile?.snapshot?.targetConcurrency);
  const activeAggregates = observation.activeSocketGaugeEvidence?.aggregates;
  const window = measurementWindowFor(record);
  const windowStart = timestampMillis(window?.start);
  const windowEnd = timestampMillis(window?.end);
  const plateauProven = Boolean(observation.activeSocketGaugeEvidence?.complete === true
    && Array.isArray(activeAggregates)
    && activeAggregates.length >= 2
    && Number.isFinite(resolvedTarget)
    && resolvedTarget > 0
    && activeAggregates.every((sample) => Number.isFinite(Number(sample?.activeConnections))
      && Number(sample.activeConnections) >= resolvedTarget
      && Number.isFinite(timestampMillis(sample?.timestamp))
      && timestampMillis(sample.timestamp) >= windowStart
      && timestampMillis(sample.timestamp) < windowEnd));
  if (claim === "latency") {
    if (record?.scenario === "message" && !histogramProven) reasons.push("message persistence latency requires histogram-window evidence");
    if (record?.scenario === "sidebar" && !attributionProven) reasons.push("sidebar latency requires measured request attribution");
  }
  if (claim === "persistenceHistogramDerivedLatency" && !histogramProven) reasons.push("persistence latency histogram delta is missing");
  if (claim === "endToEndDelivery" && !deliveryProven) reasons.push("recipient delivery requires sender/ack/receiver correlation evidence");
  if (claim === "targetConcurrency" && !plateauProven) reasons.push("target concurrency requires active-socket plateau evidence");
  const supplied = record?.claimEligibility?.[claim] || record?.claim_eligibility?.[claim];
  if (supplied && supplied.eligible === false) reasons.push(...(supplied.reasons || ["claim validator rejected claim"]));
  return {
    eligible: reasons.length === 0,
    reasons,
    ...(exercise.topologyExercise ? { topologyExercise: exercise.topologyExercise } : {}),
    ...(exercise.crossReplicaDelivery ? { crossReplicaDelivery: exercise.crossReplicaDelivery } : {}),
  };
}

function buildBaselineReport({ matrix, interpretationInputs = [], claimsByCell = {} } = {}) {
  const validation = validateBaselineMatrix(matrix);
  const cells = validation.cells.map((cell) => {
    const claims = claimsByCell[cell.cellId] || (cell.domain === "sidebar"
      ? ["latency", "multiReplica", "resource", "bottleneck"]
      : cell.domain === "message"
        ? ["latency", "endToEndDelivery", "crossReplica", "multiReplica", "resource", "bottleneck"]
        : ["targetConcurrency", "multiReplica", "resource", "bottleneck"]);
    const claimEligibility = Object.fromEntries(claims.map((claim) => [claim, claimEligibilityForCell(cell, claim)]));
    const outcome = canonicalOutcome(cell);
    const resourceEvidence = outcome === "MEASURED" ? resourceQualificationEvidence(cell) : null;
       const measurementOutput = cell.phases?.measurement?.output || {};
       const measurement = cell.measurement || {
         ...(measurementOutput.numbers !== undefined ? { numbers: measurementOutput.numbers } : {}),
         ...(measurementOutput.measurementWindow ? { measurementWindow: measurementOutput.measurementWindow } : {}),
         ...(measurementOutput.observation ? { observation: measurementOutput.observation } : {}),
         ...(cell.publishable?.numbers !== undefined ? { numbers: cell.publishable.numbers } : {}),
       };
    const sourceEntries = cell.sourceInventory?.entries || cell.artifacts?.sourceInventory?.entries || [];
    const provenance = {
      runId: cell.attemptId,
      source_inventory_sha256: sourceDigestFor(cell),
      bundle_inventory_sha256: bundleDigestFor(cell),
      rawArtifactDigests: sourceEntries
        .filter((entry) => entry?.path && entry.path !== "source-inventory.json")
        .map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    };
    const exercise = replicaExerciseEvidence(cell);
    return {
      cellId: cell.cellId,
      attemptId: cell.attemptId,
      domain: cell.domain,
      topology: cell.topology,
      profileDigest: cell.profile?.digest,
      workloadDigest: cell.workload?.digest,
      dataset: cell.dataset || null,
      outcome,
      artifact_status: cell.artifact_status,
       execution_outcome: outcome !== "MEASURED" ? outcome : (cell.execution_outcome || cell.executionOutcome || outcome),
      qualification_flags: [...new Set([
        ...(cell.qualification_flags || cell.qualificationFlags || []),
        ...(resourceEvidence?.incomplete ? ["OBSERVATION_INCOMPLETE"] : []),
      ])],
      limitation: outcome === "MEASURED" ? null : { reason: reasonFrom(cell), failure: cell.failure || null, cleanup: cell.cleanup || cell.teardown || null },
      claimEligibility,
       ...(measurement && Object.keys(measurement).length ? { measurement } : {}),
      provenance,
      ...(exercise.topologyExercise ? { topologyExercise: exercise.topologyExercise } : {}),
      ...(exercise.crossReplicaDelivery ? { crossReplicaDelivery: exercise.crossReplicaDelivery } : {}),
    };
  });
  const claims = cells.flatMap((cell) => Object.entries(cell.claimEligibility).map(([name, eligibility]) => ({
    cellId: cell.cellId,
    name,
    verified: Boolean(cell.valid !== false && cell.provenance.source_inventory_sha256 && cell.provenance.bundle_inventory_sha256),
    runId: cell.provenance.runId,
    source_inventory_sha256: cell.provenance.source_inventory_sha256,
    bundle_inventory_sha256: cell.provenance.bundle_inventory_sha256,
    rawArtifactDigests: cell.provenance.rawArtifactDigests,
    ...eligibility,
  })));
  return {
    schema: "k4-baseline-report-v1",
    runIds: cells.map((cell) => cell.provenance.runId).filter(Boolean),
    source_inventory_sha256: cells.map((cell) => cell.provenance.source_inventory_sha256).filter(Boolean),
    bundle_inventory_sha256: cells.map((cell) => cell.provenance.bundle_inventory_sha256).filter(Boolean),
    status: validation.valid ? "VALID" : "INVALID",
    valid: validation.valid,
    baselineMatrix: cells,
    topologyPairs: validation.pairs,
    claims,
    interpretationInputs,
    diagnostics: validation.diagnostics,
  };
}

function validatePrerequisiteFreshness({ guideRevision, evaluationRunId, evaluationStatus, implementationIdentity, sourcePaths, sourceDigests, contract, current, regression, expectedHeadCommit } = {}) {
  const reasons = [];
  if (!guideRevision) reasons.push("prerequisite guide revision is not pinned");
  if (!evaluationRunId) reasons.push("prerequisite Evaluation run identity is not pinned");
  if (evaluationStatus !== "PASSED") reasons.push("prerequisite Evaluation is not PASSED");
  if (!implementationIdentity) reasons.push("prerequisite implementation identity is not pinned");
  if (!Array.isArray(sourcePaths) || !sourcePaths.length) reasons.push("prerequisite relevant source paths are not pinned");
  if (!sourceDigests || typeof sourceDigests !== "object") reasons.push("prerequisite source digests are not pinned");
  if (!contract?.name || !contract?.digest) reasons.push("claim-eligibility/report-validator contract identity is not pinned");
  if (!current?.headCommit) reasons.push("Issue 89 HEAD identity is required");
  const lineage = current?.lineage || current?.historyScope;
  if (!lineage || lineage.status !== "VERIFIED") reasons.push("independently verified Issue 89 lineage is required");
  if (lineage && (!lineage.mergeBase || !lineage.head || lineage.mergeBase === lineage.head)) reasons.push("Issue 89 merge-base/head range is invalid");
  if (lineage && lineage.head !== current?.headCommit) reasons.push("Issue 89 lineage head does not match the current HEAD");
  if (expectedHeadCommit && current?.headCommit !== expectedHeadCommit) reasons.push("current HEAD does not match the pinned Issue 89 HEAD");
  if (lineage && (!Array.isArray(lineage.commits) || lineage.commits.length === 0)) reasons.push("Issue 89 lineage commit inventory is empty");
  if (lineage && (!Array.isArray(lineage.changedPaths) || lineage.changedPaths.length === 0)) reasons.push("Issue 89 lineage changed-path inventory is empty");
  if (lineage?.commits && lineage.commits.some((commit) => !commit?.sha)) reasons.push("Issue 89 lineage contains a commit without a SHA");
  const changedPaths = Array.isArray(current?.changedPaths) ? current.changedPaths : [];
  const relevantPaths = new Set([...(sourcePaths || []), ...(contract.paths || [])]);
  const relevantChangedPaths = changedPaths.filter((path) => relevantPaths.has(path));
  const currentDigests = current?.sourceDigests || {};
  const missingCurrentPaths = (sourcePaths || []).filter((sourcePath) => currentDigests?.[sourcePath] === undefined);
  const changedDigestPaths = (sourcePaths || []).filter((sourcePath) => currentDigests?.[sourcePath] !== undefined && sourceDigests?.[sourcePath] !== currentDigests?.[sourcePath]);
  for (const sourcePath of missingCurrentPaths) reasons.push(`current relevant implementation path digest is missing: ${sourcePath}`);
  for (const sourcePath of changedDigestPaths) reasons.push(`relevant implementation path changed: ${sourcePath}`);
  const contractMissing = !current?.contract?.name || !current?.contract?.digest;
  const contractChanged = !contractMissing && (contract?.digest !== current.contract.digest || contract?.name !== current.contract.name);
  if (contractMissing) reasons.push("current claim-eligibility/report-validator contract identity is missing");
  else if (contractChanged) reasons.push("claim-eligibility/report-validator contract changed");
  const changed = relevantChangedPaths.length > 0 || changedDigestPaths.length > 0 || contractChanged;
  if (changed) {
    if (regression?.status !== "PASSED") reasons.push("relevant regression must pass before prerequisite evidence can be reused");
    else {
      reasons.splice(0, reasons.length, ...reasons.filter((reason) => !/^relevant implementation path changed:/.test(reason) && reason !== "claim-eligibility/report-validator contract changed"));
      reasons.push("relevant regression was rerun after lineage change");
    }
  }
  const blockingReasons = reasons.filter((reason) => !reason.startsWith("relevant regression was rerun"));
  const reusable = blockingReasons.length === 0;
  return {
    status: reusable ? (changed ? "FRESH_WITH_REGRESSION" : "FRESH") : "STALE",
    fresh: reusable,
    reusable,
    reasons,
    changed,
    relevantChangedPaths,
    pinned: { guideRevision, evaluationRunId, evaluationStatus, implementationIdentity, sourcePaths, sourceDigests, contract },
    current: current || null,
  };
}

function validatePrerequisiteEvidenceSet({ prerequisites = [], current, regressionByEvaluation = {} } = {}) {
  const checks = prerequisites.map((prerequisite) => validatePrerequisiteFreshness({
    ...prerequisite,
    current: prerequisite.current || current,
    regression: prerequisite.regression || regressionByEvaluation[prerequisite.evaluationRunId],
  }));
  const reusable = checks.length > 0 && checks.every((check) => check.reusable);
  return {
    status: reusable ? "FRESH" : "STALE",
    reusable,
    checks,
    diagnostics: checks.flatMap((check) => check.reusable ? [] : check.reasons),
  };
}

async function runBaselineMatrix({ runCell, matrix = createBaselineMatrix(), onCell, cleanupCell } = {}) {
  if (typeof runCell !== "function") throw new Error("runCell seam is required");
  const cells = [];
  for (const cell of matrix) {
    const attempt = { ...cell, attemptId: cell.attemptId || `${cell.cellId}-attempt-1` };
    let result;
    try {
      result = await runCell(attempt);
    } catch (error) {
      let cleanup = {
        attempted: false,
        completed: false,
        ownershipSafe: false,
        noResources: false,
        reason: "executor failed before cleanup evidence was available",
      };
      if (typeof cleanupCell === "function") {
        try {
          cleanup = await cleanupCell(attempt, error);
        } catch (cleanupError) {
          cleanup = {
            attempted: true,
            completed: false,
            ownershipSafe: false,
            noResources: false,
            reason: `cleanup hook failed: ${cleanupError.message}`,
          };
        }
      }
      result = {
        ...attempt,
        outcome: "FAILED_SETUP",
        artifact_status: "INCOMPLETE",
        execution_outcome: "FAILED_SETUP",
        failure: { phase: "setup/seed", reason: error.message },
        qualification_flags: [],
        qualificationFlags: [],
        cleanup,
      };
    }
    if (!result) result = {
      ...attempt,
      outcome: "NOT_RUN",
      artifact_status: "INCOMPLETE",
      execution_outcome: "NOT_RUN",
      reason: "baseline executor returned no retained outcome",
      cleanup: { attempted: true, completed: true, ownershipSafe: true, noResources: true },
    };
    const retained = { ...attempt, ...result, cellId: attempt.cellId, attemptId: result.attemptId || attempt.attemptId };
    cells.push(retained);
    if (onCell) await onCell(retained);
  }
  return { ...validateBaselineMatrix(cells, { expectedMatrix: matrix }), cells };
}

async function executeBaselineEvidenceChain({ runCell, matrix = createBaselineMatrix(), claimsByCell, candidates = [], selectedCandidateId, humanGate, historyScope, interpretationInputs = [] } = {}) {
  const matrixResult = await runBaselineMatrix({ runCell, matrix });
  const report = buildBaselineReport({ matrix: matrixResult.cells, claimsByCell, interpretationInputs });
  const { buildBottleneckDossier } = require("./bottleneckDossier");
  const dossier = buildBottleneckDossier({
    candidates: matrixResult.valid ? candidates : [],
    selectedCandidateId,
    humanGate,
    baselineMatrix: report.baselineMatrix,
    baselineValidation: matrixResult,
    claimMatrix: report.claims,
    historyScope,
  });
  return {
    status: matrixResult.valid ? dossier.status : "BLOCKED",
    matrix: matrixResult,
    report,
    dossier,
  };
}

module.exports = {
  BASELINE_DOMAINS,
  BASELINE_MATRIX,
  BASELINE_TOPOLOGIES,
  OUTCOMES,
  PHASES,
  QUALIFICATION_FLAGS,
  buildBaselineReport,
  claimEligibilityForCell,
  createBaselineMatrix,
  digest,
  executeBaselineEvidenceChain,
  normalizeBaselineRecord,
  runBaselineMatrix,
  validateArtifactBoundary,
  validateBaselineCell,
  validateBaselineMatrix,
  validatePrerequisiteEvidenceSet,
  validatePrerequisiteFreshness,
};
