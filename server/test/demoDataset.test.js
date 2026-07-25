const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildDemoDataset } = require("../src/demo/demoDataset");

test("demo dataset is deterministic, namespaced, and covers reviewer product flows", () => {
  const first = buildDemoDataset({ passwordHash: "hashed-demo-password" });
  const second = buildDemoDataset({ passwordHash: "hashed-demo-password" });

  assert.deepEqual(first, second);
  assert.equal(first.users.every((user) => user.email.endsWith(".test")), true);

  const alice = first.users.find((user) => user.email === "alice@kittachat.test");
  const bob = first.users.find((user) => user.email === "bob@kittachat.test");
  assert.ok(alice);
  assert.ok(bob);

  const aliceConversations = first.conversations.filter((conversation) =>
    conversation.participantUserIds.includes(alice._id),
  );
  assert.equal(aliceConversations.length, 24);
  assert.equal(first.groups.some((group) => group.name === "Backend Team"), true);

  const aliceParticipants = first.participants.filter(
    (participant) => participant.userId === alice._id,
  );
  assert.equal(
    aliceParticipants.filter((participant) => participant.state.pinnedAt).length >= 2,
    true,
  );
  assert.equal(
    new Set(aliceParticipants.map((participant) => participant.state.unreadCount)).size > 1,
    true,
  );

  const catalog = first.catalog.conversations;
  assert.ok(catalog.empty);
  assert.ok(catalog.mediaOnly);
  assert.ok(catalog.filesOnly);
  assert.ok(catalog.linksOnly);
  assert.ok(catalog.longHistory);
  assert.ok(catalog.aliceBob);

  const messagesFor = (conversationId) =>
    first.messages.filter((message) => message.conversationId === conversationId);
  const filesById = new Map(first.files.map((file) => [file._id, file]));
  const attachmentFilesFor = (conversationId) =>
    messagesFor(conversationId)
      .flatMap((message) => message.attachments)
      .map((fileId) => filesById.get(fileId));

  assert.equal(messagesFor(catalog.empty).length, 0);
  assert.equal(
    attachmentFilesFor(catalog.mediaOnly).every((file) => file.mimeType.startsWith("image/")),
    true,
  );
  assert.equal(
    attachmentFilesFor(catalog.filesOnly).every((file) => !file.mimeType.startsWith("image/")),
    true,
  );
  assert.equal(messagesFor(catalog.linksOnly).every((message) => message.hasLink), true);

  const longHistoryCount = messagesFor(catalog.longHistory).length;
  assert.equal(longHistoryCount >= 50 && longHistoryCount <= 100, true);

  const aliceBobMessages = messagesFor(catalog.aliceBob);
  const aliceBobFiles = attachmentFilesFor(catalog.aliceBob);
  assert.equal(
    aliceBobFiles.filter((file) => file.mimeType.startsWith("image/")).length > 20,
    true,
  );
  assert.equal(
    aliceBobFiles.filter((file) => !file.mimeType.startsWith("image/")).length > 20,
    true,
  );
  assert.equal(aliceBobMessages.filter((message) => message.hasLink).length > 20, true);

  assert.equal(
    first.files.every(
      (file) => file.s3Key.startsWith("demo-local/") && file.url.startsWith("/demo-assets/"),
    ),
    true,
  );
  for (const file of first.files) {
    assert.equal(
      fs.existsSync(
        path.resolve(__dirname, "../../client/public", file.url.replace(/^\//, "")),
      ),
      true,
      `Missing local demo asset for ${file.url}`,
    );
  }
});

test("demo dataset reuses existing .test identity ids across all references", () => {
  const existingAliceId = "65a000000000000000000001";
  const existingBobId = "65a000000000000000000002";
  const dataset = buildDemoDataset({
    passwordHash: "hashed-demo-password",
    userIdsByEmail: {
      "alice@kittachat.test": existingAliceId,
      "bob@kittachat.test": existingBobId,
    },
  });

  const alice = dataset.users.find((user) => user.email === "alice@kittachat.test");
  const bob = dataset.users.find((user) => user.email === "bob@kittachat.test");
  assert.equal(alice._id, existingAliceId);
  assert.equal(bob._id, existingBobId);
  assert.equal(
    dataset.catalog.conversations.aliceBob,
    [existingAliceId, existingBobId].sort().join("_"),
  );
  assert.equal(
    dataset.conversations
      .find(
        (conversation) =>
          conversation.legacyConversationId === dataset.catalog.conversations.aliceBob,
      )
      .participantUserIds.includes(existingAliceId),
    true,
  );
});
