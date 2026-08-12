const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parse } = require("yaml");

const PROJECT_MARKER = "kittachat-k4";
const PROJECT_LABEL = "io.kittachat.k4.project";
const RUN_LABEL = "io.kittachat.k4.run_id";
const RESULT_OWNER_FILE = ".k4-owner.json";
const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const RESULT_ROOT = path.join(REPOSITORY_ROOT, ".k4-results");
const COMPOSE_FILE = path.join(REPOSITORY_ROOT, "docker-compose.k4.yml");
const RUNNER_IMAGE = "node:22.14.0-bookworm-slim";
const TARGET_CLASSES = ["containers", "networks", "volumes", "resultDirectory"];
const IMAGE_SET_PREFIX = "kittachat-k4";
const IMAGE_SET_MANIFEST_ROOT = path.join(REPOSITORY_ROOT, ".k4-image-sets");

function assertRunId(runId) {
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(String(runId || ""))) {
    throw new Error("runId must be 3-64 lowercase letters, digits, underscores, or hyphens.");
  }
  return String(runId);
}

function assertImageSetId(imageSetId) {
  if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(String(imageSetId || ""))) {
    throw new Error("imageSetId must be 3-64 lowercase letters, digits, dots, underscores, or hyphens.");
  }
  return String(imageSetId);
}

function imageSetEnvironment(imageSetId) {
  const normalizedImageSetId = assertImageSetId(imageSetId);
  return {
    K4_IMAGE_SET_ID: normalizedImageSetId,
    K4_NGINX_IMAGE: `${IMAGE_SET_PREFIX}-nginx:${normalizedImageSetId}`,
    K4_BACKEND_IMAGE: `${IMAGE_SET_PREFIX}-backend:${normalizedImageSetId}`,
    K4_RUNNER_IMAGE: `${IMAGE_SET_PREFIX}-runner:${normalizedImageSetId}`,
  };
}

function profileDetails(profile) {
  if (profile === "single-replica") return { replicaCount: 1, upstreamMembership: ["backend-1"] };
  if (profile === "multi-replica") return { replicaCount: 3, upstreamMembership: ["backend-1", "backend-2", "backend-3"] };
  throw new Error('profile must be "single-replica" or "multi-replica".');
}

function ownershipLabels(runId) {
  return { [PROJECT_LABEL]: PROJECT_MARKER, [RUN_LABEL]: assertRunId(runId) };
}

function createRunPlan({ runId, profile }) {
  const normalizedRunId = assertRunId(runId);
  const topology = profileDetails(profile);
  const labels = ownershipLabels(normalizedRunId);
  return {
    projectName: `${PROJECT_MARKER}-${normalizedRunId}`,
    composeFile: COMPOSE_FILE,
    runId: normalizedRunId,
    profile,
    backendReplicaCount: topology.replicaCount,
    backendUpstreamMembership: topology.upstreamMembership,
    nginx: { imageConfiguration: "repository-nginx/Dockerfile+nginx/nginx.conf", ingress: "nginx" },
    backend: { imageConfiguration: "server/Dockerfile:prod", environment: "K4-owned dependencies" },
    dependencies: { mongo: "mongo:7", redis: "redis:alpine", rabbitmq: "rabbitmq:3-management-alpine" },
    runner: { image: RUNNER_IMAGE, workloadTarget: "http://nginx", dockerManagement: false },
    workload: { profileDigest: "unconfigured-in-issue-81", datasetIdentity: "K4-run-scoped-clean" },
    phaseSettings: ["setup/seed", "warm-up", "measurement", "teardown"],
    resourceAllocation: "compose-default",
    networkIngress: "k4-internal-nginx-only",
    hostPorts: [],
    resultDirectory: path.join(RESULT_ROOT, normalizedRunId),
    resources: ["nginx", "backend", "mongo", "redis", "rabbitmq", "runner"].map((name) => ({
      class: "containers",
      name,
      labels,
    })),
  };
}

function flatten(value, prefix = "") {
  if (Array.isArray(value) || value === null || typeof value !== "object") return { [prefix]: JSON.stringify(value) };
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).reduce((all, [key, child]) => ({
    ...all,
    ...flatten(child, prefix ? `${prefix}.${key}` : key),
  }), {});
}

