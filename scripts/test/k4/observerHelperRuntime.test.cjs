const assert = require("node:assert/strict");
const test = require("node:test");
const { discoverActiveRun } = require("../../k4/observerHelperRuntime");

test("helper discovery maps only exact active-run service containers into closed role membership", async () => {
  const labels = (service) => ({ "com.docker.compose.service": service });
  const containers = [
    { Id: "b2", Labels: labels("backend"), NetworkSettings: { Networks: { backend: { IPAddress: "10.0.0.12" } } } },
    { Id: "b1", Labels: labels("backend"), NetworkSettings: { Networks: { backend: { IPAddress: "10.0.0.11" } } } },
    { Id: "n1", Labels: labels("nginx"), NetworkSettings: { Networks: {} } },
    { Id: "r1", Labels: labels("runner"), NetworkSettings: { Networks: {} } },
  ];
  const engine = { request: async ({ path }) => {
    assert.match(path, /^\/containers\/json\?all=false&filters=/);
    return containers;
  } };
  const active = await discoverActiveRun({ runId: "run-84", project: "kittachat-k4-run-84", engine });
  assert.deepEqual(active.roles, { backend: ["backend-1", "backend-2"], nginx: ["nginx"], runner: ["runner"] });
  assert.equal(active.targets["backend-1"].id, "b1");
  assert.deepEqual(active.targets["backend-2"].addresses, ["10.0.0.12"]);
});
