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

test("CLI execute accepts an operational fault fixture without changing the resolved workload", async () => {
  const original = process.argv;
  process.argv = [process.execPath, "cli.js", "execute", "--run-id", "cli-fixture", "--profile", "single-replica", "--scenario", "message", "--workload-version", "2", "--fault-fixture", "acknowledgement-failure"];
  let received;
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const { main } = require("../../k4/cli");
    await main({ executeProduction: async (input) => { received = input; return { executionOutcome: "COMPLETED" }; } });
  } finally { process.argv = original; process.stdout.write = originalWrite; }
  assert.equal(received.faultFixture, "acknowledgement-failure");
  assert.equal(received.plan.workload.snapshot.scenario, "message");
  assert.equal(received.plan.workload.snapshot.faultFixture, undefined);
});

test("CLI help documents the bounded message fault fixtures", async () => {
  const original = process.argv;
  process.argv = [process.execPath, "cli.js", "help"];
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (value) => { writes.push(value); return true; };
  try {
    const { main } = require("../../k4/cli");
    await main();
  } finally { process.argv = original; process.stdout.write = originalWrite; }
  assert.match(writes.join(""), /acknowledgement-failure/);
  assert.match(writes.join(""), /recipient-delivery-timeout/);
});

test("CLI rejects a fault fixture outside the operational allowlist", async () => {
  const original = process.argv;
  process.argv = [process.execPath, "cli.js", "execute", "--run-id", "cli-invalid-fixture", "--profile", "single-replica", "--scenario", "message", "--workload-version", "2", "--fault-fixture", "arbitrary-workload-mutation"];
  try {
    const { main } = require("../../k4/cli");
    await assert.rejects(main({ executeProduction: async () => assert.fail("invalid fixture must fail before production") }), /unsupported K4 fault fixture/);
  } finally { process.argv = original; }
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
