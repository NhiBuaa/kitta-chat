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
        info(event, fields) {
          logs.push({ event, fields });
        },
      },
    },
  );

  assert.deepEqual(result, { success: true });
  assert.equal(logs[0].event, "audit_message_created");
  assert.equal(logs[0].fields.messageId, "msg-1");
  assert.equal(logs[0].fields.conversationId, "user-1_user-2");
});
