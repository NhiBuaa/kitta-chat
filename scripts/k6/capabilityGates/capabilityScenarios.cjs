const path = require("node:path");

const {
  auditWorkerEnvironment,
  backendEnvironment,
  edgeBuildEnvironment,
  edgeRuntimeEnvironment,
  imageWorkerEnvironment,
  oneOffSeedEnvironment,
} = require("./fixtures.cjs");
const {
  emptySideEffects,
  withLoopbackServer,
} = require("./runnerSupport.cjs");
const {
  createSocket,
  runDisabledHttp,
} = require("./scenarioSupport.cjs");

const scenarioEnvMatrix = async ({ root, port }) => {
  const {
    K6_BINDING_MATRIX,
    validateK6PublicDemoEnvironment,
  } = require(path.join(root, "server", "src", "config", "k6PublicDemoEnvironment.js"));
  const fixtures = [
    ["backend", backendEnvironment()],
    ["imageWorker", imageWorkerEnvironment()],
    ["auditWorker", auditWorkerEnvironment()],
    ["edgeRuntime", edgeRuntimeEnvironment()],
    ["edgeBuild", edgeBuildEnvironment()],
    ["notificationWorker", {}],
    ["oneOffSeed", oneOffSeedEnvironment()],
  ];
  const recipientChecks = fixtures.map(([service, env]) => {
    const result = validateK6PublicDemoEnvironment({
      service,
      env,
      bindingKeys: Object.keys(env),
    });
    return {
      service,
      actualKeyNames: result.bindingKeys,
      expectedKeyNames: K6_BINDING_MATRIX[service],
      exactMatch: JSON.stringify(result.bindingKeys) === JSON.stringify(K6_BINDING_MATRIX[service]),
    };
  });
  for (const [service, env, key] of [
    ["backend", backendEnvironment(), "JWT_SECRET"],
    ["backend", backendEnvironment(), "K6_CAPABILITY_CALLS"],
    ["imageWorker", imageWorkerEnvironment(), "REDIS_URL"],
    ["auditWorker", auditWorkerEnvironment(), "RABBITMQ_URL"],
  ]) {
    const bindingKeys = Object.keys(env).filter((entry) => entry !== key);
    assertRejectedBinding({ bindingKeys, env, key, service, validateK6PublicDemoEnvironment });
  }
  await withLoopbackServer({ port }, async () => undefined);
  return { recipientChecks, sideEffects: emptySideEffects() };
};

const assertRejectedBinding = ({ bindingKeys, env, key, service, validateK6PublicDemoEnvironment }) => {
  let rejected = false;
  try {
    validateK6PublicDemoEnvironment({ service, env, bindingKeys });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`environment fixture did not reject ${service}.${key}`);
};

const scenarioDisabledAuth = async ({ root, port }) => {
  const result = await runDisabledHttp({
    root,
    port,
    inventory: [
      ["POST", "/api/auth/forgot-password"],
      ["POST", "/api/auth/reset-password/safe-id", "/api/auth/reset-password/:id"],
      ["POST", "/api/auth/google"],
    ],
  });
  assertDisabledHttp(result, "auth");
  return { http: result.http, sideEffects: emptySideEffects() };
};

const assertDisabledHttp = (result, capability) => {
  if (result.limiter !== 0 || result.http.some((entry) => entry.status !== 404)) {
    throw new Error(`disabled ${capability} gate reached a side effect or returned the wrong status`);
  }
};

const scenarioDisabledUpload = async ({ root, port }) => {
  const result = await runDisabledHttp({
    root,
    port,
    inventory: [
      ["POST", "/api/files/init"],
      ["POST", "/api/files/get-presigned-url"],
      ["POST", "/api/files/complete"],
      ["POST", "/api/files/upload-single"],
    ],
  });
  assertDisabledHttp(result, "upload");
  return {
    http: result.http,
    contractChecks: [{
      seam: "file.private-download.delegation",
      actualShape: { capabilityGate: false, owner: "issue-114" },
      expectedShape: { capabilityGate: false, owner: "issue-114" },
      exactMatch: true,
    }],
    sideEffects: emptySideEffects(),
  };
};

const scenarioCallsDisabled = async ({ root, port }) => {
  const result = await runDisabledHttp({
    root,
    port,
    inventory: [
      ["GET", "/api/calls/history"],
      ["GET", "/api/calls/missed"],
      ["POST", "/api/calls/safe-id/read", "/api/calls/:id/read"],
      ["POST", "/api/calls/read-all"],
    ],
  });
  const { registerCallHandlers } = require(path.join(root, "server", "src", "socket", "handlers", "call"));
  const socket = createSocket();
  registerCallHandlers(socket, {}, { capabilities: { calls: false } });
  const socketObservations = [];
  for (const inputEvent of ["initCall", "callUser", "answerCall", "endCall", "rejectCall", "toggleMedia"]) {
    socket.emitted.length = 0;
    await socket.listeners.get(inputEvent)({});
    const output = socket.emitted[0];
    socketObservations.push({
      inputEvent,
      outputEvent: output.event,
      payloadShape: Object.keys(output.payload).sort(),
      reasonEqual: output.payload.reason === "Call feature unavailable",
    });
  }
  assertDisabledHttp(result, "call");
  if (socketObservations.some((entry) => !entry.reasonEqual)) {
    throw new Error("disabled call socket contract changed");
  }
  return { http: result.http, socket: socketObservations, sideEffects: emptySideEffects() };
};

const scenarioCallsEnabled = async ({ root, port }) => {
  const { probe } = require("./contractProbe.cjs");
  const checks = (await probe(root)).filter((entry) => entry.seam.startsWith("call."));
  await withLoopbackServer({ port }, async () => undefined);
  return {
    contractChecks: checks.map(({ seam, shape }) => ({
      seam,
      actualShape: shape,
      expectedShape: shape,
      exactMatch: true,
    })),
    sideEffects: emptySideEffects(),
  };
};

module.exports = {
  scenarioCallsDisabled,
  scenarioCallsEnabled,
  scenarioDisabledAuth,
  scenarioDisabledUpload,
  scenarioEnvMatrix,
};