function compareTopologyPlans(left, right) {
  return {
    status: "NON-COMPARABLE",
    allowedDifferences: ["backend_replica_count", "backend_upstream_membership"],
    unexpectedDifferences: ["synthesized-plan-not-authoritative"],
  };
}

const TOPOLOGY_ALLOWED_DIFFERENCES = ["backend_replica_count", "backend_upstream_membership"];
const REQUIRED_EFFECTIVE_FIELDS = ["compose", "imageIdentities", "configFingerprints", "runnerTool", "backend_replica_count", "backend_upstream_membership"];
const BACKEND_ONLY_SERVICES = ["backend", "mongo", "redis", "rabbitmq"];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function fingerprintSensitiveValue(value, comparisonFingerprintKey, domain) {
  if (!comparisonFingerprintKey) throw new Error("required effective evidence comparison fingerprint key is missing or unresolved.");
  return `hmac-sha256:${crypto.createHmac("sha256", comparisonFingerprintKey).update(`${domain}\u0000${String(value)}`).digest("hex")}`;
}

function containsCredentialBearingUri(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return false;
  }
}

function isSensitiveEffectiveValue(key, value) {
  return /(?:secret|password|token|key)$/i.test(key) || containsCredentialBearingUri(value);
}

function normalizeEnvironment(environment, comparisonFingerprintKey) {
  if (Array.isArray(environment)) return environment.map((entry) => {
    if (typeof entry !== "string") throw new Error("required effective evidence environment array entry is unresolved.");
    const separator = entry.indexOf("=");
    const key = separator < 0 ? entry : entry.slice(0, separator);
    const value = separator < 0 ? "" : entry.slice(separator + 1);
    return isSensitiveEffectiveValue(key, value)
      ? `${key}=${fingerprintSensitiveValue(value, comparisonFingerprintKey, `compose-environment:${key}`)}`
      : entry;
  });
  return Object.fromEntries(Object.entries(environment || {}).map(([key, value]) => [
    key,
    isSensitiveEffectiveValue(key, value)
      ? fingerprintSensitiveValue(value, comparisonFingerprintKey, `compose-environment:${key}`)
      : value,
  ]));
}

function normalizeRunScopedResultMount(value, plan) {
  if (typeof value !== "string") return value;
  const normalizedDirectory = plan.resultDirectory.replaceAll("\\", "/");
  const normalizedValue = value.replaceAll("\\", "/");
  if (normalizedValue === normalizedDirectory) return "<k4-result-directory>";
  if (normalizedValue.startsWith(`${normalizedDirectory}:`)) return `<k4-result-directory>${normalizedValue.slice(normalizedDirectory.length)}`;
  return value;
}

function normalizeComposeValue(value, plan, comparisonFingerprintKey, path = []) {
  if (Array.isArray(value)) {
    if (path.join(".") === "services.runner.volumes") {
      return value.map((entry, index) => typeof entry === "string"
        ? normalizeRunScopedResultMount(entry, plan)
        : normalizeComposeValue(entry, plan, comparisonFingerprintKey, [...path, String(index)]));
    }
    return value.map((entry, index) => normalizeComposeValue(entry, plan, comparisonFingerprintKey, [...path, String(index)]));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const childPath = [...path, key];
    const parentPath = path.join(".");
    if (childPath.length === 1 && key === "name" && child === plan.projectName) return [key, "<k4-project>"];
    if (/^(networks|volumes)\.[^.]+$/.test(parentPath) && key === "name" && typeof child === "string" && child.startsWith(`${plan.projectName}_`)) {
      return [key, `<k4-generated-${path[0]}-name>`];
    }
    if (parentPath === "x-k4-labels" && key === RUN_LABEL && child === plan.runId) return [key, "<k4-run>"];
    if (/^(services|networks|volumes)\.[^.]+\.labels$/.test(parentPath) && key === RUN_LABEL && child === plan.runId) return [key, "<k4-run>"];
    if (/^services\.runner\.volumes\.\d+$/.test(parentPath) && key === "source" && child === plan.resultDirectory) return [key, "<k4-result-directory>"];
    if (key === "environment") return [key, normalizeEnvironment(child, comparisonFingerprintKey)];
    return [key, normalizeComposeValue(child, plan, comparisonFingerprintKey, childPath)];
  }));
}

