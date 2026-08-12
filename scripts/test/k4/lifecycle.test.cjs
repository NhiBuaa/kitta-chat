const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const {
  attestRuntimeTopology,
  buildImageSet,
  captureEffectiveTopologySnapshot,
  compareEffectiveTopologySnapshots,
  createRunPlan,
  compareTopologyPlans,
  selectOwnedTargets,
  validateCleanupTarget,
  runnerDiagnosticArgs,
  cleanupPreview,
  currentEffectiveTopologySnapshot,
  imageSetEnvironment,
  startArgs,
} = require("../../k4/lifecycle");

function immutableDigest(label) {
  return `sha256:${crypto.createHash("sha256").update(label).digest("hex")}`;
}

function bakedConfigArtifact(content, imageIdentity = immutableDigest("nginx")) {
  return {
    content,
    provenance: {
      kind: "baked-image",
      service: "nginx",
      imageIdentity,
      artifactPath: "/etc/nginx/nginx.conf",
      attestedContentFingerprint: `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`,
    },
  };
}

function effectiveSnapshot(overrides = {}) {
  const effectiveSpec = {
    compose: {
      services: {
        runner: { networks: ["workload"], ports: [], mounts: ["results:rw"], environment: { K4_WORKLOAD_URL: "http://nginx" } },
        nginx: { networks: ["workload", "backend"], ports: [], mounts: [], environment: {} },
        backend: { networks: ["backend"], ports: [], mounts: [], environment: { PORT: "3000" }, resources: { limits: { cpus: "1" } } },
        mongo: { networks: ["backend"], ports: [], mounts: ["mongo:rw"], environment: {} },
        redis: { networks: ["backend"], ports: [], mounts: ["redis:rw"], environment: {} },
        rabbitmq: { networks: ["backend"], ports: [], mounts: ["rabbitmq:rw"], environment: {} },
      },
    },
    imageIdentities: { runner: immutableDigest("runner"), nginx: immutableDigest("nginx"), backend: immutableDigest("backend"), mongo: immutableDigest("mongo") },
    configFingerprints: { nginx: "sha256:nginx-config", backend: "sha256:backend-config" },
    runnerTool: { name: "node", version: "22.14.0" },
    backend_replica_count: 1,
    backend_upstream_membership: ["backend-1"],
    ...overrides,
  };
  return {
    effective_spec: effectiveSpec,
    runtime_attestation: {
      networkSets: { runner: ["workload"], nginx: ["workload", "backend"], mongo: ["backend"], redis: ["backend"], rabbitmq: ["backend"] },
      backendReplicas: [{ id: "backend-1", immutableImage: immutableDigest("backend"), networkSet: ["backend"], publishedPorts: [] }],
    },
  };
}

