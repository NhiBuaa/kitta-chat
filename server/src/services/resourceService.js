const Message = require("../models/Message");
const File = require("../models/File");
const ConversationParticipant = require("../models/ConversationParticipant");
const { buildMessageVisibilityFilter } = require("./conversationVisibilityHelpers");
const mongoose = require("mongoose");

/**
 * Tải media (ảnh/video) đã chia sẻ trong cuộc trò chuyện
 * @param {string} conversationId - Legacy conversation ID
 * @param {number} limit - Số lượng tối đa cần lấy
 * @param {string} [cursor] - Message._id cursor để phân trang
 * @param {string} [userId] - ID người dùng đang yêu cầu để lọc quyền xem (visibility)
 * @returns {Promise<Object>} { items, hasMore, nextCursor }
 */
async function loadMedia(conversationId, limit = 6, cursor = null, userId = null) {
  const items = [];
  let currentCursor = cursor;
  let hasMore = false;
  let nextCursor = null;
  const batchSize = 50; // Kích thước lô truy vấn tin nhắn tối ưu hóa để tránh N+1

  let visibilityFilter = {};
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    const participant = await ConversationParticipant.findOne({
      legacyConversationId: conversationId,
      userId: userId
    });
    if (participant) {
      visibilityFilter = buildMessageVisibilityFilter(participant);
    }
  }

  let stopGom = false;

  while (!stopGom) {
    const query = {
      conversationId,
      attachments: { $exists: true, $ne: [] },
      ...visibilityFilter
    };

    if (currentCursor) {
      query._id = { $lt: new mongoose.Types.ObjectId(currentCursor) };
    }

    // Query tin nhắn chứa file trước (O(1) database call)
    const batchMessages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(batchSize)
      .select("attachments _id")
      .lean();

    if (batchMessages.length === 0) {
      break;
    }

    const fileIds = batchMessages.flatMap(m => m.attachments || []);
    if (fileIds.length > 0) {
      // Query 1 lần duy nhất bằng $in để tránh N+1
      const files = await File.find({
        _id: { $in: fileIds },
        mimeType: { $regex: /^(image|video)\//i }
      }).lean();

      const fileMap = new Map(files.map(f => [f._id.toString(), f]));

      // Gom và lọc ảnh/video theo thứ tự tin nhắn giảm dần
      for (const msg of batchMessages) {
        const msgFiles = [];
        for (const attId of msg.attachments || []) {
          const file = fileMap.get(attId.toString());
          if (file) {
            msgFiles.push({
              _id: file._id.toString(),
              messageId: msg._id.toString(),
              originalName: file.originalName,
              mimeType: file.mimeType,
              size: file.size,
              url: file.url
            });
          }
        }

        if (msgFiles.length > 0) {
          items.push(...msgFiles);
          if (items.length >= limit) {
            nextCursor = msg._id.toString();
            hasMore = true;
            stopGom = true;
            break;
          }
        }
      }
    }

    if (stopGom) {
      break;
    }

    currentCursor = batchMessages[batchMessages.length - 1]._id.toString();

    if (batchMessages.length < batchSize) {
      break;
    }
  }

  return {
    items,
    hasMore,
    nextCursor
  };
}

module.exports = {
  loadMedia
};