function normalizeRenderedCompose(renderedCompose, plan, comparisonFingerprintKey) {
  const compose = typeof renderedCompose === "string" ? parse(renderedCompose) : renderedCompose;
  if (!compose || typeof compose !== "object" || !compose.services || typeof compose.services !== "object") {
    throw new Error("required effective evidence rendered Compose is missing or unresolved.");
  }
  return stableValue(normalizeComposeValue(compose, plan, comparisonFingerprintKey));
}

function sha256Fingerprint(content) {
  return `sha256:${crypto.createHash("sha256").update(String(content)).digest("hex")}`;
}

function assertImmutableImageIdentity(identity, context) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(identity))) throw new Error(`required immutable image identity is missing or malformed for ${context}.`);
  return identity;
}

function assertImmutableImageIdentities(imageIdentities) {
  if (!imageIdentities || typeof imageIdentities !== "object" || !Object.keys(imageIdentities).length) {
    throw new Error("required immutable image identity evidence is missing or unresolved.");
  }
  for (const [service, identity] of Object.entries(imageIdentities)) assertImmutableImageIdentity(identity, service);
}

function configFingerprints(artifacts, imageIdentities) {
  if (!artifacts || typeof artifacts !== "object") throw new Error("required effective evidence config provenance is missing or unresolved.");
  return Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => {
    if (!artifact || !artifact.provenance || (typeof artifact.content !== "string" && !/^sha256:[a-f0-9]{64}$/.test(String(artifact.contentFingerprint)))) {
      throw new Error(`required config provenance is missing or unresolved for ${name}.`);
    }
    const contentFingerprint = typeof artifact.content === "string" ? sha256Fingerprint(artifact.content) : artifact.contentFingerprint;
    const provenance = stableValue(artifact.provenance);
    if (provenance.kind === "baked-image") {
      assertImmutableImageIdentity(provenance.imageIdentity, `config provenance for ${name}`);
      if (!provenance.service || !provenance.imageIdentity || imageIdentities?.[provenance.service] !== provenance.imageIdentity) {
        throw new Error(`config provenance does not bind ${name} to its effective immutable image.`);
      }
      if (!provenance.artifactPath || provenance.attestedContentFingerprint !== contentFingerprint) {
        throw new Error(`config provenance artifact attestation is missing or stale for ${name}.`);
      }
    } else if (provenance.kind === "mounted" || provenance.kind === "generated") {
      if (!provenance.target || provenance.sourceContentFingerprint !== contentFingerprint) {
        throw new Error(`config provenance does not bind ${name} to its effective source and mount target.`);
      }
    } else {
      throw new Error(`config provenance kind is unresolved for ${name}.`);
    }
    return [name, { contentFingerprint, provenance }];
  }).sort(([left], [right]) => left.localeCompare(right)));
}

function requiredEffectiveEvidence(snapshot) {
  return REQUIRED_EFFECTIVE_FIELDS.filter((field) => snapshot?.effective_spec?.[field] === undefined || snapshot.effective_spec[field] === null);
}

function compareEffectiveTopologySnapshots(left, right) {
  const missing = [...new Set([...requiredEffectiveEvidence(left), ...requiredEffectiveEvidence(right)])].sort();
  if (missing.length) return {
    status: "NON-COMPARABLE",
    allowedDifferences: TOPOLOGY_ALLOWED_DIFFERENCES,
    unexpectedDifferences: missing.map((field) => `missing-effective-evidence:${field}`),
  };
  const leftFields = flatten(stableValue(left.effective_spec));
  const rightFields = flatten(stableValue(right.effective_spec));
  const unexpectedDifferences = [...new Set([...Object.keys(leftFields), ...Object.keys(rightFields)])]
    .filter((key) => leftFields[key] !== rightFields[key] && !TOPOLOGY_ALLOWED_DIFFERENCES.includes(key))
    .sort();
  return {
    status: unexpectedDifferences.length === 0 ? "COMPARABLE" : "NON-COMPARABLE",
    allowedDifferences: TOPOLOGY_ALLOWED_DIFFERENCES,
    unexpectedDifferences,
  };
}

function effectiveNetworkSet(service) {
  const networks = service?.networks;
  return new Set(Array.isArray(networks) ? networks.map((network) => typeof network === "string" ? network : network.target) : Object.keys(networks || {}));
}

