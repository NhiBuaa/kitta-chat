const mongoose = require("mongoose");
const Conversation = require("../src/models/Conversation");
const ConversationParticipant = require("../src/models/ConversationParticipant");
const File = require("../src/models/File");
const Group = require("../src/models/Group");
const Message = require("../src/models/Message");
const User = require("../src/models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    await Promise.all([Conversation, ConversationParticipant, File, Group, Message, User].map((model) => model.init()));
    process.stdout.write("k4-schema-ready\n");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
