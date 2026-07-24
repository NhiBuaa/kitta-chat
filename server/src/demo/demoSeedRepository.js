const { DEMO_NAMESPACE } = require("./demoDataset");

function assertDemoDatasetNamespace(dataset) {
  if (dataset?.namespace !== DEMO_NAMESPACE) {
    throw new Error("Demo dataset namespace is invalid.");
  }
  if (!Array.isArray(dataset.users) || dataset.users.length === 0) {
    throw new Error("Demo dataset must contain users.");
  }
  if (dataset.users.some((user) => !user.email?.endsWith(".test"))) {
    throw new Error("Demo dataset users must remain inside the .test namespace.");
  }
}

function buildUpsertOperations(documents, getFilter) {
  return documents.map((document) => {
    const { _id, ...values } = document;
    return {
      updateOne: {
        filter: getFilter(document),
        update: {
          $set: values,
          $setOnInsert: { _id },
        },
        upsert: true,
      },
    };
  });
}

function createMongoDemoRepository(models) {
  const collections = [
    ["users", models.User, (document) => ({ email: document.email })],
    ["groups", models.Group, (document) => ({ _id: document._id })],
    ["files", models.File, (document) => ({ requestId: document.requestId })],
    [
      "messages",
      models.Message,
      (document) => ({
        sender: document.sender,
        idempotencyKey: document.idempotencyKey,
      }),
    ],
    [
      "conversations",
      models.Conversation,
      (document) => ({ legacyConversationId: document.legacyConversationId }),
    ],
    [
      "participants",
      models.ConversationParticipant,
      (document) => ({
        legacyConversationId: document.legacyConversationId,
        userId: document.userId,
      }),
    ],
  ];

  for (const [name, model] of collections) {
    if (!model || typeof model.bulkWrite !== "function") {
      throw new Error(`Demo seed model "${name}" does not support bulkWrite.`);
    }
  }

  return {
    async apply(dataset) {
      assertDemoDatasetNamespace(dataset);
      const summary = {};
      for (const [name, model, getFilter] of collections) {
        const documents = dataset[name] || [];
        if (documents.length > 0) {
          await model.bulkWrite(buildUpsertOperations(documents, getFilter), {
            ordered: true,
          });
        }
        summary[name] = documents.length;
      }
      return summary;
    },
  };
}

module.exports = {
  assertDemoDatasetNamespace,
  buildUpsertOperations,
  createMongoDemoRepository,
};
