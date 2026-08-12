const mongoose = require("mongoose");
const Conversation = require("../src/models/Conversation");
const ConversationParticipant = require("../src/models/ConversationParticipant");
const File = require("../src/models/File");
const Group = require("../src/models/Group");
const Message = require("../src/models/Message");
const User = require("../src/models/User");
const { canonicalDatasetFingerprint, canonicalizeCollections, datasetDeclaration } = require("../src/demo/k4DatasetContract");

const models = { users: User, groups: Group, files: File, messages: Message, conversations: Conversation, participants: ConversationParticipant };

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const declaration = datasetDeclaration();
    const observedCollections = Object.fromEntries(await Promise.all(Object.entries(models)
      .map(async ([name, model]) => [name, await model.find({}).lean()]))) ;
    const observedContent = canonicalizeCollections(observedCollections);
    const cardinalities = Object.fromEntries(Object.entries(observedContent).map(([name, documents]) => [name, documents.length]));
    if (JSON.stringify(cardinalities) !== JSON.stringify(declaration.cardinalities)) {
      throw new Error("K4 dataset cardinalities do not match the declared contract.");
    }
    process.stdout.write(`${JSON.stringify({ ...declaration, cardinalities, fingerprint: canonicalDatasetFingerprint(observedContent) })}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
