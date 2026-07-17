const User = require("../models/User");
const Group = require("../models/Group");
const presenceService = require("./presenceService");

/**
 * Lấy thông tin Overview của cuộc hội thoại
 * @param {string|ObjectId} userId - ID của user đang gọi API
 * @param {string} conversationId - Legacy conversation ID
 * @returns {Promise<Object>} Overview DTO
 */
async function getOverview(userId, conversationId) {
  if (!userId || !conversationId) {
    throw new Error("Missing userId or conversationId");
  }

  const isDirect = conversationId.includes("_");

  if (isDirect) {
    const parts = conversationId.split("_");
    const userIdStr = userId.toString();
    const otherUserId = parts.find(id => id !== userIdStr) || userIdStr;

    const otherUser = await User.findById(otherUserId)
      .select("displayName avatar email")
      .lean();

    let isOnline = false;
    try {
      const presence = await presenceService.getUserPresence(otherUserId);
      isOnline = presence && presence.status !== "offline";
    } catch (err) {
      console.error(`[OverviewService] Error fetching presence for user ${otherUserId}:`, err.message);
      isOnline = false; // Fallback to offline
    }

    return {
      kind: "direct",
      name: otherUser ? (otherUser.displayName || otherUser.email) : "Người dùng KittaChat",
      avatar: otherUser ? (otherUser.avatar || "") : "",
      isOnline,
      memberCount: 2,
    };
  } else {
    // Group Chat
    const group = await Group.findById(conversationId)
      .select("name avatar members")
      .lean();

    if (!group) {
      const error = new Error("Không tìm thấy cuộc hội thoại");
      error.status = 404;
      error.code = "NOT_FOUND";
      throw error;
    }

    return {
      kind: "group",
      name: group.name || "Nhóm trò chuyện",
      avatar: group.avatar || "",
      isOnline: false,
      memberCount: group.members ? group.members.length : 0,
    };
  }
}

module.exports = {
  getOverview,
};
