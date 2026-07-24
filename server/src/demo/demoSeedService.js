const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const ConversationParticipant = require("../models/ConversationParticipant");
const File = require("../models/File");
const Group = require("../models/Group");
const Message = require("../models/Message");
const User = require("../models/User");
const {
  DEMO_USER_EMAILS,
  buildDemoDataset,
} = require("./demoDataset");
const { createMongoDemoRepository } = require("./demoSeedRepository");
const { assertDemoSeedTarget } = require("./demoSeedSafety");

const DEMO_PASSWORD = "KittaChatDemo!2026";
const DEMO_PASSWORD_HASH = "$2b$10$wVBixSGimcqxJxNv30sItOZxBwkEWtZI3GTuH.OAODRtemzerygMO";

const defaultModels = {
  Conversation,
  ConversationParticipant,
  File,
  Group,
  Message,
  User,
};

async function loadExistingUserIds(userModel) {
  const users = await userModel
    .find({ email: { $in: DEMO_USER_EMAILS } })
    .select("_id email")
    .lean();
  return Object.fromEntries(
    users.map((user) => [user.email, user._id.toString()]),
  );
}

async function runDemoSeed({
  mongoUri,
  allowRemote = false,
  models = defaultModels,
  mongooseClient = mongoose,
  hashPassword = async () => DEMO_PASSWORD_HASH,
  repositoryFactory = createMongoDemoRepository,
  logger = console,
} = {}) {
  assertDemoSeedTarget(mongoUri, { allowRemote });
  await mongooseClient.connect(mongoUri);

  try {
    const userIdsByEmail = await loadExistingUserIds(models.User);
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const dataset = buildDemoDataset({ passwordHash, userIdsByEmail });
    const repository = repositoryFactory(models);
    const summary = await repository.apply(dataset);
    logger.log(
      `Demo seed complete: ${summary.users} users, ${summary.conversations} conversations, ${summary.messages || dataset.messages.length} messages.`,
    );
    return summary;
  } finally {
    await mongooseClient.disconnect();
  }
}

module.exports = {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  loadExistingUserIds,
  runDemoSeed,
};
