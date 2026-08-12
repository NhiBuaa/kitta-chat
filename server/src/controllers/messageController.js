const Message = require("../models/Message");
const Group = require("../models/Group");
const mongoose = require("mongoose");
const ConversationParticipant = require("../models/ConversationParticipant");
const { buildMessageVisibilityFilter } = require("../services/conversationVisibilityHelpers");
const { sendError } = require("../utils/apiResponse");
const { dualWriteConfirmedMessage } = require("../services/conversationDualWriteService");
const { logger } = require("../utils/logger");

const MAX_MESSAGE_LIMIT = 200;

const getPrincipalId = (req) => req.user?.id || req.user?._id;

const rejectForbidden = (res) => sendError(res, {
  status: 403,
  code: "MESSAGE_ACCESS_DENIED",
  message: "Message access denied",
});

const isGroupMember = async (groupId, userId) => Boolean(
  await Group.findOne({ _id: groupId, members: userId }).lean(),
);

const parseMessageLimit = (value, fallback = 20) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), MAX_MESSAGE_LIMIT);
};

const isCanonicalObjectId = (value) => typeof value === "string"
  && /^[a-f\d]{24}$/i.test(value)
  && mongoose.Types.ObjectId.isValid(value);

// [POST] /api/messages
exports.createMessage = async (req, res) => {
  try {
    const { sender: suppliedSender, receiver, text, attachments, isGroup, type } = req.body;
    const principalId = getPrincipalId(req)?.toString();
    if (!principalId) return rejectForbidden(res);
    if (suppliedSender && suppliedSender.toString() !== principalId) return rejectForbidden(res);
    if (type === "system") {
      return sendError(res, {
        status: 400,
        code: "PUBLIC_SYSTEM_MESSAGE_FORBIDDEN",
        message: "System messages cannot be created through this endpoint",
      });
    }
    const sender = principalId;

    let conversationId;
    const isGroupChat = isGroup === true || isGroup === "true";

    if (isGroupChat) {
      if (!isCanonicalObjectId(receiver)) {
        return sendError(res, {
          status: 400,
          code: "MESSAGE_GROUP_RECIPIENT_INVALID",
          message: "Group recipient is invalid",
        });
      }
      if (!receiver || !(await isGroupMember(receiver, principalId))) return rejectForbidden(res);
      conversationId = receiver;
    } else {
      if (!receiver) {
        return sendError(res, {
          status: 400,
          code: "MESSAGE_RECIPIENT_REQUIRED",
          message: "Thiếu thông tin người gửi/nhận",
        });
      }
      conversationId = [sender, receiver].sort().join("_");
    }

    // NẾU LÀ TIN NHẮN THƯỜNG / TIN NHẮN FILE
    const newMessage = new Message({
      conversationId,
      type: attachments && attachments.length > 0 ? "file" : "text",
      sender,
      receiver,
      text,
      attachments: attachments || [],
    });

    // Lưu message
    const savedMessage = await newMessage.save();
    await dualWriteConfirmedMessage(savedMessage, { logPrefix: "[messageController]" });

    // Dùng populate để trả về thông tin file đầy đủ ngay sau khi tạo
    await savedMessage.populate("attachments");

    res.status(200).json(savedMessage);
  } catch (err) {
    logger.error("message_create_failed", { errorName: err?.name || "Error" });
    return sendError(res, {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unable to create message",
    });
  }
};