function assertEffectiveIngressTopology(effectiveSpec) {
  const services = effectiveSpec?.compose?.services || {};
  for (const name of ["runner", "nginx", ...BACKEND_ONLY_SERVICES]) if (!services[name]) throw new Error(`required effective service evidence is missing for ${name}`);
  const runnerNetworks = effectiveNetworkSet(services.runner);
  const nginxNetworks = effectiveNetworkSet(services.nginx);
  const backendNetworks = effectiveNetworkSet(services.backend);
  if (runnerNetworks.size !== 1) throw new Error("runner must attach only one workload network");
  if (![...runnerNetworks].every((network) => nginxNetworks.has(network))) throw new Error("nginx must bridge the runner workload network");
  if (![...backendNetworks].every((network) => nginxNetworks.has(network))) throw new Error("nginx must bridge the backend network");
  if ([...runnerNetworks].some((network) => backendNetworks.has(network))) throw new Error("runner and backend share network");
  for (const name of BACKEND_ONLY_SERVICES) {
    const networks = effectiveNetworkSet(services[name]);
    if ([...networks].some((network) => runnerNetworks.has(network))) throw new Error(`runner and ${name} share network`);
  }
  if ((services.backend.ports || []).length) throw new Error("backend exposes an alternate published ingress");
}

function attestRuntimeTopology(snapshot) {
  const missing = requiredEffectiveEvidence(snapshot);
  if (missing.length) return { status: "NON-COMPARABLE", reason: `missing effective evidence: ${missing.join(", ")}` };
  assertEffectiveIngressTopology(snapshot.effective_spec);
  const runtime = snapshot.runtime_attestation;
  if (!runtime?.networkSets || !Array.isArray(runtime.backendReplicas)) return { status: "NON-COMPARABLE", reason: "runtime attestation is missing or unresolved" };
  const expectedServices = snapshot.effective_spec.compose.services;
  for (const name of ["runner", "nginx", ...BACKEND_ONLY_SERVICES.filter((name) => name !== "backend")]) {
    const actual = runtime.networkSets[name];
    if (!Array.isArray(actual)) return { status: "NON-COMPARABLE", reason: `runtime network evidence is missing for ${name}` };
    const expected = [...effectiveNetworkSet(expectedServices[name])].sort();
    if (JSON.stringify([...new Set(actual)].sort()) !== JSON.stringify(expected)) return { status: "NON-COMPARABLE", reason: `runtime network set contradicts effective spec for ${name}` };
  }
  const expectedBackendNetworks = [...effectiveNetworkSet(expectedServices.backend)].sort();
  const runnerNetworks = new Set(runtime.networkSets.runner);
  const expectedBackendImage = snapshot.effective_spec.imageIdentities.backend;
  if (runtime.backendReplicas.length !== snapshot.effective_spec.backend_replica_count) {
    return { status: "NON-COMPARABLE", reason: "runtime backend replica count contradicts effective spec" };
  }
  for (const replica of runtime.backendReplicas) {
    if (!replica?.id || !replica.immutableImage || !Array.isArray(replica.networkSet) || !Array.isArray(replica.publishedPorts)) {
      return { status: "NON-COMPARABLE", reason: "runtime backend replica evidence is missing or unresolved" };
    }
    if (replica.immutableImage !== expectedBackendImage) {
      return { status: "NON-COMPARABLE", reason: `runtime backend replica image contradicts effective spec for ${replica.id}` };
    }
    const networks = [...new Set(replica.networkSet)].sort();
    if (JSON.stringify(networks) !== JSON.stringify(expectedBackendNetworks)) {
      return { status: "NON-COMPARABLE", reason: `runtime network set contradicts effective spec for backend replica ${replica.id}` };
    }
    if (networks.some((network) => runnerNetworks.has(network))) {
      return { status: "NON-COMPARABLE", reason: `runtime runner and backend replica share network for ${replica.id}` };
    }
    if (replica.publishedPorts.length) {
      return { status: "NON-COMPARABLE", reason: `runtime backend ports contradict effective spec for ${replica.id}` };
    }
  }
  return { status: "ATTESTED" };
}

