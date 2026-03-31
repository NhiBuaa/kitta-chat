/**
 * Tạo conversationId duy nhất cho cuộc trò chuyện 1-1
 * bằng cách sort 2 userId để đảm bảo tính nhất quán
 */
const buildConversationId = (senderId, receiverId) => {
    if (!senderId || !receiverId) return null;
    return [senderId.toString(), receiverId.toString()].sort().join("_");
};

module.exports = buildConversationId;