const assert = require("node:assert/strict");
const test = require("node:test");

const { processAuditJob } = require("../src/workers/auditWorker");

test("processAuditJob records message.created audit/statistics events", async () => {
  const logs = [];

  const result = await processAuditJob(
    {
      type: "message.created",
      messageId: "msg-1",
      conversationId: "user-1_user-2",
      senderId: "user-1",
      receiverId: "user-2",
      messageType: "text",
      attachmentCount: 0,
      createdAt: "2026-05-17T10:00:00.000Z",
    },
    {
      logger: {
        log(message, payload) {
          logs.push({ message, payload });
        },
      },
    },
  );

  assert.deepEqual(result, { success: true });
  assert.equal(logs[0].message, "[AuditWorker] message.created");
  assert.equal(logs[0].payload.messageId, "msg-1");
  assert.equal(logs[0].payload.conversationId, "user-1_user-2");
});
