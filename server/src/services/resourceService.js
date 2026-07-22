const Message = require("../models/Message");
const File = require("../models/File");
const ConversationParticipant = require("../models/ConversationParticipant");
const { buildMessageVisibilityFilter } = require("./conversationVisibilityHelpers");
const mongoose = require("mongoose");
const Group = require("../models/Group");
const presenceService = require("./presenceService");
const { cacheClient } = require("../config/redis");

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
    items: items.slice(0, limit),
    hasMore,
    nextCursor
  };
}

/**
 * Tải files (tài liệu) đã chia sẻ trong cuộc trò chuyện
 * @param {string} conversationId - Legacy conversation ID
 * @param {number} limit - Số lượng tối đa cần lấy
 * @param {string} [cursor] - Message._id cursor để phân trang
 * @param {string} [userId] - ID người dùng đang yêu cầu để lọc quyền xem (visibility)
 * @returns {Promise<Object>} { items, hasMore, nextCursor }
 */
async function loadFiles(conversationId, limit = 6, cursor = null, userId = null) {
  const items = [];
  let currentCursor = cursor;
  let hasMore = false;
  let nextCursor = null;
  const batchSize = 50;

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
      const files = await File.find({
        _id: { $in: fileIds }
      }).lean();

      // Lọc các file không phải image/video
      const fileMap = new Map(
        files
          .filter(f => !/^(image|video)\//i.test(f.mimeType))
          .map(f => [f._id.toString(), f])
      );

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
    items: items.slice(0, limit),
    hasMore,
    nextCursor
  };
}

/**
 * Tải links (liên kết) đã chia sẻ trong cuộc trò chuyện
 * @param {string} conversationId - Legacy conversation ID
 * @param {number} limit - Số lượng tối đa cần lấy
 * @param {string} [cursor] - Message._id cursor để phân trang
 * @param {string} [userId] - ID người dùng đang yêu cầu để lọc quyền xem (visibility)
 * @returns {Promise<Object>} { items, hasMore, nextCursor }
 */
async function loadLinks(conversationId, limit = 6, cursor = null, userId = null) {
  const items = [];
  let currentCursor = cursor;
  let hasMore = false;
  let nextCursor = null;
  const batchSize = 50;

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
      hasLink: true,
      ...visibilityFilter
    };

    if (currentCursor) {
      query._id = { $lt: new mongoose.Types.ObjectId(currentCursor) };
    }

    const batchMessages = await Message.find(query)
      .sort({ _id: -1 })
      .limit(batchSize)
      .select("links _id")
      .lean();

    if (batchMessages.length === 0) {
      break;
    }

    for (const msg of batchMessages) {
      const msgLinks = (msg.links || []).map(l => ({
        url: l.url,
        hostname: l.hostname,
        messageId: msg._id.toString()
      }));

      if (msgLinks.length > 0) {
        items.push(...msgLinks);
        if (items.length >= limit) {
          nextCursor = msg._id.toString();
          hasMore = true;
          stopGom = true;
          break;
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
    items: items.slice(0, limit),
    hasMore,
    nextCursor
  };
}

/**
 * Tải danh sách thành viên trong nhóm (Group Chat)
 * @param {string} conversationId - Legacy group conversation ID (groupId)
 * @param {number} limit - Số lượng tối đa cần lấy
 * @param {string} [cursor] - ConversationParticipant._id cursor để phân trang
 * @param {string} [userId] - ID người dùng đang yêu cầu để lọc quyền xem (visibility)
 * @returns {Promise<Object>} { items, hasMoreMembers, nextMemberCursor }
 */
async function loadGroupMembers(conversationId, limit = 20, cursor = null, userId = null) {
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    const isMember = await ConversationParticipant.findOne({
      legacyConversationId: conversationId,
      userId: userId,
      leftAt: null
    }).lean();
    if (!isMember) {
      return {
        items: [],
        hasMoreMembers: false,
        nextMemberCursor: null
      };
    }
  }

  const query = {
    legacyConversationId: conversationId,
    leftAt: null
  };

  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const participants = await ConversationParticipant.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate("userId", "displayName avatar isOnline")
    .lean();

  const hasMoreMembers = participants.length > limit;
  const resultParticipants = participants.slice(0, limit);

  let nextMemberCursor = null;
  if (hasMoreMembers && resultParticipants.length > 0) {
    nextMemberCursor = resultParticipants[resultParticipants.length - 1]._id.toString();
  }

  const userIds = resultParticipants.map(p => p.userId?._id?.toString()).filter(Boolean);
  const presenceMap = await presenceService.getMultiPresence(userIds);

  const items = resultParticipants.map(p => {
    if (!p.userId) return null;
    const uId = p.userId._id.toString();
    const presence = presenceMap[uId];
    return {
      _id: uId,
      displayName: p.userId.displayName || "",
      avatar: p.userId.avatar || "",
      role: p.role || "member",
      isOnline: presence ? presence.status !== "offline" : false
    };
  }).filter(Boolean);

  return {
    items,
    hasMoreMembers,
    nextMemberCursor
  };
}

