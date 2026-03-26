const Message = require("../models/Message");

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
        return res
          .status(400)
          .json({ message: "Thiếu thông tin người gửi/nhận" });
      }
      conversationId = [sender, receiver].sort().join("_");
    }

    // NẾU LÀ SYSTEM MESSAGE
    if (type === "system") {
      const savedSystemMsg = await exports.createSystemMessage(
        conversationId,
        text
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
    let conversationId;

    if (req.query.isGroup === "true") {
      conversationId = userId2;
    } else {
      conversationId = [userId1, userId2].sort().join("_");
    }

    const messages = await Message.find({
      conversationId: conversationId,
    })
      .populate("sender", "displayName avatar username")
      .populate("attachments");

    res.status(200).json(messages);
  } catch (err) {
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
      attachments: []
    });
    await systemMessage.save();
    return systemMessage;
  } catch (error) {
    console.error("Lỗi tạo system message:", error);
    return null;
  }
};
