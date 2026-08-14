const assert = require("node:assert/strict");
const test = require("node:test");
const { createObserverHelperClient } = require("../../k4/observerHelperClient");
const { createObserverHelperServer } = require("../../k4/observerHelperServer");

test("typed helper authenticates and enforces current-run role policy", async () => {
  const server = createObserverHelperServer({ token: "run-token", activeRun: { runId: "run-84", project: "kittachat-k4", roles: { backend: ["backend-1"], runner: ["runner"] } }, adapters: { identity: async ({ target }) => ({ target }) } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = createObserverHelperClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, token: "run-token" });
    const response = await client.identity({ runId: "run-84", project: "kittachat-k4", role: "backend", target: "backend-1" });
    assert.equal(response.target, "backend-1");
    await assert.rejects(client.identity({ runId: "run-84", project: "kittachat-k4", role: "backend", target: "foreign" }), /403/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
