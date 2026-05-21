const Message = require("../models/Message");
const Group = require("../models/Group");
const { sendError } = require("../utils/apiResponse");

// [POST] /api/messages
exports.createMessage = async (req, res) => {
  try {
    const { sender, receiver, text, attachments, isGroup, type } = req.body;
    console.log("Dữ liệu nhận từ FE:", req.body);

    let conversationId;
    const isGroupChat = isGroup === true || isGroup === "true";

    if (isGroupChat) {
      conversationId = receiver;
    } else {
      if (!sender || !receiver) {
        return sendError(res, {
          status: 400,
          code: "MESSAGE_RECIPIENT_REQUIRED",
          message: "Thiếu thông tin người gửi/nhận",
        });
      }
      conversationId = [sender, receiver].sort().join("_");
    }

    // NẾU LÀ SYSTEM MESSAGE
    if (type === "system") {
      const savedSystemMsg = await exports.createSystemMessage(
        conversationId,
        text,
      );

      if (savedSystemMsg) {
        return res.status(200).json(savedSystemMsg);
      } else {
        return res.status(500).json({ message: "Lỗi tạo tin nhắn hệ thống" });
      }
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

    // Dùng populate để trả về thông tin file đầy đủ ngay sau khi tạo
    await savedMessage.populate("attachments");

    console.log("Đã lưu thành công:", savedMessage);
    res.status(200).json(savedMessage);
  } catch (err) {
    console.error("Create Message Error:", err);
    res.status(500).json(err);
  }
};

// [GET] /api/messages/:userId1/:userId2
exports.getMessages = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    const { isGroup, cursor, limit = 20 } = req.query;
    let conversationId;

    // Lấy conversationId;
    if (isGroup === "true") {
      conversationId = userId2;
    } else {
      conversationId = [userId1, userId2].sort().join("_");
    }

    const query = { conversationId: conversationId };

    // Nếu Fe có gửi cursor
    if (cursor) {
      query._id = { $lt: cursor };
    }

    // Truy vấn DB
    let messages = await Message.find(query)
      .sort({ _id: -1 }) // Lấy từ mới nhất lùi về quá khứ
      .limit(parseInt(limit, 10)) // Giới hạn lại số lượng
      .populate("sender", "displayName avatar username")
      .populate("attachments");

    // Kiểm tra xem còn tin nhắn nào mới hơn không
    const hasMore = messages.length === parseInt(limit, 10);
    messages = messages.reverse();

    res.status(200).json({
      success: true,
      data: messages,
      hasMore: hasMore
    });
  } catch (err) {
    console.error("Lỗi getMessages:", err);
    res.status(500).json(err);
  }
};

exports.createSystemMessage = async (groupId, text) => {
  try {
    const systemMessage = new Message({
      conversationId: groupId,
      type: "system",
      sender: null,
      receiver: null,
      text: text,
      attachments: [],
    });
    await systemMessage.save();
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

    // 2. Query cho cả Group và 1-1 conversations
    // Group: conversationId nằm trong danh sách group
    // 1-1: conversationId chứa userId (format: userId1_userId2)
    let query = {
      $or: [
        { conversationId: { $in: groupConversationIds } },
        { conversationId: { $regex: userId, $options: "i" } },
      ],
    };

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
