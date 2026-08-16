const assert = require("node:assert/strict");
const test = require("node:test");
const { createK4AttributionLogger } = require("../../src/observability/k4Attribution");

test("K4 attribution logging is disabled by default", () => {
  const records = [];
  const attribution = createK4AttributionLogger({ env: {}, write: (record) => records.push(record), clock: () => "2026-08-13T00:00:00.000Z" });
  attribution.socketConnected({ actorRef: "actor-1", socketId: "socket-1", nodeName: "backend-1" });
  assert.deepEqual(records, []);
});

test("K4 attribution emits versioned lifecycle and delivery records without payloads", () => {
  const records = [];
  const attribution = createK4AttributionLogger({ env: { K4_ATTRIBUTION_ENABLED: "true", K4_RUN_ID: "run-84" }, write: (record) => records.push(record), clock: () => "2026-08-13T00:00:00.000Z" });
  attribution.socketConnected({ actorRef: "actor-1", socketId: "socket-1", nodeName: "backend-1" });
  attribution.socketDisconnected({ actorRef: "actor-1", socketId: "socket-1", nodeName: "backend-1", reason: "client disconnect" });
  attribution.messageSender({ correlationId: "corr-1", actorRef: "actor-1", recipientRef: "actor-2", replica: "backend-1" });
  attribution.messageAcknowledged({ correlationId: "corr-1", actorRef: "actor-1", recipientRef: "actor-2", replica: "backend-1", success: true });
  attribution.messageReceiver({ correlationId: "corr-1", actorRef: "actor-2", senderRef: "actor-1", replica: "backend-2" });

  assert.deepEqual(records.map(({ event }) => event), ["socket_authenticated_connect", "socket_disconnect", "message_sender", "message_acknowledgement", "message_receiver"]);
  assert.equal(records.every(({ schema, runId, timestamp }) => schema === "k4-attribution-v1" && runId === "run-84" && Boolean(timestamp)), true);
  assert.equal(JSON.stringify(records).includes("payload"), false);
});

test("K4 message attribution retains correlation identity and legacy conversation evidence", () => {
  const records = [];
  const attribution = createK4AttributionLogger({ env: { K4_ATTRIBUTION_ENABLED: "true", K4_RUN_ID: "run-87" }, write: (record) => records.push(record), clock: () => "2026-08-14T00:00:00.000Z" });
  const fields = {
    correlationId: "idem-87",
    actorRef: "alice",
    recipientRef: "bob",
    replica: "backend-1",
    conversationId: "alice_bob",
    messageId: "message-87",
    success: true,
  };
  attribution.messageSender(fields);
  attribution.messageAcknowledged(fields);
  attribution.messageReceiver({ ...fields, actorRef: "bob", senderRef: "alice", replica: "backend-2" });

  assert.deepEqual(records.map(({ event, correlationId, conversationId, messageId }) => ({ event, correlationId, conversationId, messageId })), [
    { event: "message_sender", correlationId: "idem-87", conversationId: "alice_bob", messageId: "message-87" },
    { event: "message_acknowledgement", correlationId: "idem-87", conversationId: "alice_bob", messageId: "message-87" },
    { event: "message_receiver", correlationId: "idem-87", conversationId: "alice_bob", messageId: "message-87" },
  ]);
});
