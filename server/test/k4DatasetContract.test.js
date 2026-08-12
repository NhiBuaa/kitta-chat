const assert = require("node:assert/strict");
const test = require("node:test");

const { canonicalDatasetFingerprint, datasetContent, datasetDeclaration } = require("../src/demo/k4DatasetContract");
const Message = require("../src/models/Message");
const { buildDemoDataset } = require("../src/demo/demoDataset");

test("K4 dataset contract has stable content identity and excludes credential material", () => {
  const content = datasetContent();
  const declaration = datasetDeclaration();

  assert.match(declaration.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(declaration.fingerprint, canonicalDatasetFingerprint(content));
  assert.equal(JSON.stringify(content).includes("k4-fixture-password-hash"), false);
  assert.deepEqual(declaration.cardinalities, {
    users: 19,
    groups: 6,
    files: 60,
    messages: 244,
    conversations: 24,
    participants: 60,
  });
});

test("K4 dataset contract fingerprints the same canonical content after Message schema defaults materialize", () => {
  const dataset = buildDemoDataset({ passwordHash: "k4-fixture-password-hash" });
  const persistedMessages = dataset.messages.map((message) => new Message(message).toObject());

  assert.equal(
    canonicalDatasetFingerprint({ messages: persistedMessages }),
    canonicalDatasetFingerprint({ messages: dataset.messages }),
  );
});
