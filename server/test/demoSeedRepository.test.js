const assert = require("node:assert/strict");
const test = require("node:test");

const { buildDemoDataset } = require("../src/demo/demoDataset");
const { createMongoDemoRepository } = require("../src/demo/demoSeedRepository");
const {
  canonicalDatasetFingerprint,
  canonicalizeCollections,
  datasetContent,
} = require("../src/demo/k4DatasetContract");

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function createMemoryModel(initialDocuments = []) {
  const documents = initialDocuments.map((document) => structuredClone(document));
  const operations = [];
  return {
    documents,
    operations,
    async bulkWrite(batch) {
      for (const operation of batch) {
        operations.push(structuredClone(operation));
        const { filter, update } = operation.updateOne;
        const existing = documents.find((document) => matches(document, filter));
        if (existing) {
          Object.assign(existing, structuredClone(update.$set || {}));
        } else {
          documents.push({
            ...structuredClone(update.$setOnInsert || {}),
            ...structuredClone(update.$set || {}),
          });
        }
      }
      return { acknowledged: true };
    },
  };
}

function createTimestampMaterializingMemoryModel(initialDocuments = []) {
  const model = createMemoryModel(initialDocuments);
  const bulkWrite = model.bulkWrite;
  model.bulkWrite = async (batch, options) => {
    const materializedBatch = structuredClone(batch);
    for (const operation of materializedBatch) {
      const update = operation.updateOne;
      if (options.timestamps !== false && update.timestamps !== false) {
        update.update.$set.createdAt = new Date("2030-01-01T00:00:00.000Z");
        update.update.$set.updatedAt = new Date("2030-01-01T00:00:00.000Z");
      }
    }
    return bulkWrite(materializedBatch, options);
  };
  return model;
}

function createTimestampMaterializingModels() {
  return {
    User: createTimestampMaterializingMemoryModel(),
    Group: createTimestampMaterializingMemoryModel(),
    File: createTimestampMaterializingMemoryModel(),
    Message: createTimestampMaterializingMemoryModel(),
    Conversation: createTimestampMaterializingMemoryModel(),
    ConversationParticipant: createTimestampMaterializingMemoryModel(),
  };
}

function canonicalProjection(models) {
  return canonicalizeCollections({
    users: models.User.documents,
    groups: models.Group.documents,
    files: models.File.documents,
    messages: models.Message.documents,
    conversations: models.Conversation.documents,
    participants: models.ConversationParticipant.documents,
  });
}

test("Mongo demo repository is idempotent and preserves records outside the demo namespace", async () => {
  const sentinel = {
    _id: "64a999999999999999999999",
    email: "owner@example.com",
    displayName: "Repository Owner",
  };
  const models = {
    User: createMemoryModel([sentinel]),
    Group: createMemoryModel(),
    File: createMemoryModel(),
    Message: createMemoryModel(),
    Conversation: createMemoryModel(),
    ConversationParticipant: createMemoryModel(),
  };
  const dataset = buildDemoDataset({ passwordHash: "hashed-demo-password" });
  const repository = createMongoDemoRepository(models);

  await repository.apply(dataset);
  await repository.apply(dataset);

  assert.equal(models.User.documents.length, dataset.users.length + 1);
  assert.equal(models.Group.documents.length, dataset.groups.length);
  assert.equal(models.File.documents.length, dataset.files.length);
  assert.equal(models.Message.documents.length, dataset.messages.length);
  assert.equal(models.Conversation.documents.length, dataset.conversations.length);
  assert.equal(
    models.ConversationParticipant.documents.length,
    dataset.participants.length,
  );
  assert.deepEqual(
    models.User.documents.find((user) => user.email === sentinel.email),
    sentinel,
  );

  for (const model of Object.values(models)) {
    assert.equal(
      model.operations.every(
        (operation) => operation.updateOne && operation.updateOne.upsert === true,
      ),
      true,
    );
  }
});

test("Mongo demo repository rejects identities outside .test before writing", async () => {
  const models = {
    User: createMemoryModel(),
    Group: createMemoryModel(),
    File: createMemoryModel(),
    Message: createMemoryModel(),
    Conversation: createMemoryModel(),
    ConversationParticipant: createMemoryModel(),
  };
  const dataset = buildDemoDataset({ passwordHash: "hashed-demo-password" });
  dataset.users[0].email = "alice@example.com";
  const repository = createMongoDemoRepository(models);

  await assert.rejects(
    () => repository.apply(dataset),
    /inside the \.test namespace/,
  );
  assert.equal(
    Object.values(models).every((model) => model.operations.length === 0),
    true,
  );
});

test("K4 demo seed preserves declared timestamps and canonical content across repeated fresh writes", async () => {
  const models = createTimestampMaterializingModels();
  const freshModels = createTimestampMaterializingModels();
  const dataset = buildDemoDataset({ passwordHash: "k4-fixture-password-hash" });
  const repository = createMongoDemoRepository(models);
  const freshRepository = createMongoDemoRepository(freshModels);

  await repository.apply(dataset);
  const firstProjection = canonicalProjection(models);
  await repository.apply(dataset);
  const secondProjection = canonicalProjection(models);
  await freshRepository.apply(dataset);
  const freshProjection = canonicalProjection(freshModels);

  assert.equal(canonicalDatasetFingerprint(firstProjection), canonicalDatasetFingerprint(datasetContent()));
  assert.equal(canonicalDatasetFingerprint(secondProjection), canonicalDatasetFingerprint(firstProjection));
  assert.equal(canonicalDatasetFingerprint(freshProjection), canonicalDatasetFingerprint(firstProjection));
  const expectedByModel = {
    User: dataset.users,
    Group: dataset.groups,
    File: dataset.files,
    Message: dataset.messages,
    Conversation: dataset.conversations,
    ConversationParticipant: dataset.participants,
  };
  for (const [name, model] of Object.entries(models)) {
    const expected = expectedByModel[name];
    assert.deepEqual(
      model.documents.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt })),
      expected.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt })),
      `${name} persisted timestamps must equal the declared fixture`,
    );
    assert.equal(model.operations.every((operation) => operation.updateOne.timestamps === false), true);
  }
});
