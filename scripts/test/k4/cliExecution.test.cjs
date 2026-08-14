const assert = require("node:assert/strict");
const test = require("node:test");

test("CLI execute passes only an approved resolved plan into production composition", async () => {
  const original = process.argv;
  process.argv = [process.execPath, "cli.js", "execute", "--run-id", "cli-execute", "--profile", "single-replica", "--scenario", "sidebar", "--workload-version", "2"];
  let received;
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (value) => { writes.push(value); return true; };
  try {
    const { main } = require("../../k4/cli");
    await main({ executeProduction: async (input) => { received = input; return { executionOutcome: "COMPLETED" }; } });
  } finally { process.argv = original; process.stdout.write = originalWrite; }
  assert.equal(received.plan.workload.scenario, "sidebar");
  assert.equal(received.plan.topology.profile, "single-replica");
  assert.match(writes.join(""), /COMPLETED/);
});

test("CLI production entry fails closed before setup for immutable non-executable v1", async () => {
  const original = process.argv;
  process.argv = [process.execPath, "cli.js", "execute", "--run-id", "cli-incomplete", "--profile", "single-replica", "--scenario", "sidebar", "--workload-version", "1"];
  try {
    const { main } = require("../../k4/cli");
    const { executeProduction } = require("../../k4/runtimeComposition");
    await assert.rejects(main({ executeProduction }), /requires approved production-executable version 2/);
  } finally {
    process.argv = original;
  }
});
