const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createRuntimeComposition,
  executeRunnerWorkload,
  runnerPhaseArgs,
} = require("../../k4/runtimeComposition");

function plan(scenario = "sidebar") {
  const profile = require("../../k4/workloadProfiles").approvedWorkloadProfile(scenario, 2);
  return {
    runId: "runtime-composition",
    projectName: "kittachat-k4-runtime-composition",
    composeFile: "docker-compose.k4.yml",
    backendReplicaCount: 1,
    backendUpstreamMembership: ["backend-1"],
    topology: {
      profile: "single-replica",
      backendReplicaCount: 1,
      backendUpstreamMembership: ["backend-1"],
    },
    resultDirectory: "C:/tmp/k4/runtime-composition",
    workload: { ...profile, bytes: undefined, metadata: { label: "review" } },
  };
}

test("production composition scopes secrets in memory and drives the approved lifecycle through runner and nginx", async () => {
  const trace = [];
  let suppliedEnvironment;
  const executeRunFn = async (resolvedPlan, { executePhase, observation }) => {
    assert.equal(resolvedPlan.workload.scenario, "sidebar");
    assert.equal(observation.id, "production-observation");
    const context = {
      plan: resolvedPlan,
      registerOwnedResource(resource) { trace.push(["owned", resource]); },
      ownedResources: () => [{ class: "run", id: resolvedPlan.runId }],
    };
    const setup = await executePhase("setup/seed", context);
    const warmup = await executePhase("warm-up", { ...context, ...setup });
    const measurement = await executePhase("measurement", { ...context, ...setup, ...warmup });
    const teardown = await executePhase("teardown", context);
    return { setup, warmup, measurement, teardown };
  };
  const runtime = createRuntimeComposition({
    executeRunFn,
    environment: {
      K4_IMAGE_SET_ID: "fixed-images",
      K4_BENCHMARK_EMAIL: "alice@kittachat.test",
      K4_BENCHMARK_PASSWORD: "memory-only-password",
    },
    randomBytes: (size) => Buffer.alloc(size, 7),
    setupPreflight: async ({ environment }) => {
      suppliedEnvironment = environment;
      trace.push(["setup", environment.K4_BENCHMARK_EMAIL]);
      return { warmupAdmission: "WARMUP_ADMITTED", benchmarkActors: { alice: { id: "actor-alice", token: "secret-a" } } };
    },
    executeRunnerWorkload: async ({ phase, target, workload, actorRefs, actorSecrets }) => {
      assert.equal(actorSecrets.alice.token, "secret-a");
      trace.push([phase, target, workload.scenario, Object.keys(actorRefs)]);
      return phase === "measurement"
        ? { numbers: { requests: 2 }, measuredRequestIds: ["sidebar-1"], runnerShortfallSamples: [] }
        : { stable: true };
    },
    teardownOwnedRun: async ({ ownedResources }) => {
      trace.push(["teardown", ownedResources]);
      return { released: true };
    },
    observationFactory: ({ intervalMs, environment }) => {
      assert.equal(intervalMs, 250);
      assert.equal(environment.K4_OBSERVER_TOKEN, Buffer.alloc(32, 7).toString("hex"));
      return { id: "production-observation" };
    },
    observerBridgeFactory: ({ plan: suppliedPlan, environment }) => {
      assert.equal(suppliedPlan.runId, "runtime-composition");
      assert.match(environment.K4_OBSERVER_TOKEN, /^[a-f0-9]{64}$/);
      return { kind: "compose-observer-bridge" };
    },
    observationSourcesFactory: ({ helper }) => {
      assert.equal(helper.kind, "compose-observer-bridge");
      return { kind: "production-runtime-port" };
    },
  });

  const result = await runtime.executeProduction({ plan: plan(), intervalMs: 250 });

  assert.equal(suppliedEnvironment.K4_JWT_SECRET, Buffer.alloc(48, 7).toString("hex"));
  assert.equal(suppliedEnvironment.K4_OBSERVER_TOKEN, Buffer.alloc(32, 7).toString("hex"));
  assert.deepEqual(trace.map((entry) => entry[0]), ["owned", "setup", "warm-up", "measurement", "teardown"]);
  assert.equal(result.measurement.numbers.requests, 2);
  assert.equal(JSON.stringify(result).includes("secret-a"), false);
  for (const entry of trace.filter((item) => item[0] === "warm-up" || item[0] === "measurement")) {
    assert.equal(entry[1], "http://nginx");
  }
});

test("production composition fails closed and uses the registered ownership ledger for teardown", async () => {
  const trace = [];
  const executeRunFn = async (resolvedPlan, { executePhase }) => {
    const owned = [];
    const context = {
      plan: resolvedPlan,
      registerOwnedResource(resource) { owned.push(resource); },
      ownedResources: () => [...owned],
    };
    await assert.rejects(executePhase("setup/seed", context), /setup\/preflight did not admit warm-up/);
    return executePhase("teardown", context);
  };
  const runtime = createRuntimeComposition({
    executeRunFn,
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 3),
    setupPreflight: async () => ({ warmupAdmission: "NOT_ADMITTED", status: "FAILED_SETUP" }),
    executeRunnerWorkload: async () => assert.fail("workload must not run after failed setup"),
    teardownOwnedRun: async ({ ownedResources }) => {
      trace.push(ownedResources);
      return { released: true };
    },
    observationFactory: () => ({ id: "unused" }),
  });

  await runtime.executeProduction({ plan: plan() });
  assert.equal(trace.length, 1);
  assert.equal(trace[0][0].class, "run");
  assert.equal(trace[0][0].id, "runtime-composition");
});