function effectiveCaptureEvidence({ services = {}, secret = "runtime-only-test-secret", configImageIdentity = immutableDigest("nginx") } = {}) {
  const defaults = {
    runner: { networks: ["workload"], environment: { K4_WORKLOAD_URL: "http://nginx" } },
    nginx: { networks: ["workload", "backend"] },
    backend: { networks: ["backend"], environment: { JWT_SECRET: secret, REFRESH_TOKEN_SECRET: secret } },
    mongo: { networks: ["backend"] },
    redis: { networks: ["backend"] },
    rabbitmq: { networks: ["backend"] },
  };
  return {
    renderedCompose: { services: { ...defaults, ...services } },
    imageIdentities: {
      runner: immutableDigest("runner"), nginx: immutableDigest("nginx"), backend: immutableDigest("backend"),
      mongo: immutableDigest("mongo"), redis: immutableDigest("redis"), rabbitmq: immutableDigest("rabbitmq"),
    },
    configArtifacts: {
      nginx: {
        ...bakedConfigArtifact("worker_processes 1;", configImageIdentity || immutableDigest("nginx")),
        provenance: configImageIdentity === null
          ? { kind: "baked-image", service: "nginx" }
          : bakedConfigArtifact("worker_processes 1;", configImageIdentity).provenance,
      },
    },
    comparisonFingerprintKey: "comparison-key-for-test-only",
    runnerTool: { name: "node", version: "v22.14.0" },
    effectiveTopology: { backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"] },
  };
}

test("run plan gives every K4 resource exact project and run ownership labels", () => {
  const plan = createRunPlan({ runId: "run-20260811-a", profile: "single-replica" });

  assert.equal(plan.projectName, "kittachat-k4-run-20260811-a");
  assert.equal(plan.resources.every((resource) => (
    resource.labels["io.kittachat.k4.project"] === "kittachat-k4"
    && resource.labels["io.kittachat.k4.run_id"] === "run-20260811-a"
  )), true);
  assert.equal(plan.resultDirectory.endsWith("run-20260811-a"), true);
  assert.equal(plan.hostPorts.length, 0);
});

test("effective topology comparison permits only backend count and upstream membership", () => {
  const single = effectiveSnapshot();
  const multi = effectiveSnapshot({ backend_replica_count: 3, backend_upstream_membership: ["backend-1", "backend-2", "backend-3"] });

  assert.deepEqual(compareEffectiveTopologySnapshots(single, multi), {
    status: "COMPARABLE",
    allowedDifferences: ["backend_replica_count", "backend_upstream_membership"],
    unexpectedDifferences: [],
  });
});

test("effective topology comparison rejects effective image identity without plan fallback", () => {
  const single = effectiveSnapshot();
  const multi = effectiveSnapshot({ imageIdentities: { ...single.effective_spec.imageIdentities, runner: "node@sha256:changed" } });

  const result = compareEffectiveTopologySnapshots(single, multi);

  assert.equal(result.status, "NON-COMPARABLE");
  assert.deepEqual(result.unexpectedDifferences, ["imageIdentities.runner"]);
});

test("effective topology comparison rejects every representative effective field while synthesized intent remains unchanged", () => {
  const base = effectiveSnapshot();
  const mutations = [
    ["configFingerprints.nginx", { configFingerprints: { ...base.effective_spec.configFingerprints, nginx: "sha256:changed" } }],
    ["imageIdentities.backend", { imageIdentities: { ...base.effective_spec.imageIdentities, backend: "backend@sha256:changed" } }],
    ["compose.services.backend.resources.limits.cpus", { compose: { services: { ...base.effective_spec.compose.services, backend: { ...base.effective_spec.compose.services.backend, resources: { limits: { cpus: "2" } } } } } }],
    ["runnerTool.version", { runnerTool: { name: "node", version: "22.15.0" } }],
    ["compose.services.backend.networks", { compose: { services: { ...base.effective_spec.compose.services, backend: { ...base.effective_spec.compose.services.backend, networks: ["different-backend"] } } } }],
    ["compose.services.backend.ports", { compose: { services: { ...base.effective_spec.compose.services, backend: { ...base.effective_spec.compose.services.backend, ports: ["127.0.0.1:3000:3000"] } } } }],
  ];

  for (const [field, mutation] of mutations) {
    const changed = effectiveSnapshot(mutation);
    assert.equal(compareEffectiveTopologySnapshots(base, changed).status, "NON-COMPARABLE", field);
  }
});

test("synthesized plan mutation does not decide effective topology comparability", () => {
  const left = effectiveSnapshot();
  const right = effectiveSnapshot();
  const leftPlan = createRunPlan({ runId: "one", profile: "single-replica" });
  const rightPlan = createRunPlan({ runId: "two", profile: "single-replica" });
  rightPlan.runner.workloadTarget = "http://changed-intent-only";

  assert.equal(compareTopologyPlans(leftPlan, rightPlan).status, "NON-COMPARABLE");
  assert.equal(compareEffectiveTopologySnapshots(left, right).status, "COMPARABLE");
});

test("missing effective evidence fails closed without synthesized-plan fallback", () => {
  const incomplete = effectiveSnapshot();
  delete incomplete.effective_spec.imageIdentities;

  assert.deepEqual(compareEffectiveTopologySnapshots(effectiveSnapshot(), incomplete), {
    status: "NON-COMPARABLE",
    allowedDifferences: ["backend_replica_count", "backend_upstream_membership"],
    unexpectedDifferences: ["missing-effective-evidence:imageIdentities"],
  });
});

test("effective snapshot fingerprints config content and removes only run-scoped identity and secret values", () => {
  const plan = createRunPlan({ runId: "capture-run", profile: "single-replica" });
  const renderedCompose = { services: {
    runner: { networks: ["workload"], environment: { K4_WORKLOAD_URL: "http://nginx" } },
    nginx: { networks: ["workload", "backend"] }, backend: { networks: ["backend"], environment: { JWT_SECRET: "different-per-run" } },
    mongo: { networks: ["backend"] }, redis: { networks: ["backend"] }, rabbitmq: { networks: ["backend"] },
  } };
  const evidence = {
    renderedCompose,
    imageIdentities: { runner: immutableDigest("runner"), nginx: immutableDigest("nginx"), backend: immutableDigest("backend"), mongo: immutableDigest("mongo"), redis: immutableDigest("redis"), rabbitmq: immutableDigest("rabbitmq") },
    configArtifacts: {
      nginx: bakedConfigArtifact("worker_processes 1;"),
    },
    comparisonFingerprintKey: "comparison-key-for-test-only",
    runnerTool: { name: "node", version: "v22.14.0" },
    effectiveTopology: { backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"] },
  };
  const snapshot = captureEffectiveTopologySnapshot(plan, evidence);

  assert.match(snapshot.effective_spec.configFingerprints.nginx.contentFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(snapshot.effective_spec.configFingerprints.nginx.provenance.imageIdentity, immutableDigest("nginx"));
  assert.match(snapshot.effective_spec.compose.services.backend.environment.JWT_SECRET, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(snapshot), /different-per-run/);
  assert.equal(snapshot.effective_spec.compose.services.runner.environment.K4_WORKLOAD_URL, "http://nginx");
});

test("effective Compose canonicalization sorts object keys but preserves array order", () => {
  const plan = createRunPlan({ runId: "ordered-compose", profile: "single-replica" });
  const evidence = effectiveCaptureEvidence({
    services: { runner: { networks: ["workload"], environment: { B: "2", A: "1", K4_WORKLOAD_URL: "http://nginx" } } },
  });
  const reorderedKeys = structuredClone(evidence);
  reorderedKeys.renderedCompose.services.runner.environment = { K4_WORKLOAD_URL: "http://nginx", A: "1", B: "2" };
  const reorderedArray = structuredClone(evidence);
  reorderedArray.renderedCompose.services.nginx.networks = ["backend", "workload"];

  assert.equal(compareEffectiveTopologySnapshots(
    captureEffectiveTopologySnapshot(plan, evidence),
    captureEffectiveTopologySnapshot(plan, reorderedKeys),
  ).status, "COMPARABLE");
  assert.equal(compareEffectiveTopologySnapshots(
    captureEffectiveTopologySnapshot(plan, evidence),
    captureEffectiveTopologySnapshot(plan, reorderedArray),
  ).status, "NON-COMPARABLE");

  const reorderedEnvironment = structuredClone(evidence);
  reorderedEnvironment.renderedCompose.services.runner.environment = ["K4_WORKLOAD_URL=http://nginx", "A=1", "B=2"];
  const environmentOrderChanged = structuredClone(reorderedEnvironment);
  environmentOrderChanged.renderedCompose.services.runner.environment = ["K4_WORKLOAD_URL=http://nginx", "B=2", "A=1"];
  assert.equal(compareEffectiveTopologySnapshots(
    captureEffectiveTopologySnapshot(plan, reorderedEnvironment),
    captureEffectiveTopologySnapshot(plan, environmentOrderChanged),
  ).status, "NON-COMPARABLE");
});

test("only explicit run-scoped Compose identity fields are normalized", () => {
  const leftPlan = createRunPlan({ runId: "allowlisted-left", profile: "single-replica" });
  const rightPlan = createRunPlan({ runId: "allowlisted-right", profile: "single-replica" });
  const compose = (plan, arbitraryValue) => ({
    name: plan.projectName,
    "x-k4-labels": { "io.kittachat.k4.run_id": plan.runId },
    networks: {
      workload: { name: `${plan.projectName}_k4-workload` },
      backend: { name: `${plan.projectName}_k4-backend` },
    },
    volumes: { mongo_data: { name: `${plan.projectName}_mongo_data` } },
    services: {
      runner: {
        networks: ["workload"], labels: { "io.kittachat.k4.run_id": plan.runId }, environment: { K4_WORKLOAD_URL: "http://nginx" },
        volumes: [{ type: "bind", source: plan.resultDirectory, target: "/results" }],
      },
      nginx: { networks: ["workload", "backend"] },
      backend: { networks: ["backend"], environment: { NOTE: arbitraryValue } },
      mongo: { networks: ["backend"] }, redis: { networks: ["backend"] }, rabbitmq: { networks: ["backend"] },
    },
  });
  const left = effectiveCaptureEvidence();
  const right = effectiveCaptureEvidence();
  left.renderedCompose = compose(leftPlan, "same-non-allowlisted-value");
  right.renderedCompose = compose(rightPlan, "same-non-allowlisted-value");
  assert.equal(compareEffectiveTopologySnapshots(
    captureEffectiveTopologySnapshot(leftPlan, left),
    captureEffectiveTopologySnapshot(rightPlan, right),
  ).status, "COMPARABLE");

  left.renderedCompose.services.backend.environment.NOTE = `contains-${leftPlan.runId}-but-is-not-allowlisted`;
  right.renderedCompose.services.backend.environment.NOTE = `contains-${rightPlan.runId}-but-is-not-allowlisted`;
  assert.equal(compareEffectiveTopologySnapshots(
    captureEffectiveTopologySnapshot(leftPlan, left),
    captureEffectiveTopologySnapshot(rightPlan, right),
  ).status, "NON-COMPARABLE");
});

test("sensitive effective values use paired non-disclosing HMAC fingerprints", () => {
  const plan = createRunPlan({ runId: "secret-fingerprint", profile: "single-replica" });
  const first = effectiveCaptureEvidence({ secret: "secret-A" });
  const same = effectiveCaptureEvidence({ secret: "secret-A" });
  const changed = effectiveCaptureEvidence({ secret: "secret-B" });
  const firstSnapshot = captureEffectiveTopologySnapshot(plan, first);
  const sameSnapshot = captureEffectiveTopologySnapshot(plan, same);
  const changedSnapshot = captureEffectiveTopologySnapshot(plan, changed);

  assert.equal(compareEffectiveTopologySnapshots(firstSnapshot, sameSnapshot).status, "COMPARABLE");
  assert.equal(compareEffectiveTopologySnapshots(firstSnapshot, changedSnapshot).status, "NON-COMPARABLE");
  assert.doesNotMatch(JSON.stringify(changedSnapshot), /secret-[AB]|comparison-key-for-test-only/);
});

test("credential-bearing effective URIs use paired non-disclosing HMAC fingerprints", () => {
  const plan = createRunPlan({ runId: "uri-fingerprint", profile: "single-replica" });
  const evidenceFor = (credential) => effectiveCaptureEvidence({
    services: {
      rabbitmq: {
        networks: ["backend"],
        environment: { RABBITMQ_URL: `amqp://guest:${credential}@rabbitmq:5672/k4` },
      },
    },
  });
  const first = captureEffectiveTopologySnapshot(plan, evidenceFor("credential-A"));
  const same = captureEffectiveTopologySnapshot(plan, evidenceFor("credential-A"));
  const changed = captureEffectiveTopologySnapshot(plan, evidenceFor("credential-B"));

  assert.equal(compareEffectiveTopologySnapshots(first, same).status, "COMPARABLE");
  assert.equal(compareEffectiveTopologySnapshots(first, changed).status, "NON-COMPARABLE");
  assert.match(first.effective_spec.compose.services.rabbitmq.environment.RABBITMQ_URL, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(changed), /credential-[AB]|guest:|comparison-key-for-test-only/);
});

test("configuration provenance fails closed when image binding is unresolved or stale", () => {
  const plan = createRunPlan({ runId: "config-provenance", profile: "single-replica" });
  const valid = effectiveCaptureEvidence();
  const stale = effectiveCaptureEvidence({ configImageIdentity: immutableDigest("another-nginx") });

  assert.throws(() => captureEffectiveTopologySnapshot(plan, effectiveCaptureEvidence({ configImageIdentity: null })), /config provenance/i);
  assert.throws(() => captureEffectiveTopologySnapshot(plan, stale), /does not bind.*effective immutable image/i);
  const changedContent = effectiveCaptureEvidence();
  changedContent.configArtifacts.nginx.content = "worker_processes 2;";
  changedContent.configArtifacts.nginx.provenance.attestedContentFingerprint = `sha256:${crypto.createHash("sha256").update(changedContent.configArtifacts.nginx.content).digest("hex")}`;
  assert.equal(compareEffectiveTopologySnapshots(
    captureEffectiveTopologySnapshot(plan, valid),
    captureEffectiveTopologySnapshot(plan, changedContent),
  ).status, "NON-COMPARABLE");
});

test("effective capture and config provenance reject mutable image identities", () => {
  const plan = createRunPlan({ runId: "mutable-image", profile: "single-replica" });
  const tagOnly = effectiveCaptureEvidence();
  tagOnly.imageIdentities.nginx = "nginx:latest";
  tagOnly.configArtifacts.nginx.provenance.imageIdentity = "nginx:latest";
  assert.throws(() => captureEffectiveTopologySnapshot(plan, tagOnly), /immutable image identity/i);

  const mutableProvenance = effectiveCaptureEvidence();
  mutableProvenance.configArtifacts.nginx.provenance.imageIdentity = "nginx:latest";
  assert.throws(() => captureEffectiveTopologySnapshot(plan, mutableProvenance), /immutable image/i);
});

test("effective capture fails closed for malformed sha256-prefixed immutable identities", () => {
  const plan = createRunPlan({ runId: "malformed-image-identity", profile: "single-replica" });
  const evidence = effectiveCaptureEvidence();
  evidence.imageIdentities.nginx = "sha256:not-a-64-character-lowercase-hex-digest";
  evidence.configArtifacts.nginx.provenance.imageIdentity = evidence.imageIdentities.nginx;

  assert.throws(() => captureEffectiveTopologySnapshot(plan, evidence), /immutable image identity/i);
});

test("effective topology canonicalizes complete rendered Compose semantics beyond selected service fields", () => {
  const plan = createRunPlan({ runId: "complete-compose", profile: "single-replica" });
  const compose = { services: {
    runner: {
      networks: ["workload"], environment: { K4_WORKLOAD_URL: "http://nginx" },
      entrypoint: ["node"], user: "1000:1000", working_dir: "/results", extra_hosts: ["host.docker.internal:host-gateway"],
      dns: ["127.0.0.11"], ulimits: { nofile: { soft: 1024, hard: 2048 } }, devices: ["/dev/null:/dev/null:r"],
      privileged: false, pid: "private", network_mode: "default", tmpfs: ["/tmp:rw,noexec"],
    },
    nginx: { networks: ["workload", "backend"] }, backend: { networks: ["backend"] },
    mongo: { networks: ["backend"] }, redis: { networks: ["backend"] }, rabbitmq: { networks: ["backend"] },
  }, networks: { workload: { internal: true }, backend: { internal: true } }, volumes: {} };
  const evidence = {
    renderedCompose: compose,
    imageIdentities: { runner: immutableDigest("runner"), nginx: immutableDigest("nginx"), backend: immutableDigest("backend"), mongo: immutableDigest("mongo"), redis: immutableDigest("redis"), rabbitmq: immutableDigest("rabbitmq") },
    configArtifacts: {
      nginx: bakedConfigArtifact("worker_processes 1;"),
    },
    comparisonFingerprintKey: "comparison-key-for-test-only",
    runnerTool: { name: "node", version: "v22.14.0" },
    effectiveTopology: { backendReplicaCount: 1, backendUpstreamMembership: ["backend-1"] },
  };
  const base = captureEffectiveTopologySnapshot(plan, evidence);

  for (const field of ["entrypoint", "user", "working_dir", "extra_hosts", "dns", "ulimits", "devices", "privileged", "pid", "network_mode", "tmpfs"]) {
    assert.notEqual(base.effective_spec.compose.services.runner[field], undefined, field);
    const changedCompose = structuredClone(compose);
    changedCompose.services.runner[field] = field === "privileged" ? true : [`changed-${field}`];
    const changed = captureEffectiveTopologySnapshot(plan, { ...evidence, renderedCompose: changedCompose });
    assert.equal(compareEffectiveTopologySnapshots(base, changed).status, "NON-COMPARABLE", field);
  }
});

test("current effective snapshots render Compose with the started run secret and remain comparable", () => {
  const commandEnvironments = [];
  const plan = createRunPlan({ runId: "snapshot-live", profile: "single-replica" });
  const inspected = ["runner", "nginx", "backend", "mongo", "redis", "rabbitmq"].map((service) => ({
    Id: `${service}-id`,
    Name: `/${plan.projectName}-${service}-1`,
    Image: immutableDigest(service),
    Config: {
      Image: service === "nginx" ? "kittachat-k4-nginx:fixed-source-a" : service === "backend" ? "kittachat-k4-backend:fixed-source-a" : `${service}:pinned`,
      Labels: { "com.docker.compose.service": service },
      Env: service === "backend"
        ? ["JWT_SECRET=runtime-only-test-secret", "REFRESH_TOKEN_SECRET=runtime-only-test-secret"]
        : [],
    },
    NetworkSettings: {
      Networks: Object.fromEntries((service === "runner" ? ["k4-workload"] : service === "nginx" ? ["k4-workload", "k4-backend"] : ["k4-backend"])
        .map((network) => [`${plan.projectName}_${network}`, {}])),
      Ports: {},
    },
  }));
  const renderedCompose = { services: Object.fromEntries(["runner", "nginx", "backend", "mongo", "redis", "rabbitmq"].map((service) => [service, {
    image: `${service}:pinned`,
    environment: service === "backend" ? { JWT_SECRET: "runtime-only-test-secret", REFRESH_TOKEN_SECRET: "runtime-only-test-secret" } : {},
    networks: service === "runner" ? ["k4-workload"] : service === "nginx" ? ["k4-workload", "k4-backend"] : ["k4-backend"],
  }])), networks: {}, volumes: {} };
  const dockerCommand = (args, options) => {
    commandEnvironments.push({ args, env: options?.env });
    if (args[0] === "ps") return inspected.map(({ Id }) => Id).join("\n");
    if (args[0] === "inspect") return JSON.stringify(inspected);
    if (args[0] === "compose" && args.includes("exec")) return "v22.14.0\n";
    if (args[0] === "compose" && args.includes("config")) return JSON.stringify(renderedCompose);
    throw new Error(`unexpected Docker command: ${args.join(" ")}`);
  };

  const imageSetManifest = imageSetManifestFor({ nginx: immutableDigest("nginx"), backend: immutableDigest("backend") });
  const left = currentEffectiveTopologySnapshot(plan, { dockerCommand, imageSetManifest, comparisonFingerprintKey: "comparison-key-for-test-only" });
  const right = currentEffectiveTopologySnapshot(plan, { dockerCommand, imageSetManifest, comparisonFingerprintKey: "comparison-key-for-test-only" });
  const configCommands = commandEnvironments.filter(({ args }) => args[0] === "compose" && args.includes("config"));

  assert.equal(configCommands.length, 2);
  assert.equal(configCommands.every(({ env }) => env.K4_JWT_SECRET === "runtime-only-test-secret"), true);
  assert.deepEqual(compareEffectiveTopologySnapshots(left, right), {
    status: "COMPARABLE",
    allowedDifferences: ["backend_replica_count", "backend_upstream_membership"],
    unexpectedDifferences: [],
  });
});

test("two profiles supplied the same image set preserve immutable nginx and backend identities", () => {
  const imageSet = "fixed-source-a";
  const single = currentSnapshotForProfile({ runId: "shared-single", profile: "single-replica", imageSet });
  const multi = currentSnapshotForProfile({ runId: "shared-multi", profile: "multi-replica", imageSet });

  assert.equal(single.effective_spec.imageIdentities.nginx, multi.effective_spec.imageIdentities.nginx);
  assert.equal(single.effective_spec.imageIdentities.backend, multi.effective_spec.imageIdentities.backend);
  assert.deepEqual(multi.runtime_attestation.backendReplicas.map((replica) => replica.id), ["backend-1", "backend-2", "backend-3"]);
  assert.equal(compareEffectiveTopologySnapshots(single, multi).status, "COMPARABLE");
});

test("a changed image set remains non-comparable without weakening immutable identity comparison", () => {
  const single = currentSnapshotForProfile({ runId: "changed-single", profile: "single-replica", imageSet: "fixed-source-a" });
  const multi = currentSnapshotForProfile({ runId: "changed-multi", profile: "multi-replica", imageSet: "fixed-source-b" });

  const result = compareEffectiveTopologySnapshots(single, multi);

  assert.equal(result.status, "NON-COMPARABLE");
  assert.deepEqual(result.unexpectedDifferences, ["compose.services.backend.image", "compose.services.nginx.image", "configFingerprints.nginx.provenance.imageIdentity", "imageIdentities.backend", "imageIdentities.nginx"]);
});

test("current effective evidence fails closed when the image-set config provenance is stale", () => {
  assert.throws(() => currentSnapshotForProfile({
    runId: "stale-manifest",
    profile: "single-replica",
    imageSet: "fixed-source-a",
    imageSetManifest: imageSetManifestFor({ nginx: immutableDigest("stale-nginx"), backend: immutableDigest("backend-fixed-source-a") }),
  }), /config provenance contradicts the effective immutable image identity/i);
});

test("shared image-set starts use immutable tagged images and never rebuild per run", () => {
  const plan = createRunPlan({ runId: "image-set-run", profile: "single-replica" });

  assert.deepEqual(imageSetEnvironment("fixed-source-a"), {
    K4_IMAGE_SET_ID: "fixed-source-a",
    K4_NGINX_IMAGE: "kittachat-k4-nginx:fixed-source-a",
    K4_BACKEND_IMAGE: "kittachat-k4-backend:fixed-source-a",
  });
  assert.equal(startArgs(plan).includes("--build"), false);
});

test("building an image set resolves nginx and backend immutable identities once before any run starts", () => {
  const commands = [];
  const imageSetManifestRoot = path.join(process.env.TEMP || process.cwd(), "k4-image-set-test-manifests");
  const built = buildImageSet("fixed-source-a", {
    jwtSecret: "test-secret",
    imageSetManifestRoot,
    dockerCommand(args, options) {
      commands.push({ args, env: options.env });
      if (args[0] === "compose") return "built\n";
      if (args[0] === "image" && args.at(-1) === "kittachat-k4-nginx:fixed-source-a") return `${immutableDigest("nginx-fixed-source-a")}\n`;
      if (args[0] === "image" && args.at(-1) === "kittachat-k4-backend:fixed-source-a") return `${immutableDigest("backend-fixed-source-a")}\n`;
      if (args[0] === "container" && args[1] === "create") return "temporary-nginx-container\n";
      if (args[0] === "container" && args[1] === "inspect") return `${immutableDigest("nginx-fixed-source-a")}\n`;
      if (args[0] === "cp") {
        fs.writeFileSync(path.join(args.at(-1), "nginx.conf"), "worker_processes 1;");
        return "";
      }
      if (args[0] === "container" && args[1] === "rm") return "temporary-nginx-container\n";
      throw new Error(`unexpected Docker command: ${args.join(" ")}`);
    },
  });

  assert.deepEqual(commands[0].args.slice(-3), ["build", "nginx", "backend"]);
  assert.equal(commands[0].env.K4_NGINX_IMAGE, "kittachat-k4-nginx:fixed-source-a");
  assert.deepEqual({
    K4_IMAGE_SET_ID: built.K4_IMAGE_SET_ID,
    K4_NGINX_IMAGE: built.K4_NGINX_IMAGE,
    K4_BACKEND_IMAGE: built.K4_BACKEND_IMAGE,
    imageIdentities: built.imageIdentities,
  }, {
    K4_IMAGE_SET_ID: "fixed-source-a",
    K4_NGINX_IMAGE: "kittachat-k4-nginx:fixed-source-a",
    K4_BACKEND_IMAGE: "kittachat-k4-backend:fixed-source-a",
    imageIdentities: { nginx: immutableDigest("nginx-fixed-source-a"), backend: immutableDigest("backend-fixed-source-a") },
  });
  assert.equal(built.configArtifacts.nginx.provenance.imageIdentity, immutableDigest("nginx-fixed-source-a"));
  const manifest = JSON.parse(fs.readFileSync(path.join(imageSetManifestRoot, "fixed-source-a.json"), "utf8"));
  assert.equal(manifest.configArtifacts.nginx.content, undefined);
  assert.match(manifest.configArtifacts.nginx.contentFingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("image-set baked config provenance uses bytes copied from the exact immutable image, not the workspace", () => {
  const commands = [];
  const copiedNginxContent = "worker_processes 99;";
  const imageSetManifestRoot = path.join(process.env.TEMP || process.cwd(), "k4-image-set-effective-artifact-manifests");
  const built = buildImageSet("effective-artifact-a", {
    jwtSecret: "test-secret",
    imageSetManifestRoot,
    dockerCommand(args, options) {
      commands.push({ args, env: options.env });
      if (args[0] === "compose") return "built\n";
      if (args[0] === "image" && args.at(-1) === "kittachat-k4-nginx:effective-artifact-a") return `${immutableDigest("nginx-effective-artifact-a")}\n`;
      if (args[0] === "image" && args.at(-1) === "kittachat-k4-backend:effective-artifact-a") return `${immutableDigest("backend-effective-artifact-a")}\n`;
      if (args[0] === "container" && args[1] === "create") return "temporary-nginx-container\n";
      if (args[0] === "container" && args[1] === "inspect") return `${immutableDigest("nginx-effective-artifact-a")}\n`;
      if (args[0] === "cp") {
        fs.writeFileSync(path.join(args.at(-1), "nginx.conf"), copiedNginxContent);
        return "";
      }
      if (args[0] === "container" && args[1] === "rm") return "temporary-nginx-container\n";
      throw new Error(`unexpected Docker command: ${args.join(" ")}`);
    },
  });

  assert.equal(built.configArtifacts.nginx.contentFingerprint, `sha256:${crypto.createHash("sha256").update(copiedNginxContent).digest("hex")}`);
  assert.equal(built.configArtifacts.nginx.provenance.imageIdentity, immutableDigest("nginx-effective-artifact-a"));
  assert.equal(built.configArtifacts.nginx.provenance.artifactPath, "/etc/nginx/nginx.conf");
  assert.equal(commands.some(({ args }) => args[0] === "container" && args[1] === "create"), true);
  assert.equal(commands.some(({ args }) => args[0] === "cp" && args.includes("temporary-nginx-container:/etc/nginx/nginx.conf")), true);
  assert.equal(commands.some(({ args }) => args[0] === "container" && args[1] === "rm"), true);
});

test("baked config provenance fails closed without exact-image artifact attestation", () => {
  const plan = createRunPlan({ runId: "unattested-baked-config", profile: "single-replica" });
  const evidence = effectiveCaptureEvidence();
  evidence.configArtifacts.nginx.provenance.artifactPath = "/etc/nginx/nginx.conf";
  evidence.configArtifacts.nginx.provenance.attestedContentFingerprint = "sha256:stale";

  assert.throws(() => captureEffectiveTopologySnapshot(plan, evidence), /artifact attestation|config provenance/i);
});

function imageSetManifestFor(imageIdentities) {
  return {
    imageIdentities: { nginx: imageIdentities.nginx, backend: imageIdentities.backend },
    configArtifacts: {
      nginx: bakedConfigArtifact("worker_processes 1;", imageIdentities.nginx),
    },
  };
}

function currentSnapshotForProfile({ runId, profile, imageSet, imageSetManifest }) {
  const plan = createRunPlan({ runId, profile });
  const imageEnvironment = imageSetEnvironment(imageSet);
  const services = ["runner", "nginx", "backend", "mongo", "redis", "rabbitmq"];
  const backendCount = profile === "multi-replica" ? 3 : 1;
  const inspected = services.flatMap((service) => Array.from({ length: service === "backend" ? backendCount : 1 }, (_, index) => ({
    Id: `${service}-${index + 1}`,
    Name: `/${plan.projectName}-${service}-${index + 1}`,
    Image: immutableDigest(service === "nginx" ? `nginx-${imageSet}` : service === "backend" ? `backend-${imageSet}` : service),
    Config: {
      Image: service === "nginx" ? imageEnvironment.K4_NGINX_IMAGE : service === "backend" ? imageEnvironment.K4_BACKEND_IMAGE : `${service}:pinned`,
      Labels: { "com.docker.compose.service": service },
      Env: service === "backend" ? ["JWT_SECRET=runtime-only-test-secret", "REFRESH_TOKEN_SECRET=runtime-only-test-secret"] : [],
    },
    NetworkSettings: {
      Networks: Object.fromEntries((service === "runner" ? ["k4-workload"] : service === "nginx" ? ["k4-workload", "k4-backend"] : ["k4-backend"])
        .map((network) => [`${plan.projectName}_${network}`, {}])),
      Ports: {},
    },
  })));
  const renderedCompose = { services: Object.fromEntries(services.map((service) => [service, {
    image: service === "nginx" ? imageEnvironment.K4_NGINX_IMAGE : service === "backend" ? imageEnvironment.K4_BACKEND_IMAGE : `${service}:pinned`,
    environment: service === "backend" ? { JWT_SECRET: "runtime-only-test-secret", REFRESH_TOKEN_SECRET: "runtime-only-test-secret" } : {},
    networks: service === "runner" ? ["k4-workload"] : service === "nginx" ? ["k4-workload", "k4-backend"] : ["k4-backend"],
  }])), networks: {}, volumes: {} };
  const dockerCommand = (args) => {
    if (args[0] === "ps") return inspected.map(({ Id }) => Id).join("\n");
    if (args[0] === "inspect") return JSON.stringify(inspected);
    if (args[0] === "compose" && args.includes("exec")) return "v22.14.0\n";
    if (args[0] === "compose" && args.includes("config")) return JSON.stringify(renderedCompose);
    throw new Error(`unexpected Docker command: ${args.join(" ")}`);
  };
  return currentEffectiveTopologySnapshot(plan, {
    dockerCommand,
    imageSetManifest: imageSetManifest || imageSetManifestFor({ nginx: immutableDigest(`nginx-${imageSet}`), backend: immutableDigest(`backend-${imageSet}`) }),
    comparisonFingerprintKey: "comparison-key-for-test-only",
  });
}

test("current effective snapshot fails closed when the active backend cannot supply the Compose secret", () => {
  const plan = createRunPlan({ runId: "snapshot-missing", profile: "single-replica" });
  const inspected = ["runner", "nginx", "backend", "mongo", "redis", "rabbitmq"].map((service) => ({
    Id: `${service}-id`,
    Image: immutableDigest(service),
    Config: { Labels: { "com.docker.compose.service": service }, Env: [] },
    NetworkSettings: { Networks: {} },
  }));
  const dockerCommand = (args) => {
    if (args[0] === "ps") return inspected.map(({ Id }) => Id).join("\n");
    if (args[0] === "inspect") return JSON.stringify(inspected);
    throw new Error(`Compose must not render without required runtime secret: ${args.join(" ")}`);
  };

  assert.throws(
    () => currentEffectiveTopologySnapshot(plan, { dockerCommand }),
    /required runtime evidence is missing: K4 Compose secret cannot be recovered/,
  );
});

test("effective topology rejects shared runner/backend networks and direct backend ports", () => {
  const sharedNetwork = effectiveSnapshot();
  sharedNetwork.effective_spec.compose.services.backend.networks = ["backend", "workload"];
  assert.throws(() => attestRuntimeTopology(sharedNetwork), /runner and backend share network/);

  const directPort = effectiveSnapshot();
  directPort.effective_spec.compose.services.backend.ports = ["3000:3000"];
  assert.throws(() => attestRuntimeTopology(directPort), /backend exposes an alternate published ingress/);
});

test("runtime attestation rejects network or port contradictions against effective spec", () => {
  const snapshot = effectiveSnapshot();
  snapshot.runtime_attestation.backendReplicas[0].networkSet = ["backend", "unexpected"];
  assert.deepEqual(attestRuntimeTopology(snapshot), { status: "NON-COMPARABLE", reason: "runtime network set contradicts effective spec for backend replica backend-1" });
});

test("runtime attestation preserves and rejects contradictions in every backend replica", () => {
  const snapshot = effectiveSnapshot({ backend_replica_count: 3, backend_upstream_membership: ["backend-1", "backend-2", "backend-3"] });
  snapshot.runtime_attestation.backendReplicas = [
    { id: "backend-1", immutableImage: immutableDigest("backend"), networkSet: ["backend"], publishedPorts: [] },
    { id: "backend-2", immutableImage: immutableDigest("backend"), networkSet: ["backend"], publishedPorts: [] },
    { id: "backend-3", immutableImage: immutableDigest("backend"), networkSet: ["backend"], publishedPorts: [] },
  ];

  assert.deepEqual(attestRuntimeTopology(snapshot), { status: "ATTESTED" });

  for (const [field, value, reason] of [
    ["immutableImage", immutableDigest("unexpected"), "runtime backend replica image contradicts effective spec for backend-2"],
    ["networkSet", ["backend", "workload"], "runtime network set contradicts effective spec for backend replica backend-2"],
    ["publishedPorts", ["127.0.0.1:3000"], "runtime backend ports contradict effective spec for backend-2"],
  ]) {
    const changed = structuredClone(snapshot);
    changed.runtime_attestation.backendReplicas[1][field] = value;
    assert.deepEqual(attestRuntimeTopology(changed), { status: "NON-COMPARABLE", reason }, field);
  }
});

test("cleanup target selection accepts only exact project and run ownership", () => {
  const current = { labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "current" } };
  const foreign = { labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "foreign" } };
  const nonK4 = { labels: { "com.example.owner": "outside" } };

  assert.deepEqual(selectOwnedTargets([current, foreign, nonK4], "current"), [current]);
});

test("cleanup validation rejects non-K4 and foreign-run targets without deletion", () => {
  const current = { labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "current" } };
  const foreign = { labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "foreign" } };
  const nonK4 = { labels: { "com.example.owner": "outside" } };

  assert.deepEqual(validateCleanupTarget("volumes", current, "current"), { status: "ACCEPTED" });
  assert.deepEqual(validateCleanupTarget("volumes", foreign, "current"), { status: "REJECTED", reason: "ownership marker does not match the active K4 run" });
  assert.deepEqual(validateCleanupTarget("volumes", nonK4, "current"), { status: "REJECTED", reason: "ownership marker does not match the active K4 run" });
});

test("K4 compose runner has nginx-only workload ingress and no Docker-management mount", () => {
  const compose = fs.readFileSync(path.resolve(__dirname, "../../../docker-compose.k4.yml"), "utf8");

  assert.match(compose, /K4_WORKLOAD_URL: http:\/\/nginx/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.doesNotMatch(compose, /docker\.sock|\/var\/run\/docker|privileged:\s*true/);
});

test("K4 Compose structurally isolates runner ingress from backend and dependencies", () => {
  const compose = parse(fs.readFileSync(path.resolve(__dirname, "../../../docker-compose.k4.yml"), "utf8"));

  assert.deepEqual(compose.services.runner.networks, ["k4-workload"]);
  assert.deepEqual(compose.services.nginx.networks, ["k4-workload", "k4-backend"]);
  for (const service of ["backend", "mongo", "redis", "rabbitmq"]) {
    assert.deepEqual(compose.services[service].networks, ["k4-backend"], service);
  }
  assert.equal(compose.services.backend.ports, undefined);
  assert.equal(compose.networks["k4-workload"].internal, true);
  assert.equal(compose.networks["k4-backend"].internal, true);
});

test("K4 Compose health-gates Redis and RabbitMQ with service-native probes", () => {
  const compose = fs.readFileSync(path.resolve(__dirname, "../../../docker-compose.k4.yml"), "utf8");

  assert.match(compose, /redis:\n[\s\S]*?healthcheck:\n\s+test: \["CMD", "redis-cli", "ping"\]/);
  assert.match(compose, /rabbitmq:\n[\s\S]*?healthcheck:\n\s+test: \["CMD", "rabbitmq-diagnostics", "-q", "ping"\]/);
});

test("cleanup preview inspects networks and volumes with their Docker inspect subcommands", () => {
  const commands = [];
  const response = (args) => {
    commands.push(args);
    if (args[0] === "ps") return "container-id\n";
    if (args[0] === "network" && args[1] === "ls") return "network-id\n";
    if (args[0] === "volume" && args[1] === "ls") return "volume-id\n";
    if (args[0] === "inspect") return JSON.stringify([{ Id: "container-id", Config: { Labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "current-run" } } }]);
    if (args[0] === "network" && args[1] === "inspect") return JSON.stringify([{ Id: "network-id", Labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "current-run" } }]);
    if (args[0] === "volume" && args[1] === "inspect") return JSON.stringify([{ Name: "volume-id", Labels: { "io.kittachat.k4.project": "kittachat-k4", "io.kittachat.k4.run_id": "current-run" } }]);
    throw new Error(`unexpected Docker command: ${args.join(" ")}`);
  };

  const preview = cleanupPreview("current-run", { dockerCommand: response });

  assert.deepEqual(commands.map((args) => args.slice(0, 2)), [
    ["ps", "--all"],
    ["inspect", "container-id"],
    ["network", "ls"],
    ["network", "inspect"],
    ["volume", "ls"],
    ["volume", "inspect"],
  ]);
  assert.deepEqual(commands[4], [
    "volume",
    "ls",
    "--filter",
    "label=io.kittachat.k4.project=kittachat-k4",
    "--format",
    "{{.Name}}",
  ]);
  assert.equal(preview.targets.networks[0].id, "network-id");
  assert.equal(preview.targets.volumes[0].id, "volume-id");
});

test("runner diagnostic exercises nginx DNS and reports negative Docker access", () => {
  const plan = createRunPlan({ runId: "diagnostic-run", profile: "single-replica" });
  const args = runnerDiagnosticArgs(plan);

  assert.deepEqual(args.slice(-4, -2), ["runner", "node"]);
  assert.match(args.at(-1), /dns\.lookup\("nginx"/);
  assert.match(args.at(-1), /http:\/\/nginx\/healthz/);
  assert.match(args.at(-1), /dockerSocketPresent/);
  assert.match(args.at(-1), /dockerApiReachable/);
  assert.match(args.at(-1), /backendResolvable/);
  assert.match(args.at(-1), /backendDirectReachable/);
});