function captureEffectiveTopologySnapshot(plan, evidence = {}) {
  const renderedCompose = evidence.renderedCompose;
  const imageIdentities = evidence.imageIdentities;
  const runnerTool = evidence.runnerTool;
  if (!renderedCompose || !imageIdentities || !runnerTool) throw new Error("required effective topology evidence is missing or unresolved.");
  assertImmutableImageIdentities(imageIdentities);
  const effectiveSpec = {
    compose: normalizeRenderedCompose(renderedCompose, plan, evidence.comparisonFingerprintKey),
    imageIdentities: stableValue(imageIdentities),
    configFingerprints: configFingerprints(evidence.configArtifacts, imageIdentities),
    runnerTool: stableValue(runnerTool),
    backend_replica_count: evidence.effectiveTopology?.backendReplicaCount,
    backend_upstream_membership: stableValue(evidence.effectiveTopology?.backendUpstreamMembership),
  };
  assertEffectiveIngressTopology(effectiveSpec);
  return { effective_spec: effectiveSpec, runtime_attestation: evidence.runtimeAttestation || null };
}

function runtimeNetworkName(plan, name) {
  return name.startsWith(`${plan.projectName}_`) ? name.slice(plan.projectName.length + 1) : name;
}

function runtimeEnvironment(container) {
  return Object.fromEntries((container?.Config?.Env || []).map((entry) => {
    const separator = entry.indexOf("=");
    return separator < 0 ? [entry, ""] : [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

function runtimeComposeEnvironment(plan, options, backendContainer) {
  const backendEnvironment = runtimeEnvironment(backendContainer);
  const jwtSecret = backendEnvironment.JWT_SECRET;
  if (!jwtSecret || backendEnvironment.REFRESH_TOKEN_SECRET !== jwtSecret) {
    throw new Error("required runtime evidence is missing: K4 Compose secret cannot be recovered from the active backend.");
  }
  const nginxImage = options.nginxImage;
  const backendImage = options.backendImage || backendContainer?.Config?.Image;
  if (!nginxImage || !backendImage) {
    throw new Error("required runtime evidence is missing: K4 image-set references cannot be recovered from active containers.");
  }
  return {
    ...process.env,
    ...options.env,
    K4_PROJECT_NAME: plan.projectName,
    K4_RUN_ID: plan.runId,
    K4_RESULT_DIR: plan.resultDirectory,
    K4_JWT_SECRET: jwtSecret,
    K4_NGINX_IMAGE: nginxImage,
    K4_BACKEND_IMAGE: backendImage,
  };
}

function imageSetIdFromReference(image) {
  const match = new RegExp(`^${IMAGE_SET_PREFIX}-(?:nginx|backend):([a-z0-9][a-z0-9_.-]{2,63})$`).exec(String(image || ""));
  if (!match) throw new Error("required runtime evidence is missing: active images do not identify a K4 image set.");
  return match[1];
}

function imageSetManifestPath(imageSetId, root = IMAGE_SET_MANIFEST_ROOT) {
  return path.join(root, `${assertImageSetId(imageSetId)}.json`);
}

function loadImageSetManifest(imageSetId, options = {}) {
  if (options.imageSetManifest) return options.imageSetManifest;
  const manifestPath = imageSetManifestPath(imageSetId, options.imageSetManifestRoot);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error("required effective evidence image-set config provenance is missing or unresolved.");
  }
}

function configArtifactsFromImageSet(manifest, imageIdentities) {
  if (!manifest || !manifest.imageIdentities || !manifest.configArtifacts) {
    throw new Error("required effective evidence image-set config provenance is missing or unresolved.");
  }
  for (const [service, identity] of Object.entries(manifest.imageIdentities)) {
    assertImmutableImageIdentity(identity, `image-set manifest ${service}`);
    if (imageIdentities[service] !== identity) {
      throw new Error("image-set config provenance contradicts the effective immutable image identity.");
    }
  }
  return manifest.configArtifacts;
}

function currentEffectiveTopologySnapshot(plan, options = {}) {
  const ids = String(docker([
    "ps", "--all",
    "--filter", `label=${PROJECT_LABEL}=${PROJECT_MARKER}`,
    "--filter", `label=${RUN_LABEL}=${plan.runId}`,
    "--format", "{{.ID}}",
  ], options)).split(/\r?\n/).filter(Boolean);
  if (!ids.length) throw new Error("required runtime evidence is missing: K4 containers are not resolved.");
  const inspected = JSON.parse(String(docker(["inspect", ...ids], options)));
  const byService = inspected.reduce((services, container) => {
    const service = container.Config?.Labels?.["com.docker.compose.service"];
    if (service) (services[service] ||= []).push(container);
    return services;
  }, {});
  const requiredServices = ["runner", "nginx", ...BACKEND_ONLY_SERVICES];
  if (requiredServices.some((service) => !byService[service]?.length)) throw new Error("required runtime evidence is missing: one or more K4 services are unresolved.");
  if (["runner", "nginx", "mongo", "redis", "rabbitmq"].some((service) => byService[service].length !== 1)) {
    throw new Error("required runtime evidence is missing: singleton K4 service resolution is ambiguous.");
  }
  const selectedService = (service) => byService[service][0];
  const backendContainers = byService.backend;
  const nginxImageReference = selectedService("nginx").Config?.Image;
  const backendImageReference = backendContainers[0].Config?.Image;
  const composeEnvironment = runtimeComposeEnvironment(plan, {
    ...options,
    nginxImage: nginxImageReference,
  }, backendContainers[0]);
  const nginxImageSetId = imageSetIdFromReference(nginxImageReference);
  if (imageSetIdFromReference(backendImageReference) !== nginxImageSetId) {
    throw new Error("required runtime evidence is missing: nginx and backend image sets differ.");
  }
  const dockerOptions = { ...options, env: composeEnvironment };
  const renderedCompose = docker(composeArgs(plan, ["config", "--format", "json"]), dockerOptions);
  const imageIdentities = Object.fromEntries(requiredServices.map((service) => [service, service === "backend" ? backendContainers[0].Image : selectedService(service).Image]));
  assertImmutableImageIdentities(imageIdentities);
  const networkSets = Object.fromEntries(requiredServices.filter((service) => service !== "backend").map((service) => [service, Object.keys(selectedService(service).NetworkSettings?.Networks || {}).map((name) => runtimeNetworkName(plan, name)).sort()]));
  const backendReplicas = backendContainers.map((container) => ({
    id: container.Id,
    immutableImage: container.Image,
    networkSet: Object.keys(container.NetworkSettings?.Networks || {}).map((name) => runtimeNetworkName(plan, name)).sort(),
    publishedPorts: Object.values(container.NetworkSettings?.Ports || {}).flat().filter(Boolean).map(({ HostIp, HostPort }) => `${HostIp}:${HostPort}`),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const runnerTool = { name: "node", version: String(docker(composeArgs(plan, ["exec", "-T", "runner", "node", "--version"]), dockerOptions)).trim() };
  const imageSetManifest = loadImageSetManifest(nginxImageSetId, options);
  const configArtifacts = configArtifactsFromImageSet(imageSetManifest, imageIdentities);
  const effectiveTopology = {
    backendReplicaCount: backendContainers.length,
    backendUpstreamMembership: backendContainers.map((container) => container.Name.replace(/^\//, "")).sort(),
  };
  return captureEffectiveTopologySnapshot(plan, {
    renderedCompose,
    imageIdentities,
    configArtifacts,
    comparisonFingerprintKey: options.comparisonFingerprintKey || options.env?.K4_COMPARISON_FINGERPRINT_KEY || process.env.K4_COMPARISON_FINGERPRINT_KEY,
    runnerTool,
    effectiveTopology,
    runtimeAttestation: { networkSets, backendReplicas },
  });
}

function ownsResource(resource, runId) {
  const labels = resource?.labels || resource?.Labels || {};
  return labels[PROJECT_LABEL] === PROJECT_MARKER && labels[RUN_LABEL] === assertRunId(runId);
}

function selectOwnedTargets(resources, runId) {
  return resources.filter((resource) => ownsResource(resource, runId));
}

function validateCleanupTarget(targetClass, target, runId) {
  if (!TARGET_CLASSES.includes(targetClass)) {
    return { status: "REJECTED", reason: "unknown destructive target class" };
  }
  if (!ownsResource(target, runId)) {
    return { status: "REJECTED", reason: "ownership marker does not match the active K4 run" };
  }
  return { status: "ACCEPTED" };
}

function ownerFile(resultDirectory) {
  return path.join(resultDirectory, RESULT_OWNER_FILE);
}

function resultDirectoryIsOwned(resultDirectory, runId) {
  try {
    const marker = JSON.parse(fs.readFileSync(ownerFile(resultDirectory), "utf8"));
    return marker.project === PROJECT_MARKER && marker.runId === assertRunId(runId);
  } catch {
    return false;
  }
}

function createResultDirectory(plan) {
  fs.mkdirSync(plan.resultDirectory, { recursive: true });
  fs.writeFileSync(ownerFile(plan.resultDirectory), `${JSON.stringify({ project: PROJECT_MARKER, runId: plan.runId })}\n`, { flag: "wx" });
}

function docker(args, { execute = true, env = process.env, dockerCommand } = {}) {
  if (!execute) return { command: "docker", args };
  if (dockerCommand) return dockerCommand(args, { env });
  const result = spawnSync("docker", args, { cwd: REPOSITORY_ROOT, encoding: "utf8", windowsHide: true, env });
  if (result.status !== 0) throw new Error(`docker ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function inspectDockerClass(targetClass, runId, options) {
  const filter = `label=${PROJECT_LABEL}=${PROJECT_MARKER}`;
  const command = targetClass === "containers" ? ["ps", "--all"] : [targetClass.slice(0, -1), "ls"];
  const listFormat = targetClass === "volumes" ? "{{.Name}}" : "{{.ID}}";
  const names = String(docker([...command, "--filter", filter, "--format", listFormat], options))
    .split(/\r?\n/).filter(Boolean);
  if (!names.length) return [];
  const inspected = String(docker(
    targetClass === "containers" ? ["inspect", ...names] : [targetClass.slice(0, -1), "inspect", ...names],
    options,
  ));
  const parsed = JSON.parse(inspected);
  return selectOwnedTargets(parsed.map((entry) => ({ id: entry.Id || entry.Name, labels: entry.Config?.Labels || entry.Labels || {} })), runId);
}

function cleanupPreview(runId, options = {}) {
  const plan = createRunPlan({ runId, profile: options.profile || "single-replica" });
  const targets = Object.fromEntries(TARGET_CLASSES.map((targetClass) => [targetClass, []]));
  for (const targetClass of ["containers", "networks", "volumes"]) targets[targetClass] = inspectDockerClass(targetClass, plan.runId, options);
  if (resultDirectoryIsOwned(plan.resultDirectory, plan.runId)) targets.resultDirectory = [{ path: plan.resultDirectory, labels: ownershipLabels(plan.runId) }];
  return { runId: plan.runId, targets, digest: crypto.createHash("sha256").update(JSON.stringify(targets)).digest("hex") };
}

function cleanup(runId, digest, options = {}) {
  const preview = cleanupPreview(runId, options);
  if (digest !== preview.digest) throw new Error("cleanup confirmation digest does not match the current exact K4 target set.");
  for (const target of preview.targets.containers) docker(["rm", "--force", target.id], options);
  for (const target of preview.targets.networks) docker(["network", "rm", target.id], options);
  for (const target of preview.targets.volumes) docker(["volume", "rm", target.id], options);
  const resultDirectory = preview.targets.resultDirectory[0]?.path;
  if (resultDirectory && resultDirectoryIsOwned(resultDirectory, preview.runId)) fs.rmSync(resultDirectory, { recursive: true, force: false });
  return preview;
}

function composeArgs(plan, args) {
  return ["compose", "--project-name", plan.projectName, "--file", COMPOSE_FILE, ...args];
}

function startArgs(plan) {
  return composeArgs(plan, ["up", "--detach", "--scale", `backend=${plan.backendReplicaCount}`]);
}

function attestBakedImageArtifact({ imageReference, imageIdentity, artifactPath, service }, options = {}) {
  assertImmutableImageIdentity(imageIdentity, `baked config artifact ${service}`);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "k4-baked-config-"));
  let containerId;
  try {
    containerId = String(docker(["container", "create", imageReference], options)).trim();
    if (!containerId) throw new Error(`required config provenance cannot create temporary ${service} image container.`);
    const containerImageIdentity = String(docker(["container", "inspect", "--format", "{{.Image}}", containerId], options)).trim();
    if (containerImageIdentity !== imageIdentity) {
      throw new Error(`required config provenance image identity contradicts the exact immutable ${service} image.`);
    }
    docker(["cp", `${containerId}:${artifactPath}`, temporaryDirectory], options);
    const effectiveArtifactPath = path.join(temporaryDirectory, path.basename(artifactPath));
    const content = fs.readFileSync(effectiveArtifactPath, "utf8");
    const contentFingerprint = sha256Fingerprint(content);
    return {
      content,
      provenance: {
        kind: "baked-image",
        service,
        imageIdentity,
        artifactPath,
        attestedContentFingerprint: contentFingerprint,
      },
    };
  } finally {
    if (containerId) docker(["container", "rm", "--force", containerId], options);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function buildImageSet(imageSetId, options = {}) {
  const imageEnvironment = imageSetEnvironment(imageSetId);
  const buildPlan = createRunPlan({ runId: `image-build-${imageEnvironment.K4_IMAGE_SET_ID}`, profile: "single-replica" });
  const environment = {
    ...process.env,
    ...options.env,
    ...imageEnvironment,
    K4_PROJECT_NAME: buildPlan.projectName,
    K4_RUN_ID: buildPlan.runId,
    K4_RESULT_DIR: buildPlan.resultDirectory,
    K4_JWT_SECRET: options.jwtSecret || crypto.randomBytes(48).toString("hex"),
  };
  docker(composeArgs(buildPlan, ["build", "nginx", "backend", "runner"]), { ...options, env: environment });
  const imageIdentities = Object.fromEntries(["nginx", "backend", "runner"].map((service) => {
    const image = imageEnvironment[`K4_${service.toUpperCase()}_IMAGE`];
    const identity = String(docker(["image", "inspect", "--format", "{{.Id}}", image], options)).trim();
    assertImmutableImageIdentity(identity, service);
    return [service, identity];
  }));
  const configArtifacts = {
    nginx: attestBakedImageArtifact({
      imageReference: imageEnvironment.K4_NGINX_IMAGE,
      imageIdentity: imageIdentities.nginx,
      artifactPath: "/etc/nginx/nginx.conf",
      service: "nginx",
    }, options),
  };
  const manifest = {
    imageSetId: imageEnvironment.K4_IMAGE_SET_ID,
    imageIdentities,
    configArtifacts: configFingerprints(configArtifacts, imageIdentities),
  };
  const manifestPath = imageSetManifestPath(imageEnvironment.K4_IMAGE_SET_ID, options.imageSetManifestRoot);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, { flag: "w" });
  return { ...imageEnvironment, imageIdentities, configArtifacts: manifest.configArtifacts };
}

function runnerDiagnosticArgs(plan) {
  const diagnostic = [
    'const dns = require("node:dns").promises;',
    'const fs = require("node:fs");',
    '(async () => {',
    '  const nginxAddresses = await dns.lookup("nginx", { all: true });',
    '  const response = await fetch("http://nginx/healthz");',
    '  let backendResolvable = true; let backendDirectReachable = true;',
    '  try { await dns.lookup("backend", { all: true }); } catch { backendResolvable = false; }',
    '  try { await fetch("http://backend:3000/healthz", { signal: AbortSignal.timeout(250) }); } catch { backendDirectReachable = false; }',
    '  let dockerApiReachable = false;',
    '  try { await fetch("http://docker:2375/_ping", { signal: AbortSignal.timeout(250) }); dockerApiReachable = true; } catch {}',
    '  process.stdout.write(JSON.stringify({ workloadTarget: "http://nginx/healthz", host: "nginx", nginxAddresses, status: response.status, backendResolvable, backendDirectReachable, dockerSocketPresent: fs.existsSync("/var/run/docker.sock"), dockerApiReachable }));',
    '})().catch((error) => { process.stderr.write(error.message); process.exit(1); });',
  ].join(" ");
  return composeArgs(plan, ["exec", "-T", "runner", "node", "-e", diagnostic]);
}

module.exports = { COMPOSE_FILE, PROJECT_LABEL, PROJECT_MARKER, RESULT_ROOT, RUN_LABEL, TARGET_CLASSES, assertImageSetId, attestRuntimeTopology, buildImageSet, captureEffectiveTopologySnapshot, cleanup, cleanupPreview, compareEffectiveTopologySnapshots, compareTopologyPlans, composeArgs, createResultDirectory, createRunPlan, currentEffectiveTopologySnapshot, docker, imageSetEnvironment, ownershipLabels, runnerDiagnosticArgs, selectOwnedTargets, startArgs, validateCleanupTarget };
