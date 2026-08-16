const assert = require("node:assert/strict");
const test = require("node:test");
const { crossReplicaAttribution, sidebarAttribution, socketAttribution } = require("../../k4/measurementAttribution");

const metadata = { runId: "run-84", sourceIdentity: "nginx", sourceDigest: "sha256:x", parserVersion: "v1", measurementStart: "2026-08-13T00:00:00Z", measurementEnd: "2026-08-13T00:00:10Z" };

function validCrossReplicaRecords() {
  return {
    sender: { correlationId: "c1", actorRef: "a", recipientRef: "b", conversationId: "a_b", replica: "backend-1" },
    acknowledgement: { correlationId: "c1", actorRef: "a", recipientRef: "b", success: true, realId: "m1", messageId: "m1", conversationId: "a_b" },
    receiver: { correlationId: "c1", actorRef: "b", senderRef: "a", messageId: "m1", conversationId: "a_b", replica: "backend-2" },
    delivery: { correlationId: "c1", success: true, messageId: "m1", senderId: "a", recipientId: "b", conversationId: "a_b" },
  };
}

test("sidebar attribution binds measured request ids to unique upstream replicas", () => {
  const result = sidebarAttribution({ records: [{ requestId: "r1", upstreamAddr: "10.0.0.1:3000" }, { requestId: "r2", upstreamAddr: "10.0.0.2:3000" }], requestIds: ["r1", "r2"], replicaAddressMap: { "10.0.0.1:3000": "backend-1", "10.0.0.2:3000": "backend-2" }, metadata });
  assert.equal(result.claimEligible, true);
  assert.equal(result.topologyNotExercised, false);
  assert.equal(sidebarAttribution({ records: [], requestIds: ["r1"], metadata }).topologyNotExercised, false);
});