test("production composition has a closed approved-scenario adapter set", async () => {
  const runtime = createRuntimeComposition({
    executeRunFn: async () => assert.fail("invalid scenario must fail before lifecycle"),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    randomBytes: (size) => Buffer.alloc(size, 1),
    setupPreflight: async () => assert.fail("invalid scenario must fail before setup"),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
  });
  const customPlan = plan("sidebar");
  customPlan.workload.scenario = "custom";
  customPlan.workload.snapshot.scenario = "custom";
  await assert.rejects(runtime.executeProduction({ plan: customPlan }), /production workload adapter is unavailable/);
});

test("runner phase transport keeps credentials out of command arguments", () => {
  const args = runnerPhaseArgs(plan(), {
    phase: "measurement",
    workload: plan().workload,
    actorRefs: { alice: { id: "actor-alice" } },
  });
  const serialized = JSON.stringify(args);
  assert.doesNotMatch(serialized, /token|password|authorization/i);
  assert.match(serialized, /K4_ACTOR_REFS_B64/);
  assert.equal(serialized.includes("K4_ACTORS_B64"), false);
  assert.match(serialized, /K4_ACTOR_SECRETS_JSON/);
  assert.doesNotMatch(serialized, /secret-a/);
});

test("production setup authenticates every v2 message actor through nginx", async () => {
  const { runApprovedSetupPreflight } = require("../../k4/runtimeComposition");
  const requestedEmails = [];
  const runtimePlan = plan("message");
  const result = await runApprovedSetupPreflight({
    plan: runtimePlan,
    environment: { K4_BENCHMARK_EMAIL: "alice@kittachat.test", K4_BENCHMARK_PASSWORD: "memory-only" },
    dockerCommand: (args, { env }) => {
      const command = args.join(" ");
      if (command.includes("k4VerifyDataset")) return JSON.stringify(require("../../k4/preflight").K4_DATASET_DECLARATION);
      if (command.includes("api/auth/login")) {
      const bobEmail = args.find((entry) => entry.startsWith("K4_BOB_EMAIL="))?.split("=")[1];
      const email = bobEmail || env.K4_BOB_EMAIL || env.K4_BENCHMARK_EMAIL;
        requestedEmails.push(email);
        const name = email.startsWith("bob") ? "bob" : "alice";
        return JSON.stringify({ token: `${name}-token`, user: { id: `${name}-id` } });
      }
      return "socket-authenticated";
    },
  });
  assert.deepEqual(requestedEmails, ["alice@kittachat.test", "bob@kittachat.test"]);
  assert.deepEqual(Object.keys(result.benchmarkActors), ["alice", "bob"]);
});

test("runner phase persists raw phase output while keeping secrets outside artifacts", async () => {
  let written;
  const runtimePlan = plan("sidebar");
  const evidence = await executeRunnerWorkload({
    plan: runtimePlan,
    phase: "measurement",
    workload: runtimePlan.workload,
    actorRefs: { alice: { id: "alice-id" } },
    actorSecrets: { alice: { token: "memory-only-token" } },
    environment: {},
    dockerCommand: (_args, { env }) => {
      assert.match(env.K4_ACTOR_SECRETS_JSON, /memory-only-token/);
      return JSON.stringify({ measuredRequestIds: ["request-1"], runnerShortfallSamples: [] });
    },
    writeFileSync: (artifactPath, content, options) => { written = { artifactPath, content, options }; },
  });
  assert.deepEqual(evidence.measuredRequestIds, ["request-1"]);
  assert.match(written.artifactPath, /measurement-runner\.json$/);
  assert.doesNotMatch(written.content, /memory-only-token/);
  assert.equal(written.options.flag, "wx");
});

test("production composition rejects non-executable v1 before setup", async () => {
  const incomplete = plan("sidebar");
  incomplete.workload.snapshot = {
    scenario: "sidebar",
    version: 1,
    loadModel: { type: "fixed-rate", ratePerSecond: 2 },
    pageSize: 20,
    pagination: { mode: "page", pageSize: 20 },
  };
  const runtime = createRuntimeComposition({
    executeRunFn: async () => assert.fail("incomplete workload must fail before lifecycle"),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    setupPreflight: async () => assert.fail("incomplete workload must fail before setup"),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
  });
  await assert.rejects(runtime.executeProduction({ plan: incomplete }), /requires approved production-executable version 2/);
});

test("production composition rejects socket execution without a locked actor allocation and ramp timeout", async () => {
  const incomplete = plan("socket-concurrency");
  incomplete.workload.snapshot = {
    scenario: "socket-concurrency",
    version: 1,
    loadModel: { type: "concurrency", concurrency: 4 },
    clientCount: 4,
    targetConcurrency: 4,
    ramp: { mode: "immediate" },
    settling: { durationMs: 1000 },
    plateau: { durationMs: 2000 },
  };
  const runtime = createRuntimeComposition({
    executeRunFn: async () => assert.fail("incomplete workload must fail before lifecycle"),
    environment: { K4_IMAGE_SET_ID: "fixed-images", K4_BENCHMARK_PASSWORD: "memory-only-password" },
    setupPreflight: async () => assert.fail("incomplete workload must fail before setup"),
    executeRunnerWorkload: async () => ({}),
    teardownOwnedRun: async () => ({}),
    observationFactory: () => ({}),
  });
  await assert.rejects(runtime.executeProduction({ plan: incomplete }), /requires approved production-executable version 2/);
});
