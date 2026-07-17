const Conversation = require("../models/Conversation");
const ConversationParticipant = require("../models/ConversationParticipant");

// Ngày mặc định sử dụng để tắt thông báo vô hạn
const DEFAULT_MUTED_UNTIL = new Date("9999-12-31T23:59:59Z");

/**
 * Lấy tùy chỉnh cá nhân (Preferences) của user cho cuộc trò chuyện
 * @param {string|ObjectId} userId
 * @param {string} legacyConversationId
 * @returns {Promise<Object>} Preference DTO
 */
async function getPreferences(userId, legacyConversationId) {
  if (!userId || !legacyConversationId) {
    throw new Error("Missing userId or legacyConversationId");
  }

  const participant = await ConversationParticipant.findOne({
    legacyConversationId,
    userId,
  }).lean();

  if (!participant) {
    return {
      isPinned: false,
      isMuted: false,
      mutedUntil: null,
      customTitle: null,
    };
  }

  const now = new Date();
  const isPinned = !!(participant.state && participant.state.pinnedAt);
  const isMuted = !!(
    participant.state &&
    participant.state.mutedUntil &&
    new Date(participant.state.mutedUntil) > now
  );

  return {
    isPinned,
    isMuted,
    mutedUntil: participant.state?.mutedUntil || null,
    customTitle: participant.settings?.customTitle || null,
  };
}

/**
 * Cập nhật tùy chỉnh cá nhân của user cho cuộc trò chuyện
 * @param {string|ObjectId} userId
 * @param {string} legacyConversationId
 * @param {Object} updates
 * @returns {Promise<Object>} Mới Preference DTO
 */
async function updatePreferences(userId, legacyConversationId, updates) {
  if (!userId || !legacyConversationId) {
    throw new Error("Missing userId or legacyConversationId");
  }

  // Tìm hoặc tạo Conversation để lấy Object ID
  let conv = await Conversation.findOne({ legacyConversationId });
  if (!conv) {
    if (legacyConversationId.includes("_")) {
      const parts = legacyConversationId.split("_");
      conv = await Conversation.create({
        kind: "direct",
        legacyConversationId,
        directKey: legacyConversationId,
        participantUserIds: parts.map(id => id.toString()),
      });
    } else {
      throw new Error("Không tìm thấy cuộc hội thoại để cập nhật tùy chỉnh");
    }
  }

  const updateDoc = {};
  if (updates.isPinned !== undefined) {
    updateDoc["state.pinnedAt"] = updates.isPinned ? new Date() : null;
  }

  if (updates.isMuted !== undefined) {
    if (updates.isMuted) {
      // Nếu isMuted = true và chưa có mutedUntil, set mặc định để mute vô thời hạn
      updateDoc["state.mutedUntil"] = updates.mutedUntil
        ? new Date(updates.mutedUntil)
        : DEFAULT_MUTED_UNTIL;
    } else {
      updateDoc["state.mutedUntil"] = null;
    }
  } else if (updates.mutedUntil !== undefined) {
    updateDoc["state.mutedUntil"] = updates.mutedUntil ? new Date(updates.mutedUntil) : null;
  }

  if (updates.customTitle !== undefined) {
    updateDoc["settings.customTitle"] = updates.customTitle || null;
  }

  const participant = await ConversationParticipant.findOneAndUpdate(
    { legacyConversationId, userId },
    {
      $set: updateDoc,
      $setOnInsert: {
        conversationId: conv._id,
        role: legacyConversationId.includes("_") ? null : "member",
        joinedAt: new Date(),
      },
    },
    { new: true, upsert: true, runValidators: true }
  );

  const now = new Date();
  const isPinned = !!(participant.state && participant.state.pinnedAt);
  const isMuted = !!(
    participant.state &&
    participant.state.mutedUntil &&
    new Date(participant.state.mutedUntil) > now
  );

  return {
    isPinned,
    isMuted,
    mutedUntil: participant.state?.mutedUntil || null,
    customTitle: participant.settings?.customTitle || null,
  };
}

module.exports = {
  getPreferences,
  updatePreferences,
};