test("socket attribution reconstructs lifetimes overlapping measurement", () => {
  const result = socketAttribution({
    measurementStart: metadata.measurementStart,
    measurementEnd: metadata.measurementEnd,
    measuredActors: ["a", "b"],
    measuredConnections: [{ actorRef: "a", socketId: "s1" }, { actorRef: "b", socketId: "s2" }],
    metadata,
    lifecycles: [{ actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-12T23:59:59Z", disconnectedAt: "2026-08-13T00:00:05Z" }, { actorRef: "b", socketId: "s2", nodeName: "backend-2", authenticatedAt: "2026-08-13T00:00:02Z", disconnectedAt: null }],
  });
  assert.equal(result.claimEligible, true);
  assert.deepEqual(result.replicas, ["backend-1", "backend-2"]);
});

test("socket attribution fails closed without an authoritative connection binding", () => {
  const result = socketAttribution({
    measurementStart: metadata.measurementStart,
    measurementEnd: metadata.measurementEnd,
    measuredActors: ["a", "b"],
    metadata,
    lifecycles: [{ actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null }],
  });
  assert.equal(result.complete, false);
  assert.equal(result.claimEligible, false);
  assert.equal(result.incompleteReasons.includes("measured connection binding missing"), true);
});

test("socket attribution rejects duplicate, missing, extra, and actor-mismatched socket lifecycles", () => {
  const base = {
    measurementStart: metadata.measurementStart,
    measurementEnd: metadata.measurementEnd,
    measuredActors: ["a", "b"],
    measuredConnections: [{ actorRef: "a", socketId: "s1" }, { actorRef: "b", socketId: "s2" }],
    metadata,
  };
  const mismatch = socketAttribution({ ...base, lifecycles: [
    { actorRef: "b", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null },
    { actorRef: "b", socketId: "s2", nodeName: "backend-2", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null },
  ] });
  assert.equal(mismatch.complete, false);
  assert.equal(mismatch.incompleteReasons.includes("measured actor binding mismatch"), true);

  const duplicate = socketAttribution({ ...base, measuredConnections: [{ actorRef: "a", socketId: "s1" }, { actorRef: "b", socketId: "s1" }], lifecycles: [
    { actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null },
  ] });
  assert.equal(duplicate.complete, false);
  assert.equal(duplicate.incompleteReasons.includes("duplicate measured socket binding"), true);

  const extra = socketAttribution({ ...base, lifecycles: [
    { actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null },
    { actorRef: "b", socketId: "s2", nodeName: "backend-2", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null },
    { actorRef: "a", socketId: "s3", nodeName: "backend-3", authenticatedAt: "2026-08-13T00:00:01Z", disconnectedAt: null },
  ] });
  assert.equal(extra.complete, false);
  assert.equal(extra.incompleteReasons.includes("measured socket lifecycle incomplete"), true);
});

test("socket attribution records malformed and ambiguous lifecycle timestamps as incomplete diagnostics", () => {
  const result = socketAttribution({
    measurementStart: metadata.measurementStart,
    measurementEnd: metadata.measurementEnd,
    measuredActors: ["a", "b"],
    measuredConnections: [{ actorRef: "a", socketId: "s1" }, { actorRef: "b", socketId: "s2" }],
    metadata,
    lifecycles: [
      { actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "not-a-time", disconnectedAt: null },
      { actorRef: "b", socketId: "s2", nodeName: "backend-2", authenticatedAt: "2026-08-13T00:00:02Z", disconnectedAt: "2026-08-13T00:00:02Z" },
    ],
  });
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics.length >= 2, true);
});

test("socket attribution requires every measured socket and distinguishes one-replica exercise", () => {
  const oneReplica = socketAttribution({
    measurementStart: metadata.measurementStart,
    measurementEnd: metadata.measurementEnd,
    measuredActors: ["a", "a"],
    measuredConnections: [{ actorRef: "a", socketId: "s1" }, { actorRef: "a", socketId: "s2" }],
    metadata,
    lifecycles: [
      { actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:02Z", disconnectedAt: null },
      { actorRef: "a", socketId: "s2", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:02Z", disconnectedAt: null },
    ],
  });
  assert.equal(oneReplica.complete, true);
  assert.equal(oneReplica.topologyNotExercised, true);
  assert.equal(oneReplica.claimEligible, false);

  const incomplete = socketAttribution({
    measurementStart: metadata.measurementStart,
    measurementEnd: metadata.measurementEnd,
    measuredActors: ["a", "a"],
    measuredConnections: [{ actorRef: "a", socketId: "s1" }, { actorRef: "a", socketId: "s2" }],
    metadata,
    lifecycles: [{ actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-13T00:00:02Z", disconnectedAt: null }],
  });
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.topologyNotExercised, false);
});

test("cross-replica attribution requires one correlation, measured actors, ack and delivery", () => {
  const result = crossReplicaAttribution({
    measuredActors: { sender: "a", recipient: "b" },
    metadata,
    sender: { correlationId: "c1", actorRef: "a", recipientRef: "b", conversationId: "a_b", replica: "backend-1" },
    acknowledgement: { correlationId: "c1", actorRef: "a", recipientRef: "b", success: true, realId: "m1", messageId: "m1", conversationId: "a_b" },
    receiver: { correlationId: "c1", actorRef: "b", senderRef: "a", messageId: "m1", conversationId: "a_b", replica: "backend-2" },
    delivery: { correlationId: "c1", success: true, messageId: "m1", senderId: "a", recipientId: "b", conversationId: "a_b" },
  });
  assert.equal(result.claimEligible, true);
  assert.equal(result.sampleEligible, true);
  assert.equal(result.deliveryEligible, true);
});

test("cross-replica attribution rejects message identity mismatches", () => {
  const result = crossReplicaAttribution({
    measuredActors: { sender: "a", recipient: "b" },
    metadata,
    sender: { correlationId: "c1", actorRef: "a", recipientRef: "b", conversationId: "a_b", replica: "backend-1" },
    acknowledgement: { correlationId: "c1", actorRef: "a", recipientRef: "b", success: true, realId: "m1", messageId: "m1", conversationId: "a_b" },
    receiver: { correlationId: "c1", actorRef: "b", senderRef: "a", messageId: "m2", conversationId: "a_b", replica: "backend-2" },
    delivery: { correlationId: "c1", success: true, messageId: "m2", senderId: "a", recipientId: "b", conversationId: "a_b" },
  });
  assert.equal(result.complete, false);
  assert.equal(result.claimEligible, false);
  assert.equal(result.sampleEligible, false);
});

test("same-replica message sample is ineligible without claiming run-level topology", () => {
  const result = crossReplicaAttribution({
    measuredActors: { sender: "a", recipient: "b" },
    metadata,
    sender: { correlationId: "c1", actorRef: "a", recipientRef: "b", conversationId: "a_b", replica: "backend-1" },
    acknowledgement: { correlationId: "c1", actorRef: "a", recipientRef: "b", success: true, realId: "m1", messageId: "m1", conversationId: "a_b" },
    receiver: { correlationId: "c1", actorRef: "b", senderRef: "a", messageId: "m1", conversationId: "a_b", replica: "backend-1" },
    delivery: { correlationId: "c1", success: true, messageId: "m1", senderId: "a", recipientId: "b", conversationId: "a_b" },
  });
  assert.equal(result.sampleEligible, false);
  assert.equal(result.deliveryEligible, true);
  assert.equal(result.topologyNotExercised, true);
  assert.equal(result.runTopologyNotExercised, undefined);
});

test("cross-replica attribution requires conversation and message identity on every record", () => {
  const result = crossReplicaAttribution({
    measuredActors: { sender: "a", recipient: "b" },
    metadata,
    sender: { correlationId: "c1", actorRef: "a", recipientRef: "b", conversationId: "a_b", replica: "backend-1" },
    acknowledgement: { correlationId: "c1", actorRef: "a", recipientRef: "b", success: true, realId: "m1", messageId: "m1", conversationId: "a_b" },
    receiver: { correlationId: "c1", actorRef: "b", senderRef: "a", messageId: "m1", replica: "backend-2" },
    delivery: { correlationId: "c1", success: true, messageId: "m1", senderId: "a", recipientId: "b", conversationId: "a_b" },
  });
  assert.equal(result.complete, false);
  assert.equal(result.claimEligible, false);
});

test("cross-replica attribution fails closed for missing correlation, ack actors, or replicas", () => {
  const cases = [
    ["missing acknowledgement correlation", (records) => ({ ...records, acknowledgement: { ...records.acknowledgement, correlationId: undefined } })],
    ["mismatched acknowledgement actor", (records) => ({ ...records, acknowledgement: { ...records.acknowledgement, actorRef: "other" } })],
    ["missing sender replica", (records) => ({ ...records, sender: { ...records.sender, replica: undefined } })],
  ];
  for (const [label, mutate] of cases) {
    const result = crossReplicaAttribution({ measuredActors: { sender: "a", recipient: "b" }, metadata, ...mutate(validCrossReplicaRecords()) });
    assert.equal(result.complete, false, label);
    assert.equal(result.claimEligible, false, label);
    assert.equal(result.sampleEligible, false, label);
  }
});