/**
 * Tải danh sách nhóm chat chung giữa 2 người dùng (cho 1-1 Chat)
 * @param {string} conversationId - Legacy 1-1 conversation ID (userA_userB)
 * @param {number} limit - Số lượng tối đa cần lấy
 * @param {string} [cursor] - Group._id cursor để phân trang
 * @param {string} [userId] - ID người dùng đang yêu cầu
 * @returns {Promise<Object>} { items, hasMore, nextCursor }
 */
async function loadCommonGroups(conversationId, limit = 6, cursor = null, userId = null) {
  const parts = conversationId.split("_");
  if (parts.length !== 2) {
    return { items: [], hasMore: false, nextCursor: null };
  }

  const currentUserId = userId ? userId.toString() : parts[0];
  const partnerId = parts.find(id => id !== currentUserId) || parts[1];

  const sortedIds = [currentUserId, partnerId].sort();
  const cacheKey = `commonGroups:${sortedIds[0]}:${sortedIds[1]}`;

  if (!cursor && cacheClient.isOpen) {
    try {
      const cached = await cacheClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.error("[ResourceService] Redis get error for common groups:", err);
    }
  }

  const query = {
    members: { $all: [currentUserId, partnerId] }
  };

  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const groups = await Group.find(query)
    .select("name avatar members")
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = groups.length > limit;
  const resultGroups = groups.slice(0, limit);

  let nextCursor = null;
  if (hasMore && resultGroups.length > 0) {
    nextCursor = resultGroups[resultGroups.length - 1]._id.toString();
  }

  const items = resultGroups.map(g => ({
    _id: g._id.toString(),
    name: g.name || "Nhóm trò chuyện",
    avatar: g.avatar || "",
    memberCount: g.members ? g.members.length : 0
  }));

  const result = {
    items,
    hasMore,
    nextCursor
  };

  if (!cursor && cacheClient.isOpen) {
    try {
      await cacheClient.set(cacheKey, JSON.stringify(result), {
        EX: 300 // 5 phút
      });
    } catch (err) {
      console.error("[ResourceService] Redis set error for common groups:", err);
    }
  }

  return result;
}

/**
 * Tải membership (members list cho group hoặc common groups cho 1-1 chat)
 * @param {string} conversationId - Legacy conversation ID
 * @param {number} limit - Số lượng tối đa
 * @param {string} [cursor] - Cursor phân trang
 * @param {string} [userId] - ID người dùng yêu cầu
 * @returns {Promise<Object>} Membership API Payload
 */
async function loadMembership(conversationId, limit = 6, cursor = null, userId = null) {
  const isDirect = conversationId.includes("_");
  if (isDirect) {
    const res = await loadCommonGroups(conversationId, limit, cursor, userId);
    return {
      commonGroups: res.items,
      membersPreview: [],
      hasMoreMembers: res.hasMore,
      nextMemberCursor: res.nextCursor
    };
  } else {
    const groupLimit = limit || 20;
    const res = await loadGroupMembers(conversationId, groupLimit, cursor, userId);
    return {
      commonGroups: [],
      membersPreview: res.items,
      hasMoreMembers: res.hasMoreMembers,
      nextMemberCursor: res.nextMemberCursor
    };
  }
}

module.exports = {
  loadMedia,
  loadFiles,
  loadLinks,
  loadGroupMembers,
  loadCommonGroups,
  loadMembership
};
