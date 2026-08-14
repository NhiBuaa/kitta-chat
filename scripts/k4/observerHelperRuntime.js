const { createDockerEngineClient } = require("./dockerEngineClient");
const { createDockerObservationAdapters } = require("./dockerObservationAdapters");
const { createObserverHelperServer } = require("./observerHelperServer");

const RUN_LABEL = "io.kittachat.k4.run_id";
const PROJECT_LABEL = "com.docker.compose.project";
const SERVICE_LABEL = "com.docker.compose.service";

async function discoverActiveRun({ runId, project, engine }) {
  const filters = encodeURIComponent(JSON.stringify({ label: [`${RUN_LABEL}=${runId}`, `${PROJECT_LABEL}=${project}`] }));
  const containers = await engine.request({ path: `/containers/json?all=false&filters=${filters}` });
  const grouped = { backend: [], nginx: [], runner: [] };
  for (const container of containers) {
    const role = container.Labels?.[SERVICE_LABEL];
    if (grouped[role]) grouped[role].push(container);
  }
  for (const role of Object.keys(grouped)) grouped[role].sort((left, right) => left.Id.localeCompare(right.Id));
  if (grouped.nginx.length !== 1 || grouped.runner.length !== 1 || grouped.backend.length < 1) throw new Error("active K4 run topology is incomplete or ambiguous");
  const targets = {};
  grouped.backend.forEach((container, index) => {
    targets[`backend-${index + 1}`] = { id: container.Id, role: "backend", addresses: Object.values(container.NetworkSettings?.Networks || {}).map(({ IPAddress }) => IPAddress).filter(Boolean) };
  });
  for (const role of ["nginx", "runner"]) targets[role] = { id: grouped[role][0].Id, role };
  return {
    runId,
    project,
    targets,
    roles: {
      backend: Object.keys(targets).filter((name) => name.startsWith("backend-")),
      nginx: ["nginx"],
      runner: ["runner"],
    },
  };
}

async function startObserverHelper({ env = process.env, engine = createDockerEngineClient(), fetchFn = fetch } = {}) {
  const token = env.K4_OBSERVER_TOKEN;
  const runId = env.K4_RUN_ID;
  const project = env.K4_PROJECT_NAME;
  if (!token || !runId || !project) throw new Error("observer helper run identity is incomplete");
  const activeRun = await discoverActiveRun({ runId, project, engine });
  const adapters = createDockerObservationAdapters({ activeRun, engine, fetchFn });
  const server = createObserverHelperServer({ token, activeRun, adapters });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(env.K4_OBSERVER_HELPER_PORT || 8080), "0.0.0.0", resolve);
  });
  return { server, activeRun };
}

if (require.main === module) {
  startObserverHelper().catch((error) => {
    process.stderr.write(`observer helper failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { discoverActiveRun, startObserverHelper };
