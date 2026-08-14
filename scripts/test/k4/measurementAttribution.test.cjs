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
  const result = socketAttribution({ measurementStart: metadata.measurementStart, measurementEnd: metadata.measurementEnd, measuredActors: ["a", "b"], metadata, lifecycles: [{ actorRef: "a", socketId: "s1", nodeName: "backend-1", authenticatedAt: "2026-08-12T23:59:59Z", disconnectedAt: "2026-08-13T00:00:05Z" }, { actorRef: "b", socketId: "s2", nodeName: "backend-2", authenticatedAt: "2026-08-13T00:00:02Z", disconnectedAt: null }] });
  assert.equal(result.claimEligible, true);
  assert.deepEqual(result.replicas, ["backend-1", "backend-2"]);
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
