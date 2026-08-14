const test = require("node:test");
const assert = require("node:assert/strict");
const { approvedWorkloadProfile, authoritativeRepresentation, resolveWorkloadProfile, sha256Bytes } = require("../../k4/workloadProfiles");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const profiles = {
  sidebar: { scenario: "sidebar", version: 1, loadModel: { type: "fixed-rate", ratePerSecond: 2 }, pageSize: 20, pagination: { mode: "page", pageSize: 20 } },
  message: { scenario: "message", version: 1, loadModel: { type: "fixed-rate", ratePerSecond: 1 }, messageSizeBytes: 128, senderCount: 1, recipientCount: 1, ackMode: "required", deliveryTimeoutMs: 5000 },
  "socket-concurrency": { scenario: "socket-concurrency", version: 1, loadModel: { type: "concurrency", concurrency: 4 }, clientCount: 4, targetConcurrency: 4, ramp: { mode: "immediate" }, settling: { durationMs: 1000 }, plateau: { durationMs: 2000 } },
};

const executableProfiles = {
  sidebar: {
    scenario: "sidebar", version: 2, loadModel: { type: "open-loop", ratePerSecond: 2 },
    warmup: { durationSeconds: 10 }, measurement: { durationSeconds: 30 },
    actorAllocation: { alice: 1 }, connectionReuse: "http-keep-alive-per-phase",
    request: { method: "GET", path: "/api/sidebar/conversations" }, pagination: { mode: "page", pageSize: 20 },
  },
  message: {
    scenario: "message", version: 2, loadModel: { type: "open-loop", ratePerSecond: 1 },
    warmup: { durationSeconds: 10 }, measurement: { durationSeconds: 30 },
    actorAllocation: { sender: "alice", recipient: "bob" }, connectionReuse: "persistent-socket-per-actor-per-phase",
    messageSizeBytes: 128, ackMode: "required", deliveryTimeoutMs: 5000,
  },
  "socket-concurrency": {
    scenario: "socket-concurrency", version: 2, loadModel: { type: "connection-ramp", targetConcurrency: 4 },
    actorAllocation: { alice: 2, bob: 2 }, ramp: { mode: "immediate", timeoutMs: 10000 },
    settling: { durationMs: 1000 }, plateau: { durationMs: 2000 },
  },
};

test("resolves each scenario with an explicit scenario-specific schema and digest", () => {
  for (const profile of Object.values(profiles)) {
    const resolved = resolveWorkloadProfile(profile);
    assert.equal(resolved.digest, sha256Bytes(resolved.bytes));
    assert.equal(resolved.snapshot.scenario, profile.scenario);
  }
});

test("rejects cross-schema and generic superset payloads", () => {
  assert.throws(() => resolveWorkloadProfile({ ...profiles.sidebar, messageSizeBytes: 1 }), /unknown sidebar/);
  assert.throws(() => resolveWorkloadProfile({ ...profiles.message, clientCount: 1 }), /unknown message/);
  assert.throws(() => resolveWorkloadProfile({ ...profiles.sidebar, messageSizeBytes: 1, clientCount: 1 }), /unknown sidebar/);
});

test("same workload is topology-independent and workload edits change digest", () => {
  const single = resolveWorkloadProfile(profiles.message);
  const multi = resolveWorkloadProfile(profiles.message);
  assert.deepEqual(single.snapshot, multi.snapshot);
  assert.equal(single.digest, multi.digest);
  assert.notEqual(single.digest, resolveWorkloadProfile({ ...profiles.message, messageSizeBytes: 129 }).digest);
});

test("operational metadata is closed and cannot carry nested workload overrides", () => {
  const base = resolveWorkloadProfile(profiles.sidebar, { label: "smoke" });
  assert.equal(base.metadata.label, "smoke");
  assert.throws(() => resolveWorkloadProfile(profiles.sidebar, { unknown: "x" }), /unsupported operational metadata/);
  assert.throws(() => resolveWorkloadProfile(profiles.sidebar, { label: { pageSize: 99 } }), /unsupported operational metadata/);
});

test("rejects arbitrary versions and CLI-style scenario mismatches", () => {
  assert.throws(() => resolveWorkloadProfile({ ...profiles.sidebar, version: "custom" }), /approved version/);
  assert.throws(() => resolveWorkloadProfile({ ...profiles.sidebar, scenario: "message" }), /unknown message workload fields/);
});

test("approved scenario versions resolve while execution rejects raw workload channels", () => {
  const approved = approvedWorkloadProfile("sidebar", 1, { label: "smoke" });
  assert.equal(approved.metadata.label, "smoke");
  const cli = path.resolve(__dirname, "../../k4/cli.js");
  for (const action of ["start", "setup-preflight", "diagnose-runner"]) {
    const result = spawnSync(process.execPath, [cli, action, "--run-id", `cli-${action}`, "--profile", "single-replica", "--scenario", "sidebar", "--workload-json", "{}"], { encoding: "utf8", env: process.env });
    assert.notEqual(result.status, 0, action);
    assert.match(result.stderr, /raw workload channels are forbidden/);
  }
  const inspected = spawnSync(process.execPath, [cli, "resolve", "--run-id", "cli-inspection", "--profile", "single-replica", "--scenario", "sidebar", "--workload-json", JSON.stringify({ version: 1, loadModel: { type: "fixed-rate", ratePerSecond: 2 }, pageSize: 20, pagination: { mode: "page", pageSize: 20 } })], { encoding: "utf8", env: process.env });
  assert.equal(inspected.status, 0);
  assert.match(inspected.stdout, /"scenario": "sidebar"/);
});

test("locks the exact production-executable v2 profiles and leaves v1 immutable", () => {
  for (const [scenario, expected] of Object.entries(executableProfiles)) {
    const approved = approvedWorkloadProfile(scenario, 2);
    assert.deepEqual(approved.snapshot, expected);
    assert.equal(approved.digest, sha256Bytes(Buffer.from(authoritativeRepresentation(expected))));
  }
  assert.equal(approvedWorkloadProfile("sidebar", 1).snapshot.version, 1);
  assert.throws(() => approvedWorkloadProfile("sidebar", 3), /not approved/);
});
