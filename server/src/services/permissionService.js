const Group = require("../models/Group");
const ConversationParticipant = require("../models/ConversationParticipant");

/**
 * Đánh giá các quyền hạn của một người dùng đối với một cuộc trò chuyện
 * @param {string|ObjectId} userId - ID người dùng
 * @param {string} conversationId - Legacy conversation ID (groupId hoặc directKey)
 * @returns {Promise<Object>} Permission DTO
 */
async function getPermissions(userId, conversationId) {
  if (!userId || !conversationId) {
    return {
      canRead: false,
      canWrite: false,
      canLeave: false,
      canArchive: false,
      canDelete: false,
      canMute: false,
      canPin: false,
    };
  }

  const userIdStr = userId.toString();
  const isDirect = conversationId.includes("_");

  if (isDirect) {
    // Direct chat
    const parts = conversationId.split("_");
    const isMember = parts.includes(userIdStr);

    if (!isMember) {
      return {
        canRead: false,
        canWrite: false,
        canLeave: false,
        canArchive: false,
        canDelete: false,
        canMute: false,
        canPin: false,
      };
    }

    return {
      canRead: true,
      canWrite: true,
      canLeave: false,
      canArchive: true,
      canDelete: true,
      canMute: true,
      canPin: true,
    };
  } else {
    // Group chat
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return {
        canRead: false,
        canWrite: false,
        canLeave: false,
        canArchive: false,
        canDelete: false,
        canMute: false,
        canPin: false,
      };
    }

    const group = await Group.findById(conversationId);
    if (!group) {
      return {
        canRead: false,
        canWrite: false,
        canLeave: false,
        canArchive: false,
        canDelete: false,
        canMute: false,
        canPin: false,
      };
    }

    const isCurrentMember = Array.isArray(group.members) && group.members.some(m => m.toString() === userIdStr);

    // Tìm trạng thái trong ConversationParticipant để kiểm tra lịch sử tham gia
    const participant = await ConversationParticipant.findOne({
      legacyConversationId: conversationId,
      userId: userId,
    });

    const hasHistoricalAccess = !!participant;
    const hasLeft = participant && participant.leftAt !== null;

    const canRead = isCurrentMember || hasHistoricalAccess; // Cho phép xem tin nhắn cũ trước leftAt/deletedAt
    // LƯU Ý: buildMessageVisibilityFilter sẽ tự động lọc tin nhắn gửi sau leftAt, nên canRead: true cho phép người đã rời nhóm xem lại lịch sử tin nhắn cũ.
    const canWrite = isCurrentMember;
    const canLeave = isCurrentMember;
    const canArchive = isCurrentMember;
    const canDelete = isCurrentMember || hasHistoricalAccess; // Thành viên hiện tại hoặc người cũ đều có quyền soft-delete (xóa lịch sử tin nhắn đối với bản thân)
    const canMute = isCurrentMember;
    const canPin = isCurrentMember;

    return {
      canRead,
      canWrite,
      canLeave,
      canArchive,
      canDelete,
      canMute,
      canPin,
    };
  }
}

module.exports = {
  getPermissions,
};
