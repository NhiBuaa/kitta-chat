const { getConversationMigrationConfig } = require("../config/env");
const { ensureConversationForConfirmedMessage } = require("./conversationReadModelService");

const dualWriteConfirmedMessage = async (message, { logPrefix = "[conversationDualWrite]" } = {}) => {
  if (!message || !getConversationMigrationConfig().conversationDualWriteEnabled) return;

  try {
    await ensureConversationForConfirmedMessage(message);
  } catch (error) {
    console.error(`${logPrefix} Conversation read-model dual-write failed:`, error);
  }
};

module.exports = {
  dualWriteConfirmedMessage,
};