// [GET] /api/messages/:userId1/:userId2
exports.getMessages = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    const { isGroup, cursor, limit } = req.query;
    const requestUserId = getPrincipalId(req)?.toString();
    if (!requestUserId) return rejectForbidden(res);
    let conversationId;

    // Lấy conversationId;
    if (isGroup === "true") {
      if (!(await isGroupMember(userId2, requestUserId))) return rejectForbidden(res);
      conversationId = userId2;
    } else {
      if (requestUserId !== userId1 && requestUserId !== userId2) return rejectForbidden(res);
      conversationId = [userId1, userId2].sort().join("_");
    }

    let visibilityFilter = {};
    if (requestUserId) {
      try {
        const participant = await ConversationParticipant.findOne({
          legacyConversationId: conversationId,
          userId: requestUserId,
        }).lean();
        if (participant) {
          visibilityFilter = buildMessageVisibilityFilter(participant);
        }
      } catch (err) {
        console.error("Lỗi lấy visibility filter cho sidebar/messages:", err);
      }
    }

    const query = { conversationId: conversationId, ...visibilityFilter };

    // Nếu Fe có gửi cursor
    if (cursor) {
      query._id = { $lt: cursor };
    }

    // Truy vấn DB
    const parsedLimit = parseMessageLimit(limit);
    let messages = await Message.find(query)
      .sort({ _id: -1 }) // Lấy từ mới nhất lùi về quá khứ
      .limit(parsedLimit) // Giới hạn lại số lượng
      .populate("sender", "displayName avatar username")
      .populate("attachments");

    // Kiểm tra xem còn tin nhắn nào mới hơn không
    const hasMore = messages.length === parsedLimit;
    messages = messages.reverse();

    res.status(200).json({
      success: true,
      data: messages,
      hasMore: hasMore
    });
  } catch (err) {
    logger.error("message_read_failed", { errorName: err?.name || "Error" });
    return sendError(res, {
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unable to retrieve messages",
    });
  }
};

exports.createSystemMessage = async (groupId, text, options = {}) => {
  try {
    const isGroup = groupId && !groupId.includes("_");
    const systemMessage = new Message({
      conversationId: groupId,
      type: "system",
      sender: null,
      receiver: isGroup ? groupId : null,
      isGroup: isGroup,
      text: text,
      attachments: [],
      readBy: options.readBy || [],
    });
    await systemMessage.save();
    await dualWriteConfirmedMessage(systemMessage, { logPrefix: "[messageController]" });
    return systemMessage;
  } catch (error) {
    console.error("Lỗi tạo system message:", error);
    return null;
  }
};

// =========================================================
// [GET] /api/messages/sync
// Sync tin nhắn bị miss khi client reconnect
// Đặt trong REST API thay vì WebSocket:
//   - Nginx rate limiting
//   - HTTP caching
//   - Không block WebSocket real-time channel
//
// IDOR-SAFE: Server tự query conversations hợp lệ
// =========================================================
exports.syncMissedMessages = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { after_id, limit = 100 } = req.query;

    const parsedLimit = Math.min(parseInt(limit, 10) || 100, 200);

    // 1. Lấy group IDs mà user là thành viên
    const userGroups = await Group.find({ members: userId }).select("_id");
    const groupConversationIds = userGroups.map((g) => g._id.toString());

    const userIdString = userId.toString();
    const participants = await ConversationParticipant.find({ userId: userIdString }).lean();
    const orClauses = [];
    const processedConvIds = new Set();

    for (const p of participants) {
      const convId = p.legacyConversationId;
      processedConvIds.add(convId);

      const bounds = buildMessageVisibilityFilter(p);
      if (Object.keys(bounds).length > 0) {
        orClauses.push({
          conversationId: convId,
          ...bounds,
        });
      } else {
        orClauses.push({ conversationId: convId });
      }
    }

    // Dành cho group user tham gia nhưng chưa có participant row
    for (const groupId of groupConversationIds) {
      if (!processedConvIds.has(groupId)) {
        orClauses.push({ conversationId: groupId });
      }
    }

    // Dành cho direct chats chứa userId nhưng chưa có participant row
    orClauses.push({
      conversationId: {
        $regex: userIdString,
        $options: "i",
        $nin: Array.from(processedConvIds),
      },
    });

    let query = { $or: orClauses };

    // Lấy tin nhắn mới hơn after_id
    if (after_id) {
      query._id = { $gt: after_id };
    }

    // Sort theo _id thay vì createdAt
    // _id (ObjectId) chứa timestamp → y hệt sort theo createdAt
    // _id đã có sẵn index → nhanh hơn nhiều
    const messages = await Message.find(query)
      .sort({ _id: 1 })
      .limit(parsedLimit)
      .populate("sender", "displayName avatar username")
      .populate("attachments");

    console.log(`[Sync] User ${userId} synced ${messages.length} missed messages`);

    res.status(200).json({
      success: true,
      messages: messages,
      count: messages.length,
    });
  } catch (err) {
    console.error("Lỗi syncMissedMessages:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
